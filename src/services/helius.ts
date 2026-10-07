import type { PortfolioHolding } from '../types/token';

const HELIUS_KEY = import.meta.env.VITE_HELIUS_API_KEY ?? '';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const REQUEST_TIMEOUT_MS = 10_000;

interface DASAsset {
  interface: string;
  id: string;
  content?: {
    metadata?: { name?: string; symbol?: string };
    links?: { image?: string };
  };
  token_info?: {
    symbol?: string;
    balance?: number;
    decimals?: number;
    price_info?: { price_per_token?: number; currency?: string };
  };
}

async function log(label: string, data: unknown) {
  console.log(`[Helius] ${label}`, data);
}

/* ═══════════════════════════════════════════════════════════════════
   Fetch live SOL price from CoinGecko (no CORS issues)
   ═══════════════════════════════════════════════════════════════════ */

async function getLiveSolPrice(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
    );
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json();
    const price = data.solana?.usd;
    if (price && price > 0) {
      log('sol-price-live', { price });
      return price;
    }
    throw new Error('Invalid price response');
  } catch (e) {
    log('sol-price-fallback', { error: (e as Error).message });
    return 145; // Fallback
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Fetch token accounts via Helius DAS API
   ═══════════════════════════════════════════════════════════════════ */

export async function fetchTokenAccounts(ownerAddress: string): Promise<PortfolioHolding[]> {
  const body = {
    jsonrpc: '2.0',
    id: 'cryinder-portfolio',
    method: 'getAssetsByOwner',
    params: {
      ownerAddress,
      page: 1,
      limit: 1000,
      displayOptions: {
        showFungible: true,
        showNativeBalance: true,
      },
    },
  };

  log('request', { owner: ownerAddress.slice(0, 8) + '...' });

  if (!HELIUS_KEY) {
    throw new Error('VITE_HELIUS_API_KEY is not configured.');
  }

  const res = await fetch(
    `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Helius HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();

  if (json.error) {
    throw new Error(`Helius RPC error: ${json.error.message || JSON.stringify(json.error)}`);
  }

  const assets: DASAsset[] = json.result?.items ?? [];
  const nativeLamports: number = json.result?.nativeBalance?.lamports ?? 0;
  const nativeBalance = nativeLamports / 1e9;

  log('received', {
    assetCount: assets.length,
    nativeSol: nativeBalance,
    interfaces: assets.map((a) => a.interface),
  });

  /* ── Collect mint addresses for price lookup ── */
  const fungibleTokens = assets.filter(
    (a) => a.interface === 'FungibleToken' || a.interface === 'FungibleAsset',
  );

  log('fungible', { count: fungibleTokens.length });

  const mintAddresses = fungibleTokens.map((a) => a.id);

  /* ── Fetch prices for all mints + SOL ── */
  const priceMap = await fetchPricesForMints([...mintAddresses, SOL_MINT]);

  log('prices', { entries: priceMap.size });

  /* ── Build holdings from DAS assets ── */
  const holdings: PortfolioHolding[] = [];

  for (const asset of fungibleTokens) {
    const mint = asset.id;
    const decimals = asset.token_info?.decimals ?? 0;
    const rawBalance = asset.token_info?.balance ?? 0;

    if (decimals === 0) {
      log('skip-zero-decimals', mint);
      continue;
    }

    const balance = rawBalance / 10 ** decimals;

    if (balance <= 0) {
      log('skip-zero-balance', { mint, rawBalance, balance });
      continue;
    }

    const priceData = priceMap.get(mint);

    holdings.push({
      mint,
      name: asset.content?.metadata?.name || priceData?.name || shortMint(mint),
      symbol: asset.token_info?.symbol || priceData?.symbol || shortMint(mint),
      logoUrl: asset.content?.links?.image || priceData?.imageUrl || '',
      balance,
      decimals,
      priceUsd: priceData?.priceUsd ?? 0,
      valueUsd: balance * (priceData?.priceUsd ?? 0),
      priceChange24h: priceData?.priceChange24h ?? 0,
      marketCap: priceData?.marketCap,
      sparkline: priceData?.sparkline,
    });
  }

  /* ── Native SOL ── */
  if (nativeBalance > 0) {
    const solPrice = priceMap.get(SOL_MINT);
    holdings.unshift({
      mint: SOL_MINT,
      name: 'Solana',
      symbol: 'SOL',
      logoUrl: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      balance: nativeBalance,
      decimals: 9,
      priceUsd: solPrice?.priceUsd ?? 145,
      valueUsd: nativeBalance * (solPrice?.priceUsd ?? 145),
      priceChange24h: solPrice?.priceChange24h ?? 0,
    });
  }

  const sorted = holdings.sort((a, b) => b.valueUsd - a.valueUsd);

  log('result', {
    count: sorted.length,
    total: sorted.reduce((s, h) => s + h.valueUsd, 0),
    top: sorted[0] ? `${sorted[0].symbol}: $${sorted[0].valueUsd.toFixed(2)}` : 'none',
  });

  return sorted;
}

/* ═══════════════════════════════════════════════════════════════════
   Batch-fetch prices from DexScreener (with SOL fallback)
   ═══════════════════════════════════════════════════════════════════ */

async function fetchPricesForMints(
  addresses: string[],
): Promise<
  Map<
    string,
    {
      priceUsd: number;
      priceChange24h: number;
      marketCap?: number;
      sparkline?: number[];
      name?: string;
      symbol?: string;
      imageUrl?: string;
    }
  >
> {
  const map = new Map<
    string,
    {
      priceUsd: number;
      priceChange24h: number;
      marketCap?: number;
      sparkline?: number[];
      name?: string;
      symbol?: string;
      imageUrl?: string;
    }
  >();

  if (addresses.length === 0) return map;

  // ✅ Fetch prices using DexScreener
  const chunkSize = 30;
  const promises: Promise<void>[] = [];
  const liquidityByAddr = new Map<string, number>();

  for (let i = 0; i < addresses.length; i += chunkSize) {
    const chunk = addresses.slice(i, i + chunkSize);
    promises.push(
      (async () => {
        const url = `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(',')}`;
        try {
          const res = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          if (!res.ok) return;
          const json = await res.json();
          const pairs = Array.isArray(json) ? json : json?.pairs ?? [];

          for (const p of pairs) {
            const addr = p.baseToken?.address;
            if (!addr) continue;
            const price = parseFloat(p.priceUsd ?? '0');
            if (price <= 0) continue;

            const liquidity = parseFloat(p.liquidity?.usd ?? '0');
            // Keep the entry from the most liquid market
            if ((liquidityByAddr.get(addr) ?? -1) >= liquidity) continue;
            liquidityByAddr.set(addr, liquidity);

            const marketCap = p.marketCap ? parseFloat(p.marketCap) : undefined;
            const sparkline = Array.isArray(p.priceChange?.sparkline)
              ? (p.priceChange.sparkline as string[]).map((v) => parseFloat(v))
              : undefined;

            map.set(addr, {
              priceUsd: price,
              priceChange24h: p.priceChange?.h24 ?? 0,
              marketCap,
              sparkline,
              name: p.baseToken?.name,
              symbol: p.baseToken?.symbol,
              imageUrl: p.info?.imageUrl,
            });
          }
        } catch (e) {
          log('dex-error', { chunk: chunk[0], error: (e as Error).message });
        }
      })(),
    );
  }

  await Promise.all(promises);

  /* ── Fallback: CoinGecko prices for mints DexScreener missed ── */
  const missing = addresses.filter(
    (addr) => !map.has(addr) && addr !== SOL_MINT,
  );

  if (missing.length > 0) {
    // CoinGecko's free tier only accepts ONE contract address per request,
    // so fetch each mint in parallel with short timeouts.
    const results = await Promise.all(
      missing.map(async (mint) => {
        try {
          const cgRes = await fetch(
            `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${mint}&vs_currencies=usd`,
            {
              headers: { Accept: 'application/json' },
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            },
          );
          if (!cgRes.ok) return null;
          const cg = await cgRes.json();
          return { mint, price: cg?.[mint]?.usd as number | undefined };
        } catch (e) {
          log('coingecko-error', { mint: mint.slice(0, 6), error: (e as Error).message });
          return null;
        }
      }),
    );

    let added = 0;
    for (const r of results) {
      if (r && r.price && r.price > 0) {
        map.set(r.mint, {
          priceUsd: r.price,
          priceChange24h: 0,
        });
        added++;
      }
    }
    if (added > 0) {
      log('prices-coingecko-fallback', { added });
    }
  }

  // ✅ FIX: Ensure SOL price is correct (live price + fallback)
  const solPrice = map.get(SOL_MINT)?.priceUsd;
  if (!solPrice || solPrice < 1) {
    // ✅ Get live SOL price from CoinGecko
    const livePrice = await getLiveSolPrice();
    
    map.set(SOL_MINT, {
      priceUsd: livePrice,
      priceChange24h: 0,
      name: 'Solana',
      symbol: 'SOL',
      imageUrl: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    });
  } else {
    // ✅ Ensure SOL price is never shown as scientific notation
    // If price is less than $1, it's wrong for SOL
    if (solPrice < 1) {
      const livePrice = await getLiveSolPrice();
      map.set(SOL_MINT, {
        priceUsd: livePrice,
        priceChange24h: 0,
        name: 'Solana',
        symbol: 'SOL',
        imageUrl: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      });
    }
  }

  return map;
}

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

function shortMint(mint: string): string {
  return mint.length > 12 ? `${mint.slice(0, 4)}...${mint.slice(-4)}` : mint;
}

/* ═══════════════════════════════════════════════════════════════════
   Helius RPC health check
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Verify the Helius API key works by calling getHealth.
 * Call this from the browser console: `testHelius()`
 */
export async function testHelius(): Promise<{ ok: boolean; message: string }> {
  const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'test', method: 'getHealth' }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status} — key may be invalid` };
    }
    const data = await res.json();
    if (data.result === 'ok') {
      return { ok: true, message: 'Helius RPC is healthy ✓' };
    }
    return { ok: false, message: `Unexpected response: ${JSON.stringify(data)}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// Expose for browser-console testing
if (typeof window !== 'undefined') {
  (window as any).testHelius = testHelius;
}
