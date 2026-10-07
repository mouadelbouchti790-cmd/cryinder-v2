import type { DeckTab, TokenData } from '../types/token';
import { fisherYatesShuffle } from '../utils';
import { createMockTokens } from './mock-tokens';

// ── Raw API types ──

interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string | null; symbol: string | null };
  priceUsd: string;
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  priceChange?: { h24?: number; h6?: number; h1?: number; m5?: number };
  txns?: { h24?: { buys?: number; sells?: number }; h1?: { buys?: number; sells?: number } };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
  labels?: string[];
}

interface TokenProfile {
  url?: string;
  chainId?: string;
  tokenAddress?: string;
  icon?: string;
  description?: string;
  header?: string;
  links?: { type?: string; url?: string }[];
  updatedAt?: string;
}

// ── Constants ──

const BASE = 'https://api.dexscreener.com';
const BATCH_SIZE = 20;

// ── Well-known Solana memecoins to seed the feed when needed ──

const SEED_SYMBOLS = [
  'WIF', 'BONK', 'POPCAT', 'MYRO', 'SAMO', 'MUMU', 'WEN',
  'PONKE', 'MOG', 'BILLY', 'GIGA', 'SPX', 'MICHI',
];

// ── Fetch helpers ──

const REQUEST_TIMEOUT_MS = 10_000;

async function safeFetchJson(url: string): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Parse DexScreener pairs ──

function parsePairs(json: any): DexPair[] {
  if (!json || json === null) return [];
  const rawPairs: DexPair[] = Array.isArray(json)
    ? json
    : Array.isArray(json.pairs)
      ? json.pairs
      : [];
  return rawPairs.filter(
    (p) => p?.chainId === 'solana',
  );
}

// ── Deduplicate pairs (keep highest liquidity per token address) ──

function deduplicate(pairs: DexPair[]): DexPair[] {
  const map = new Map<string, DexPair>();
  for (const p of pairs) {
    const addr = p.baseToken?.address;
    if (!addr) continue;
    const existing = map.get(addr);
    if (!existing || (p.liquidity?.usd ?? 0) > (existing.liquidity?.usd ?? 0)) {
      map.set(addr, p);
    }
  }
  return Array.from(map.values());
}

// ── Normalize DexPair → TokenData ──

function pairToToken(
  p: DexPair,
  overrides?: { name?: string; symbol?: string; description?: string; logoUrl?: string },
): TokenData {
  const price = parseFloat(p.priceUsd) || 0;
  const change24h = p.priceChange?.h24 ?? 0;
  const change6h = p.priceChange?.h6 ?? 0;
  const change1h = p.priceChange?.h1 ?? 0;
  const change5m = p.priceChange?.m5 ?? 0;
  const mcap = p.marketCap || p.fdv || 0;
  const vol = p.volume?.h24 ?? 0;
  const vol1h = p.volume?.h1 ?? 0;
  const vol6h = p.volume?.h6 ?? 0;
  const liq = p.liquidity?.usd ?? 0;
  const fdv = p.fdv ?? 0;
  const txnsBuys = p.txns?.h24?.buys ?? 0;
  const txnsSells = p.txns?.h24?.sells ?? 0;
  const txnsBuys1h = p.txns?.h1?.buys ?? 0;
  const txnsSells1h = p.txns?.h1?.sells ?? 0;

  let createdAt = p.pairCreatedAt ?? 0;
  if (createdAt > 0 && createdAt < 1e12) createdAt *= 1000;

  const liqScore = Math.min(10, liq / 500_000);
  // Unknown creation date = neutral age contribution. Never fabricate one.
  const ageScore = createdAt > 0 ? Math.min(10, (Date.now() - createdAt) / 86_400_000 / 30) : 5;
  const volScore = Math.min(10, vol / 1_000_000);
  const risk = Math.max(1, Math.min(10, 10 - (liqScore + ageScore + volScore) / 3));

  // Liquidity-lock percentage is NOT provided by DexScreener. Showing a
  // seeded-random number here would present fabricated due-diligence data
  // as fact. Report unknown until a real lock/audit source is integrated.
  const lockedPct: number | null = null;

  const name = overrides?.name || p.baseToken.name || 'Unknown Token';
  const symbol = overrides?.symbol || p.baseToken.symbol || '???';

  return {
    id: p.pairAddress,
    mintAddress: p.baseToken.address,
    name,
    symbol,
    description:
      overrides?.description ||
      (name !== 'Unknown Token'
        ? `${name} is actively traded on Solana via ${p.dexId || 'DEX'}.`
        : 'A Solana-based token actively traded on decentralized exchanges.'),
    logoUrl: overrides?.logoUrl ?? p.info?.imageUrl ?? '',
    priceUsd: price,
    priceChange24h: change24h,
    priceChange1h: change1h,
    priceChange6h: change6h,
    priceChange5m: change5m,
    marketCap: mcap,
    volume24h: vol,
    volume1h: vol1h,
    volume6h: vol6h,
    liquidityUsd: liq,
    fdv,
    liquiditySource: liq > 0 ? 'dexscreener' : 'none',
    liquidityLockedPct: lockedPct,
    auditStatus: 'Unverified',
    riskScore: Math.round(risk * 10) / 10,
    sparkline: [],
    chain: p.chainId || 'solana',
    dexId: p.dexId || '',
    pairAddress: p.pairAddress,
    createdAt,
    labels: p.labels ?? [],
    txnsBuys24h: txnsBuys,
    txnsSells24h: txnsSells,
    txnsBuys1h: txnsBuys1h,
    txnsSells1h: txnsSells1h,
  };
}

