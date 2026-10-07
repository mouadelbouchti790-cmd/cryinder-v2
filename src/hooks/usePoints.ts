import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getUserPoints,
  addPoints,
  getSwipeReward,
  getHourlyCPEarned,
  checkHourlyCPLimit,
  DAILY_SWIPE_LIMIT,
  HOURLY_CP_LIMIT,
  type CPSource,
  type Points,
} from '../services/pocketbase';

export interface HourlyCPState {
  earned: number;
  remaining: number;
  limit: number;
  capped: boolean;
  nearLimit: boolean;
  resetAt: Date | null;
}

export function usePoints(userId: string | null) {
  const [balance, setBalance] = useState(0);
  const [dailySwipes, setDailySwipes] = useState(0);
  const [dailyLimit] = useState(DAILY_SWIPE_LIMIT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hourly, setHourly] = useState<HourlyCPState>({
    earned: 0,
    remaining: HOURLY_CP_LIMIT,
    limit: HOURLY_CP_LIMIT,
    capped: false,
    nearLimit: false,
    resetAt: null,
  });

  const refreshHourlyTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshHourly = useCallback(async () => {
    if (!userId) return;

    try {
      const [earned, check] = await Promise.all([
        getHourlyCPEarned(),
        checkHourlyCPLimit(0),
      ]);

      setHourly({
        earned: Math.min(earned, HOURLY_CP_LIMIT),
        remaining: check.remaining,
        limit: HOURLY_CP_LIMIT,
        capped: check.remaining <= 0,
        nearLimit: check.remaining > 0 && check.remaining <= 50,
        resetAt: check.resetAt,
      });
    } catch (err) {
      console.warn('[CP] Failed to refresh hourly CP:', err);
    }
  }, [userId]);

  const fetchPoints = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const points = await getUserPoints();
      setBalance(points.balance ?? 0);
      setDailySwipes(points.daily_swipes ?? 0);
      setError(null);
      await refreshHourly();
    } catch (err) {
      // If points don't exist yet, just set defaults
      if (err instanceof Error && err.message.includes('404')) {
        setBalance(0);
        setDailySwipes(0);
      } else {
        setError(err as Error);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, refreshHourly]);

  // Initial fetch
  useEffect(() => {
    fetchPoints();
  }, [fetchPoints]);

  // Re-evaluate the rolling window as it slides forward.
  useEffect(() => {
    if (!userId) return;

    refreshHourlyTimer.current = setInterval(refreshHourly, 60_000);
    return () => {
      if (refreshHourlyTimer.current) clearInterval(refreshHourlyTimer.current);
    };
  }, [userId, refreshHourly]);

  const grantSwipeReward = useCallback(
    async (swipeType: 'right' | 'left'): Promise<Points | null> => {
      if (!userId) return null;

      try {
        const reward = getSwipeReward(swipeType);
        const source: CPSource = swipeType === 'right' ? 'swipe-right' : 'swipe-left';
        const result = await addPoints(userId, reward, source);

        // Update local state from the server truth
        setBalance(result.updated.balance ?? 0);
        setDailySwipes(result.updated.daily_swipes ?? 0);
        await refreshHourly();

        return result.updated;
      } catch (err) {
        console.error('Error granting swipe reward:', err);
        // Refresh on error to sync
        await fetchPoints();
        return null;
      }
    },
    [userId, refreshHourly, fetchPoints],
  );

  return {
    balance,
    dailySwipes,
    dailyLimit,
    hourly,
    loading,
    error,
    grantSwipeReward,
    refreshPoints: fetchPoints,
    refreshHourly,
  };
}
