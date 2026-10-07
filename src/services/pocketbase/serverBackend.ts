/**
 * Server-only PocketBase backend.
 *
 * Runs inside a Vercel serverless function (api/pb.ts) and a Vite dev
 * middleware (see vite.config.ts). The PocketBase SDK and admin
 * credentials live HERE and are NEVER shipped to the browser: the
 * client talks to this backend over /api/pb/* with a thin HTTP facade
 * (see ./index.ts).
 *
 * Imported by Node environments only — do not import from client code.
 */
import PocketBase from 'pocketbase';
import { randomBytes } from 'node:crypto';
import {
  COLLECTION,
  CP_HISTORY_COLLECTION,
  HOURLY_CP_LIMIT,
  HOURLY_WINDOW_MS,
  addPointsServer,
  calculateNewStreak,
  checkLootBoxCooldown,
  cooldownDaysRemaining,
  generateLootBoxReward,
  getBoxCost,
  getStreakMultiplier,
  getSwipeReward,
  getTodayDate,
  isHourlyExempt,
  validateUsername,
  type AppStats,
  type CPSource,
  type HourlyCPCheck,
  type LeaderboardEntry,
  type LootBox,
  type LootBoxHistoryEntry,
  type LootBoxResult,
  type Points,
  type SwiperRankingEntry,
  type TokenRankingEntry,
  type User,
} from './shared';
import {
  consumeNonce,
  issueNonce,
  signSession,
  verifySession,
  verifyWalletSignature,
  SOLANA_WALLET_RE,
} from './auth';

// ─── Cloudflare Turnstile verification (dev backend) ─────────────────
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_TIMEOUT_MS = 5000;

async function verifyTurnstileToken(token: string, remoteip?: string): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error('[serverBackend] TURNSTILE_SECRET_KEY not configured — rejecting.');
    return false;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);
    // Cloudflare expects the token in the `response` field (NOT `token`) —
    // sending any other name yields missing-input-response for every call.
    const params = new URLSearchParams({ secret, response: token });
    if (remoteip) params.set('remoteip', remoteip);
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
    if (!data.success) {
      console.warn('[serverBackend] Turnstile failed:', data['error-codes']);
      return false;
    }
    return true;
  } catch (err: unknown) {
    console.error('[serverBackend] Turnstile error:', err);
    return false;
  }
}

// ── Rate limiter (in-memory, per-wallet, per-endpoint) ──────────
// 30s window, generous limits tuned for normal usage; tight enough to
// block trivial abuse. Restart loses state (Vercel serverless) — that's
// fine, it just resets.

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();
const RATE_LIMITS: Record<string, { windowMs: number; max: number }> = {
  'identify':          { windowMs: 60_000, max: 10 },
  'add-points':        { windowMs: 60_000, max: 60 },
  'record-swipe':      { windowMs: 60_000, max: 100 },
  'open-loot-box':     { windowMs: 60_000, max: 6 },
  'set-username':      { windowMs: 60_000, max: 5 },
  'update-username':   { windowMs: 60_000, max: 5 },
  'ad-impression':     { windowMs: 60_000, max: 60 },
  'ad-click':          { windowMs: 60_000, max: 30 },
};
const DEFAULT_LIMIT = { windowMs: 60_000, max: 30 };

function checkRate(key: string): boolean {
  const cfg = RATE_LIMITS[key] ?? DEFAULT_LIMIT;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + cfg.windowMs });
    return true;
  }
  if (bucket.count >= cfg.max) return false;
  bucket.count++;
  return true;
}

// ── Per-wallet dedupe for ad impressions ─────────────────────────
const impressionCache = new Map<string, number>(); // key -> expiresAt
const IMPRESSION_TTL_MS = 60 * 60 * 1000;

function dedupeImpression(wallet: string, slotId: string): boolean {
  const key = `${wallet}:${slotId}`;
  const now = Date.now();
  const expiresAt = impressionCache.get(key);
  if (expiresAt && expiresAt > now) return false;
  impressionCache.set(key, now + IMPRESSION_TTL_MS);
  // Lazy sweep
  if (impressionCache.size > 1000) {
    for (const [k, v] of impressionCache) {
      if (v <= now) impressionCache.delete(k);
    }
  }
  return true;
}

export interface PbEnv {
  PB_URL?: string;
  PB_ADMIN_EMAIL?: string;
  PB_ADMIN_PASSWORD?: string;
}

