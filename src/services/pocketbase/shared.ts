/**
 * Shared PocketBase types, constants, and pure helpers.
 *
 * Imported by BOTH the browser client facade (index.ts) and the
 * server-side backend (serverBackend.ts). Must stay free of Node,
 * PocketBase SDK, and env access so it is safe to ship to the client.
 */

// ─── Types ─────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
  wallet: string;
  verified: boolean;
  emailVisibility: boolean;
  usernameSet: boolean;
  usernameChangedAt?: string;
  created: string;
  updated: string;
}

export interface Points {
  id: string;
  user: string;
  balance: number;
  daily_swipes: number;
  last_swipe_date: string;
  created: string;
  updated: string;
}

export interface LootBox {
  id: string;
  user: string;
  last_open_date: string | null;
  streak: number;
  total_opened: number;
  created: string;
  updated: string;
}

export type CPSource = 'swipe-left' | 'swipe-right' | 'loot-box' | 'jackpot';

export interface CPHistoryRecord {
  id: string;
  user: string;
  amount: number;
  source: string;
  created: string;
}

export interface HourlyCPCheck {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export interface AddPointsResult {
  updated: Points;
  hourlyLimited: boolean;
  hourlyEarned: number;
  hourlyRemaining: number;
  hourlyResetAt: Date;
}

export interface LootBoxHistoryEntry {
  id: string;
  amount: number;
  source: string;
  created: string;
}

export interface AppStats {
  totalSwipes: number;
  totalCPEarned: number;
  totalSwipers: number;
}

export interface LeaderboardEntry {
  userId: string;
  userName: string | null;
  rank: number;
  value: number;
  byline: string | null;
}

export interface SwiperRankingEntry {
  userId: string;
  userName: string | null;
  rank: number;
  value: number;
  byline: string | null;
}

export interface TokenRankingEntry {
  tokenId: string;
  tokenSymbol: string;
  tokenName: string;
  tokenPrice: number;
  rank: number;
  value: number;
}

export type LootTier = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface LootTierConfig {
  tier: LootTier;
  label: string;
  icon: 'coin' | 'diamond' | 'flame' | 'gem' | 'slot';
  minReward: number;
  maxReward: number;
  chancePct: number;
  color: string;
}

export interface LootBoxResult {
  baseReward: number;
  isJackpot: boolean;
  tier: LootTier;
  streak: number;
  streakMultiplier: number;
  bonusReward: number;
  totalReward: number;
  awardedCP: number;
  totalOpened: number;
  boxCost: number;
}

// ─── Constants ─────────────────────────────────────────────────────

export const COLLECTION = 'users';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
export const USERNAME_COOLDOWN_DAYS = 30;

export const DAILY_SWIPE_LIMIT = 200;
export const HOURLY_CP_LIMIT = 350;
export const CP_HISTORY_COLLECTION = 'cp_history';
export const HOURLY_WINDOW_MS = 60 * 60 * 1000;

const HOURLY_EXEMPT_SOURCES = new Set<CPSource>(['loot-box', 'jackpot']);
export function isHourlyExempt(source: CPSource): boolean {
  return HOURLY_EXEMPT_SOURCES.has(source);
}

export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function getSwipeReward(swipeType: 'right' | 'left'): number {
  if (swipeType === 'left') return 3;
  return 25;
}

// ─── Usernames ─────────────────────────────────────────────────────

export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (username.length < USERNAME_MIN) {
    return { valid: false, error: `Username must be at least ${USERNAME_MIN} characters.` };
  }

  if (username.length > USERNAME_MAX) {
    return { valid: false, error: `Username must be at most ${USERNAME_MAX} characters.` };
  }

  if (!USERNAME_REGEX.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, and underscores.' };
  }

  return { valid: true };
}

