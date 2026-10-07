/**
 * Cryinder API — single-file Vercel serverless function.
 *
 * Plain JavaScript: Vercel ships this as-is, no esbuild step, no
 * TypeScript. All crypto uses Node built-ins (node:crypto). The base58
 * decoder is inlined.
 *
 * NEVER add external deps. Keep this self-contained.
 */

import { createHmac, timingSafeEqual, randomBytes, verify, createPublicKey } from 'node:crypto';
import PocketBase from 'pocketbase';

// ─── Security headers on every response ───────────────────────────────

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function applySecurityHeaders(res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(k, v);
  }
}

// ─── Base58 decoder (inlined, no bs58 dep) ────────────────────────────

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP = {};
for (let i = 0; i < B58_ALPHABET.length; i++) B58_MAP[B58_ALPHABET[i]] = i;

function base58Decode(input) {
  if (typeof input !== 'string') throw new TypeError('expected string');
  let result = 0n;
  let base = 1n;
  for (let i = input.length - 1; i >= 0; i--) {
    const c = input[i];
    const digit = B58_MAP[c];
    if (digit === undefined) throw new Error(`invalid base58 char: ${c}`);
    result += BigInt(digit) * base;
    base *= 58n;
  }
  let hex = result.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let leadingZeros = 0;
  for (const ch of input) {
    if (ch === '1') leadingZeros++;
    else break;
  }
  return Buffer.concat([Buffer.alloc(leadingZeros), Buffer.from(hex, 'hex')]);
}

// ─── Cloudflare Turnstile verification ────────────────────────────────
// Verifies a Turnstile token with Cloudflare's Siteverify API.
// Returns true only if Cloudflare confirms the token is valid and fresh.
// The secret key MUST be configured as env var TURNSTILE_SECRET_KEY.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_TIMEOUT_MS = 5000;

async function verifyTurnstileToken(token, remoteip) {
  if (!token || typeof token !== 'string') return false;

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error('[api/pb] TURNSTILE_SECRET_KEY not configured — rejecting Turnstile check.');
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

    if (!res.ok) {
      console.warn(`[api/pb] Turnstile siteverify returned ${res.status}`);
      return false;
    }

    const data = await res.json();
    if (!data.success) {
      console.warn('[api/pb] Turnstile verification failed:', data['error-codes']);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[api/pb] Turnstile verification error:', err?.message || err);
    return false;
  }
}

// ─── Auth — wallet signature verification + HMAC sessions ─────────────

const IDENTITY_PREFIX = 'cryinder-identity-v1:';
const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 60 * 60 * 1000;
const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// SPKI DER prefix for Ed25519 public keys (12 bytes). Solana wallets emit
// raw 32-byte pubkeys; Node's crypto.verify expects SPKI/DER format.
const SPKI_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

const nonces = new Map();

function sweepNonces(now) {
  for (const [k, v] of nonces) {
    if (v.expiresAt <= now) nonces.delete(k);
  }
}

function issueNonce(wallet) {
  const now = Date.now();
  sweepNonces(now);
  const nonceBytes = randomBytes(16);
  const nonce = Buffer.from(nonceBytes).toString('hex');
  const expiresAt = now + NONCE_TTL_MS;
  nonces.set(`${wallet}:${nonce}`, { expiresAt });
  const message = `${IDENTITY_PREFIX}${wallet}:${nonce}`;
  return { nonce, message, expiresAt };
}

function consumeNonce(wallet, nonce) {
  const entry = nonces.get(`${wallet}:${nonce}`);
  if (!entry) return false;
  nonces.delete(`${wallet}:${nonce}`);
  return entry.expiresAt > Date.now();
}

function verifyWalletSignature(wallet, message, signatureBase64) {
  try {
    const pubkey = base58Decode(wallet);
    const signature = Buffer.from(signatureBase64, 'base64');
    if (pubkey.length !== 32) return false;
    if (signature.length !== 64) return false;
    // Solana wallets emit raw 32-byte ed25519 pubkeys. Node's crypto.verify
    // can't accept a raw Buffer as a key — it needs a KeyObject. Wrap the
    // raw pubkey in SPKI DER (12-byte prefix) and import it.
    const spkiPubkey = Buffer.concat([SPKI_PREFIX, pubkey]);
    const keyObj = createPublicKey({ key: spkiPubkey, format: 'der', type: 'spki' });
    return verify(null, Buffer.from(message, 'utf8'), keyObj, signature);
  } catch {
    return false;
  }
}

