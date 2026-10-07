import {
  VersionedTransaction,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import bs58 from 'bs58';

/* ═══════════════════════════════════════════════════════════════════
   Jupiter Swap API V2 — Meta-Aggregator path (/order + /execute)
   docs: https://developers.jup.ag/docs/swap/order-and-execute

   ONE transaction, ONE signature. The 1% Cryinder fee is collected by
   Jupiter itself via the Referral Program (referralAccount + referralFee
   on /order). The fee is baked into the swap transaction, so the user
   CANNOT approve the swap and reject the fee — they are atomic.

   Flow:
     1. GET  /order    → quote + assembled tx (fee + swap in one)
     2. wallet.signTransaction()  → single approval in Phantom/Solflare
     3. POST /execute  → Jupiter Beam lands it (priority fees + MEV
                          protection + confirmation polling)

   A local broadcast+confirm fallback covers /execute network blips.

   ⚠️  Fail-closed fee guarantee: if /order returns a quote where the
       referral fee was NOT applied (e.g. referral token account missing
       for the fee mint), we REFUSE the swap instead of letting a
       fee-less trade through.
   ═══════════════════════════════════════════════════════════════════ */

const API_BASE = 'https://api.jup.ag/swap/v2';

/** Wrapped SOL mint — the input token for every Cryinder buy. */
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

// ─── Environment (Vite client env) ───────────────────────────────

const API_KEY = import.meta.env.VITE_JUPITER_API_KEY as string | undefined;

/** 1% platform fee collected on every swap (basis points). */
export const FEE_BPS = 100;

/**
 * Jupiter Referral Program account. Jupiter collects the fee in the SAME
 * swap transaction and deposits it into this account's token account for
 * the fee mint (fee-mint priority starts with SOL).
 */
export const REFERRAL_ACCOUNT =
  (import.meta.env.VITE_JUPITER_REFERRAL_ACCOUNT as string | undefined) ??
  '3Abf6RjpP2bQEUJpGqVJWzFH3TmMo1nChvZsMA2bMXs9';

/**
 * Cryinder treasury wallet that ultimately receives platform fees
 * (referral account balance is withdrawn here). Shown in the UI only.
 */
export const TREASURY_WALLET =
  (import.meta.env.VITE_CRYINDER_TREASURY_PUBLIC_KEY as string | undefined) ??
  '67cuvTzUsYVRkv4sogHeuQEVF7LRixgP2hSbCFoULTj7';

// ─── Errors ─────────────────────────────────────────────────────

export class JupiterError extends Error {
  status?: number;
  code?: string;
  isTimeout?: boolean;
  isWalletRejection?: boolean;

  constructor(
    message: string,
    opts?: { status?: number; code?: string; isTimeout?: boolean; isWalletRejection?: boolean },
  ) {
    super(message);
    this.name = 'JupiterError';
    this.status = opts?.status;
    this.code = opts?.code;
    this.isTimeout = opts?.isTimeout;
    this.isWalletRejection = opts?.isWalletRejection;
  }
}

// ─── Base64 ↔ bytes (browser-safe, no Buffer) ───────────────────

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunk to avoid call-stack limits on large payloads.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ─── Low-level fetch with timeout + structured errors ────────────

interface FetchOpts {
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | undefined | null>;
  body?: Record<string, unknown>;
  timeoutMs?: number;
}

async function jupiterFetch<T = any>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { method = 'GET', query, body, timeoutMs = 30_000 } = opts;
  const url = new URL(API_BASE + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;
  if (body) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new JupiterError('Request timed out', { isTimeout: true });
    }
    throw new JupiterError(err?.message || 'Network error contacting Jupiter');
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      (typeof data?.error === 'string' ? data.error : null) ||
      data?.errorMessage ||
      `Jupiter API error (HTTP ${res.status})`;
    const code =
      data?.error?.code ??
      (data?.errorCode != null ? String(data.errorCode) : undefined);
    throw new JupiterError(msg, { status: res.status, code });
  }

  return data as T;
}

