import type { LiquiditySource, TokenData } from '../types/token';

/**
 * Liquidity enrichment service.
 *
 * The DexScreener *search* endpoint frequently omits `liquidity.usd`.
 * Two keyless, CORS-friendly fallbacks fill the gap — never fabricated:
 *
 *   1. DexScreener bulk endpoint (`/latest/dex/tokens/{mints}`) — same
 *      provider, usually returns the full pair payload with liquidity.
 *   2. GeckoTerminal (`/networks/solana/tokens/multi/{mints}`) — a real
 *      liquidity feed from a different provider, used only when the
 *      DexScreener deep-fetch also comes up empty.
 *
 * All results are cached in-memory per mint, rate-limited to stay far
 * below provider free-tier limits, and never block the UI (callers can
 * await it or fire-and-forget). If every source fails, liquidity stays
 * at its original value and `liquiditySource` remains `'none'` — the
 * UI then shows the honest "Unverified" badge.
 */

// ── Types ──

interface DexPairLiquidity {
  pairAddress: string;
  baseToken?: { address?: string };
  liquidity?: { usd?: number };
}

interface GtTokenLiquidity {
  attributes?: {
    address?: string;
    /** Exact reserve in USD is only reliable via a pool lookup; GT's
     *  token endpoint exposes total reserve when available. */
    reserve_in_usd?: number;
  };
}

interface Enrichment {
  liquidityUsd: number;
  source: LiquiditySource;
}

// ── Constants ──

const DEX_BASE = 'https://api.dexscreener.com';
const GT_BASE = 'https://api.geckoterminal.com/api/v2';

const REQUEST_TIMEOUT_MS = 10_000;
/** Cache TTL — liquidity moves slowly; 5 min avoids rate limits. */
const CACHE_TTL_MS = 5 * 60_000;
const DEX_BATCH_SIZE = 20;
const GT_BATCH_SIZE = 20;
/** Stale-while-revalidate lifetime (beyond TTL a refresh is scheduled). */
const SWR_TTL_MS = 30 * 60_000;
/** Max in-flight refresh batches — keeps burst loads bounded. */
const MAX_CONCURRENT_REFRESHES = 6;

/** 200 req/min is a generous margin below DexScreener's 300/min tier. */
const MAX_REQUESTS_PER_MINUTE = 200;
const RATE_WINDOW_MS = 60_000;

// ── Cache ──

