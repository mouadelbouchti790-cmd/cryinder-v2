import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllStats, type AppStats } from '../services/pocketbase';

const REFRESH_INTERVAL_MS = 30_000;
// After this many consecutive failures (e.g. local dev without PocketBase
// running), stop the interval so a dead backend doesn't spam failed
// requests. Manual refresh() still retries and re-arms polling.
const MAX_CONSECUTIVE_FAILURES = 3;

const EMPTY_STATS: AppStats = {
  totalSwipes: 0,
  totalCPEarned: 0,
  totalSwipers: 0,
};

export interface UseStatsReturn {
  stats: AppStats;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useStats(): UseStatsReturn {
  const [stats, setStats] = useState<AppStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendDown, setBackendDown] = useState(false);
  // Single-flight: StrictMode double-mounts must not fire parallel fetches.
  const inflightRef = useRef(false);
  const failuresRef = useRef(0);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      setError(null);
      const data = await getAllStats();
      setStats(data);
      failuresRef.current = 0;
      setBackendDown(false);
    } catch (err: any) {
      failuresRef.current += 1;
      setError(err.message || 'Failed to load stats');
      if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) setBackendDown(true);
    } finally {
      setLoading(false);
      inflightRef.current = false;
    }
  }, []);

  // Manual retry re-arms polling after a backoff stop.
  const retry = useCallback(async () => {
    failuresRef.current = 0;
    setBackendDown(false);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
    if (backendDown) return;
    const timer = setInterval(() => {
      if (failuresRef.current < MAX_CONSECUTIVE_FAILURES) refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh, backendDown]);

  return { stats, loading, error, refresh: retry };
}