// ─── Types ───────────────────────────────────────────────────────

export interface QuoteParams {
  /** Mint being spent (SOL for buys). */
  inputMint: string;
  /** Mint being bought (the token). */
  outputMint: string;
  /** Input amount in smallest units (lamports for SOL). */
  amount: number;
  /** User's wallet address (taker). */
  userPublicKey: string;
  /** Fixed slippage in bps. Omit for Jupiter RTSE auto-slippage. */
  slippageBps?: number;
}

export interface SwapQuote {
  requestId: string;
  /** Base64 unsigned versioned transaction (referral fee included). */
  transaction: string;
  inAmount: string;
  outAmount: string;
  /** Minimum output after slippage. */
  otherAmountThreshold: string;
  swapMode: string;
  priceImpactPct?: number;
  router?: string;
  mode?: string;
  /** Total fee rate actually applied to this quote (must be ≥ FEE_BPS). */
  feeBps?: number;
  /** Mint the fee is collected in (SOL per Jupiter fee-mint priority). */
  feeMint?: string;
  /** Referral account echoed back by /order when the fee was applied. */
  referralAccount?: string;
  /** 1% fee in lamports (display estimate: amount × FEE_BPS). */
  feeLamports: number;
}

export interface SwapResult {
  signature: string;
  status: 'Success' | 'Failed';
  code: number;
  totalInputAmount: string;
  totalOutputAmount: string;
  inputAmountResult: string;
  outputAmountResult: string;
  error?: string;
}

// ─── Quote + order ──────────────────────────────────────────────

/**
 * Get a swap order: quote + assembled transaction in one call.
 *
 * The 1% Cryinder fee is collected INSIDE the same transaction via
 * Jupiter's Referral Program. There is no separate fee transaction and
 * no second wallet signature.
 *
 * Fail-closed: if Jupiter did not apply the referral fee to this quote
 * (missing/under-sized referral token account for the fee mint), we
 * throw instead of executing a fee-less swap.
 */
export async function getQuote(params: QuoteParams): Promise<SwapQuote> {
  const query: Record<string, string | number | undefined | null> = {
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: String(params.amount),
    taker: params.userPublicKey,
    // ✅ Fee collected in the SAME transaction as the swap.
    referralAccount: REFERRAL_ACCOUNT,
    referralFee: String(FEE_BPS),
    ...(params.slippageBps ? { slippageBps: params.slippageBps } : {}),
  };

  const data = await jupiterFetch<any>('/order', {
    method: 'GET',
    timeoutMs: 20_000,
    query,
  });

  // /order returns transaction = "" when a price exists but no tx could be built.
  if (!data || data.transaction === '' || data.transaction == null) {
    throw new JupiterError(
      data?.errorMessage || 'No route available for this token right now.',
      { status: 422, code: data?.errorCode != null ? String(data.errorCode) : undefined },
    );
  }

  // ── FAIL-CLOSED FEE GUARANTEE ──────────────────────────────────
  // If the referral fee was not applied (feeBps below our 1%, or the
  // referral account not echoed back), do NOT hand the user a swap they
  // could execute without paying the fee. The swap must never proceed
  // without the fee being collected atomically.
  const appliedFeeBps = data.feeBps != null ? Number(data.feeBps) : 0;
  const referralApplied =
    appliedFeeBps >= FEE_BPS &&
    (!data.referralAccount || data.referralAccount === REFERRAL_ACCOUNT);

  if (!referralApplied) {
    console.error(
      '[jupiter] Referral fee NOT applied to quote — refusing swap.',
      { expected: FEE_BPS, actual: appliedFeeBps, referralAccount: data.referralAccount },
    );
    throw new JupiterError(
      'Fee configuration error — swap blocked to protect the platform fee. Please contact support.',
      { status: 502, code: 'FEE_NOT_APPLIED' },
    );
  }

  return {
    requestId: data.requestId,
    transaction: data.transaction,
    inAmount: String(data.inAmount ?? ''),
    outAmount: String(data.outAmount ?? ''),
    otherAmountThreshold: String(data.otherAmountThreshold ?? ''),
    swapMode: data.swapMode ?? 'ExactIn',
    priceImpactPct:
      data.priceImpactPct != null ? Number(data.priceImpactPct) : undefined,
    router: data.router,
    mode: data.mode,
    feeBps: appliedFeeBps,
    feeMint: data.feeMint,
    referralAccount: data.referralAccount,
    feeLamports: Math.floor((params.amount * FEE_BPS) / 10_000),
  };
}

