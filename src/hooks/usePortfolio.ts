import { useState, useEffect, useCallback, useRef } from 'react';
import type { PortfolioHolding, PortfolioMetrics, PortfolioState } from '../types/token';
import { fetchTokenAccounts } from '../services/helius';

const EMPTY_METRICS: PortfolioMetrics = {
  totalValueUsd: 0,
  change24hPct: 0,
  topPerformer: null,
  biggestGainer: null,
  biggestLoser: null,
  mostValuable: null,
  tokenCount: 0,
};

export function computeMetrics(holdings: PortfolioHolding[]): PortfolioMetrics {
  const withValue = holdings.filter((h) => h.valueUsd > 0);

  const totalValueUsd = withValue.reduce((sum, h) => sum + h.valueUsd, 0);

  // Weighted 24h change across holdings with a price
  const priced = withValue.filter((h) => h.priceUsd > 0);
  const priceWeight = priced.reduce((sum, h) => sum + h.valueUsd, 0);
  const change24hPct = priceWeight > 0
    ? priced.reduce((sum, h) => sum + (h.priceChange24h * h.valueUsd), 0) / priceWeight
    : 0;

  const byChange = [...withValue].sort((a, b) => b.priceChange24h - a.priceChange24h);
  const byValue = [...withValue].sort((a, b) => b.valueUsd - a.valueUsd);

  // Top performer = biggest absolute USD gain over 24h, distinct from %-gainer
  const byAbsGain = [...withValue].sort(
    (a, b) =>
      b.valueUsd * (b.priceChange24h / 100) - a.valueUsd * (a.priceChange24h / 100),
  );

  return {
    totalValueUsd,
    change24hPct,
    topPerformer: byAbsGain[0] ?? null,
    biggestGainer: byChange[0] ?? null,
    biggestLoser: byChange[byChange.length - 1] ?? null,
    mostValuable: byValue[0] ?? null,
    tokenCount: holdings.length,
  };
}

export function usePortfolio(walletAddress: string | null): PortfolioState {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [totalValueUsd, setTotalValueUsd] = useState(0);
  const [metrics, setMetrics] = useState<PortfolioMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const seqRef = useRef(0);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!walletAddress) {
        setHoldings([]);
        setTotalValueUsd(0);
        setMetrics(EMPTY_METRICS);
        setLoading(false);
        setRefreshing(false);
        setError(null);
        setLastUpdated(null);
        return;
      }

      mountedRef.current = true;
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const seq = ++seqRef.current;

      try {
        const enriched = await fetchTokenAccounts(walletAddress);
        if (!mountedRef.current || seq !== seqRef.current) return;

        const nextMetrics = computeMetrics(enriched);
        setHoldings(enriched);
        setTotalValueUsd(nextMetrics.totalValueUsd);
        setMetrics(nextMetrics);
        setLastUpdated(Date.now());
      } catch (e: any) {
        if (!mountedRef.current || seq !== seqRef.current) return;
        setError(e.message || 'Failed to load portfolio.');
        setHoldings([]);
        setTotalValueUsd(0);
        setMetrics(EMPTY_METRICS);
      } finally {
        if (mountedRef.current && seq === seqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [walletAddress],
  );

  const retry = useCallback(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    void load(false);
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  return {
    holdings,
    totalValueUsd,
    metrics,
    loading,
    refreshing,
    error,
    lastUpdated,
    retry,
    refresh,
  };
}