// ── Fetch pairs for a batch of token addresses ──

async function fetchPairsForAddresses(addresses: string[]): Promise<DexPair[]> {
  const allPairs: DexPair[] = [];

  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE);
    const json = await safeFetchJson(
      `${BASE}/latest/dex/tokens/${batch.join(',')}`,
    );
    if (json) {
      allPairs.push(...parsePairs(json));
    }
  }

  return deduplicate(allPairs);
}

// ── Phase 1: Get trending/new Solana tokens from token-profiles ──

async function fetchProfileTokens(): Promise<TokenData[]> {
  const json = await safeFetchJson(`${BASE}/token-profiles/latest/v1`);
  if (!json) return [];

  const profiles: TokenProfile[] = Array.isArray(json) ? json : json?.data ?? [];
  const solProfiles = profiles.filter(
    (p) => p?.chainId === 'solana' && p?.tokenAddress,
  );

  if (solProfiles.length === 0) return [];

  // Build a lookup for names/icons from profiles
  const profileMap = new Map(solProfiles.map((p) => [p.tokenAddress!, p]));

  const addresses = solProfiles.map((p) => p.tokenAddress!);
  const pairs = await fetchPairsForAddresses(addresses);

  return pairs.map((p) => {
    const profile = profileMap.get(p.baseToken.address);
    return pairToToken(p, {
      name: undefined,   // let pairToToken use the DEX pair's name
      symbol: undefined, // let pairToToken use the DEX pair's symbol
      description: profile?.description || undefined,
      logoUrl: profile?.icon || undefined,
    });
  });
}

// ── Phase 2: Search well-known memecoins for reliable price data ──

async function fetchSeedTokens(): Promise<TokenData[]> {
  // Fetch all seed symbols in parallel so a single slow endpoint can't
  // stall the whole deck for minutes.
  const results = await Promise.all(
    SEED_SYMBOLS.map(async (symbol) => {
      const json = await safeFetchJson(
        `${BASE}/latest/dex/search?q=${encodeURIComponent(symbol)}`,
      );
      if (!json) return null;

      const pairs = parsePairs(json);
      if (pairs.length === 0) return null;

      const bestPair = deduplicate(pairs)[0];
      return bestPair ? pairToToken(bestPair) : null;
    }),
  );

  // Deduplicate by address again across all seed symbols
  const seen = new Set<string>();
  return results.filter((t): t is TokenData => {
    if (!t || seen.has(t.mintAddress)) return false;
    seen.add(t.mintAddress);
    return true;
  });
}

// ── Sorting ──

export function sortTokens(tokens: TokenData[], tab: DeckTab): TokenData[] {
  const sorted = [...tokens];
  switch (tab) {
    case 'new':
      sorted.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case 'gainers':
      sorted.sort((a, b) => b.priceChange24h - a.priceChange24h);
      break;
    case 'trending':
      sorted.sort((a, b) => b.volume24h - a.volume24h);
      break;
  }
  return sorted;
}