function getSessionSecret() {
  const secret =
    process.env.PB_SESSION_SECRET ||
    process.env.PB_ADMIN_PASSWORD ||
    null;
  if (!secret) {
    // Fail CLOSED on hosted deploys: a shared hardcoded fallback would let
    // anyone forge session tokens. Vercel always sets VERCEL=1; local dev
    // (vite middleware) does not, so plain `npm run dev` keeps working.
    if (process.env.VERCEL) {
      throw new Error(
        '[api/pb] No session secret configured. Set PB_SESSION_SECRET (or PB_ADMIN_PASSWORD).',
      );
    }
    console.warn('[api/pb] WARNING: using insecure dev session secret. Set PB_SESSION_SECRET.');
    return Buffer.from('cryinder-dev-fallback-secret', 'utf8');
  }
  return Buffer.from(secret, 'utf8');
}

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function fromB64url(input) {
  return Buffer.from(input, 'base64url');
}

function signSession(wallet) {
  const now = Date.now();
  const payload = { wallet, iat: now, exp: now + SESSION_TTL_MS };
  const bodyBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const body = b64url(bodyBytes);
  const mac = createHmac('sha256', getSessionSecret()).update(bodyBytes).digest();
  return { token: `${body}.${b64url(mac)}`, expiresAt: payload.exp };
}

function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  try {
    const bodyBytes = fromB64url(token.slice(0, dot));
    const macBytes = fromB64url(token.slice(dot + 1));
    const expected = createHmac('sha256', getSessionSecret()).update(bodyBytes).digest();
    if (expected.length !== macBytes.length) return null;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(macBytes))) return null;
    const payload = JSON.parse(Buffer.from(bodyBytes).toString('utf8'));
    if (typeof payload.wallet !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp <= Date.now()) return null;
    if (!SOLANA_WALLET_RE.test(payload.wallet)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Rate limiter ─────────────────────────────────────────────────────

const buckets = new Map();

const RATE_LIMITS = {
  identify:        { windowMs: 60_000, max: 10 },
  'add-points':    { windowMs: 60_000, max: 60 },
  'record-swipe':  { windowMs: 60_000, max: 100 },
  'open-loot-box': { windowMs: 60_000, max: 6 },
  'set-username':  { windowMs: 60_000, max: 5 },
  'update-username': { windowMs: 60_000, max: 5 },
  'ad-impression': { windowMs: 60_000, max: 60 },
  'ad-click':      { windowMs: 60_000, max: 30 },
};
const DEFAULT_LIMIT = { windowMs: 60_000, max: 30 };

function checkRate(key) {
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

// ─── Ad dedupe ────────────────────────────────────────────────────────

const impressionCache = new Map();
const IMPRESSION_TTL_MS = 60 * 60 * 1000;

function dedupeImpression(wallet, slotId) {
  const key = `${wallet}:${slotId}`;
  const now = Date.now();
  const last = impressionCache.get(key);
  if (last && now - last < IMPRESSION_TTL_MS) return false;
  impressionCache.set(key, now);
  // Occasional sweep
  if (impressionCache.size > 5000) {
    for (const [k, t] of impressionCache) {
      if (now - t > IMPRESSION_TTL_MS) impressionCache.delete(k);
    }
  }
  return true;
}

// ─── Shared constants & helpers ───────────────────────────────────────

const DAILY_SWIPE_LIMIT = 200;
const HOURLY_CP_LIMIT = 350;
const HOURLY_WINDOW_MS = 60 * 60 * 1000;
const LEFT_SWIPE_REWARD = 3;
const RIGHT_SWIPE_REWARD = 25;
const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const USERNAME_COOLDOWN_DAYS = 30;

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}
function getYesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function getSwipeReward(swipeType) {
  return swipeType === 'left' ? 3 : 25;
}

function formatFirstSwipeDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'First swipe date unknown';
  return `First swipe ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

function isHourlyExempt(source) {
  return ['loot-box', 'jackpot'].includes(source);
}

function validateUsername(username) {
  if (username.length < USERNAME_MIN) return { valid: false, error: `At least ${USERNAME_MIN} characters.` };
  if (username.length > USERNAME_MAX) return { valid: false, error: `At most ${USERNAME_MAX} characters.` };
  if (!USERNAME_REGEX.test(username)) return { valid: false, error: 'Letters, numbers, underscores only.' };
  return { valid: true };
}

function cooldownDaysRemaining(lastChangedAt) {
  const lastChanged = new Date(lastChangedAt);
  const daysSince = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, USERNAME_COOLDOWN_DAYS - Math.floor(daysSince));
}

function checkLootBoxCooldown(lootBox) {
  if (!lootBox.last_open_date) return { available: true, hoursRemaining: 0, minutesRemaining: 0 };
  const msSinceOpen = Date.now() - new Date(lootBox.last_open_date).getTime();
  const msIn24h = 24 * 60 * 60 * 1000;
  if (msSinceOpen >= msIn24h) return { available: true, hoursRemaining: 0, minutesRemaining: 0 };
  const msRemaining = msIn24h - msSinceOpen;
  return {
    available: false,
    hoursRemaining: Math.floor(msRemaining / 3600000),
    minutesRemaining: Math.floor((msRemaining % 3600000) / 60000),
  };
}

const LOOT_BOX_BASE_COST = 100;
const LOOT_BOX_CURVE_MULTIPLIER = 1.15;

const LOOT_TIERS = [
  { tier: 'common',    label: 'Common',    minReward: 300,   maxReward: 450,   chancePct: 50, color: '#00F0FF' },
  { tier: 'rare',      label: 'Rare',      minReward: 600,   maxReward: 1200,  chancePct: 28, color: '#7000FF' },
  { tier: 'epic',      label: 'Epic',      minReward: 1500,  maxReward: 3000,  chancePct: 14, color: '#FF007A' },
  { tier: 'legendary', label: 'Legendary', minReward: 3500,  maxReward: 6000,  chancePct: 6,  color: '#FFD700' },
  { tier: 'mythic',    label: 'Mythic',    minReward: 7500,  maxReward: 15000, chancePct: 2,  color: '#B000FF' },
];

const INJECTION_PATTERNS = [
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
  /import\s+/i,
];

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  const cleaned = input.replace(/[<>"'`;{}()\[\]\\]/g, '').trim();
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(cleaned)) return '';
  }
  return cleaned.slice(0, 256);
}

