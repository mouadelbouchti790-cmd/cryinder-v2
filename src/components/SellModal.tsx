import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { X, Check, AlertTriangle, ExternalLink, ArrowDown, Wallet } from 'lucide-react';
import type { PortfolioHolding } from '../types/token';
import { formatPrice, formatBalance } from '../utils/formatters';
import {
  getQuote,
  executeSwap,
  SOL_MINT,
  humanizeSwapError,
  JupiterError,
  type SwapQuote,
  type SwapResult,
} from '../services/jupiter';

interface SellModalProps {
  holding: PortfolioHolding;
  onClose: () => void;
  onSuccess?: () => void;
}

const PERCENTS = [25, 50, 75, 100];

type QuoteState = 'idle' | 'loading' | 'ready' | 'error';
type SwapState = 'idle' | 'signing' | 'executing' | 'done' | 'error';

function formatSol(lamports: number): string {
  return (lamports / 1e9).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export default function SellModal({ holding, onClose, onSuccess }: SellModalProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [percent, setPercent] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState<'auto' | number>('auto');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteState, setQuoteState] = useState<QuoteState>('idle');
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [swapState, setSwapState] = useState<SwapState>('idle');
  const [swapError, setSwapError] = useState<string | null>(null);
  const [result, setResult] = useState<SwapResult | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && swapState !== 'signing' && swapState !== 'executing') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, swapState]);

  const swapping = swapState === 'signing' || swapState === 'executing';
  const amountNum = parseFloat(amount) || 0;
  const isValidAmount = amountNum > 0 && amountNum <= holding.balance;
  const tooSmall = amountNum > 0 && amountNum < 0.000001;

  const handlePercent = useCallback((p: number) => {
    setPercent(p);
    const val = (holding.balance * p) / 100;
    // Keep up to 6 decimals for token amounts
    const formatted = val.toFixed(Math.min(6, holding.decimals));
    // Trim trailing zeros
    setAmount(parseFloat(formatted).toString());
  }, [holding.balance, holding.decimals]);

  const handleAmountChange = (v: string) => {
    setAmount(v);
    setPercent(null);
  };

  // Fetch quote when amount changes
  useEffect(() => {
    if (!publicKey || swapping) return;
    if (!isValidAmount || tooSmall) {
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
        const decimals = holding.decimals;
        const amountSmallest = Math.floor(amountNum * Math.pow(10, decimals));
        const q = await getQuote({
          inputMint: holding.mint,
          outputMint: SOL_MINT,
          amount: amountSmallest,
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
  }, [amount, amountNum, isValidAmount, tooSmall, publicKey, holding.mint, holding.decimals, slippage, swapping]);

  const handleSell = useCallback(async () => {
    if (!publicKey || !signTransaction || !quote) return;
    setSwapError(null);
    setSwapState('signing');
    try {
      const res = await executeSwap({
        quote,
        signTransaction: signTransaction as (tx: import('@solana/web3.js').VersionedTransaction) => Promise<import('@solana/web3.js').VersionedTransaction>,
        connection,
      });
      if (!aliveRef.current) return;
      setResult(res);
      if (res.status === 'Success') {
        setSwapState('done');
        onSuccess?.();
      } else {
        setSwapError(res.error || 'Swap failed on-chain.');
        setSwapState('error');
      }
    } catch (e) {
      if (!aliveRef.current) return;
      if (e instanceof JupiterError && e.isWalletRejection) {
        setSwapState('idle');
        return;
      }
      setSwapError(humanizeSwapError(e));
      setSwapState('error');
    }
  }, [publicKey, signTransaction, quote, connection, onSuccess]);

  const sellDisabled = !publicKey || !signTransaction || swapping || quoteState !== 'ready' || !isValidAmount || tooSmall;
  const solscanUrl = result ? `https://solscan.io/tx/${result.signature}` : '';
  const totalValue = holding.balance * holding.priceUsd;
  const selectedValue = amountNum * holding.priceUsd;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => !swapping && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Sell ${holding.symbol}`}
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
              {holding.logoUrl ? (
                <img src={holding.logoUrl} alt={holding.symbol} className="h-8 w-8 object-contain" />
              ) : (
                <span className="text-lg font-black text-white/30">{holding.symbol[0]}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-extrabold tracking-[-0.01em]">Sell {holding.symbol}</div>
              <div className="truncate text-xs font-medium text-white/35">{holding.name}</div>
            </div>
          </div>
          {!swapping && (
            <button
              onClick={onClose}
              aria-label="Close sell modal"
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
            <div className="mb-1 text-lg font-extrabold">Sold {holding.symbol}</div>
            <p className="mb-1 text-sm text-white/55">
              Received <span className="font-bold text-white">{formatSol(parseInt(result.totalOutputAmount))} SOL</span>
            </p>
            <p className="mb-5 text-[11px] text-white/35">Sold {amount} {holding.symbol}</p>
            <a
              href={solscanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-2xl border border-white/[0.08] text-sm font-bold text-white/70 transition-colors hover:border-white/[0.15] hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> View on Solscan
            </a>
            <button
              onClick={onClose}
              className="min-h-[48px] w-full rounded-2xl bg-[#18BFFF] text-sm font-extrabold text-[#041018] transition-colors hover:bg-[#52D6FF]"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Token balance / price */}
            <div className="mb-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-white/40">Balance</span>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-white/40">
                  <Wallet className="h-3 w-3" aria-hidden="true" /> {formatBalance(holding.balance)} {holding.symbol}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-white/45">Price</span>
                <span className="text-xs font-bold text-white/70">{formatPrice(holding.priceUsd)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/45">Value</span>
                <span className="text-xs font-bold text-white/70">{formatPrice(totalValue)}</span>
              </div>
              {selectedValue > 0 && (
                <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2">
                  <span className="text-xs font-semibold text-white/60">Selling</span>
                  <span className="text-xs font-bold text-white">{formatPrice(selectedValue)} ({amount} {holding.symbol})</span>
                </div>
              )}
            </div>

            {/* Amount input */}
            <div className="mb-4">
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/40">
                Amount to sell
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={holding.balance}
                  step="any"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  disabled={swapping}
                  placeholder="0.0"
                  className="min-w-0 flex-1 bg-transparent text-lg font-extrabold text-white outline-none placeholder:text-white/30"
                />
                <span className="shrink-0 rounded-lg bg-white/[0.06] px-2.5 py-1 text-xs font-bold text-white/70">
                  {holding.symbol}
                </span>
                <button
                  onClick={() => handlePercent(100)}
                  disabled={swapping}
                  className="shrink-0 rounded-lg border border-[#263A4F] bg-[#162333] px-2.5 py-1 text-xs font-bold text-white/70 transition-colors hover:text-white disabled:opacity-40"
                >
                  Max
                </button>
              </div>
              <div className="mt-2 flex gap-1.5">
                {PERCENTS.map((p) => {
                  const active = percent === p;
                  return (
                    <button
                      key={p}
                      onClick={() => handlePercent(p)}
                      disabled={swapping}
                      className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold transition-colors disabled:opacity-40 ${
                        active ? 'bg-[#18BFFF] text-[#041018]' : 'bg-white/[0.05] text-white/55 hover:bg-white/[0.09]'
                      }`}
                    >
                      {p}%
                    </button>
                  );
                })}
              </div>
              {!isValidAmount && amountNum > holding.balance && (
                <p className="mt-1.5 text-[11px] font-semibold text-[#E0827A]">Amount exceeds balance.</p>
              )}
            </div>

            {/* Quote preview */}
            <div className="mb-4 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/40">
                  You receive (est.)
                </span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-white/30">
                  <ArrowDown className="h-3 w-3" aria-hidden="true" /> SOL
                </span>
              </div>
              <div className="flex min-h-[28px] items-baseline gap-1.5">
                {quoteState === 'loading' ? (
                  <span className="text-sm font-medium text-white/40">Finding best route…</span>
                ) : quote ? (
                  <>
                    <span className="text-lg font-extrabold">{formatSol(parseInt(quote.outAmount))}</span>
                    <span className="text-sm font-bold text-white/55">SOL</span>
                  </>
                ) : quoteState === 'error' ? (
                  <span className="text-sm font-semibold text-[#E0827A]">{quoteError}</span>
                ) : (
                  <span className="text-sm font-medium text-white/40">Enter an amount</span>
                )}
              </div>
              {quote && (
                <div className="mt-2 text-[11px] text-white/45">
                  Min received: {formatSol(parseInt(quote.otherAmountThreshold))} SOL
                  {quote.priceImpactPct != null && (
                    <span className={`ml-2 ${quote.priceImpactPct > 2 ? 'text-[#E0827A]' : 'text-white/45'}`}>
                      Impact {quote.priceImpactPct.toFixed(2)}%
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="mb-5">
              <button
                onClick={() => setDetailsOpen((v) => !v)}
                aria-expanded={detailsOpen}
                className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-transparent px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white/40 transition-colors hover:border-white/[0.12] hover:text-white/60"
              >
                <span>Details</span>
                <span className="text-xs">{detailsOpen ? '−' : '+'}</span>
              </button>
              <AnimatePresence initial={false}>
                {detailsOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-white/45">
                      <div className="flex items-center justify-between">
                        <span>Selling</span>
                        <span className="tabular-nums text-white/65">{amount || '0'} {holding.symbol}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Cryinder fee (1%)</span>
                        <span className="tabular-nums text-yellow-400">included in quote</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Slippage</span>
                        <div className="flex gap-1">
                          {(['auto', 100, 500, 1000] as const).map((opt) => {
                            const label = opt === 'auto' ? 'Auto' : opt === 100 ? '1%' : opt === 500 ? '5%' : '10%';
                            const active = slippage === opt;
                            return (
                              <button
                                key={label}
                                onClick={() => setSlippage(opt as any)}
                                disabled={swapping}
                                className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition-colors disabled:opacity-40 ${active ? 'bg-white/[0.12] text-white' : 'bg-white/[0.04] text-white/45 hover:bg-white/[0.08]'}`}
                              >
                                {label}
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

            <button
              onClick={handleSell}
              disabled={sellDisabled}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-[#E05263]/40 bg-[#162333] text-[15px] font-extrabold text-white transition-all hover:bg-[#1B2A3A] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {swapState === 'signing' && 'Approve in wallet…'}
              {swapState === 'executing' && 'Processing sell…'}
              {swapState === 'error' && 'Retry Sell'}
              {swapState === 'idle' && (!isValidAmount ? 'Enter amount' : quoteState === 'error' ? 'No route' : `Sell ${holding.symbol}`)}
            </button>

            {swapState === 'error' && swapError && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#E0827A]/20 bg-[#E0827A]/[0.04] px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E0827A]" aria-hidden="true" />
                <span className="text-[11px] leading-relaxed text-white/65">{swapError}</span>
              </div>
            )}

            {(swapState === 'signing' || swapState === 'executing') && (
              <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-white/40">
                <div className="h-3 w-3 rounded-full border-2 border-white/[0.08] border-t-white/60 animate-spin" />
                {swapState === 'signing' ? 'Waiting for wallet approval…' : 'Processing sell…'}
              </div>
            )}

            <p className="mt-3 text-center text-[10px] text-white/25">1% fee · Powered by Jupiter · 1 signature</p>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