function mockForTab(tab: DeckTab): TokenData[] {
  return sortTokens(createMockTokens(), tab);
}

// ── Tab-specific source pools ──────────────────────────────────
//
//  Each tab pulls from the sources most relevant to it, then sorts:
//    new      → token-profiles (freshest listings) + boosted latest
//                sorted by pairCreatedAt desc
//    gainers  → well-known memecoins + keyword discovery pool
//                sorted by 24h price change desc
//    trending → boosted (top) tokens + well-known memecoins
//                sorted by 24h volume desc
//
//  Deterministic ordering: no shuffle — the sort IS the tab's meaning.

async function fetchTabPool(tab: DeckTab): Promise<TokenData[]> {
  switch (tab) {
    case 'new': {
      const [profileTokens, boostedTokens] = await Promise.all([
        fetchProfileTokens(),
        fetchBoostedTokenData(),
      ]);
      return [...profileTokens, ...boostedTokens];
    }
    case 'gainers': {
      const [seedTokens, discoveryTokens] = await Promise.all([
        fetchSeedTokens(),
        fetchDiscoveryBatch(new Set<string>()).then((r) => r.tokens),
      ]);
      return [...seedTokens, ...discoveryTokens];
    }
    case 'trending': {
      const [boostedTokens, seedTokens] = await Promise.all([
        fetchBoostedTokenData(),
        fetchSeedTokens(),
      ]);
      return [...boostedTokens, ...seedTokens];
    }
  }
}

/** Deterministic first-pair ranking for "new" tokens missing createdAt. */
function firstPairRank(a: TokenData, b: TokenData): number {
  const at = a.createdAt || 0;
  const bt = b.createdAt || 0;
  if (at !== bt) return bt - at;
  // Fall back to pair address ordering for stable ties.
  return a.pairAddress.localeCompare(b.pairAddress);
}

// ── Top Gainers (real 24h data, multi-source pool) ───────────────
//
//  DexScreener has no "top gainers" endpoint, so we build one:
//    1. Candidate pool = boosted top + boosted latest + newest token
//       profiles + well-known memecoins (all Solana, all with pairs).
//    2. Every candidate already carries REAL price, 24h change and
//       liquidity from the /latest/dex/tokens bulk fetch.
//    3. Quality filter: real name/symbol, price > 0, 24h volume > 0,
//       positive 24h change, liquidity above a floor (floor relaxes if
//       the strict pass is too thin).
//    4. Sort by priceChange24h desc — the deck order IS the ranking.
//
//  NO mock fallback here. Showing fake "gainers" destroys trust, so on
//  failure we return nothing and let the UI show an honest retry state.

const GAINER_MIN_LIQUIDITY_USD = 25_000;
const GAINER_CACHE_TTL_MS = 60_000;

let _gainersCache: { at: number; ranked: TokenData[] } | null = null;

/** Real, deduped TokenData for every candidate across the pool. */
async function fetchGainerPool(): Promise<TokenData[]> {
  const [boostedPairs, profilePairs, seedTokens] = await Promise.all([
    fetchBoostedTokens(),
    fetchNewProfiles(),
    fetchSeedTokens(),
  ]);

  const pairTokens = enrichPairs(
    deduplicate([...boostedPairs, ...profilePairs]),
    [],
  );

  const seen = new Set<string>();
  const merged: TokenData[] = [];
  for (const t of [...pairTokens, ...seedTokens]) {
    if (seen.has(t.mintAddress)) continue;
    seen.add(t.mintAddress);
    merged.push(t);
  }
  return merged;
}

/** Legitimacy + liquidity filter, then rank by real 24h change. */
function rankGainers(pool: TokenData[]): TokenData[] {
  const base = pool.filter(
    (t) =>
      t.name !== 'Unknown Token' &&
      t.symbol !== '???' &&
      t.priceUsd > 0 &&
      t.volume24h > 0 &&
      t.priceChange24h > 0,
  );

  // Relax the liquidity floor if the strict pass is too thin — still
  // ranked by 24h change either way, and never fabricated.
  for (const floor of [GAINER_MIN_LIQUIDITY_USD, 5_000, 0]) {
    const pass = base.filter((t) => t.liquidityUsd >= floor);
    if (pass.length >= 8) {
      return pass.sort((a, b) => b.priceChange24h - a.priceChange24h);
    }
  }
  return base.sort((a, b) => b.priceChange24h - a.priceChange24h);
}

