import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { X, Check, AlertTriangle, ExternalLink } from 'lucide-react';
import type { TokenData } from '../types/token';
import { formatPrice } from '../utils/formatters';
import {
  getQuote,
  executeSwap,
  getMintDecimals,
  solToLamports,
  lamportsToSol,
  SOL_MINT,
  FEE_BPS,
  humanizeSwapError,
  JupiterError,
  type SwapQuote,
  type SwapResult,
} from '../services/jupiter';

interface BuyModalProps {
  token: TokenData;
  onConfirm: (token: TokenData) => void;
  onClose: () => void;
  /** Fired ONLY when the swap transaction confirms successfully. */
  onSwapComplete?: (token: TokenData) => void;
}

const PRESETS = [0.05, 0.1, 0.25];
const SLIPPAGE_OPTIONS = [
  { label: 'Auto', value: 'auto' as const },
  { label: '1%', value: 100 as const },
  { label: '5%', value: 500 as const },
  { label: '10%', value: 1000 as const },
];

/** Rent for a new token account on Solana (~0.00203928 SOL). */
const TOKEN_ACCOUNT_RENT_LAMPORTS = 2_039_280;
/** Conservative gas reserve for the swap transaction. */
const GAS_RESERVE_LAMPORTS = 50_000;
/** User-friendly minimum for a FIRST buy (swap + 1% fee + gas + rent). */
const FIRST_BUY_MIN_SOL = 0.005;

type QuoteState = 'idle' | 'loading' | 'ready' | 'error';
type SwapState = 'idle' | 'signing' | 'executing' | 'done' | 'error';

