import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getOrCreateLootBox,
  getUserPoints,
  openLootBox,
  checkLootBoxCooldown,
  getRecentLootBoxRewards,
  getBoxCost,
  type LootBox,
  type LootBoxResult,
  type LootBoxHistoryEntry,
} from '../services/pocketbase';

const SPIN_SOUND_URL = '/sounds/spin.mp3';
const COINS_SOUND_URL = '/sounds/coins.mp3';

export type LootBoxSound = 'spin' | 'coins';

export function useLootBoxSounds() {
  const spinRef = useRef<HTMLAudioElement | null>(null);
  const coinsRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const spin = new Audio(SPIN_SOUND_URL);
    const coins = new Audio(COINS_SOUND_URL);
    spin.preload = 'auto';
    coins.preload = 'auto';
    spinRef.current = spin;
    coinsRef.current = coins;
    return () => {
      spinRef.current = null;
      coinsRef.current = null;
    };
  }, []);

  const play = useCallback((sound: LootBoxSound) => {
    const audio = sound === 'spin' ? spinRef.current : coinsRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  const stop = useCallback((sound: LootBoxSound) => {
    const audio = sound === 'spin' ? spinRef.current : coinsRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  return { play, stop };
}

export interface LootBoxState {
  available: boolean;
  streak: number;
  totalOpened: number;
  cooldownHours: number;
  cooldownMinutes: number;
  history: LootBoxHistoryEntry[];
  loading: boolean;
  error: string | null;
  boxCost: number;
  balance: number;
}

export interface UseLootBoxReturn extends LootBoxState {
  open: () => Promise<LootBoxResult | null>;
  refresh: () => Promise<void>;
}

export function useLootBox(userId: string | null, intervalMs: number = 60000): UseLootBoxReturn {
  const [lootBox, setLootBox] = useState<LootBox | null>(null);
  const [history, setHistory] = useState<LootBoxHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const lb = await getOrCreateLootBox();
      setLootBox(lb);
      try {
        const points = await getUserPoints();
        setBalance(Number(points.balance || 0));
      } catch {
        /* balance stays at last known value when points read fails */
      }
      getRecentLootBoxRewards(5).then((data) => setHistory(Array.isArray(data) ? data : [])).catch(() => {});
    } catch (err: any) {
      setError(err.message || 'Failed to load loot box');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);

    cooldownRef.current = setInterval(() => {
      if (lootBox) {
        setLootBox({ ...lootBox });
      }
    }, intervalMs);

    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [lootBox, intervalMs]);

  const cooldown = lootBox ? checkLootBoxCooldown(lootBox) : null;
  const boxCost = lootBox ? getBoxCost(Number(lootBox.total_opened || 0)) : 100;

  const open = useCallback(async (): Promise<LootBoxResult | null> => {
    if (!userId) return null;

    try {
      setError(null);
      setLoading(true);
      const result = await openLootBox();
      await refresh();
      return result;
    } catch (err: any) {
      setError(err.message || 'Failed to open loot box');
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId, refresh]);

  return {
    available: cooldown?.available ?? false,
    streak: lootBox?.streak ?? 0,
    totalOpened: lootBox?.total_opened ?? 0,
    cooldownHours: cooldown?.hoursRemaining ?? 0,
    cooldownMinutes: cooldown?.minutesRemaining ?? 0,
    history,
    loading,
    error,
    boxCost,
    balance,
    open,
    refresh,
  };
}