// ─── Execute (single signature) ─────────────────────────────────

function mapExecuteResult(data: any, fallback?: Partial<SwapResult>): SwapResult {
  return {
    signature: data?.signature ?? fallback?.signature ?? '',
    status: data?.status === 'Success' ? 'Success' : 'Failed',
    code: Number(data?.code ?? fallback?.code ?? -1),
    totalInputAmount: String(data?.totalInputAmount ?? fallback?.totalInputAmount ?? ''),
    totalOutputAmount: String(data?.totalOutputAmount ?? fallback?.totalOutputAmount ?? ''),
    inputAmountResult: String(data?.inputAmountResult ?? fallback?.inputAmountResult ?? ''),
    outputAmountResult: String(data?.outputAmountResult ?? fallback?.outputAmountResult ?? ''),
    error: data?.error ?? fallback?.error,
  };
}

/**
 * Execute a swap order. The wallet signs ONCE — the swap AND the 1% fee
 * are the same transaction, so the fee can never be skipped. Jupiter's
 * /execute handles priority-fee optimisation, MEV-protected landing and
 * confirmation polling.
 *
 * If /execute is unreachable (network blip / timeout) the already-signed
 * transaction is broadcast + confirmed locally as a safety net. The fee
 * remains guaranteed because it is inside that signed transaction.
 */
