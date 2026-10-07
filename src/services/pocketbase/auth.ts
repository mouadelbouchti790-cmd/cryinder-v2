/**
 * Wallet-signed identity & session tokens (server-only).
 *
 * Architecture:
 *   1. Browser asks the connected wallet to sign a fresh nonce message.
 *   2. Browser POSTs { wallet, message, signature } to /identify.
 *   3. Server verifies the signature with ed25519 against the wallet's
 *      decoded public key. Nonce is single-use and 5-minute scoped.
 *   4. Server returns a short-lived HMAC-SHA256 token containing the
 *      wallet address. All subsequent requests send
 *      "Authorization: Bearer <token>". The server resolves the user
 *      from the wallet — it never trusts client-provided userIds.
 *
 * This module imports Node-only APIs (node:crypto). Do not import it
 * from browser code.
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils.js';
import bs58 from 'bs58';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export const IDENTITY_PREFIX = 'cryinder-identity-v1:';
export const NONCE_TTL_MS = 5 * 60 * 1000;       // 5 min
export const SESSION_TTL_MS = 60 * 60 * 1000;    // 1 hour

const nonces = new Map<string, { expiresAt: number }>();

/** Garbage-collect expired nonces lazily on every `consumeNonce`. */
function sweepNonces(now: number): void {
  for (const [k, v] of nonces) {
    if (v.expiresAt <= now) nonces.delete(k);
  }
}

export function issueNonce(wallet: string): { nonce: string; message: string; expiresAt: number } {
  const now = Date.now();
  sweepNonces(now);
  const nonceBytes = randomBytes(16);
  const nonce = bytesToHex(nonceBytes);
  const expiresAt = now + NONCE_TTL_MS;
  nonces.set(`${wallet}:${nonce}`, { expiresAt });
  const message = `${IDENTITY_PREFIX}${wallet}:${nonce}`;
  return { nonce, message, expiresAt };
}

export function consumeNonce(wallet: string, nonce: string): boolean {
  const key = `${wallet}:${nonce}`;
  const entry = nonces.get(key);
  if (!entry) return false;
  nonces.delete(key);
  return entry.expiresAt > Date.now();
}

/** ed25519 signature verification: returns true if signature is valid for (message, wallet). */
export function verifyWalletSignature(
  wallet: string,
  message: string,
  signatureBase64: string,
): boolean {
  let pubkey: Uint8Array;
  let signature: Uint8Array;
  let messageBytes: Uint8Array;
  try {
    pubkey = bs58.decode(wallet);
    signature = Buffer.from(signatureBase64, 'base64');
    messageBytes = utf8ToBytes(message);
  } catch {
    return false;
  }

  if (pubkey.length !== 32) return false;
  if (signature.length !== 64) return false;

  try {
    return ed25519.verify(signature, messageBytes, pubkey);
  } catch {
    return false;
  }
}

// ── HMAC session token ────────────────────────────────────────────

function getSessionSecret(): Uint8Array {
  // Vercel sets PB_SESSION_SECRET in prod; fallback to admin password
  // so dev still works (still server-side, never reaches the browser).
  const secret =
    process.env.PB_SESSION_SECRET ||
    process.env.PB_ADMIN_PASSWORD ||
    'cryinder-dev-fallback-secret';
  return utf8ToBytes(secret);
}

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function fromB64url(input: string): Uint8Array {
  return new Uint8Array(Buffer.from(input, 'base64url'));
}

interface SessionPayload {
  wallet: string;
  iat: number;
  exp: number;
}

export function signSession(wallet: string): { token: string; expiresAt: number } {
  const now = Date.now();
  const payload: SessionPayload = {
    wallet,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  // Sign the JSON-serialized payload directly. The verifier reconstructs
  // the payload by base64url-decoding the body, so we encode then sign
  // over the encoded bytes — keeping sign/verify symmetric.
  const bodyBytes = utf8ToBytes(JSON.stringify(payload));
  const body = b64url(bodyBytes);
  const secret = getSessionSecret();
  const mac = hmac(sha256, secret, bodyBytes);
  return { token: `${body}.${b64url(mac)}`, expiresAt: payload.exp };
}

export function verifySession(token: string | null | undefined): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const macB64 = token.slice(dot + 1);

  let bodyBytes: Uint8Array;
  let macBytes: Uint8Array;
  try {
    bodyBytes = fromB64url(body);
    macBytes = fromB64url(macB64);
  } catch {
    return null;
  }

  const secret = getSessionSecret();
  const expected = hmac(sha256, secret, bodyBytes);

  if (expected.length !== macBytes.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(macBytes))) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(bodyBytes).toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload.wallet !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp <= Date.now()) return null;
  if (!SOLANA_WALLET_RE.test(payload.wallet)) return null;
  return payload;
}

export const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;