function formatTokenAmount(raw: string, decimals: number): string {
  const n = Number(raw) / 10 ** decimals;
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export default function BuyModal({ token, onConfirm, onClose, onSwapComplete }: BuyModalProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [amountSol, setAmountSol] = useState('0.1');
  const [slippage, setSlippage] = useState<(typeof SLIPPAGE_OPTIONS)[number]['value']>('auto');
  const [decimals, setDecimals] = useState<number | null>(null);
  const [balanceLamports, setBalanceLamports] = useState<number | null>(null);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteState, setQuoteState] = useState<QuoteState>('idle');
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [swapState, setSwapState] = useState<SwapState>('idle');
  const [swapError, setSwapError] = useState<string | null>(null);
  const [result, setResult] = useState<SwapResult | null>(null);
  /** True when the user already has a token account for this mint. */
  const [hasTokenAccount, setHasTokenAccount] = useState<boolean | null>(null);
  /** Advanced breakdown disclosure — open by default for first buy. */
  const [detailsOpen, setDetailsOpen] = useState(false);

  const swapping = swapState === 'signing' || swapState === 'executing';
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Esc to close (only when not mid-swap)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !swapping) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, swapping]);

  const amountNum = parseFloat(amountSol) || 0;
  // User inputs the TOTAL they want to spend.
  // We pass the full `totalLamports` to /order
  // and show the 1% display estimate locally.
  const totalLamports = solToLamports(amountNum);
  const feeLamports = Math.floor((totalLamports * FEE_BPS) / 10_000);
  const swapLamports = totalLamports;
  const balanceSol = balanceLamports != null ? lamportsToSol(balanceLamports) : null;
  const insufficient = balanceLamports != null && totalLamports >= balanceLamports - 5000;
  const tooSmall = totalLamports < 1000;
  // First buy = no token account yet → the swap must also pay ~0.002 SOL rent.
  const isFirstBuy = hasTokenAccount === false;
  // Exact minimum lamports required: total + gas + rent (fee already included in total)
  const minRequiredLamports =
    totalLamports + GAS_RESERVE_LAMPORTS + (isFirstBuy ? TOKEN_ACCOUNT_RENT_LAMPORTS : 0);
  const belowMinimum =
    balanceLamports != null && minRequiredLamports > balanceLamports;
  // Simple headline check: brand-new token + very small wallet.
  const firstBuyTooLow =
    isFirstBuy && balanceSol != null && balanceSol < FIRST_BUY_MIN_SOL;

  useEffect(() => {
    if (isFirstBuy) setDetailsOpen(true);
  }, [isFirstBuy]);

  // ── Fetch decimals + balance on open ────────────────────────
  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    (async () => {
      try {
        const bal = await connection.getBalance(publicKey);
        if (cancelled) return;
        setBalanceLamports(bal);
      } catch {
        /* ignore */
      }
      try {
        const dec = await getMintDecimals(connection, token.mintAddress);
        if (cancelled) return;
        setDecimals(dec);
      } catch {
        if (cancelled) return;
        setDecimals(null);
      }
      // Detect whether the user already holds this token (first buy needs
      // ~0.002 SOL extra for token account rent).
      try {
        const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          mint: new PublicKey(token.mintAddress),
        });
        if (cancelled) return;
        setHasTokenAccount(accounts.value.length > 0);
      } catch {
        if (cancelled) return;
        setHasTokenAccount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey, connection, token.mintAddress]);

  // ── Live quote (debounced) ──────────────────────────────────
  useEffect(() => {
    if (!publicKey || swapping) return;
    if (tooSmall) {
      setQuote(null);
      setQuoteState('idle');
      setQuoteError(null);
      return;
    }

    setQuoteState('loading');
    setQuoteError(null);
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const q = await getQuote({
          inputMint: SOL_MINT,
          outputMint: token.mintAddress,
          amount: swapLamports,
          userPublicKey: publicKey.toBase58(),
          slippageBps: slippage === 'auto' ? undefined : slippage,
        });
        if (cancelled || !aliveRef.current) return;
        setQuote(q);
        setQuoteState('ready');
      } catch (e) {
        if (cancelled || !aliveRef.current) return;
        setQuote(null);
        setQuoteError(humanizeSwapError(e));
        setQuoteState('error');
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountSol, slippage, publicKey, token.mintAddress, swapping]);

  // ── Execute swap ─────────────────────────────────────────────
  const handleBuy = useCallback(async () => {
    if (!publicKey || !signTransaction || !quote) return;
    setSwapError(null);
    setSwapState('signing');
    try {
      const res = await executeSwap({
        quote,
        signTransaction: signTransaction as (
          tx: import('@solana/web3.js').VersionedTransaction,
        ) => Promise<import('@solana/web3.js').VersionedTransaction>,
        connection,
      });
      if (!aliveRef.current) return;
      setResult(res);
      if (res.status === 'Success') {
        setSwapState('done');
        // CP reward + success ding fire HERE — only on confirmed success.
        onSwapComplete?.(token);
      } else {
        setSwapError(res.error || 'Swap failed on-chain.');
        setSwapState('error');
      }
    } catch (e) {
      if (!aliveRef.current) return;
      if (e instanceof JupiterError && e.isWalletRejection) {
        // back to ready so they can retry
        setSwapState('idle');
        return;
      }
      setSwapError(humanizeSwapError(e));
      setSwapState('error');
    }
  }, [publicKey, signTransaction, quote, connection, token, onSwapComplete]);

  // Show the landing state immediately after the wallet approves, so the
  // user sees feedback even if /execute is slow.
  useEffect(() => {
    if (swapState === 'signing') {
      const t = setTimeout(() => {
        setSwapState((s) => (s === 'signing' ? 'executing' : s));
      }, 30_000);
      return () => clearTimeout(t);
    }
  }, [swapState]);

  const handleMax = useCallback(() => {
    if (balanceLamports == null) return;
    // Fee is included in total (taken FROM amount), so MAX is total spendable = balance - gas - rent
    const rentReserve = isFirstBuy ? TOKEN_ACCOUNT_RENT_LAMPORTS : 0;
    const maxLamports = Math.floor(
      Math.max(0, balanceLamports - GAS_RESERVE_LAMPORTS - rentReserve),
    );
    setAmountSol(String(parseFloat(lamportsToSol(maxLamports).toFixed(4))));
  }, [balanceLamports, isFirstBuy]);

  const setPreset = useCallback((v: number) => setAmountSol(String(v)), []);

  const buyDisabled =
    !publicKey ||
    !signTransaction ||
    swapping ||
    quoteState !== 'ready' ||
    tooSmall ||
    insufficient ||
    belowMinimum;

  const solscanUrl = result ? `https://solscan.io/tx/${result.signature}` : '';

  const feeSol = lamportsToSol(feeLamports);
  const priceImpactPct = quote?.priceImpactPct;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => !swapping && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Buy ${token.symbol}`}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[#263A4F] bg-[#0E1622] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#141414]">
              {token.logoUrl ? (
                <img src={token.logoUrl} alt={token.symbol} className="h-8 w-8 object-contain" />
              ) : (
                <span className="text-lg font-black text-white/30">{token.symbol[0]}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-extrabold tracking-[-0.01em]">Buy {token.symbol}</div>
              <div className="truncate text-xs font-medium text-white/35">{token.name}</div>
            </div>
          </div>
          {!swapping && (
            <button
              onClick={onClose}
              aria-label="Close buy modal"
              className="flex h-11 w-11 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Success view */}
        {swapState === 'done' && result ? (
          <div className="py-4 text-center">
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/[0.08]"
            >
              <Check className="h-8 w-8 text-emerald-400" aria-hidden="true" />
            </motion.div>
            <div className="mb-1 text-lg font-extrabold">Swap complete</div>
            <p className="mb-1 text-sm text-white/55">
              You bought{' '}
              <span className="font-bold text-white">
                {decimals != null
                  ? formatTokenAmount(result.totalOutputAmount, decimals)
                  : result.totalOutputAmount}{' '}
                {token.symbol}
              </span>
            </p>
            <p className="mb-5 text-[11px] text-white/35">Paid {lamportsToSol(Number(result.totalInputAmount))} SOL</p>
            <a
              href={solscanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-2xl border border-white/[0.08] text-sm font-bold text-white/70 transition-colors hover:border-white/[0.15] hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> View on Solscan
            </a>
            <button
              onClick={() => onConfirm(token)}
              className="min-h-[48px] w-full rounded-2xl bg-[#18BFFF] text-sm font-extrabold text-[#041018] transition-colors hover:bg-[#52D6FF]"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Rent explainer (only the one-time real cost — fee is folded into the total, not surfaced as an alarm) */}
            {isFirstBuy ? (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                <span className="text-[11px] leading-relaxed text-white/65">
                  First buy of <span className="font-bold text-white">{token.symbol}</span> includes a one-time <span className="font-bold text-white">~0.002 SOL</span> token account rent — total shown below.
                </span>
              </div>
            ) : null}

            {/* You pay */}
            <div className="mb-4">
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/40">
                You pay
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.001}
                  step={0.01}
                  value={amountSol}
                  onChange={(e) => setAmountSol(e.target.value)}
                  disabled={swapping}
                  className="min-w-0 flex-1 bg-transparent text-lg font-extrabold text-white outline-none placeholder:text-white/30"
                  placeholder="0.1"
                />
                <span className="shrink-0 rounded-lg bg-white/[0.06] px-2.5 py-1 text-xs font-bold text-white/70">
                  SOL
                </span>
                <button
                  onClick={handleMax}
                  disabled={swapping || balanceLamports == null}
                  className="shrink-0 rounded-lg border border-white/[0.08] bg-transparent px-2.5 py-1 text-xs font-bold text-white/40 transition-colors hover:border-white/[0.15] hover:text-white/60 disabled:opacity-40"
                >
                  Max
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex gap-1.5">
                  {PRESETS.map((v) => {
                    const active = parseFloat(amountSol) === v;
                    return (
                      <button
                        key={v}
                        onClick={() => setPreset(v)}
                        disabled={swapping}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-40 ${
                          active
                            ? 'bg-[#18BFFF] text-[#041018]'
                            : 'bg-white/[0.05] text-white/55 hover:bg-white/[0.09]'
                        }`}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[11px] font-medium text-white/35 tabular-nums">
                  {balanceSol != null ? `Bal ${balanceSol.toFixed(3)}◎` : '—'}
                </span>
              </div>
              {insufficient && !tooSmall && (
                <p className="mt-1.5 text-[11px] font-semibold text-[#E0827A]">
                  Insufficient SOL for this amount.
                </p>
              )}
              {firstBuyTooLow && !insufficient && (
                <p className="mt-1.5 text-[11px] font-semibold text-[#E0827A]">
                  For your first buy of this token you need at least {FIRST_BUY_MIN_SOL} SOL
                  to cover the swap, fee, gas and token account creation.
                </p>
              )}
            </div>

            {/* High-risk warning (never buried behind the flip) */}
            {token.riskScore > 6 && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#E0827A]/20 bg-[#E0827A]/[0.04] px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E0827A]" aria-hidden="true" />
                <span className="text-[11px] leading-relaxed text-white/60">
                  High risk token ({token.riskScore.toFixed(1)}/10). Price movements can be
                  extreme. Memecoins can lose value quickly.
                </span>
              </div>
            )}

            {/* You receive (quote) */}
            <div className="mb-4 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/40">
                  You receive (est.)
                </span>
                <span className="text-[10px] font-bold text-white/30">{formatPrice(token.priceUsd)}/token</span>
              </div>

              <div className="flex min-h-[28px] items-baseline gap-1.5">
                {quoteState === 'loading' || quoteState === 'idle' ? (
                  <span className="text-sm font-medium text-white/40">
                    {quoteState === 'loading' ? 'Finding best route…' : 'Enter an amount'}
                  </span>
                ) : quote && decimals != null ? (
                  <>
                    <span className="text-lg font-extrabold">
                      ≈ {formatTokenAmount(quote.outAmount, decimals)}
                    </span>
                    <span className="text-sm font-bold text-white/55">{token.symbol}</span>
                  </>
                ) : quote && decimals == null ? (
                  <span className="text-sm font-medium text-white/40">Quoting…</span>
                ) : (
                  <span className="text-sm font-semibold text-[#E0827A]">{quoteError}</span>
                )}
              </div>

              {quote && (
                <div className="mt-2 space-y-1 text-[11px] text-white/45">
                  <div className="flex items-center justify-between">
                    <span>Min received</span>
                    <span className="tabular-nums text-white/65">
                      {decimals != null
                        ? `${formatTokenAmount(quote.otherAmountThreshold, decimals)} ${token.symbol}`
                        : '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Total you pay (dominant) */}
            {quote && (
              <div className="mb-4 rounded-2xl border border-white/[0.1] bg-white/[0.03] p-4 text-center">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/40">
                  Total you pay
                </div>
                <div className="mt-1 text-3xl font-black tracking-[-0.02em] text-white tabular-nums">
                  {lamportsToSol(minRequiredLamports).toFixed(4)} SOL
                </div>
                <div className="mt-1 text-[11px] font-medium text-white/35">
                  {isFirstBuy
                    ? 'Includes one-time token account rent and gas'
                    : 'Includes network gas'}
                </div>
              </div>
            )}

            {/* Details (collapsed by default) */}
            <div className="mb-5">
              <button
                onClick={() => setDetailsOpen((v) => !v)}
                aria-expanded={detailsOpen}
                className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-transparent px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white/40 transition-colors hover:border-white/[0.12] hover:text-white/60"
              >
                <span>Advanced</span>
                <span className="text-xs">{detailsOpen ? '−' : '+'}</span>
              </button>

              <AnimatePresence initial={false}>
                {detailsOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-white/45">
                      <div className="flex items-center justify-between">
                        <span>Swap amount</span>
                        <span className="tabular-nums text-white/65">{amountNum} SOL</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/35">
                          Includes 1% platform fee
                        </span>
                        <span className="tabular-nums text-white/35">
                          {feeSol.toFixed(5)} SOL
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Network gas</span>
                        <span className="tabular-nums text-white/40">~0.00002 SOL</span>
                      </div>
                      {isFirstBuy && (
                        <div className="flex items-center justify-between">
                          <span>Token account (one-time)</span>
                          <span className="tabular-nums text-white/40">~0.002 SOL</span>
                        </div>
                      )}
                      {priceImpactPct != null && (
                        <div className="flex items-center justify-between">
                          <span>Price impact</span>
                          <span
                            className={`tabular-nums ${
                              priceImpactPct > 2 ? 'text-[#E0827A]' : 'text-white/65'
                            }`}
                          >
                            {priceImpactPct.toFixed(2)}%
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between border-t border-white/[0.06] pt-1.5">
                        <span className="font-bold text-white/60">Total required</span>
                        <span className="font-bold tabular-nums text-white">
                          {lamportsToSol(minRequiredLamports).toFixed(4)} SOL
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Slippage</span>
                        <div className="flex gap-1">
                          {SLIPPAGE_OPTIONS.map((opt) => {
                            const active = slippage === opt.value;
                            return (
                              <button
                                key={opt.label}
                                onClick={() => setSlippage(opt.value)}
                                disabled={swapping}
                                className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition-colors disabled:opacity-40 ${
                                  active
                                    ? 'bg-white/[0.12] text-white'
                                    : 'bg-white/[0.04] text-white/45 hover:bg-white/[0.08]'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Buy button */}
            <button
              onClick={handleBuy}
              disabled={buyDisabled}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#18BFFF] text-[15px] font-extrabold text-[#041018] transition-all hover:bg-[#52D6FF] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {swapState === 'signing' && 'Approve in wallet…'}
              {swapState === 'executing' && 'Processing swap…'}
              {swapState === 'error' && 'Retry'}
              {swapState === 'idle' &&
                (insufficient
                  ? 'Insufficient SOL'
                  : belowMinimum
                    ? `Need ${lamportsToSol(minRequiredLamports).toFixed(4)} SOL`
                    : quoteState === 'error'
                      ? 'No route — try another amount'
                      : `Confirm Swap`)}
            </button>

            {swapState === 'error' && swapError && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#E0827A]/20 bg-[#E0827A]/[0.04] px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E0827A]" aria-hidden="true" />
                <span className="text-[11px] leading-relaxed text-white/65">{swapError}</span>
              </div>
            )}

            {(swapState === 'signing' || swapState === 'executing') && (
              <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-white/40">
                <div className="h-3 w-3 rounded-full border-2 border-white/[0.08] border-t-[#18BFFF] animate-spin" />
                {swapState === 'signing' ? 'Waiting for wallet approval…' : 'Processing swap…'}
              </div>
            )}

            <p className="mt-3.5 text-center text-[10px] text-white/30">
              1% fee · Powered by Jupiter · 1 signature
            </p>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
