/**
 * All-Time High (ATH) price tracker.
 *
 * DexScreener doesn't provide ATH data, so we track the highest price
 * seen per token locally. Values persist to localStorage so they survive
 * page reloads but are never shared across devices.
 *
 * The tracker is seeded with the first price seen for each token and
 * only updates when a higher price is observed. This means the ATH
 * will always be >= the first price the user saw.
 */

interface AthEntry {
  /** Highest USD price observed for this token. */
  price: number;
  /** Unix ms timestamp when this ATH was recorded. */
  at: number;
}

const STORAGE_KEY = 'cryinder_ath_cache';
const MAX_ENTRIES = 500;
const STORAGE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

let memoryCache: Map<string, AthEntry> | null = null;

function loadCache(): Map<string, AthEntry> {
  if (memoryCache) return memoryCache;
  memoryCache = new Map();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: Record<string, AthEntry> = JSON.parse(raw);
      const now = Date.now();
      for (const [key, entry] of Object.entries(parsed)) {
        if (now - entry.at < STORAGE_TTL_MS) {
          memoryCache.set(key, entry);
        }
      }
    }
  } catch {
    // Corrupted storage — start fresh
  }
  return memoryCache;
}

function saveCache(): void {
  if (!memoryCache) return;
  try {
    // Evict oldest entries if over limit
    if (memoryCache.size > MAX_ENTRIES) {
      const sorted = [...memoryCache.entries()].sort(
        (a, b) => a[1].at - b[1].at,
      );
      const toRemove = sorted.slice(0, sorted.length - MAX_ENTRIES);
      for (const [key] of toRemove) {
        memoryCache.delete(key);
      }
    }
    const obj: Record<string, AthEntry> = {};
    for (const [key, entry] of memoryCache) {
      obj[key] = entry;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Storage full — silently fail
  }
}

/**
 * Record a price observation for a token. If it's higher than the
 * stored ATH, the cache is updated. Returns the current ATH entry.
 */
export function recordPrice(
  tokenAddress: string,
  currentPrice: number,
): AthEntry | null {
  if (!tokenAddress || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return null;
  }

  const cache = loadCache();
  const existing = cache.get(tokenAddress);

  if (!existing || currentPrice > existing.price) {
    const entry: AthEntry = { price: currentPrice, at: Date.now() };
    cache.set(tokenAddress, entry);
    saveCache();
    return entry;
  }

  return existing;
}

/**
 * Get the stored ATH for a token (without updating).
 * Returns null if no ATH has been recorded yet.
 */
export function getAth(tokenAddress: string): AthEntry | null {
  if (!tokenAddress) return null;
  const cache = loadCache();
  return cache.get(tokenAddress) ?? null;
}

/**
 * Compute discount info between current price and ATH.
 * Returns null if ATH is unknown.
 */
export interface AthDiscount {
  /** Percentage below ATH (positive = discount, negative = above ATH). */
  discountPct: number;
  /** The ATH price. */
  athPrice: number;
  /** Classification of the discount. */
  tier: 'deep' | 'good' | 'near' | 'above';
}

export function getAthDiscount(
  tokenAddress: string,
  currentPrice: number,
): AthDiscount | null {
  const ath = getAth(tokenAddress);
  if (!ath || ath.price <= 0 || currentPrice <= 0) return null;

  const discountPct = ((ath.price - currentPrice) / ath.price) * 100;

  let tier: AthDiscount['tier'];
  if (discountPct >= 50) tier = 'deep';
  else if (discountPct >= 20) tier = 'good';
  else if (discountPct > 0) tier = 'near';
  else tier = 'above';

  return { discountPct, athPrice: ath.price, tier };
}

/**
 * Clear all stored ATH data. Useful for development/debugging.
 */
export function clearAthCache(): void {
  memoryCache = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