/** Ranked real gainers, cached for 60s so tab switches are instant. */
async function getRankedGainers(): Promise<TokenData[]> {
  if (_gainersCache && Date.now() - _gainersCache.at < GAINER_CACHE_TTL_MS) {
    return _gainersCache.ranked;
  }
  const pool = await fetchGainerPool();
  const ranked = rankGainers(pool);
  _gainersCache = { at: Date.now(), ranked };
  return ranked;
}

export async function fetchSolanaGainers(): Promise<{
  tokens: TokenData[];
  fromMock: false;
}> {
  try {
    return { tokens: await getRankedGainers(), fromMock: false };
  } catch (err) {
    console.warn('Top gainers fetch failed:', err);
    // Deliberately empty rather than mock — the UI shows an honest
    // empty/retry state instead of fake gainers.
    return { tokens: [], fromMock: false };
  }
}

export async function fetchTokenFeedByTab(
  tab: DeckTab,
): Promise<{ tokens: TokenData[]; fromMock: boolean }> {
  if (tab === 'gainers') {
    return fetchSolanaGainers();
  }
  try {
    const pool = await fetchTabPool(tab);

    // Merge, deduplicating by mint address (first occurrence wins —
    // profile sources come first, so their metadata takes priority).
    const seen = new Set<string>();
    const merged: TokenData[] = [];
    for (const t of pool) {
      if (seen.has(t.mintAddress)) continue;
      seen.add(t.mintAddress);
      // Only include tokens that have actual price data
      if (t.volume24h > 0 || t.liquidityUsd > 0) {
        merged.push(t);
      }
    }

    if (merged.length === 0) {
      return { tokens: mockForTab(tab), fromMock: true };
    }

    // Sort deterministically for the tab (new tabs have their own rank).
    const sorted =
      tab === 'new'
        ? [...merged].sort(firstPairRank)
        : sortTokens(merged, tab);

    return { tokens: sorted, fromMock: false };
  } catch (err) {
    console.warn('Token feed fetch failed, using mock data:', err);
    return { tokens: mockForTab(tab), fromMock: true };
  }
}

// ── Phase 3: Robust discovery engine for load-more ──
//
//  Multi-source pipeline:
//    A) Keyword search (180+ terms, 3 per loadMore, wraps infinitely)
//    B) Token-profiles poll (every 4th loadMore — constant stream of new tokens)
//    C) Boosted tokens (every 7th loadMore — trending/boosted coins)
//
//  Exhaustion: stall-based, not cycle-based.
//    Only declare exhausted after 8 *consecutive* loadMore calls yield 0
//    new tokens across all sources. A single hit resets the counter.

// ── Keyword search terms (182, no duplicates) ──

const DISCOVERY_TERMS = [
  // Animals (40)
  'dog', 'cat', 'fish', 'bear', 'bull', 'frog', 'ape', 'shark', 'whale',
  'wolf', 'fox', 'deer', 'duck', 'hawk', 'eagle', 'lion', 'tiger',
  'panda', 'koala', 'rabbit', 'turtle', 'snake', 'lizard', 'dragon',
  'phoenix', 'unicorn', 'pepe', 'toad', 'chad', 'pig', 'cow', 'sheep',
  'goat', 'horse', 'chicken', 'mouse', 'rat', 'bat', 'crab', 'squid',
  // Meme / internet (35)
  'wojak', 'sigma', 'based', 'gigachad', 'doge', 'cheems', 'bonk',
  'wif', 'popcat', 'mog', 'spx', 'turbo', 'mumu', 'wen', 'myro',
  'ponke', 'billy', 'degen', 'kek', 'chungus', 'pog', 'cope',
  'seethe', 'retardio', 'brett', 'andy', 'matt', 'pepecoin',
  'moodeng', 'chillguy', 'fartcoin', 'goatseus', 'act', 'pnut',
  'trump',
  // Crypto / finance (35)
  'sol', 'solana', 'moon', 'rocket', 'pump', 'hodl', 'fomo', 'defi',
  'nft', 'airdrop', 'staking', 'yield', 'swap', 'dex', 'amm',
  'liquidity', 'oracle', 'bridge', 'dao', 'treasury', 'vault',
  'launchpad', 'money', 'cash', 'bank', 'capital', 'profit',
  'trade', 'alpha', 'beta', 'gamma', 'delta', 'theta', 'sigma',
  'omega',
  // People (15)
  'elon', 'musk', 'satoshi', 'vitalik', 'nakamoto', 'buterin',
  'saylor', 'cuban', 'dorsey', 'bald', 'jensen', 'huang',
  'armstrong', 'sun', 'bezos',
  // Objects / concepts (30)
  'gold', 'silver', 'diamond', 'gem', 'crystal', 'star', 'fire',
  'water', 'earth', 'wind', 'thunder', 'lightning', 'storm',
  'blaze', 'frost', 'shadow', 'ghost', 'ninja', 'samurai',
  'wizard', 'knight', 'king', 'queen', 'sword', 'shield',
  'crown', 'throne', 'jewel', 'pearl', 'opal',
  // AI / tech (15)
  'ai', 'agent', 'gpt', 'neural', 'bot', 'chat', 'prompt',
  'model', 'compute', 'data', 'brain', 'mind', 'cyber',
  'matrix', 'quantum',
  // Actions / vibes (12)
  'fun', 'chill', 'vibe', 'hyper', 'ultra', 'super',
  'mega', 'giga', 'turbo', 'swift', 'rapid', 'zen',
];

