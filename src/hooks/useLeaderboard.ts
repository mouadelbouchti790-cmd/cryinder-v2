import { useState, useEffect, useCallback } from 'react';
import {
  getLeaderboard,
  getUserRank,
  getTopSwipers,
  getTopTokens,
  type LeaderboardEntry,
  type SwiperRankingEntry,
  type TokenRankingEntry,
} from '../services/pocketbase';

const REFRESH_INTERVAL_MS = 60_000;

export interface UseLeaderboardReturn {
  cpRankings: LeaderboardEntry[];
  swiperRankings: SwiperRankingEntry[];
  tokenRankings: TokenRankingEntry[];
  userRank: number | null;
  loading: boolean;
  swipersLoading: boolean;
  tokensLoading: boolean;
  error: string | null;
  swipersError: string | null;
  tokensError: string | null;
  refresh: () => Promise<void>;
  refreshSwipers: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  fetchUserRank: (userId: string | null) => Promise<void>;
}

export function useLeaderboard(userId?: string | null): UseLeaderboardReturn {
  const [cpRankings, setCpRankings] = useState<LeaderboardEntry[]>([]);
  const [swiperRankings, setSwiperRankings] = useState<SwiperRankingEntry[]>([]);
  const [tokenRankings, setTokenRankings] = useState<TokenRankingEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [swipersLoading, setSwipersLoading] = useState(true);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [swipersError, setSwipersError] = useState<string | null>(null);
  const [tokensError, setTokensError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await getLeaderboard(100);
      // API returns { items: [...] } wrapper - extract the array
      const items = Array.isArray(data) ? data : (data?.items ?? []);
      setCpRankings(items);
    } catch (err: any) {
      setError(err.message || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSwipers = useCallback(async () => {
    try {
      setSwipersError(null);
      const data = await getTopSwipers(100);
      // API returns { items: [...] } wrapper - extract the array
      const items = Array.isArray(data) ? data : (data?.items ?? []);
      setSwiperRankings(items);
    } catch (err: any) {
      setSwipersError(err.message || 'Failed to load top swipers');
    } finally {
      setSwipersLoading(false);
    }
  }, []);

  const refreshTokens = useCallback(async () => {
    try {
      setTokensError(null);
      const data = await getTopTokens(100);
      // API returns { items: [...] } wrapper - extract the array
      const items = Array.isArray(data) ? data : (data?.items ?? []);
      setTokenRankings(items);
    } catch (err: any) {
      setTokensError(err.message || 'Failed to load top tokens');
    } finally {
      setTokensLoading(false);
    }
  }, []);

  const fetchUserRank = useCallback(async (_id: string | null) => {
    // Server derives the user from the session token; the id argument
    // is kept for backward compatibility but no longer sent.
    try {
      const rank = await getUserRank();
      setUserRank(rank);
    } catch {
      setUserRank(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshSwipers();
    refreshTokens();
    const timer = setInterval(() => {
      refresh();
      refreshSwipers();
      refreshTokens();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh, refreshSwipers, refreshTokens]);

  useEffect(() => {
    fetchUserRank(userId ?? null);
  }, [userId, fetchUserRank]);

  return {
    cpRankings,
    swiperRankings,
    tokenRankings,
    userRank,
    loading,
    swipersLoading,
    tokensLoading,
    error,
    swipersError,
    tokensError,
    refresh,
    refreshSwipers,
    refreshTokens,
    fetchUserRank,
  };
}
