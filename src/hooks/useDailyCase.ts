import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  DAILY_REWARDS,
  CASE_TIERS,
  DAILY_COOLDOWN_MS,
  XP_PER_CASE_OPEN,
  rollDailyReward,
  type DailyReward,
} from '../data/dailyCase';

const LS_NEXT = 'cryinder:daily-case:next-available-at';
const LS_XP = 'cryinder:daily-case:xp';
const LS_LAST = 'cryinder:daily-case:last-reward';
const LS_DEMO = 'cryinder:daily-case:demo-count';

export type DailyCaseStatus = 'available' | 'opening' | 'revealed' | 'cooldown' | 'locked';

export interface UseDailyCaseReturn {
  status: DailyCaseStatus;
  xp: number;
  currentTierIndex: number;
  nextTierIndex: number;
  xpIntoLevel: number;
  xpForLevel: number;
  xpPct: number;
  cooldownMs: number;
  cooldownText: string;
  lastReward: DailyReward | null;
  pendingReward: DailyReward | null;
  demoMode: boolean;
  openCase: (demo?: boolean) => DailyReward | null;
  confirmReward: () => void;
  resetDemo: () => void;
  caseId: string;
}

function readNum(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

export function useDailyCase(userId: string | null, externalXp?: number): UseDailyCaseReturn {
  const storageSuffix = userId ?? 'guest';
  const nextKey = `${LS_NEXT}:${storageSuffix}`;
  const xpKey = `${LS_XP}:${storageSuffix}`;
  const lastKey = `${LS_LAST}:${storageSuffix}`;

  const [now, setNow] = useState(() => Date.now());
  const [nextAt, setNextAt] = useState(() => readNum(nextKey, 0));
  const [xp, setXp] = useState(() => {
    if (typeof externalXp === 'number') return externalXp;
    return readNum(xpKey, 1044);
  });
  const [pendingReward, setPendingReward] = useState<DailyReward | null>(null);
  const [lastReward, setLastReward] = useState<DailyReward | null>(() => {
    try {
      const raw = localStorage.getItem(lastKey);
      if (!raw) return null;
      const found = DAILY_REWARDS.find((r) => r.id === raw);
      return found ?? null;
    } catch {
      return null;
    }
  });
  const [demoMode, setDemoMode] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // tick every second for countdown
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // persist xp
  useEffect(() => {
    try {
      localStorage.setItem(xpKey, String(xp));
    } catch { /* noop */ }
  }, [xp, xpKey]);

  // reload per-user state when user changes
  useEffect(() => {
    setNextAt(readNum(nextKey, 0));
    if (typeof externalXp === 'number') {
      setXp(externalXp);
    } else {
      setXp(readNum(xpKey, 1044));
    }
    setPendingReward(null);
    setIsOpening(false);
    setDemoMode(false);
    try {
      const raw = localStorage.getItem(lastKey);
      setLastReward(DAILY_REWARDS.find((r) => r.id === raw) ?? null);
    } catch {
      setLastReward(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageSuffix]);

  const cooldownMs = Math.max(0, nextAt - now);
  const onCooldown = nextAt > 0 && cooldownMs > 0;

  const tierInfo = useMemo(() => {
    let current = 0;
    CASE_TIERS.forEach((t, i) => {
      if (xp >= t.xpRequired) current = i;
    });
    const next = Math.min(current + 1, CASE_TIERS.length - 1);
    const curReq = CASE_TIERS[current].xpRequired;
    const nextReq = CASE_TIERS[next].xpRequired;
    const span = Math.max(1, nextReq - curReq);
    const into = current === CASE_TIERS.length - 1 ? span : Math.max(0, xp - curReq);
    return {
      currentTierIndex: current,
      nextTierIndex: current === CASE_TIERS.length - 1 ? current : next,
      xpIntoLevel: current === CASE_TIERS.length - 1 ? span : into,
      xpForLevel: current === CASE_TIERS.length - 1 ? span : span,
      xpPct: current === CASE_TIERS.length - 1 ? 1 : Math.min(1, into / span),
    };
  }, [xp]);

  const status: DailyCaseStatus = useMemo(() => {
    if (isOpening) return 'opening';
    if (pendingReward) return 'revealed';
    if (onCooldown) return 'cooldown';
    return 'available';
  }, [isOpening, pendingReward, onCooldown]);

  const openCase = useCallback(
    (demo = false): DailyReward | null => {
      if (isOpening || pendingReward) return null;
      if (!demo && onCooldown) return null;
      const reward = rollDailyReward();
      setDemoMode(demo);
      setIsOpening(true);
      setPendingReward(reward);
      if (!demo) {
        try {
          localStorage.setItem(LS_DEMO, String(readNum(LS_DEMO, 0)));
        } catch { /* noop */ }
      }
      return reward;
    },
    [isOpening, pendingReward, onCooldown],
  );

  const confirmReward = useCallback(() => {
    if (!pendingReward) {
      setIsOpening(false);
      return;
    }
    if (!demoMode) {
      const t = Date.now() + DAILY_COOLDOWN_MS;
      setNextAt(t);
      try {
        localStorage.setItem(nextKey, String(t));
        localStorage.setItem(lastKey, pendingReward.id);
      } catch { /* noop */ }
      setLastReward(pendingReward);
      setXp((x) => x + XP_PER_CASE_OPEN);
    }
    setPendingReward(null);
    setIsOpening(false);
    setDemoMode(false);
    setNow(Date.now());
  }, [pendingReward, demoMode, nextKey, lastKey]);

  const resetDemo = useCallback(() => {
    setPendingReward(null);
    setIsOpening(false);
    setDemoMode(false);
  }, []);

  return {
    status,
    xp,
    currentTierIndex: tierInfo.currentTierIndex,
    nextTierIndex: tierInfo.nextTierIndex,
    xpIntoLevel: tierInfo.xpIntoLevel,
    xpForLevel: tierInfo.xpForLevel,
    xpPct: tierInfo.xpPct,
    cooldownMs,
    cooldownText: fmtCountdown(cooldownMs),
    lastReward,
    pendingReward,
    demoMode,
    openCase,
    confirmReward,
    resetDemo,
    caseId: CASE_TIERS[tierInfo.currentTierIndex].caseId,
  };
}