const TERMS_PER_CALL = 3;

// ── Internal cursor state ──

let _termCursor = 0;
let _loadMoreCallCount = 0;
let _consecutiveStalls = 0;
const STALL_LIMIT = 8;

function resetDiscoveryState(): void {
  _termCursor = 0;
  _loadMoreCallCount = 0;
  _consecutiveStalls = 0;
}

function pickNextTerms(count: number): string[] {
  const selected: string[] = [];
  for (let i = 0; i < count; i++) {
    selected.push(DISCOVERY_TERMS[_termCursor % DISCOVERY_TERMS.length]);
    _termCursor++;
  }
  return selected;
}

// ── Rate limiter (stay under 300 req/min free tier) ──

const _requestTimestamps: number[] = [];
const MAX_REQUESTS_PER_MINUTE = 200; // generous margin below 300
const REQUEST_WINDOW_MS = 60_000;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  // Prune old timestamps
  while (
    _requestTimestamps.length > 0 &&
    _requestTimestamps[0] < now - REQUEST_WINDOW_MS
  ) {
    _requestTimestamps.shift();
  }

  if (_requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    const oldestInWindow = _requestTimestamps[0];
    const waitMs = oldestInWindow + REQUEST_WINDOW_MS - now + 100;
    if (waitMs > 0 && waitMs < 10_000) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  _requestTimestamps.push(Date.now());
}

// ── Rate-limited safeFetch overload ──

async function rateLimitedFetch(url: string): Promise<any | null> {
  await rateLimit();
  return safeFetchJson(url);
}

// ── Source A: Keyword search ──

async function fetchKeywordBatch(
  terms: string[],
): Promise<DexPair[]> {
  const results: (DexPair[] | null)[] = await Promise.all(
    terms.map((term) =>
      rateLimitedFetch(
        `${BASE}/latest/dex/search?q=${encodeURIComponent(term)}`,
      ).then(parsePairs),
    ),
  );
  return results.flat().filter((p): p is DexPair => p !== null);
}

// ── Source B: Token profiles (poll for fresh new tokens) ──

async function fetchNewProfiles(): Promise<DexPair[]> {
  const json = await rateLimitedFetch(`${BASE}/token-profiles/latest/v1`);
  if (!json) return [];

  const profiles: TokenProfile[] = Array.isArray(json) ? json : json?.data ?? [];
  const addresses = profiles
    .filter((p) => p?.chainId === 'solana' && p?.tokenAddress)
    .map((p) => p.tokenAddress!);

  if (addresses.length === 0) return [];

  // Fetch pairs for all addresses (batched internally)
  return fetchPairsForAddresses(addresses);
}

// ── Source C: Boosted tokens ──