export function cooldownDaysRemaining(lastChangedAt: string | null | undefined): number {
  if (!lastChangedAt) return 0;

  const lastChanged = new Date(lastChangedAt);
  const now = new Date();
  const daysSince = (now.getTime() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
  const remaining = USERNAME_COOLDOWN_DAYS - Math.floor(daysSince);

  return remaining > 0 ? remaining : 0;
}

// ─── Loot box ──────────────────────────────────────────────────────

export function checkLootBoxCooldown(lootBox: LootBox): {
  available: boolean;
  hoursRemaining: number;
  minutesRemaining: number;
} {
  if (!lootBox.last_open_date) {
    return { available: true, hoursRemaining: 0, minutesRemaining: 0 };
  }

  const lastOpen = new Date(lootBox.last_open_date);
  const now = new Date();
  const msSinceOpen = now.getTime() - lastOpen.getTime();
  const hoursSinceOpen = msSinceOpen / (1000 * 60 * 60);
  const msIn24h = 24 * 60 * 60 * 1000;

  if (hoursSinceOpen >= 24) {
    return { available: true, hoursRemaining: 0, minutesRemaining: 0 };
  }

  const msRemaining = msIn24h - msSinceOpen;
  const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));

  return { available: false, hoursRemaining, minutesRemaining };
}

export const LOOT_BOX_BASE_COST = 100;
export const LOOT_BOX_CURVE_MULTIPLIER = 1.15;

export const LOOT_TIERS: LootTierConfig[] = [
  { tier: 'common', label: 'Common', icon: 'coin', minReward: 300, maxReward: 450, chancePct: 50, color: '#526373' },
  { tier: 'rare', label: 'Rare', icon: 'diamond', minReward: 600, maxReward: 1200, chancePct: 28, color: '#1676B5' },
  { tier: 'epic', label: 'Epic', icon: 'flame', minReward: 1500, maxReward: 3000, chancePct: 14, color: '#18BFFF' },
  { tier: 'legendary', label: 'Legendary', icon: 'gem', minReward: 3500, maxReward: 6000, chancePct: 6, color: '#5867E8' },
  { tier: 'mythic', label: 'Mythic', icon: 'slot', minReward: 7500, maxReward: 15000, chancePct: 2, color: '#63E7FF' },
];

export function getTierConfig(tier: LootTier): LootTierConfig {
  return LOOT_TIERS.find((t) => t.tier === tier) ?? LOOT_TIERS[0];
}

function secureRandom(): number {
  try {
    const cryptoObj =
      typeof globalThis !== 'undefined'
        ? (globalThis as unknown as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array; randomBytes?: (n: number) => Uint8Array } }).crypto
        : undefined;
    if (cryptoObj?.getRandomValues) {
      const buf = new Uint32Array(1);
      cryptoObj.getRandomValues(buf);
      return buf[0] / 0xffffffff;
    }
  } catch {
    /* fall through to Math.random */
  }
  return Math.random();
}

export function generateLootBoxReward(): { baseReward: number; isJackpot: boolean; tier: LootTier } {
  const roll = secureRandom() * 100;

  let cumulative = 0;
  let selected: LootTierConfig = LOOT_TIERS[0];
  for (const config of LOOT_TIERS) {
    cumulative += config.chancePct;
    if (roll < cumulative) {
      selected = config;
      break;
    }
  }

  if (selected.tier === 'mythic') {
    return { baseReward: selected.minReward, isJackpot: true, tier: 'mythic' };
  }

  const baseReward =
    Math.floor(secureRandom() * (selected.maxReward - selected.minReward + 1)) + selected.minReward;
  return { baseReward, isJackpot: false, tier: selected.tier };
}

export function getBoxCost(totalOpened: number): number {
  return Math.floor(LOOT_BOX_BASE_COST * Math.pow(LOOT_BOX_CURVE_MULTIPLIER, totalOpened));
}

export function getStreakMultiplier(streak: number): number {
  if (streak <= 1) return 1;
  if (streak >= 15) return 10;
  return Math.round((1 + ((streak - 1) / 14) * 9) * 10) / 10;
}

export function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

/**
 * Minimal collection surface needed by addPointsServer. Implemented by the
 * PocketBase SDK on the server; keeps shared.ts free of the SDK import.
 */