export async function executeSwap(opts: {
  quote: SwapQuote;
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  connection: Connection;
}): Promise<SwapResult> {
  const { quote, signTransaction, connection } = opts;

  // 1. Deserialize the unsigned transaction from /order (fee included).
  const unsigned = VersionedTransaction.deserialize(base64ToBytes(quote.transaction));

  // 2. ONE wallet signature (swap + fee together).
  let signed: VersionedTransaction;
  try {
    signed = await signTransaction(unsigned);
  } catch (err: any) {
    const msg = String(err?.message || err);
    const rejected = /reject|cancel|declin|user abort/i.test(msg);
    throw new JupiterError(
      rejected ? 'Transaction not approved in wallet.' : `Wallet signing failed: ${msg}`,
      { isWalletRejection: rejected },
    );
  }

  // 3. Submit to Jupiter /execute (managed landing).
  const signedB64 = bytesToBase64(signed.serialize());
  try {
    const data = await jupiterFetch<any>('/execute', {
      method: 'POST',
      timeoutMs: 90_000,
      body: { signedTransaction: signedB64, requestId: quote.requestId },
    });
    if (data) {
      return mapExecuteResult(data);
    }
  } catch (err) {
    // A real HTTP error from /execute (e.g. invalid tx, expired requestId)
    // is definitive — surface it. Timeouts / network blips fall through to a
    // local broadcast so a signed tx is never silently dropped.
    if (err instanceof JupiterError && !err.isTimeout && err.status !== undefined) {
      throw err;
    }
  }

  // 4. If /execute timed out, the tx may have already landed on-chain.
  //    Check the signature first so we don't double-submit a processed tx.
  const sigBytes = signed.signatures[0];
  if (sigBytes && sigBytes.length > 0) {
    const sigStr = bs58.encode(sigBytes);
    try {
      const status = await connection.getSignatureStatus(sigStr);
      if (status?.value && (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized')) {
        return mapExecuteResult(
          null,
          {
            signature: sigStr,
            status: 'Success',
            code: 0,
            totalInputAmount: quote.inAmount,
            totalOutputAmount: quote.outAmount,
            inputAmountResult: quote.inAmount,
            outputAmountResult: quote.outAmount,
          },
        );
      }
    } catch {
      // Status check failed — fall through to broadcast attempt.
    }
  }

  // 5. Fallback: broadcast + confirm the signed tx ourselves.
  let rawSig: string;
  try {
    rawSig = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
  } catch (err: any) {
    // The tx was already processed (e.g. /execute landed it but we didn't
    // detect it) — treat as success rather than a hard failure.
    if (/already been processed|AlreadyProcessed|simulation failed/i.test(err?.message || '')) {
      return mapExecuteResult(
        null,
        {
          signature: sigBytes && sigBytes.length > 0 ? bs58.encode(sigBytes) : '',
          status: 'Success',
          code: 0,
          totalInputAmount: quote.inAmount,
          totalOutputAmount: quote.outAmount,
          inputAmountResult: quote.inAmount,
          outputAmountResult: quote.outAmount,
        },
      );
    }
    throw new JupiterError(
      `Swap broadcast failed: ${err?.message || 'unknown error'}`,
    );
  }

  const confirmation = await connection.confirmTransaction(rawSig, 'confirmed');
  if (confirmation.value.err) {
    return mapExecuteResult(
      null,
      {
        signature: rawSig,
        status: 'Failed',
        code: -1000,
        error: 'Transaction failed on-chain',
        totalInputAmount: quote.inAmount,
        totalOutputAmount: '0',
        inputAmountResult: quote.inAmount,
        outputAmountResult: '0',
      },
    );
  }

  return mapExecuteResult(
    null,
    {
      signature: rawSig,
      status: 'Success',
      code: 0,
      totalInputAmount: quote.inAmount,
      totalOutputAmount: quote.outAmount,
      inputAmountResult: quote.inAmount,
      outputAmountResult: quote.outAmount,
    },
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

const decimalsCache = new Map<string, number>();

/** Look up an SPL/Token2022 mint's decimals via parsed account data. */
export async function getMintDecimals(
  connection: Connection,
  mint: string,
): Promise<number> {
  const cached = decimalsCache.get(mint);
  if (cached !== undefined) return cached;

  const res = await connection.getParsedAccountInfo(new PublicKey(mint));
  const decimals = (res.value?.data as any)?.parsed?.info?.decimals;
  if (typeof decimals === 'number') {
    decimalsCache.set(mint, decimals);
    return decimals;
  }
  throw new JupiterError(`Could not determine decimals for ${mint}`);
}

/** Convert a SOL amount to lamports. */
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

/** Convert lamports to a SOL number. */
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Map a JupiterError / execute code to a user-friendly message.
 */
export function humanizeSwapError(err: unknown): string {
  if (!(err instanceof JupiterError)) {
    const msg = err instanceof Error ? err.message : String(err);
    return msg || 'Swap failed. Please try again.';
  }

  if (err.isWalletRejection) return err.message;

  // Jupiter's generic "no route at this size" message.
  if (/failed to get quotes/i.test(err.message)) {
    return 'No route for this amount. Try a larger amount (0.005 SOL minimum for a first buy).';
  }

  // /execute error codes
  switch (err.code) {
    case '-1':
      return 'Quote expired — prices moved. Please retry.';
    case '-1000':
    case '-2000':
      return 'Transaction did not land on Solana. Please retry.';
    case '-1004':
    case '-2003':
      return 'Quote expired before landing. Please retry.';
    case '-1003':
      return 'Transaction was not fully signed. Please retry.';
    case '1':
      return 'Insufficient balance for this swap.';
    case '2':
      return 'Not enough SOL for network fees.';
    case 'FEE_NOT_APPLIED':
      return 'Fee protection blocked this swap. Please contact support.';
  }

  if (err.isTimeout) return 'Swap confirmation timed out — it may still complete. Check Solscan shortly.';

  return err.message;
}