async function fetchBoostedTokens(): Promise<DexPair[]> {
  const [latest, top] = await Promise.all([
    rateLimitedFetch(`${BASE}/token-boosts/latest/v1`),
    rateLimitedFetch(`${BASE}/token-boosts/top/v1`),
  ]);

  const all: TokenProfile[] = [
    ...(Array.isArray(latest) ? latest : latest?.data ?? []),
    ...(Array.isArray(top) ? top : top?.data ?? []),
  ];

  const addresses = all
    .filter((p) => p?.chainId === 'solana' && p?.tokenAddress)
    .map((p) => p.tokenAddress!);

  if (addresses.length === 0) return [];
  return fetchPairsForAddresses(addresses);
}

/** Boosted tokens as TokenData (used by the Trending / New tabs). */
async function fetchBoostedTokenData(): Promise<TokenData[]> {
  const pairs = await fetchBoostedTokens();
  return enrichPairs(pairs, []);
}

// ── Enrich pairs with profile metadata ──

function enrichPairs(pairs: DexPair[], profiles: TokenProfile[]): TokenData[] {
  if (profiles.length === 0) {
    return pairs
      .map((p) => pairToToken(p))
      .filter((t) => t.volume24h > 0 || t.liquidityUsd > 0);
  }

  const profileMap = new Map(profiles.map((p) => [p.tokenAddress!, p]));

  return pairs
    .map((p) => {
      const profile = profileMap.get(p.baseToken.address);
      return pairToToken(p, {
        name: undefined,
        symbol: undefined,
        description: profile?.description || undefined,
        logoUrl: profile?.icon || undefined,
      });
    })
    .filter((t) => t.volume24h > 0 || t.liquidityUsd > 0);
}

// ── Main load-more orchestrator ──

async function fetchDiscoveryBatch(
  excludeMints: Set<string>,
): Promise<{ tokens: TokenData[]; exhausted: boolean }> {
  _loadMoreCallCount++;

  // Always: keyword search (3 terms)
  const terms = pickNextTerms(TERMS_PER_CALL);

  // Every 4th call: also poll token-profiles for brand-new tokens
  const profilePromise =
    _loadMoreCallCount % 4 === 0 ? fetchNewProfiles() : null;

  // Every 7th call: also fetch boosted tokens
  const boostedPromise =
    _loadMoreCallCount % 7 === 0 ? fetchBoostedTokens() : null;

  // Parallel gather
  const [keywordPairs, profilePairs, boostedPairs] = await Promise.all([
    fetchKeywordBatch(terms),
    profilePromise ?? ([] as DexPair[]),
    boostedPromise ?? ([] as DexPair[]),
  ]);

  // Merge all pairs, deduplicate
  const allPairs = deduplicate([...keywordPairs, ...profilePairs, ...boostedPairs]);

  // Convert to tokens (profile enrichment only from profile fetch)
  const tokens = enrichPairs(allPairs, []);

  // Deduplicate against already-seen mints
  const fresh = tokens.filter((t) => !excludeMints.has(t.mintAddress));

  // Stall-based exhaustion: only give up after consecutive zero-hits
  if (fresh.length === 0) {
    _consecutiveStalls++;
  } else {
    _consecutiveStalls = 0;
  }

  const exhausted = _consecutiveStalls >= STALL_LIMIT;

  return { tokens: fisherYatesShuffle(fresh), exhausted };
}

// ═══════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════

export { resetDiscoveryState as resetDiscoveryCursor };

export async function fetchTokenSearch(query: string): Promise<TokenData[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const BASE58 =
    '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const isBase58 = (s: string) =>
    [...s].every((c) => BASE58.includes(c));
  const isMint =
    trimmed.length >= 32 && trimmed.length <= 44 && isBase58(trimmed);

  const endpoint = isMint
    ? `${BASE}/latest/dex/tokens/${encodeURIComponent(trimmed)}`
    : `${BASE}/latest/dex/search?q=${encodeURIComponent(trimmed)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const pairs = parsePairs(await res.json());
    return deduplicate(pairs).map((p) => pairToToken(p));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a fresh batch of tokens for infinite scrolling, excluding
 * any mint addresses already shown to the user.
 *
 * Uses a multi-source pipeline (keyword search, token-profiles poll,
 * boosted tokens) with stall-based exhaustion — only declares dead
 * after 8 consecutive zero-hitting attempts.
 */
export async function fetchMoreTokens(
  excludeMints: Set<string>,
): Promise<{ tokens: TokenData[]; exhausted: boolean }> {
  return fetchDiscoveryBatch(excludeMints);
}