export interface PbCollectionClient {
  collection: (name: string) => {
    getFirstListItem: (filter: string) => Promise<Record<string, unknown>>;
    getFullList: (options?: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
    create: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
    update: (id: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
}

export interface AddPointsServerDeps<TPb = PbCollectionClient> {
  getOrCreatePoints: (pb: TPb, userId: string) => Promise<Points>;
  checkHourlyCPLimit: (pb: TPb, userId: string, reward: number) => Promise<HourlyCPCheck>;
  recordCPEarned: (pb: TPb, userId: string, amount: number, source: CPSource) => Promise<void>;
  getTodayDate: () => string;
}

/**
 * Shared award logic: daily-swipe cap, hourly rolling window, history
 * recording. Runs ONLY on the server so reward rules cannot be gamed
 * from the client.
 */
export async function addPointsServer<TPb extends PbCollectionClient>(
  pb: TPb,
  userId: string,
  amount: number,
  source: CPSource,
  deps: AddPointsServerDeps<TPb>,
  options: { countSwipe?: boolean } = {},
): Promise<AddPointsResult> {
  const { countSwipe = true } = options;
  const today = deps.getTodayDate();

  const points = await deps.getOrCreatePoints(pb, userId);

  const isNewDay = points.last_swipe_date !== today;
  const currentDailySwipes = isNewDay ? 0 : (points.daily_swipes ?? 0);

  if (countSwipe && currentDailySwipes >= DAILY_SWIPE_LIMIT) {
    const limit = await deps.checkHourlyCPLimit(pb, userId, amount);
    return {
      updated: points,
      hourlyLimited: false,
      hourlyEarned: HOURLY_CP_LIMIT - limit.remaining,
      hourlyRemaining: limit.remaining,
      hourlyResetAt: limit.resetAt,
    };
  }

  if (!isHourlyExempt(source)) {
    const limit = await deps.checkHourlyCPLimit(pb, userId, amount);
    if (!limit.allowed) {
      console.warn(
        `[CP] Hourly cap reached (${HOURLY_CP_LIMIT - limit.remaining}/${HOURLY_CP_LIMIT} CP). ` +
          `Skipping +${amount} CP from "${source}".`,
      );

      if (countSwipe) {
        const updated = toPointsRecord(
          await pb.collection('points').update(points.id, {
            daily_swipes: currentDailySwipes + 1,
            last_swipe_date: today,
          }),
        );
        return {
          updated,
          hourlyLimited: true,
          hourlyEarned: HOURLY_CP_LIMIT - limit.remaining,
          hourlyRemaining: 0,
          hourlyResetAt: limit.resetAt,
        };
      }

      return {
        updated: points,
        hourlyLimited: true,
        hourlyEarned: HOURLY_CP_LIMIT - limit.remaining,
        hourlyRemaining: 0,
        hourlyResetAt: limit.resetAt,
      };
    }
  }

  const newDailySwipes = countSwipe ? currentDailySwipes + 1 : currentDailySwipes;
  const newBalance = (points.balance ?? 0) + amount;

  const updated = toPointsRecord(
    await pb.collection('points').update(points.id, {
      balance: newBalance,
      daily_swipes: newDailySwipes,
      last_swipe_date: today,
    }),
  );

  await deps.recordCPEarned(pb, userId, amount, source);

  const limit = await deps.checkHourlyCPLimit(pb, userId, 0);

  return {
    updated,
    hourlyLimited: false,
    hourlyEarned: Math.min(HOURLY_CP_LIMIT - limit.remaining, HOURLY_CP_LIMIT),
    hourlyRemaining: limit.remaining,
    hourlyResetAt: limit.resetAt,
  };
}

function toPointsRecord(record: Record<string, unknown>): Points {
  return {
    id: String(record.id ?? ''),
    user: String(record.user ?? ''),
    balance: Number(record.balance) || 0,
    daily_swipes: Number(record.daily_swipes) || 0,
    last_swipe_date: String(record.last_swipe_date ?? ''),
    created: String(record.created ?? ''),
    updated: String(record.updated ?? ''),
  };
}

export function calculateNewStreak(lootBox: LootBox): number {
  const lastOpen = lootBox.last_open_date;
  if (!lastOpen) return 1;

  const lastOpenDate = new Date(lastOpen).toISOString().split('T')[0];
  const yesterday = getYesterdayDate();
  const today = getTodayDate();

  if (lastOpenDate === today) return lootBox.streak;
  if (lastOpenDate === yesterday) return lootBox.streak + 1;
  return 1;
}