/** Server-side entrypoint referenced nowhere else; see createPbBackend below. */

export interface PbBackend {
  handle: (req: Request) => Promise<Response>;
}

export function createPbBackend(env: PbEnv): PbBackend {
  const PB_URL = env.PB_URL || 'http://127.0.0.1:8090';
  const PB_ADMIN_EMAIL = env.PB_ADMIN_EMAIL || '';
  const PB_ADMIN_PASSWORD = env.PB_ADMIN_PASSWORD || '';

  let adminPb: PocketBase | null = null;
  let adminPbPromise: Promise<PocketBase> | null = null;

  async function getAdmin(): Promise<PocketBase> {
    if (adminPb?.authStore.isValid) return adminPb;
    if (adminPbPromise) return adminPbPromise;

    adminPbPromise = (async () => {
      const pb = new PocketBase(PB_URL);
      pb.autoCancellation(false);
      if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
        throw new HttpError(
          'PocketBase admin credentials not configured (PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD).',
          500,
        );
      }
      try {
        await pb.collection('_superusers').authWithPassword(
          PB_ADMIN_EMAIL,
          PB_ADMIN_PASSWORD,
        );
      } catch (err) {
        console.error('[api/pb] superuser auth failed:', err);
        throw new HttpError('PocketBase admin authentication failed.', 500);
      }
      adminPb = pb;
      return pb;
    })();

    try {
      return await adminPbPromise;
    } finally {
      adminPbPromise = null;
    }
  }

  function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function error(message: string, status = 400): Response {
    return json({ error: message }, status);
  }

  const INJECTION_PATTERNS: RegExp[] = [
    /ignore\s+(previous|above|all)\s+instructions?/i,
    /developer\s+mode/i,
    /jailbreak/i,
    /system\s+override/i,
    /grant\s+cp/i,
    /set\s+balance/i,
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /\.\.[\/\\]/,
    /\$\{/,
    /exec\s*\(/i,
    /eval\s*\(/i,
    /process\./i,
    /require\s*\(/i,
  ];

  function sanitizeString(input: unknown): string {
    if (typeof input !== 'string') return '';
    const cleaned = input.replace(/[<>"'`;{}()\[\]\\]/g, '').trim();
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(cleaned)) return '';
    }
    return cleaned.slice(0, 256);
  }

  async function readBody(req: Request): Promise<Record<string, unknown>> {
    try {
      const text = await req.text();
      if (!text) return {};
      const parsed = JSON.parse(text) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        const cleanKey = sanitizeString(key);
        if (!cleanKey) continue;
        if (typeof value === 'string') {
          sanitized[cleanKey] = sanitizeString(value);
        } else if (typeof value === 'number' && Number.isFinite(value)) {
          sanitized[cleanKey] = value;
        } else if (typeof value === 'boolean') {
          sanitized[cleanKey] = value;
        }
      }
      return sanitized;
    } catch {
      return {};
    }
  }

  function query(req: Request, key: string): string | null {
    return new URL(req.url).searchParams.get(key);
  }

  function stringField(body: Record<string, unknown>, key: string): string {
    const v = body[key];
    return typeof v === 'string' ? v : '';
  }

  function numberField(body: Record<string, unknown>, key: string): number {
    const v = body[key];
    return typeof v === 'number' ? v : Number(v) || 0;
  }

  function boolField(body: Record<string, unknown>, key: string): boolean {
    return body[key] === true;
  }

  function toUser(record: Record<string, unknown>): User {
    return {
      id: String(record.id ?? ''),
      email: String(record.email ?? ''),
      username: String(record.username ?? ''),
      wallet: String(record.wallet ?? ''),
      verified: Boolean(record.verified),
      emailVisibility: Boolean(record.emailVisibility),
      usernameSet: Boolean(record.usernameSet),
      usernameChangedAt: record.usernameChangedAt
        ? String(record.usernameChangedAt)
        : undefined,
      created: String(record.created ?? ''),
      updated: String(record.updated ?? ''),
    };
  }

  function toPoints(record: Record<string, unknown>): Points {
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

  async function getOrCreatePoints(pb: PocketBase, userId: string): Promise<Points> {
    try {
      const result = await pb.collection('points').getFirstListItem(`user = "${userId}"`);
      return toPoints(result);
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 404) {
        const today = getTodayDate();
        const created = await pb.collection('points').create({
          user: userId,
          balance: 0,
          daily_swipes: 0,
          last_swipe_date: today,
        });
        return toPoints(created);
      }
      throw err;
    }
  }

  async function getHourlyCPEarned(pb: PocketBase, userId: string): Promise<number> {
    const windowStart = new Date(Date.now() - HOURLY_WINDOW_MS)
      .toISOString()
      .replace('T', ' ');

    const records = await pb.collection(CP_HISTORY_COLLECTION).getFullList({
      filter: `user = "${userId}" && created >= "${windowStart}"`,
      fields: 'amount,source',
    });

    return records.reduce((sum: number, record: Record<string, unknown>) => {
      const source = String(record.source ?? '') as CPSource;
      return sum + (isHourlyExempt(source) ? 0 : Number(record.amount) || 0);
    }, 0);
  }

  async function checkHourlyCPLimit(
    pb: PocketBase,
    userId: string,
    reward: number,
  ): Promise<HourlyCPCheck> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - HOURLY_WINDOW_MS)
      .toISOString()
      .replace('T', ' ');

    const records = await pb.collection(CP_HISTORY_COLLECTION).getFullList({
      filter: `user = "${userId}" && created >= "${windowStart}"`,
      fields: 'amount,source,created',
      sort: 'created',
    });

    let earned = 0;
    let oldestCountedAt: Date | null = null;
    for (const record of records as Record<string, unknown>[]) {
      if (isHourlyExempt(String(record.source ?? '') as CPSource)) continue;
      earned += Number(record.amount) || 0;
      const recordDate = new Date(String(record.created ?? ''));
      if (!oldestCountedAt || recordDate < oldestCountedAt) {
        oldestCountedAt = recordDate;
      }
    }

    const remaining = Math.max(HOURLY_CP_LIMIT - earned, 0);
    const resetAt = oldestCountedAt
      ? new Date(oldestCountedAt.getTime() + HOURLY_WINDOW_MS)
      : now;

    return { allowed: reward <= remaining, remaining, resetAt };
  }

  async function recordCPEarned(
    pb: PocketBase,
    userId: string,
    amount: number,
    source: CPSource,
  ): Promise<void> {
    if (amount <= 0) return;
    try {
      await pb.collection(CP_HISTORY_COLLECTION).create({
        user: userId,
        amount,
        source,
      });
    } catch (err) {
      console.warn('[api/pb] Failed to record CP earning:', err);
    }
  }

  async function getOrCreateUser(walletAddress: string): Promise<{ user: User; isNew: boolean }> {
    if (!SOLANA_WALLET_RE.test(walletAddress)) {
      throw new HttpError('Invalid wallet address.', 400);
    }

    const pb = await getAdmin();

    try {
      const result = await pb.collection(COLLECTION).getList(1, 1, {
        filter: `wallet = "${walletAddress}"`,
      });

      if (result.items.length > 0) {
        return { user: toUser(result.items[0] as unknown as Record<string, unknown>), isNew: false };
      }
    } catch (err) {
      console.warn('[api/pb] user lookup failed, creating anyway:', err);
    }

    // Per-user random password: the browser never needs it, and a shared
    // default would let anyone who learns it authenticate as every user.
    const password = randomBytes(24).toString('base64url');

    try {
      const newUser = await pb.collection(COLLECTION).create({
        wallet: walletAddress,
        username: `User_${walletAddress.slice(0, 6)}`,
        email: `${walletAddress.slice(0, 8)}@cryinder.temp`,
        password,
        passwordConfirm: password,
        emailVisibility: false,
        verified: true,
      });

      await pb.collection('points').create({
        user: newUser.id,
        balance: 0,
        daily_swipes: 0,
        last_swipe_date: getTodayDate(),
      });

      await pb.collection('loot_boxes').create({
        user: newUser.id,
        last_open_date: null,
        streak: 0,
        total_opened: 0,
      });

      return { user: toUser(newUser as unknown as Record<string, unknown>), isNew: true };
    } catch (err: unknown) {
      // Race: another request created this wallet first.
      if ((err as { status?: number }).status === 400) {
        const result = await pb.collection(COLLECTION).getList(1, 1, {
          filter: `wallet = "${walletAddress}"`,
        });
        if (result.items.length > 0) {
          return { user: toUser(result.items[0] as unknown as Record<string, unknown>), isNew: false };
        }
      }
      throw err;
    }
  }

  async function requireUsernameUnique(
    pb: PocketBase,
    username: string,
    excludeUserId: string,
  ): Promise<void> {
    try {
      await pb.collection(COLLECTION).getFirstListItem(
        `username = "${username}" && id != "${excludeUserId}"`,
      );
      throw new HttpError('Username is already taken.', 409);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      // 404 = unique, good.
      if ((err as { status?: number }).status !== 404) throw err;
    }
  }

  async function getOrCreateLootBox(pb: PocketBase, userId: string): Promise<LootBox> {
    try {
      const result = await pb.collection('loot_boxes').getFirstListItem(`user = "${userId}"`);
      return result as unknown as LootBox;
    } catch (err: unknown) {
      if ((err as { status?: number }).status !== 404) throw err;

      const existingList = await pb.collection('loot_boxes').getList(1, 1, {
        filter: `user = "${userId}"`,
        sort: 'created',
      });
      if (existingList.items.length > 0) {
        return existingList.items[0] as unknown as LootBox;
      }

      try {
        const created = await pb.collection('loot_boxes').create({
          user: userId,
          last_open_date: null,
          streak: 0,
          total_opened: 0,
        });
        return {
          ...created,
          last_open_date: null,
          streak: 0,
          total_opened: 0,
        } as unknown as LootBox;
      } catch (createError: unknown) {
        const retryList = await pb.collection('loot_boxes').getList(1, 1, {
          filter: `user = "${userId}"`,
          sort: 'created',
        });
        if (retryList.items.length > 0) {
          return retryList.items[0] as unknown as LootBox;
        }
        throw createError;
      }
    }
  }

  async function route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // Vercel rewrites /api/pb/<path> → /api/pb so req.url arrives as either
    // /api/pb/<path> (no rewrite) or /api/pb (with rewrite). Strip the prefix
    // only when present so we handle both cases.
    let path = url.pathname.replace(/^\/api\/pb\/?/, '');
    const method = req.method;

    // Health check for bare /api/pb
    if (!path) {
      return json({
        ok: true,
        message: 'Cryinder API is running. Endpoints: /leaderboard, /stats, /top-swipers, /top-tokens, /ad-slots, /points, /hourly, /hourly-check, /loot-box, /loot-history, /user-rank, /identify-challenge, /identify, /set-username, /update-username, /record-swipe, /add-points, /open-loot-box, /ad-impression, /ad-click',
      });
    }

    try {
      const pb = await getAdmin().catch((err) => {
        // Local dev without PocketBase running: degrade public stats to
        // zeros instead of 500-spamming. Authenticated endpoints still fail.
        if (`${method} ${path}` === 'GET stats') return null;
        throw err;
      });
      if (!pb) {
        return json({ totalSwipes: 0, totalCPEarned: 0, totalSwipers: 0 });
      }
      const body = method === 'GET' ? {} : await readBody(req);

      // Every endpoint below is protected by wallet signature (issued
      // via POST /identify) except the identify endpoint itself and the
      // read-only public endpoints (leaderboard, top-swipers, top-tokens,
      // stats, ad-slots). requireWallet throws 401 on missing/invalid
      // session. requireUser additionally resolves the PB user record.
      function requireWallet(req: Request): string {
        const auth = req.headers.get('authorization') ?? '';
        const match = auth.match(/^Bearer\s+(\S+)$/i);
        const session = verifySession(match?.[1]);
        if (!session) throw new HttpError('Authentication required.', 401);
        return session.wallet;
      }

      function rateLimit(endpoint: string, wallet: string): void {
        if (!checkRate(`${endpoint}:${wallet}`)) {
          throw new HttpError('Too many requests. Please slow down.', 429);
        }
      }

      // Read-only public endpoints allowed without a session. Anything
      // else (especially POSTs) must carry a valid bearer token.
      const publicReads = new Set([
        'leaderboard',
        'top-swipers',
        'top-tokens',
        'stats',
        'ad-slots',
      ]);

      switch (`${method} ${path}`) {
        // ── Public: identity handshake (wallet signature → session) ──
        case 'POST identify-challenge': {
          if (!checkRate(`identify:${stringField(body, 'wallet') || 'anon'}`)) {
            throw new HttpError('Too many requests.', 429);
          }
          const wallet = stringField(body, 'wallet');
          if (!SOLANA_WALLET_RE.test(wallet)) {
            throw new HttpError('Invalid wallet address.', 400);
          }
          const turnstileToken = stringField(body, 'turnstileToken');
          if (!turnstileToken) {
            throw new HttpError('Human verification required. Please complete the challenge.', 403);
          }
          const fwd = req.headers.get('x-forwarded-for') ?? '';
          const remoteip = fwd.split(',')[0].trim() || (req.headers.get('x-real-ip') ?? '').trim();
          const turnstileOk = await verifyTurnstileToken(turnstileToken, remoteip || undefined);
          if (!turnstileOk) {
            throw new HttpError('Verification failed. Please try again.', 403);
          }
          return json(issueNonce(wallet));
        }

        case 'POST identify': {
          const wallet = stringField(body, 'wallet');
          const message = stringField(body, 'message');
          const signature = stringField(body, 'signature');
          if (!SOLANA_WALLET_RE.test(wallet)) {
            throw new HttpError('Invalid wallet address.', 400);
          }
          if (!message.startsWith('cryinder-identity-v1:')) {
            throw new HttpError('Invalid message format.', 400);
          }
          // Message is "cryinder-identity-v1:<wallet>:<nonce>" — split
          // off the nonce to validate it was issued by this server.
          const afterPrefix = message.slice('cryinder-identity-v1:'.length);
          if (!afterPrefix.startsWith(`${wallet}:`)) {
            throw new HttpError('Wallet mismatch in challenge.', 400);
          }
          const nonce = afterPrefix.slice(wallet.length + 1);
          if (!consumeNonce(wallet, nonce)) {
            throw new HttpError('Challenge expired or already used. Request a new one.', 400);
          }
          if (!verifyWalletSignature(wallet, message, signature)) {
            throw new HttpError('Signature verification failed.', 401);
          }

          const session = signSession(wallet);
          const { user, isNew } = await getOrCreateUser(wallet);
          return json({ token: session.token, expiresAt: session.expiresAt, user, isNew });
        }

        // ── Public reads ──────────────────────────────────────────────
        case 'GET leaderboard':
        case 'GET top-swipers':
        case 'GET top-tokens':
        case 'GET stats': {
          // Handled below in dedicated handlers.
          break;
        }

        case 'GET ad-slots': {
          const now = new Date().toISOString();
          const active = await pb.collection('ad_slots').getList(1, 50, {
            filter: `status = "booked" && (expires_at = "" || expires_at = null || expires_at > "${now}")`,
            sort: '-booked_date',
          });
          if (active.items.length > 0) return json(active.items);
          const fallback = await pb.collection('ad_slots').getList(1, 50, {
            filter: 'status = "booked"',
            sort: '-booked_date',
          });
          return json(fallback.items);
        }

        // ── Authenticated endpoints below ─────────────────────────────
        case 'POST set-username': {
          const wallet = requireWallet(req);
          rateLimit('set-username', wallet);
          const { user } = await getOrCreateUser(wallet);
          const username = stringField(body, 'newUsername');
          const validation = validateUsername(username);
          if (!validation.valid) throw new HttpError(validation.error ?? 'Invalid username.', 400);
          await requireUsernameUnique(pb, username, user.id);
          const updated = await pb.collection(COLLECTION).update(user.id, {
            username,
            usernameSet: true,
            usernameChangedAt: new Date().toISOString(),
          });
          return json(toUser(updated as unknown as Record<string, unknown>));
        }

        case 'POST update-username': {
          const wallet = requireWallet(req);
          rateLimit('update-username', wallet);
          const { user } = await getOrCreateUser(wallet);
          const username = stringField(body, 'newUsername');
          const validation = validateUsername(username);
          if (!validation.valid) throw new HttpError(validation.error ?? 'Invalid username.', 400);

          const changedAt = user.usernameChangedAt;
          if (changedAt) {
            const daysLeft = cooldownDaysRemaining(changedAt);
            if (daysLeft > 0) {
              throw new HttpError(`You can change your username again in ${daysLeft} days.`, 409);
            }
          }

          await requireUsernameUnique(pb, username, user.id);
          const updated = await pb.collection(COLLECTION).update(user.id, {
            username,
            usernameChangedAt: new Date().toISOString(),
          });
          return json(toUser(updated as unknown as Record<string, unknown>));
        }

        case 'POST record-swipe': {
          const wallet = requireWallet(req);
          rateLimit('record-swipe', wallet);
          const { user } = await getOrCreateUser(wallet);
          await pb.collection('swipes').create({
            user: user.id,
            token_id: stringField(body, 'tokenId'),
            token_name: stringField(body, 'tokenName'),
            token_symbol: stringField(body, 'tokenSymbol'),
            token_price: numberField(body, 'tokenPrice'),
            swipe_type: stringField(body, 'swipeType') === 'left' ? 'left' : 'right',
          });
          return json({ ok: true });
        }

        case 'GET points': {
          const wallet = requireWallet(req);
          const { user } = await getOrCreateUser(wallet);
          return json(await getOrCreatePoints(pb, user.id));
        }

        case 'POST add-points': {
          const wallet = requireWallet(req);
          rateLimit('add-points', wallet);
          const { user } = await getOrCreateUser(wallet);
          const swipeType = stringField(body, 'swipeType') as 'left' | 'right';
          if (swipeType !== 'left' && swipeType !== 'right') {
            throw new HttpError('Only swipe rewards can be awarded from the client.', 400);
          }
          const result = await addPointsServer(
            pb,
            user.id,
            getSwipeReward(swipeType),
            swipeType === 'right' ? 'swipe-right' : 'swipe-left',
            {
              getOrCreatePoints,
              checkHourlyCPLimit,
              recordCPEarned,
              getTodayDate,
            },
          );
          return json(result);
        }

        case 'GET hourly': {
          const wallet = requireWallet(req);
          const { user } = await getOrCreateUser(wallet);
          return json({ earned: await getHourlyCPEarned(pb, user.id) });
        }

        case 'GET hourly-check': {
          const wallet = requireWallet(req);
          const { user } = await getOrCreateUser(wallet);
          const reward = Number(query(req, 'reward')) || 0;
          return json(await checkHourlyCPLimit(pb, user.id, reward));
        }

        case 'GET loot-box': {
          const wallet = requireWallet(req);
          const { user } = await getOrCreateUser(wallet);
          const lb = await getOrCreateLootBox(pb, user.id);
          const boxCost = getBoxCost(Number(lb.total_opened || 0));
          return json({ ...lb, boxCost, cooldown: checkLootBoxCooldown(lb) });
        }

        case 'GET loot-box-cost': {
          const wallet = requireWallet(req);
          const { user } = await getOrCreateUser(wallet);
          const lb = await getOrCreateLootBox(pb, user.id);
          const points = await getOrCreatePoints(pb, user.id);
          const boxCost = getBoxCost(Number(lb.total_opened || 0));
          const balance = Number(points.balance || 0);
          return json({ boxCost, balance, canAfford: balance >= boxCost, totalOpened: Number(lb.total_opened || 0) });
        }

        case 'GET loot-history': {
          const wallet = requireWallet(req);
          const { user } = await getOrCreateUser(wallet);
          const limit = Math.min(Number(query(req, 'limit')) || 5, 20);
          const records = await pb.collection(CP_HISTORY_COLLECTION).getList(1, limit, {
            filter: `user = "${user.id}" && (source = "loot-box" || source = "jackpot")`,
            sort: '-created',
          });
          const history: LootBoxHistoryEntry[] = records.items.map((r) => ({
            id: String(r.id),
            amount: Number(r.amount) || 0,
            source: String(r.source),
            created: String(r.created),
          }));
          return json(history);
        }

        case 'POST open-loot-box': {
          const wallet = requireWallet(req);
          rateLimit('open-loot-box', wallet);
          const { user } = await getOrCreateUser(wallet);
          const lootBox = await getOrCreateLootBox(pb, user.id);

          const cooldown = checkLootBoxCooldown(lootBox);
          if (!cooldown.available) {
            throw new HttpError(
              `Loot box on cooldown. Available in ${cooldown.hoursRemaining}h ${cooldown.minutesRemaining}m`,
              409,
            );
          }

          const totalOpened = Number(lootBox.total_opened || 0);
          const boxCost = getBoxCost(totalOpened);
          const points = await getOrCreatePoints(pb, user.id);
          const currentBalance = Number(points.balance || 0);
          if (currentBalance < boxCost) {
            throw new HttpError(
              `Insufficient CP. Need ${boxCost} CP, have ${currentBalance} CP.`,
              402,
            );
          }

          const { baseReward, isJackpot, tier } = generateLootBoxReward();
          const newStreak = calculateNewStreak(lootBox);
          const multiplier = getStreakMultiplier(newStreak);
          const bonusReward = Math.floor(baseReward * (multiplier - 1));
          const totalReward = baseReward + bonusReward;
          const netCP = totalReward - boxCost;

          await pb.collection('points').update(points.id, {
            balance: currentBalance - boxCost,
          });
          try {
            await pb.collection(CP_HISTORY_COLLECTION).create({
              user: user.id,
              amount: -boxCost,
              source: 'loot-box-cost',
            });
          } catch {
            /* cost ledger is best-effort */
          }

          await addPointsServer(pb, user.id, totalReward, isJackpot ? 'jackpot' : 'loot-box', {
            getOrCreatePoints,
            checkHourlyCPLimit,
            recordCPEarned,
            getTodayDate,
          });

          const updated = await pb.collection('loot_boxes').update(lootBox.id, {
            last_open_date: new Date().toISOString(),
            streak: newStreak,
            total_opened: totalOpened + 1,
          });

          const result: LootBoxResult = {
            baseReward,
            isJackpot,
            tier,
            streak: newStreak,
            streakMultiplier: multiplier,
            bonusReward,
            totalReward,
            awardedCP: netCP,
            totalOpened: Number(updated.total_opened) || 0,
            boxCost,
          };
          return json(result);
        }

        case 'GET user-rank': {
          const wallet = requireWallet(req);
          const { user } = await getOrCreateUser(wallet);
          try {
            const userPoints = await pb.collection('points').getFirstListItem(`user = "${user.id}"`);
            const balance = Number(userPoints.balance) || 0;
            const higherCount = await pb.collection('points').getList(1, 1, {
              filter: `balance > ${balance}`,
              fields: 'id',
            });
            return json({ rank: higherCount.totalItems + 1 });
          } catch (err) {
            if ((err as { status?: number }).status === 404) return json({ rank: null });
            throw err;
          }
        }

        case 'POST ad-impression':
        case 'POST ad-click': {
          const wallet = requireWallet(req);
          rateLimit(path === 'ad-impression' ? 'ad-impression' : 'ad-click', wallet);
          const slotId = stringField(body, 'slotId');
          if (!slotId) throw new HttpError('slotId required.', 400);

          if (path === 'ad-impression' && !dedupeImpression(wallet, slotId)) {
            // Already counted this slot for this wallet in the last hour.
            return json({ ok: true, deduped: true });
          }

          const field = path === 'ad-impression' ? 'impressions' : 'clicks';
          const slot = await pb.collection('ad_slots').getOne(slotId);
          await pb.collection('ad_slots').update(slotId, {
            [field]: (Number(slot[field]) || 0) + 1,
          });
          return json({ ok: true });
        }

        default:
          return error('Unknown PB endpoint.', 404);
      }

      // ── Public read endpoints (consolidated handler) ──────────────
      switch (`${method} ${path}`) {
        case 'GET leaderboard': {
          const limit = Math.min(Number(query(req, 'limit')) || 100, 200);
          const pointsRes = await pb.collection('points').getList(1, limit, {
            sort: '-balance',
          });

          if (pointsRes.items.length === 0) return json([]);

          const streakMap = new Map<string, number>();
          const lootBoxesRes = await pb.collection('loot_boxes').getFullList({ fields: 'user,streak' });
          for (const lb of lootBoxesRes as Record<string, unknown>[]) {
            streakMap.set(String(lb.user), Number(lb.streak) || 0);
          }

          const userIds = pointsRes.items.map((p: Record<string, unknown>) => String(p.user));
          const uniqueIds = [...new Set(userIds)];
          const usersRes = await pb.collection('users').getFullList({
            filter: uniqueIds.map((id) => `id = "${id}"`).join(' || '),
            fields: 'id,username',
          });
          const usernameMap = new Map(
            usersRes.map((u: Record<string, unknown>) => [String(u.id), String(u.username ?? '')]),
          );

          const entries: LeaderboardEntry[] = pointsRes.items.map((item, index) => {
            const record = item as unknown as Record<string, unknown>;
            const userId = String(record.user ?? '');
            const streak = streakMap.get(userId) ?? 0;
            return {
              userId,
              userName: usernameMap.get(userId) ?? null,
              rank: index + 1,
              value: Number(record.balance) || 0,
              byline: streak > 0 ? `${streak}-day streak` : null,
            };
          });
          return json(entries);
        }

        case 'GET top-swipers': {
          const limit = Math.min(Number(query(req, 'limit')) || 100, 200);
          const swipes = await pb.collection('swipes').getFullList({
            filter: 'swipe_type = "right"',
            fields: 'user,created',
          });

          const byUser = new Map<string, { count: number; firstSwipe: string }>();
          for (const swipe of swipes as Record<string, unknown>[]) {
            const user = String(swipe.user ?? '');
            const created = String(swipe.created ?? '');
            const current = byUser.get(user);
            if (current) {
              current.count += 1;
              if (created < current.firstSwipe) current.firstSwipe = created;
            } else {
              byUser.set(user, { count: 1, firstSwipe: created });
            }
          }

          const ranked = [...byUser.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, limit);

          if (ranked.length === 0) return json([]);

          const usersRes = await pb.collection('users').getFullList({
            filter: ranked.map(([id]) => `id = "${id}"`).join(' || '),
            fields: 'id,username',
          });
          const usernameMap = new Map(
            usersRes.map((u: Record<string, unknown>) => [String(u.id), String(u.username ?? '')]),
          );

          const entries: SwiperRankingEntry[] = ranked.map(([userId, agg], index) => ({
            userId,
            userName: usernameMap.get(userId) ?? null,
            rank: index + 1,
            value: agg.count,
            byline: formatFirstSwipeDate(agg.firstSwipe),
          }));
          return json(entries);
        }

        case 'GET top-tokens': {
          const limit = Math.min(Number(query(req, 'limit')) || 100, 200);
          const swipes = await pb.collection('swipes').getFullList({
            filter: 'swipe_type = "right"',
            fields: 'token_id,token_name,token_symbol,token_price',
          });

          const byToken = new Map<
            string,
            { count: number; tokenName: string; tokenSymbol: string; tokenPrice: number }
          >();
          for (const swipe of swipes as Record<string, unknown>[]) {
            const tokenId = String(swipe.token_id ?? '');
            const current = byToken.get(tokenId);
            if (current) {
              current.count += 1;
            } else {
              byToken.set(tokenId, {
                count: 1,
                tokenName: String(swipe.token_name ?? ''),
                tokenSymbol: String(swipe.token_symbol ?? ''),
                tokenPrice: Number(swipe.token_price) || 0,
              });
            }
          }

          const entries: TokenRankingEntry[] = [...byToken.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, limit)
            .map(([tokenId, agg], index) => ({
              tokenId,
              tokenSymbol: agg.tokenSymbol,
              tokenName: agg.tokenName,
              tokenPrice: agg.tokenPrice,
              rank: index + 1,
              value: agg.count,
            }));
          return json(entries);
        }

        case 'GET stats': {
          try {
            const [swipesRes, pointsRes] = await Promise.all([
              pb.collection('swipes').getList(1, 1, { fields: 'id' }),
              pb.collection('points').getFullList({ fields: 'balance' }),
            ]);
            const stats: AppStats = {
              totalSwipes: swipesRes.totalItems,
              totalCPEarned: pointsRes.reduce(
                (sum: number, record: Record<string, unknown>) =>
                  sum + (Number(record.balance) || 0),
                0,
              ),
              totalSwipers: new Set(
                await pb.collection('swipes').getFullList({ fields: 'user' }).then((rows) =>
                  rows.map((r) => String(r.user)),
                ),
              ).size,
            };
            return json(stats);
          } catch {
            // Missing collections (fresh local PB) degrade to zeros rather
            // than 500-spamming a public widget.
            return json({ totalSwipes: 0, totalCPEarned: 0, totalSwipers: 0 });
          }
        }

        default:
          return error('Unknown PB endpoint.', 404);
      }
    } catch (err) {
      if (err instanceof HttpError) {
        return error(err.message, err.status);
      }
      console.error('[api/pb] unhandled error:', err);
      // Don't leak PB SDK / schema details to the client. Only HttpError
      // messages (which we wrote ourselves) are user-safe.
      return error('Internal server error.', 500);
    }
  }

  return { handle: route };
}

class HttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function formatFirstSwipeDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'First swipe date unknown';
  return `First swipe ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}
