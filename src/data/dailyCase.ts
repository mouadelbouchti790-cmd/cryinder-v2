/* ── Cryinder Daily Case — economy config ───────────────────────────
   CP = reward currency. XP = progression only.
   NEVER add SOL / ETH / BTC / memecoins here.
------------------------------------------------------------------- */

export type CaseRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export interface DailyReward {
  id: string;
  amount: number;
  label: string; // "+1,000 CP"
  rarity: CaseRarity;
  chancePct: number; // display only, understated
  weight: number; // roll weight
}

export const RARITY_COLORS: Record<CaseRarity, string> = {
  COMMON: '#526373',
  UNCOMMON: '#1676B5',
  RARE: '#18BFFF',
  EPIC: '#5867E8',
  LEGENDARY: '#63E7FF',
};

export const DAILY_REWARDS: DailyReward[] = [
  { id: 'cp-100', amount: 100, label: '+100 CP', rarity: 'COMMON', chancePct: 32.0, weight: 32 },
  { id: 'cp-250', amount: 250, label: '+250 CP', rarity: 'COMMON', chancePct: 24.0, weight: 24 },
  { id: 'cp-500', amount: 500, label: '+500 CP', rarity: 'UNCOMMON', chancePct: 17.0, weight: 17 },
  { id: 'cp-750', amount: 750, label: '+750 CP', rarity: 'UNCOMMON', chancePct: 12.0, weight: 12 },
  { id: 'cp-1000', amount: 1000, label: '+1,000 CP', rarity: 'RARE', chancePct: 8.0, weight: 8 },
  { id: 'cp-2500', amount: 2500, label: '+2,500 CP', rarity: 'RARE', chancePct: 4.5, weight: 4.5 },
  { id: 'cp-5000', amount: 5000, label: '+5,000 CP', rarity: 'EPIC', chancePct: 2.0, weight: 2 },
  { id: 'cp-10000', amount: 10000, label: '+10,000 CP', rarity: 'LEGENDARY', chancePct: 0.5, weight: 0.5 },
];

export interface CaseTier {
  id: string;
  name: string;
  xpRequired: number; // cumulative XP to reach
  caseId: string;
  rewardPoolIds: string[];
}

export const CASE_TIERS: CaseTier[] = [
  { id: 'starter', name: 'STARTER', xpRequired: 0, caseId: 'CRY-STARTER-01', rewardPoolIds: ['cp-100', 'cp-250', 'cp-500', 'cp-750', 'cp-1000', 'cp-2500', 'cp-5000', 'cp-10000'] },
  { id: 'trader', name: 'TRADER', xpRequired: 10000, caseId: 'CRY-TRADER-02', rewardPoolIds: ['cp-100', 'cp-250', 'cp-500', 'cp-750', 'cp-1000', 'cp-2500', 'cp-5000', 'cp-10000'] },
  { id: 'pro', name: 'PRO', xpRequired: 50000, caseId: 'CRY-PRO-03', rewardPoolIds: ['cp-100', 'cp-250', 'cp-500', 'cp-750', 'cp-1000', 'cp-2500', 'cp-5000', 'cp-10000'] },
  { id: 'elite', name: 'ELITE', xpRequired: 150000, caseId: 'CRY-ELITE-04', rewardPoolIds: ['cp-100', 'cp-250', 'cp-500', 'cp-750', 'cp-1000', 'cp-2500', 'cp-5000', 'cp-10000'] },
  { id: 'master', name: 'MASTER', xpRequired: 400000, caseId: 'CRY-MASTER-05', rewardPoolIds: ['cp-100', 'cp-250', 'cp-500', 'cp-750', 'cp-1000', 'cp-2500', 'cp-5000', 'cp-10000'] },
];

export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const XP_PER_CASE_OPEN = 1250;

export function rollDailyReward(pool: DailyReward[] = DAILY_REWARDS): DailyReward {
  const total = pool.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of pool) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return pool[0];
}