function getBoxCost(totalOpened) {
  const n = Math.max(0, Math.min(Number(totalOpened) || 0, 1000));
  return Math.floor(LOOT_BOX_BASE_COST * Math.pow(LOOT_BOX_CURVE_MULTIPLIER, n));
}

function generateLootBoxReward() {
  const randBytes = randomBytes(8);
  const roll = (randBytes.readUInt32BE(0) / 0xFFFFFFFF) * 100;
  let cumulative = 0;
  for (const config of LOOT_TIERS) {
    cumulative += config.chancePct;
    if (roll < cumulative) {
      if (config.tier === 'mythic') {
        return { baseReward: config.minReward, isJackpot: true, tier: 'mythic' };
      }
      const range = config.maxReward - config.minReward + 1;
      const rewardRoll = randBytes.readUInt32BE(4) / 0xFFFFFFFF;
      const baseReward = Math.floor(rewardRoll * range) + config.minReward;
      return { baseReward, isJackpot: false, tier: config.tier };
    }
  }
  return { baseReward: LOOT_TIERS[0].minReward, isJackpot: false, tier: 'common' };
}

function calculateNewStreak(lootBox) {
  if (!lootBox.last_open_date) return 1;
  const lastDate = new Date(lootBox.last_open_date).toISOString().split('T')[0];
  const today = getTodayDate();
  if (lastDate === today) return lootBox.streak;
  if (lastDate === getYesterdayDate()) return lootBox.streak + 1;
  return 1;
}

function getStreakMultiplier(streak) {
  if (streak <= 1) return 1;
  if (streak >= 15) return 10;
  return Math.round((1 + ((streak - 1) / 14) * 9) * 10) / 10;
}

// ─── PB admin singleton ───────────────────────────────────────────────

const PB_URL = process.env.PB_URL || '';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || '';
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || '';

let adminPb = null;
let adminPbPromise = null;

class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

class HumanVerificationRequiredError extends HttpError {
  constructor() {
    super('Human verification required. Please complete the challenge.', 403);
  }
}

class HumanVerificationFailedError extends HttpError {
  constructor() {
    super('Verification failed. Please try again.', 403);
  }
}

