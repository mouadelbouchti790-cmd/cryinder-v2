/**
 * Browser-side PocketBase facade.
 *
 * All PocketBase traffic goes through the same-origin serverless backend
 * (/api/pb/*) — the PocketBase SDK and admin credentials never ship to
 * the browser. See ./serverBackend.ts and api/pb.ts.
 *
 * Identity model: the browser holds an HMAC session token issued by the
 * server after a wallet signature handshake (POST /identify-challenge
 * then POST /identify). Every authenticated request sends the token in
 * Authorization: Bearer. The token is cached per-wallet and refreshed
 * transparently on 401.
 */

import {
  COLLECTION,
  DAILY_SWIPE_LIMIT,
  HOURLY_CP_LIMIT,
  HOURLY_WINDOW_MS,
  LOOT_BOX_BASE_COST,
  LOOT_BOX_CURVE_MULTIPLIER,
  LOOT_TIERS,
  USERNAME_COOLDOWN_DAYS,
  USERNAME_MAX,
  USERNAME_MIN,
  USERNAME_REGEX,
  checkLootBoxCooldown,
  cooldownDaysRemaining,
  getBoxCost,
  getSwipeReward,
  getTierConfig,
  getTodayDate,
  validateUsername,
} from './shared';

export type {
  AppStats,
  CPSource,
  CPHistoryRecord,
  HourlyCPCheck,
  AddPointsResult,
  LeaderboardEntry,
  LootBox,
  LootBoxHistoryEntry,
  LootBoxResult,
  LootTier,
  LootTierConfig,
  Points,
  SwiperRankingEntry,
  TokenRankingEntry,
  User,
} from './shared';

export {
  COLLECTION,
  DAILY_SWIPE_LIMIT,
  HOURLY_CP_LIMIT,
  HOURLY_WINDOW_MS,
  LOOT_BOX_BASE_COST,
  LOOT_BOX_CURVE_MULTIPLIER,
  LOOT_TIERS,
  USERNAME_COOLDOWN_DAYS,
  USERNAME_MAX,
  USERNAME_MIN,
  USERNAME_REGEX,
  checkLootBoxCooldown,
  cooldownDaysRemaining,
  getBoxCost,
  getSwipeReward,
  getTierConfig,
  getTodayDate,
  validateUsername,
};

// ─── Session cache (per-wallet) ────────────────────────────────────

interface SessionState {
  token: string;
  expiresAt: number;
  userId: string;
}
let session: SessionState | null = null;

export function clearSession(): void {
  session = null;
}

export function currentSession(): SessionState | null {
  if (!session) return null;
  if (session.expiresAt <= Date.now() + 30_000) {
    session = null;
    return null;
  }
  return session;
}

// ─── HTTP transport ────────────────────────────────────────────────

const PB_BASE = '/api/pb';

class PbHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'PbHttpError';
    this.status = status;
  }
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${PB_BASE}/${path}`, init);
}

async function pbFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await rawFetch(path, init ?? {});
  } catch (err) {
    throw new PbHttpError('Backend unavailable. Try again shortly.', 0);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new PbHttpError(message, res.status);
  }

  return (await res.json()) as T;
}

function postBody(body: Record<string, unknown>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// ─── Identity handshake ────────────────────────────────────────────

async function signMessage(walletAddress: string, message: string): Promise<string> {
  // The wallet is injected from App via setWalletContext(), so identify()
  // can be called from any module — hook context isn't required here.
  const ctx = walletCtx;
  if (!ctx || !ctx.signMessage) {
    throw new PbHttpError('Wallet not ready. Connect your wallet first.', 0);
  }
  if (!ctx.publicKey || ctx.publicKey.toBase58() !== walletAddress) {
    throw new PbHttpError('Connected wallet does not match the requested address.', 0);
  }
  const signatureBytes = await ctx.signMessage(new TextEncoder().encode(message));
  let binary = '';
  for (let i = 0; i < signatureBytes.length; i++) {
    binary += String.fromCharCode(signatureBytes[i]);
  }
  return typeof btoa !== 'undefined'
    ? btoa(binary)
    : Buffer.from(signatureBytes).toString('base64');
}

// Wallet context is injected by App at startup. App calls setWalletContext
// with the @solana/wallet-adapter-react values so this module can sign
// without depending on React hooks at module scope.
type WalletCtx = {
  publicKey: { toBase58(): string } | null;
  signMessage: ((msg: Uint8Array) => Promise<Uint8Array>) | null;
};

let walletCtx: WalletCtx | null = null;

// Turnstile token cached by the gateway after the visitor passes the
// challenge. Sent with /identify-challenge so the backend can verify it
// with Cloudflare's Siteverify API before issuing a nonce.
let turnstileToken: string | null = null;

export function setTurnstileToken(token: string): void {
  turnstileToken = token;
}

export function clearTurnstileToken(): void {
  turnstileToken = null;
}

export function setWalletContext(ctx: WalletCtx): void {
  walletCtx = ctx;
}

export function clearWalletContext(): void {
  walletCtx = null;
  session = null;
  turnstileToken = null;
}

export interface IdentifyResult {
  token: string;
  expiresAt: number;
  user: import('./shared').User;
  isNew: boolean;
}

export async function identify(walletAddress: string): Promise<IdentifyResult> {
  return identifyAndGetUser(walletAddress);
}

// ─── Authenticated fetch wrapper ───────────────────────────────────

async function pbAuthFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  let s = currentSession();
  if (!s) {
    // No session — caller must identify first. Surface a clear error
    // rather than silently 401'ing.
    throw new PbHttpError('Not authenticated. Connect your wallet first.', 401);
  }
  headers.set('Authorization', `Bearer ${s.token}`);
  const requestInit: RequestInit = { ...init, headers };

  let res: Response;
  try {
    res = await rawFetch(path, requestInit);
  } catch {
    throw new PbHttpError('Backend unavailable. Try again shortly.', 0);
  }

  if (res.status === 401) {
    // Token expired mid-session — try to refresh once.
    clearSession();
    throw new PbHttpError('Session expired. Please reconnect your wallet.', 401);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new PbHttpError(message, res.status);
  }

  return (await res.json()) as T;
}

// ─── User ──────────────────────────────────────────────────────────

/**
 * Identify flow that returns the full IdentifyResult (with token + user).
 * Use this from useUsername so the hook can cache both the user and the
 * session in one round trip.
 */
// Single-flight handshakes per wallet — see identifyAndGetUser.
const identifyInflight = new Map<string, Promise<IdentifyResult>>();

export async function identifyAndGetUser(walletAddress: string): Promise<IdentifyResult> {
  // Single-flight per wallet: concurrent callers (StrictMode double-effects,
  // retries racing the first attempt) share one handshake. Without this, a
  // second concurrent call would read the single-use Turnstile token after
  // the first call consumed it — or worse, both would POST it and
  // Cloudflare would reject the duplicate.
  const inflight = identifyInflight.get(walletAddress);
  if (inflight) return inflight;
  const task = runIdentify(walletAddress);
  identifyInflight.set(walletAddress, task);
  try {
    return await task;
  } finally {
    if (identifyInflight.get(walletAddress) === task) {
      identifyInflight.delete(walletAddress);
    }
  }
}

async function runIdentify(walletAddress: string): Promise<IdentifyResult> {
  clearSession();
  const token = turnstileToken;
  // Presence-only log: confirms the widget delivered a token without ever
  // printing the token itself.
  console.log('[identify-challenge] turnstile token present:', token != null && token !== '');
  if (!token) {
    // Never POST without a token — the backend rejects it with 403.
    throw new PbHttpError('Human verification required. Complete the challenge and try again.', 403);
  }
  // Tokens are single-use and expire in 5 min — clear immediately so a
  // stale token is never sent on a retry.
  turnstileToken = null;

  const challenge = await pbFetch<{ nonce: string; message: string; expiresAt: number }>(
    'identify-challenge',
    postBody({ wallet: walletAddress, turnstileToken: token }),
  );
  const signature = await signMessage(walletAddress, challenge.message);
  const result = await pbFetch<IdentifyResult>(
    'identify',
    postBody({ wallet: walletAddress, message: challenge.message, signature }),
  );
  session = { token: result.token, expiresAt: result.expiresAt, userId: result.user.id };
  return result;
}

export async function setUsername(_userId: string, newUsername: string) {
  return pbAuthFetch<import('./shared').User>('set-username', postBody({ newUsername }));
}

export async function updateUsername(_userId: string, newUsername: string) {
  return pbAuthFetch<import('./shared').User>('update-username', postBody({ newUsername }));
}

// ─── Swipes ────────────────────────────────────────────────────────

export async function recordSwipe(params: {
  tokenId: string;
  tokenName: string;
  tokenSymbol: string;
  tokenPrice: number;
  swipeType: 'right' | 'left';
}): Promise<{ ok: boolean }> {
  return pbAuthFetch<{ ok: boolean }>('record-swipe', postBody(params));
}

// ─── Points ────────────────────────────────────────────────────────

export async function getUserPoints(): Promise<import('./shared').Points> {
  return pbAuthFetch(`points`);
}

/**
 * Award CP for a swipe. The server re-derives the reward from swipeType
 * and enforces daily/hourly caps, so the client cannot inflate points.
 */
export async function addPoints(
  _userId: string,
  _amount: number,
  source: import('./shared').CPSource,
  _options?: { countSwipe?: boolean },
): Promise<import('./shared').AddPointsResult> {
  const swipeType =
    source === 'swipe-left' ? 'left' : source === 'swipe-right' ? 'right' : null;
  if (!swipeType) {
    throw new Error(`Source "${source}" cannot be awarded from the client.`);
  }
  return pbAuthFetch<import('./shared').AddPointsResult>(
    'add-points',
    postBody({ swipeType }),
  );
}

export async function getHourlyCPEarned(): Promise<number> {
  const res = await pbAuthFetch<{ earned: number }>(`hourly`);
  return res.earned;
}

export async function checkHourlyCPLimit(
  reward: number,
): Promise<import('./shared').HourlyCPCheck> {
  const check = await pbAuthFetch<import('./shared').HourlyCPCheck>(
    `hourly-check?reward=${reward}`,
  );
  return { ...check, resetAt: new Date(check.resetAt) };
}

// ─── Loot box ──────────────────────────────────────────────────────

export async function getOrCreateLootBox(): Promise<import('./shared').LootBox> {
  return pbAuthFetch(`loot-box`);
}

export async function getRecentLootBoxRewards(
  limit = 5,
): Promise<import('./shared').LootBoxHistoryEntry[]> {
  return pbAuthFetch(`loot-history?limit=${limit}`);
}

export async function openLootBox(): Promise<import('./shared').LootBoxResult> {
  return pbAuthFetch('open-loot-box', postBody({}));
}

// ─── Leaderboard ───────────────────────────────────────────────────

export async function getLeaderboard(limit = 100): Promise<import('./shared').LeaderboardEntry[]> {
  return pbFetch(`leaderboard?limit=${limit}`);
}

export async function getUserRank(): Promise<number | null> {
  const res = await pbAuthFetch<{ rank: number | null }>(`user-rank`);
  return res.rank;
}

export async function getTopSwipers(limit = 100): Promise<import('./shared').SwiperRankingEntry[]> {
  return pbFetch(`top-swipers?limit=${limit}`);
}

export async function getTopTokens(limit = 100): Promise<import('./shared').TokenRankingEntry[]> {
  return pbFetch(`top-tokens?limit=${limit}`);
}

// ─── Stats ─────────────────────────────────────────────────────────

export async function getAllStats(): Promise<import('./shared').AppStats> {
  return pbFetch(`stats`);
}

// ─── Ad slots ──────────────────────────────────────────────────────

export async function getActiveAdSlots(): Promise<import('../../types/adSlots').AdSlot[]> {
  return pbFetch('ad-slots');
}

export async function trackAdEvent(slotId: string, event: 'impression' | 'click'): Promise<{ ok: boolean }> {
  return pbAuthFetch<{ ok: boolean }>(`ad-${event}`, postBody({ slotId }));
}