interface CacheEntry {
  liquidityUsd: number;
  source: LiquiditySource;
  at: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Enrichment | null>>();
let refreshScheduled: Promise<void> | null = null;

// ── Rate limiter (sliding window) ──

const requestTimestamps: number[] = [];

async function rateLimit(): Promise<void> {
  const now = Date.now();
  while (
    requestTimestamps.length > 0 &&
    requestTimestamps[0] < now - RATE_WINDOW_MS
  ) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    const oldest = requestTimestamps[0];
    const waitMs = oldest + RATE_WINDOW_MS - now + 100;
    if (waitMs > 0 && waitMs < 10_000) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  requestTimestamps.push(Date.now());
}

async function fetchJson(url: string): Promise<any | null> {
  await rateLimit();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Source 1: DexScreener bulk pairs ──

async function fetchDexLiquidity(mints: string[]): Promise<Map<string, Enrichment>> {
  const out = new Map<string, Enrichment>();

  for (let i = 0; i < mints.length; i += DEX_BATCH_SIZE) {
    const batch = mints.slice(i, i + DEX_BATCH_SIZE);
    const json = await fetchJson(
      `${DEX_BASE}/latest/dex/tokens/${batch.join(',')}`,
    );
    if (!json) continue;

    const pairs: DexPairLiquidity[] = Array.isArray(json)
      ? json
      : Array.isArray(json?.pairs)
        ? json.pairs
        : [];

    for (const p of pairs) {
      const mint = p.baseToken?.address;
      const usd = p.liquidity?.usd;
      if (!mint || typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) {
        continue;
      }
      // A token can have many pairs; keep the single highest-liquidity one.
      const prev = out.get(mint);
      if (!prev || usd > prev.liquidityUsd) {
        out.set(mint, { liquidityUsd: usd, source: 'dexscreener' });
      }
    }
  }

  return out;
}

// ── Source 2: GeckoTerminal (keyless) ──

async function fetchGtLiquidity(mints: string[]): Promise<Map<string, Enrichment>> {
  const out = new Map<string, Enrichment>();

  for (let i = 0; i < mints.length; i += GT_BATCH_SIZE) {
    const batch = mints.slice(i, i + GT_BATCH_SIZE);
    const url =
      `${GT_BASE}/networks/solana/tokens/multi/${batch.join(',')}` +
      '?include=top_pools';
    const json = await fetchJson(url);
    if (!json) continue;

    const tokens: GtTokenLiquidity[] = Array.isArray(json?.data)
      ? json.data
      : [];

    for (const t of tokens) {
      const mint = t.attributes?.address;
      if (!mint) continue;
      // Prefer aggregate reserve when present, else fall back to the
      // included top pool's USD reserve.
      let usd = t.attributes?.reserve_in_usd ?? 0;
      const pools = (json?.included ?? []).filter(
        (inc: any) =>
          inc?.type === 'pool' &&
          inc?.relationships?.base_token?.data?.id?.endsWith(mint) &&
          typeof inc?.attributes?.reserve_in_usd === 'number',
      );
      if ((!usd || !Number.isFinite(usd)) && pools.length > 0) {
        usd = pools.reduce(
          (max: number, pool: any) =>
            Math.max(max, Number(pool.attributes.reserve_in_usd) || 0),
          0,
        );
      }
      if (!Number.isFinite(usd) || usd <= 0) continue;
      out.set(mint, { liquidityUsd: usd, source: 'geckoterminal' });
    }
  }

  return out;
}

// ── Enrichment core ──

async function resolveLiquidity(mints: string[]): Promise<Map<string, Enrichment>> {
  const result = new Map<string, Enrichment>();

  // 1) DexScreener bulk endpoint.
  const dex = await fetchDexLiquidity(mints);
  for (const [mint, value] of dex) result.set(mint, value);

  // 2) GeckoTerminal for whatever DexScreener still couldn't answer.
  const missing = mints.filter((m) => !result.has(m));
  if (missing.length > 0) {
    const gt = await fetchGtLiquidity(missing);
    for (const [mint, value] of gt) result.set(mint, value);
  }

  return result;
}

/** Apply enrichment results to tokens in place (mutation avoided). */
function applyEnrichment(
  tokens: TokenData[],
  results: Map<string, Enrichment>,
): TokenData[] {
  if (results.size === 0) return tokens;
  return tokens.map((t) => {
    const found = results.get(t.mintAddress);
    if (!found) return t;
    return {
      ...t,
      liquidityUsd: found.liquidityUsd,
      liquiditySource: found.source,
    };
  });
}

/** Resolve one mint through the cache (stale-while-revalidate). */
function resolveCached(mint: string): Enrichment | null {
  const hit = cache.get(mint);
  if (!hit) return null;
  const age = Date.now() - hit.at;
  if (age < CACHE_TTL_MS) return hit;
  if (age < SWR_TTL_MS) {
    scheduleRefresh([mint]);
    return hit;
  }
  return null;
}

/** Refresh a batch of mints, deduping concurrent work. */
function scheduleRefresh(mints: string[]): void {
  const toFetch = mints.filter((m) => !inFlight.has(m));
  if (toFetch.length === 0 || refreshScheduled) return;

  refreshScheduled = (async () => {
    // Process in windows to bound concurrent provider requests.
    for (let i = 0; i < toFetch.length; i += MAX_CONCURRENT_REFRESHES) {
      const window = toFetch.slice(i, i + MAX_CONCURRENT_REFRESHES);
      const promises = window.map((mint) => {
        const promise = resolveLiquidity([mint]).then(
          (res) => res.get(mint) ?? null,
        );
        inFlight.set(mint, promise);
        return promise;
      });
      const results = await Promise.all(promises);
      for (let j = 0; j < window.length; j++) {
        const r = results[j];
        if (r) cache.set(window[j], { ...r, at: Date.now() });
        inFlight.delete(window[j]);
      }
    }
    refreshScheduled = null;
  })();
}

/**
 * Public API: enrich a batch of tokens with real liquidity.
 *
 * - Fast path: fully cached (or in-flight) mints resolve instantly.
 * - Slow path: uncached mints are resolved from the two sources.
 * - Non-blocking: callers that don't await get a background refresh
 *   that mutates nothing — results are returned only when awaited.
 */
export async function enrichTokensWithLiquidity(
  tokens: TokenData[],
): Promise<TokenData[]> {
  if (tokens.length === 0) return tokens;

  const uniqueMints = [...new Set(tokens.map((t) => t.mintAddress))];
  const cachedResults = new Map<string, Enrichment>();
  const pending: Promise<Enrichment | null>[] = [];
  const needsFetch: string[] = [];

  for (const mint of uniqueMints) {
    const cached = resolveCached(mint);
    if (cached) {
      cachedResults.set(mint, cached);
      continue;
    }
    const inflight = inFlight.get(mint);
    if (inflight) {
      pending.push(
        inflight.then((r) => {
          if (r) cachedResults.set(mint, r);
          return r;
        }),
      );
      continue;
    }
    needsFetch.push(mint);
  }

  if (pending.length > 0) {
    await Promise.all(pending);
  }

  if (needsFetch.length > 0) {
    const fresh = await resolveLiquidity(needsFetch);
    for (const [mint, value] of fresh) {
      cache.set(mint, { ...value, at: Date.now() });
      cachedResults.set(mint, value);
    }
  }

  return applyEnrichment(tokens, cachedResults);
}

/**
 * Background (fire-and-forget) variant: refreshes the cache so the next
 * deck build is instant. Never throws, never blocks the caller.
 */
export function warmLiquidityCache(tokens: TokenData[]): void {
  const mints = tokens
    .map((t) => t.mintAddress)
    .filter((m) => !cache.has(m));
  if (mints.length === 0) return;
  scheduleRefresh(mints);
}

/** Unit-test helper: wipe the cache. */
export function _resetLiquidityCacheForTests(): void {
  cache.clear();
  inFlight.clear();
  refreshScheduled = null;
}
