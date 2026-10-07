import { useState, useEffect, useCallback, useRef } from 'react';
import type { DeckTab, TokenData } from '../types/token';
import {
  fetchTokenFeedByTab,
  fetchSolanaGainers,
  fetchMoreTokens,
  sortTokens,
  resetDiscoveryCursor,
} from '../services/dexscreener';
import { enrichTokensWithLiquidity } from '../services/liquidity';

const LOAD_MORE_THRESHOLD = 5;

/** How long to wait before retrying after exhaustion (ms) */
const EXHAUSTED_COOLDOWN_MS = 60_000;

export interface InfiniteFeedState {
  tokens: TokenData[];
  currentIndex: number;
  setCurrentIndex: (idx: number | ((prev: number) => number)) => void;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  fromMock: boolean;
  retry: () => void;
  injectToken: (token: TokenData) => void;
}

/**
 * Infinite swipe feed for Cryinder.
 *
 * - Initial fetch sorted by active tab.
 * - Appends sorted batches when the user nears the end.
 * - Stall-based exhaustion with cooldown retry — even if exhausted,
 *   will try again after a 60s cooldown since new tokens are created
 *   constantly.
 * - Resets everything on tab switches.
 */
export function useInfiniteTokenFeed(activeTab: DeckTab): InfiniteFeedState {
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [fromMock, setFromMock] = useState(false);

  const seenMintsRef = useRef(new Set<string>());
  const loadMoreInFlight = useRef(false);
  const generationRef = useRef(0);
  const exhaustedAtRef = useRef<number>(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mints the user explicitly injected via search — these must survive
  // fetch cycles (tab switches / retries) so the card stays swipeable.
  const injectedRef = useRef<Map<string, TokenData>>(new Map());

  function markSeen(newTokens: TokenData[]) {
    for (const t of newTokens) {
      seenMintsRef.current.add(t.mintAddress);
    }
  }

  /**
   * Fire-and-forget liquidity enrichment. Renders tokens immediately
   * (never blocks the deck) and patches in real liquidity once the
   * enrichment sources answer, using mint address as the stable key.
   */
  const enrichDeck = useCallback((tokens: TokenData[], gen: number) => {
    enrichTokensWithLiquidity(tokens).then((enriched) => {
      if (generationRef.current !== gen || enriched.length === 0) return;
      setTokens((prev) => {
        const byMint = new Map(enriched.map((t) => [t.mintAddress, t]));
        let changed = false;
        const next = prev.map((t) => {
          const richer = byMint.get(t.mintAddress);
          if (richer && richer.liquidityUsd > (t.liquidityUsd || 0)) {
            changed = true;
            return richer;
          }
          return t;
        });
        return changed ? next : prev;
      });
    }).catch(() => {
      /* enrichment is best-effort; cards keep their original values */
    });
  }, []);

  // ── Search injection ──

  const injectToken = useCallback((token: TokenData) => {
    injectedRef.current.set(token.mintAddress, token);
    seenMintsRef.current.add(token.mintAddress);

    setTokens((prev) => {
      // Dedup: if the same mint is already in the deck, drop the old card
      // so it doesn't reappear later.
      const without = prev.filter((t) => t.mintAddress !== token.mintAddress);
      return [token, ...without];
    });
    setCurrentIndex(0);
    setError(null);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  // ── Initial fetch (resets on tab change) ──

  const doInitialFetch = useCallback(async () => {
    const gen = ++generationRef.current;
    loadMoreInFlight.current = false;

    // Keep injected mints "seen" across resets so fetch cycles can't
    // re-add duplicates of cards the user explicitly searched for.
    seenMintsRef.current = new Set(injectedRef.current.keys());
    exhaustedAtRef.current = 0;

    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }

    setTokens([]);
    setCurrentIndex(0);
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setHasMore(true);
    setFromMock(false);
    resetDiscoveryCursor();

    try {
      const result = activeTab === 'gainers'
        ? await fetchSolanaGainers()
        : await fetchTokenFeedByTab(activeTab);
      if (generationRef.current !== gen) return;

      markSeen(result.tokens);
      const sorted = sortTokens(result.tokens, activeTab);

      // Surviving injected tokens ride on top of every fetch cycle.
      const injected = Array.from(injectedRef.current.values());
      const injectedMints = new Set(injected.map((t) => t.mintAddress));
      setTokens([...injected, ...sorted.filter((t) => !injectedMints.has(t.mintAddress))]);
      setFromMock(result.fromMock);

      // Best-effort real liquidity enrichment (never blocks the deck).
      enrichDeck(sorted, gen);

      // If the initial load returned mock data, don't try infinite fetch
      if (result.fromMock) {
        setHasMore(false);
      }
    } catch (e: any) {
      if (generationRef.current !== gen) return;
      setError(e.message || 'Failed to load tokens.');
    } finally {
      if (generationRef.current === gen) {
        setLoading(false);
      }
    }
  }, [activeTab]);

  // Cleanup cooldown timer on unmount (but not on tab change — that's handled above)
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    doInitialFetch();
  }, [doInitialFetch]);

  // ── Load more ──

  const doLoadMore = useCallback(async () => {
    if (loadMoreInFlight.current) return;

    // Check cooldown: if we were recently exhausted, wait before retrying
    if (exhaustedAtRef.current > 0) {
      const elapsed = Date.now() - exhaustedAtRef.current;
      if (elapsed < EXHAUSTED_COOLDOWN_MS) {
        // Still in cooldown — don't try yet
        return;
      }
      // Cooldown elapsed — reset exhaustion and try again
      exhaustedAtRef.current = 0;
      resetDiscoveryCursor();
      setHasMore(true);
    }

    loadMoreInFlight.current = true;
    const gen = generationRef.current;
    setLoadingMore(true);

    try {
      // Gainers load-more asks for MORE ranked real gainers (deeper
      // ranking) — never random discovery keywords, which is exactly
      // the junk that used to pollute this tab.
      const result = activeTab === 'gainers'
        ? { tokens: await fetchSolanaGainers().then((r) => r.tokens), exhausted: false }
        : await fetchMoreTokens(seenMintsRef.current);
      if (generationRef.current !== gen) return;

      const fresh = result.tokens.filter(
        (t) => !seenMintsRef.current.has(t.mintAddress),
      );
      // Gainers has a bounded real ranking: if the cached pool adds
      // nothing new, treat it as exhausted so the cooldown throttles
      // re-fetching instead of hot-looping the API.
      const isExhausted =
        result.exhausted || (activeTab === 'gainers' && fresh.length === 0);
      if (fresh.length > 0) {
        markSeen(fresh);
        const sorted = sortTokens(fresh, activeTab);
        setTokens((prev) => [...prev, ...sorted]);
        setHasMore(true);
        exhaustedAtRef.current = 0;
        // Same best-effort enrichment for load-more batches.
        enrichDeck(sorted, gen);
      } else if (isExhausted) {
        // Exhausted — record the time and schedule a cooldown retry
        exhaustedAtRef.current = Date.now();
        setHasMore(false);

        // Schedule a retry after cooldown
        if (cooldownTimerRef.current) {
          clearTimeout(cooldownTimerRef.current);
        }
        cooldownTimerRef.current = setTimeout(() => {
          // After cooldown, mark as having more so the auto-trigger can fire again
          if (generationRef.current === gen) {
            setHasMore(true);
          }
        }, EXHAUSTED_COOLDOWN_MS);
      }
      // If not exhausted but all were dupes, just try again next threshold
    } catch (e: any) {
      if (generationRef.current !== gen) return;
      console.warn('Load more failed:', e.message);
    } finally {
      if (generationRef.current === gen) {
        setLoadingMore(false);
      }
      loadMoreInFlight.current = false;
    }
  }, [activeTab]);

  // ── Auto-trigger load more when near the end ──

  const remaining = tokens.length - currentIndex;

  useEffect(() => {
    if (
      remaining <= LOAD_MORE_THRESHOLD &&
      hasMore &&
      !loading &&
      !loadingMore
    ) {
      doLoadMore();
    }
  }, [remaining, hasMore, loading, loadingMore, doLoadMore]);

  return {
    tokens,
    currentIndex,
    setCurrentIndex,
    loading,
    loadingMore,
    error,
    hasMore,
    fromMock,
    retry: doInitialFetch,
    injectToken,
  };
}