async function getAdmin() {
  if (adminPb?.authStore?.isValid) return adminPb;
  if (adminPbPromise) return adminPbPromise;
  adminPbPromise = (async () => {
    if (!PB_URL) throw new HttpError('PB_URL not configured.', 500);
    if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
      throw new HttpError('PocketBase admin credentials not configured.', 500);
    }
    const pb = new PocketBase(PB_URL);
    pb.autoCancellation(false);
    try {
      await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
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

async function readBody(req) {
  try {
    const text = await req.text();
    if (!text) return {};
    const parsed = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const sanitized = {};
    for (const [key, value] of Object.entries(parsed)) {
      const cleanKey = sanitizeInput(key);
      if (!cleanKey) continue;
      if (typeof value === 'string') {
        sanitized[cleanKey] = sanitizeInput(value);
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

function stringField(body, key) {
  return String(body[key] ?? '');
}
function numField(body, key) {
  return Number(body[key] ?? 0);
}

// ─── Core logic: points, user, loot box ──────────────────────────────

async function getOrCreateUser(pb, wallet) {
  let users = await listAll(pb, 'users', { filter: `wallet="${wallet}"` });
  if (users.length > 0) return { user: users[0], isNew: false };
  // One random password, reused for confirm — calling randomBytes twice
  // generated mismatched values and PocketBase rejected the create with
  // a passwordConfirm error (new users could never sign up).
  const password = randomBytes(24).toString('base64');
  const user = await pb.collection('users').create({
    wallet,
    email: `${wallet.slice(0, 8)}@cryinder.app`,
    emailVisibility: false,
    usernameSet: false,
    verified: false,
    name: '',
    streak: 0,
    password,
    passwordConfirm: password,
  });
  return { user, isNew: true };
}

async function getOrCreatePoints(pb, userId) {
  let records = await listAll(pb, 'points', { filter: `user="${userId}"` });
  if (records.length > 0) return records[0];
  // last_swipe_date is a required date field — an empty string is
  // rejected by PocketBase (400) and blocks new users from earning CP.
  return pb.collection('points').create({
    user: userId,
    balance: 0,
    daily_swipes: 0,
    last_swipe_date: getTodayDate(),
  });
}

async function getOrCreateLootBox(pb, userId) {
  let records = await listAll(pb, 'loot_boxes', { filter: `user="${userId}"` });
  if (records.length > 0) return records[0];
  return pb.collection('loot_boxes').create({
    user: userId,
    last_open_date: null,
    streak: 0,
    total_opened: 0,
  });
}

async function checkHourlyCPLimit(pb, userId, reward) {
  const nowMs = Date.now();
  const oneHourAgoMs = nowMs - HOURLY_WINDOW_MS;
  const oneHourAgo = new Date(oneHourAgoMs).toISOString();
  // Fetch by time only and exclude exempt sources in JS — filtering on
  // `source != "loot-box"` in the query is fragile (can 500 on null source).
  // If cp_history is missing/unavailable, degrade gracefully: no cap
  // enforcement rather than failing the whole swipe/points request.
  let earned = 0;
  try {
    const records = await listAll(pb, 'cp_history', {
      filter: `user="${userId}" && created >= "${oneHourAgo}"`,
      fields: 'amount,source',
    });
    earned = records.reduce((sum, r) => {
      const src = String(r.source ?? '');
      if (src === 'loot-box' || src === 'jackpot') return sum;
      return sum + Number(r.amount || 0);
    }, 0);
  } catch (err) {
    console.error('[api/pb] cp_history read failed, skipping hourly cap:', err?.message || err);
  }
  const remaining = Math.max(0, HOURLY_CP_LIMIT - earned - reward);
  return {
    allowed: remaining > 0,
    remaining,
    resetAt: new Date(oneHourAgoMs + HOURLY_WINDOW_MS),
  };
}

/**
 * getFullList wrapper that forces a small perPage so the SDK pages
 * through valid sizes. PocketBase caps perPage at 200, while the SDK's
 * default batch of 1000 makes getFullList throw "page out of bounds"
 * on collections with more than 200 matching records.
 */
async function listAll(pb, collection, options = {}) {
  return pb.collection(collection).getFullList({
    ...options,
    perPage: options.perPage ?? 200,
  });
}

async function recordCPEarned(pb, userId, amount, source) {
  try {
    await pb.collection('cp_history').create({ user: userId, amount, source });
  } catch (err) {
    console.error('[api/pb] cp_history write failed (points still granted):', err?.message || err);
  }
}

async function addPointsCore(pb, userId, amount, source, countSwipe = true) {
  const today = getTodayDate();
  const points = await getOrCreatePoints(pb, userId);
  const isNewDay = String(points.last_swipe_date || '') !== today;
  const currentDailySwipes = isNewDay ? 0 : Number(points.daily_swipes || 0);

  if (countSwipe && currentDailySwipes >= DAILY_SWIPE_LIMIT) {
    const limit = await checkHourlyCPLimit(pb, userId, amount);
    return {
      updated: points,
      hourlyLimited: false,
      hourlyEarned: HOURLY_CP_LIMIT - limit.remaining,
      hourlyRemaining: limit.remaining,
      hourlyResetAt: limit.resetAt,
    };
  }

  if (!isHourlyExempt(source)) {
    const limit = await checkHourlyCPLimit(pb, userId, amount);
    if (!limit.allowed) {
      if (countSwipe) {
        const updated = await pb.collection('points').update(points.id, {
          daily_swipes: currentDailySwipes + 1,
          last_swipe_date: today,
        });
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
  const newBalance = Number(points.balance || 0) + amount;
  const updated = await pb.collection('points').update(points.id, {
    balance: newBalance,
    daily_swipes: newDailySwipes,
    last_swipe_date: today,
  });
  await recordCPEarned(pb, userId, amount, source);
  const limit = await checkHourlyCPLimit(pb, userId, 0);
  return {
    updated,
    hourlyLimited: false,
    hourlyEarned: Math.min(HOURLY_CP_LIMIT - limit.remaining, HOURLY_CP_LIMIT),
    hourlyRemaining: limit.remaining,
    hourlyResetAt: limit.resetAt,
  };
}

// ─── Route handler ────────────────────────────────────────────────────

async function handle(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/pb\/?/, '') || 'pb-root';
  const method = req.method;

  function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!path || path === 'pb-root') {
    return json({ ok: true, message: 'Cryinder API running. See /leaderboard, /stats, etc.' });
  }

  // Best-effort client IP for Turnstile's optional remoteip check.
  function clientIp() {
    const fwd = req.headers.get('x-forwarded-for') || '';
    return fwd.split(',')[0].trim() || (req.headers.get('x-real-ip') || '').trim();
  }

  // Identify-challenge is public (no admin PB needed)
  if (method === 'POST' && path === 'identify-challenge') {
    const body = await readBody(req);
    const wallet = stringField(body, 'wallet');
    if (!SOLANA_WALLET_RE.test(wallet)) throw new HttpError('Invalid wallet.', 400);
    if (!checkRate(`identify:${wallet}`)) throw new HttpError('Too many requests.', 429);
    // Require a valid Turnstile token to block bot-driven nonce issuance.
    const turnstileToken = stringField(body, 'turnstileToken');
    if (!turnstileToken) throw new HumanVerificationRequiredError();
    const turnstileOk = await verifyTurnstileToken(turnstileToken, clientIp());
    if (!turnstileOk) throw new HumanVerificationFailedError();
    return json(issueNonce(wallet));
  }

  const pb = await getAdmin();
  const body = method === 'GET' ? {} : await readBody(req);

  // GET query params are parsed from the URL (the GET body is always {}).
  const query = Object.fromEntries(url.searchParams.entries());
  const limitParam = Math.min(Number(query.limit) || 10, 100);

  // Identify (also public: returns session token)
  if (method === 'POST' && path === 'identify') {
    const wallet = stringField(body, 'wallet');
    const message = stringField(body, 'message');
    const signature = stringField(body, 'signature');
    if (!SOLANA_WALLET_RE.test(wallet)) throw new HttpError('Invalid wallet.', 400);
    if (!message.startsWith(IDENTITY_PREFIX)) throw new HttpError('Invalid message format.', 400);
    const afterPrefix = message.slice(IDENTITY_PREFIX.length);
    if (!afterPrefix.startsWith(`${wallet}:`)) throw new HttpError('Wallet mismatch.', 400);
    const nonce = afterPrefix.slice(wallet.length + 1);
    // Verify the Ed25519 signature FIRST — this is the actual authentication
    // and is stateless, so it always works regardless of serverless cold
    // starts. The nonce is a best-effort replay guard: if the in-memory
    // store was lost (new instance), we accept a valid signature rather
    // than failing the whole login.
    if (!verifyWalletSignature(wallet, message, signature)) throw new HttpError('Signature verification failed.', 401);
    if (!consumeNonce(wallet, nonce)) {
      // Nonce unknown (cold start) — the signature is still valid, so allow.
      console.warn('[api/pb] Nonce not found (cold start?), accepting valid signature.');
    }
    const { user, isNew } = await getOrCreateUser(pb, wallet);
    const session = signSession(wallet);
    return json({ token: session.token, expiresAt: session.expiresAt, user, isNew });
  }

  // Public reads
  if (method === 'GET') {
    if (path === 'leaderboard') {
      const limit = limitParam;
      const records = await listAll(pb, 'points', { sort: '-balance', perPage: limit });
      const items = await Promise.all(records.map(async (r, i) => {
        const users = await listAll(pb, 'users', { filter: `id="${r.user}"`, perPage: 1 });
        return {
          userId: r.user,
          userName: users[0]?.username || null,
          rank: i + 1,
          value: Number(r.balance || 0),
          byline: null,
        };
      }));
      return json({ items });
    }

    if (path === 'top-swipers') {
      const limit = limitParam;
      const swipes = await listAll(pb, 'swipes', { filter: 'swipe_type = "right"' });

      // Count swipes per user
      const byUser = new Map();
      for (const s of swipes) {
        const userId = s.user;
        if (!userId) continue;
        if (!byUser.has(userId)) {
          byUser.set(userId, { count: 0, firstSwipe: s.created });
        }
        const entry = byUser.get(userId);
        entry.count++;
        if (s.created < entry.firstSwipe) entry.firstSwipe = s.created;
      }

      // Sort by count descending
      const sorted = [...byUser.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, limit);

      // Get usernames
      const userIds = sorted.map(([id]) => id);
      const users = await listAll(pb, 'users', {
        filter: userIds.map((id) => `id = "${id}"`).join(' || '),
      });
      const usernameMap = new Map(users.map((u) => [u.id, u.username || null]));

      return json({
        items: sorted.map(([userId, data], i) => ({
          userId,
          userName: usernameMap.get(userId) || null,
          rank: i + 1,
          value: data.count,
          byline: formatFirstSwipeDate(data.firstSwipe),
        })),
      });
    }

    if (path === 'top-tokens') {
      const limit = limitParam;
      const swipes = await listAll(pb, 'swipes', { filter: 'swipe_type = "right"' });

      // Aggregate by token_id
      const byToken = new Map();
      for (const s of swipes) {
        const id = s.token_id || s.id;
        if (!id) continue;
        if (!byToken.has(id)) {
          byToken.set(id, {
            tokenId: id,
            tokenSymbol: s.token_symbol || '?',
            tokenName: s.token_name || 'Token',
            tokenPrice: Number(s.token_price) || 0,
            count: 0,
          });
        }
        byToken.get(id).count++;
      }

      // Sort by count descending
      const sorted = [...byToken.values()].sort((a, b) => b.count - a.count).slice(0, limit);
      return json({
        items: sorted.map((t, i) => ({
          tokenId: t.tokenId,
          tokenSymbol: t.tokenSymbol,
          tokenName: t.tokenName,
          tokenPrice: t.tokenPrice,
          rank: i + 1,
          value: t.count,
        })),
      });
    }

    if (path === 'stats') {
      try {
        const allUsers = await listAll(pb, 'users');
        const allPoints = await listAll(pb, 'points');
        // Total swipes = record count in the swipes collection.
        const swipesRes = await pb.collection('swipes').getList(1, 1, { fields: 'id' });
        return json({
          totalSwipes: swipesRes.totalItems,
          totalCPEarned: allPoints.reduce((s, p) => s + Number(p.balance || 0), 0),
          totalSwipers: allUsers.length,
        });
      } catch {
        // Missing collections degrade to zeros rather than 500-spamming.
        return json({ totalSwipes: 0, totalCPEarned: 0, totalSwipers: 0 });
      }
    }

    if (path === 'ad-slots') {
      const now = new Date().toISOString();
      let active = await listAll(pb, 'ad_slots', {
        filter: `status = "booked" && (expires_at = "" || expires_at = null || expires_at > "${now}")`,
        sort: '-booked_date',
      });
      if (!active.length) {
        active = await listAll(pb, 'ad_slots', {
          filter: `status = "booked"`,
          sort: '-booked_date',
        });
      }
      return json(active);
    }
  }

  // Authenticated routes
  const auth = req.headers.get('authorization') ?? '';
  const match = auth.match(/^Bearer\s+(\S+)$/i);
  const session = verifySession(match?.[1]);
  if (!session) throw new HttpError('Authentication required.', 401);
  if (!checkRate(`${path}:${session.wallet}`)) throw new HttpError('Rate limited.', 429);
  const wallet = session.wallet;
  const { user } = await getOrCreateUser(pb, wallet);
  const userId = String(user.id);

  if (method === 'GET') {
    if (path === 'points') {
      const points = await getOrCreatePoints(pb, userId);
      return json(points);
    }

    if (path === 'hourly') {
      const oneHourAgo = new Date(Date.now() - HOURLY_WINDOW_MS).toISOString();
      let earned = 0;
      try {
        const records = await listAll(pb, 'cp_history', {
          filter: `user="${userId}" && created >= "${oneHourAgo}"`,
          fields: 'amount,source',
        });
        earned = records.reduce((sum, r) => {
          const src = String(r.source ?? '');
          if (src === 'loot-box' || src === 'jackpot') return sum;
          return sum + Number(r.amount || 0);
        }, 0);
      } catch (err) {
        console.error('[api/pb] cp_history read failed for /hourly:', err?.message || err);
      }
      return json({ earned });
    }

    if (path === 'hourly-check') {
      const amount = numField(query, 'reward') || 0;
      const limit = await checkHourlyCPLimit(pb, userId, amount);
      return json({ allowed: limit.allowed, remaining: limit.remaining, resetAt: limit.resetAt });
    }

    if (path === 'loot-box') {
      const lb = await getOrCreateLootBox(pb, userId);
      const boxCost = getBoxCost(Number(lb.total_opened || 0));
      return json({ ...lb, cooldown: checkLootBoxCooldown(lb), boxCost });
    }

    if (path === 'loot-box-cost') {
      const lb = await getOrCreateLootBox(pb, userId);
      const points = await getOrCreatePoints(pb, userId);
      const boxCost = getBoxCost(Number(lb.total_opened || 0));
      const balance = Number(points.balance || 0);
      return json({ boxCost, balance, canAfford: balance >= boxCost, totalOpened: Number(lb.total_opened || 0) });
    }

    if (path === 'loot-history') {
      try {
        const records = await listAll(pb, 'loot_history', {
          filter: `user="${userId}"`,
          sort: '-created',
          perPage: 20,
        });
        return json(records);
      } catch (err) {
        console.error('[api/pb] loot_history read failed:', err?.message || err);
        return json([]);
      }
    }

    if (path === 'user-rank') {
      const userPoints = await listAll(pb, 'points', { filter: `user="${userId}"` });
      if (!userPoints.length) return json({ rank: null, total: 0 });
      const userBalance = Number(userPoints[0].balance || 0);
      const higher = await listAll(pb, 'points', { filter: `balance > ${userBalance}` });
      return json({ rank: higher.length + 1, total: (await listAll(pb, 'points')).length });
    }
  }

  if (method === 'POST') {
    if (path === 'set-username' || path === 'update-username') {
      // Client sends newUsername; keep username accepted too.
      const username = stringField(body, 'username') || stringField(body, 'newUsername');
      const { valid, error } = validateUsername(username);
      if (!valid) throw new HttpError(error || 'Invalid username.', 400);
      const cooldown = cooldownDaysRemaining(user.usernameChangedAt);
      if (cooldown > 0) throw new HttpError(`Username change on cooldown. ${cooldown} days remaining.`, 429);
      const existing = await listAll(pb, 'users', {
        filter: `username = "${username}" && id != "${userId}"`,
      });
      if (existing.length) throw new HttpError('Username already taken.', 409);
      const updated = await pb.collection('users').update(userId, {
        username,
        usernameSet: true,
        usernameChangedAt: new Date().toISOString(),
      });
      return json(updated);
    }

    if (path === 'record-swipe') {
      const swipeType = stringField(body, 'swipeType');
      if (swipeType !== 'left' && swipeType !== 'right') throw new HttpError('Invalid swipeType.', 400);
      // Log only — CP is awarded by add-points (TokenDeck/usePoints).
      await pb.collection('swipes')
        .create({
          user: userId,
          token_id: stringField(body, 'tokenId'),
          token_name: stringField(body, 'tokenName'),
          token_symbol: stringField(body, 'tokenSymbol'),
          token_price: Number(body.tokenPrice) || 0,
          swipe_type: swipeType,
        });
      return json({ ok: true });
    }

    if (path === 'add-points') {
      const swipeType = stringField(body, 'swipeType');
      if (swipeType === 'left' || swipeType === 'right') {
        // New format: derive amount from swipeType
        const reward = swipeType === 'right' ? RIGHT_SWIPE_REWARD : LEFT_SWIPE_REWARD;
        const source = swipeType === 'right' ? 'swipe-right' : 'swipe-left';
        const result = await addPointsCore(pb, userId, reward, source, true);
        return json({ ok: true, ...result });
      }
      // Old format: explicit amount
      const amount = numField(body, 'amount');
      const source = stringField(body, 'source') || 'manual';
      if (!amount) throw new HttpError('amount required.', 400);
      const result = await addPointsCore(pb, userId, amount, source, false);
      return json({ ok: true, ...result });
    }

    if (path === 'open-loot-box') {
      const lb = await getOrCreateLootBox(pb, userId);
      const cooldown = checkLootBoxCooldown(lb);
      if (!cooldown.available) {
        throw new HttpError(
          `Cooldown: ${cooldown.hoursRemaining}h ${cooldown.minutesRemaining}m remaining.`,
          429,
        );
      }
      const totalOpened = Number(lb.total_opened || 0);
      const boxCost = getBoxCost(totalOpened);
      const points = await getOrCreatePoints(pb, userId);
      const currentBalance = Number(points.balance || 0);
      if (currentBalance < boxCost) {
        throw new HttpError(`Insufficient CP. Need ${boxCost} CP, have ${currentBalance} CP.`, 402);
      }
      const streak = calculateNewStreak(lb);
      const { baseReward, isJackpot, tier } = generateLootBoxReward();
      const streakMultiplier = getStreakMultiplier(streak);
      const bonusReward = Math.floor(baseReward * (streakMultiplier - 1));
      const totalReward = baseReward + bonusReward;
      const netCP = totalReward - boxCost;
      const updated = await pb.collection('loot_boxes').update(lb.id, {
        last_open_date: new Date().toISOString(),
        streak,
        total_opened: totalOpened + 1,
      });
      const newBalance = currentBalance - boxCost + totalReward;
      await pb.collection('points').update(points.id, {
        balance: newBalance,
      });
      try {
        await pb.collection('cp_history').create({ user: userId, amount: -boxCost, source: 'loot-box-cost' });
      } catch {}
      const result = await addPointsCore(pb, userId, totalReward, isJackpot ? 'jackpot' : 'loot-box', false);
      try {
        await pb.collection('loot_history')
          .create({ user: userId, amount: totalReward, source: tier, tier });
      } catch (err) {
        console.error('[api/pb] loot_history write failed:', err?.message || err);
      }
      return json({
        ...result,
        baseReward,
        isJackpot,
        tier,
        streak,
        streakMultiplier,
        bonusReward,
        totalReward,
        awardedCP: netCP,
        totalOpened: Number(updated.total_opened) || 0,
        boxCost,
      });
    }

    if (path === 'ad-impression') {
      const slotId = stringField(body, 'slotId');
      if (!slotId) throw new HttpError('slotId required.', 400);
      if (!dedupeImpression(wallet, slotId)) return json({ ok: true, message: 'Already recorded.' });
      try {
        const slot = await pb.collection('ad_slots').getFirstListItem(`id="${slotId}"`);
        await pb.collection('ad_slots').update(slotId, { impressions: Number(slot.impressions || 0) + 1 });
      } catch {}
      return json({ ok: true });
    }

    if (path === 'ad-click') {
      const slotId = stringField(body, 'slotId');
      if (!slotId) throw new HttpError('slotId required.', 400);
      try {
        const slot = await pb.collection('ad_slots').getFirstListItem(`id="${slotId}"`);
        await pb.collection('ad_slots').update(slotId, { clicks: Number(slot.clicks || 0) + 1 });
      } catch {}
      return json({ ok: true });
    }
  }

  throw new HttpError('Not found.', 404);
}

// ─── Vercel handler ───────────────────────────────────────────────────

export default async function handler(req, res) {
  applySecurityHeaders(res);
  try {
    const url = new URL(req.url ?? '/', `https://${req.headers.host ?? 'localhost'}`);
    const method = (req.method ?? 'GET').toUpperCase();

    let bodyText;
    if (method !== 'GET' && typeof req.body === 'string') {
      bodyText = req.body;
    } else if (method !== 'GET' && req.body) {
      bodyText = JSON.stringify(req.body);
    }

    const response = await handle(
      new Request(url.toString(), {
        method,
        headers: req.headers,
        body: bodyText,
      }),
    );

    res.status(response.status).setHeader('Content-Type', 'application/json');
    res.status(response.status).send(await response.text());
  } catch (err) {
    console.error('[api/pb] handler error:', err);
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : 'Internal server error.';
    res.status(status).json({ error: message });
  }
}