import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Coins,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import type { PortfolioHolding } from '../types/token';
import { formatPrice, formatChange, formatBalance, formatMarketCap } from '../utils/formatters';
import Sparkline from './ui/Sparkline';
import TokenLogo from './ui/TokenLogo';

interface TokenDetailModalProps {
  holding: PortfolioHolding | null;
  cpBalance: number;
  onClose: () => void;
}

const JUPITER_URL = 'https://jup.ag/swap/SOL';

export default function TokenDetailModal({ holding, cpBalance, onClose }: TokenDetailModalProps) {
  // Escape-to-close + scroll lock
  useEffect(() => {
    if (!holding) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [holding, onClose]);

  const isPositive = (holding?.priceChange24h ?? 0) >= 0;
  const dexScreenerUrl = holding ? `https://dexscreener.com/solana/${holding.mint}` : '#';
  const jupiterUrl = holding ? `${JUPITER_URL}-${holding.mint}` : JUPITER_URL;
  const sparkline = holding?.sparkline;
  const hasChart = Array.isArray(sparkline) && sparkline.length >= 2;

  return (
    <AnimatePresence>
      {holding && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={`${holding.name} details`}
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#263A4F] bg-[#0E1622] p-6 shadow-[0_32px_64px_rgba(0,0,0,0.6)]"
          >
            {/* ── Header ──────────────────────────────────────────── */}
            <div className="mb-6 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <TokenLogo src={holding.logoUrl} alt={holding.symbol} size="lg" />
                <div>
                  <h2 className="text-xl font-black leading-tight tracking-[-0.02em]">
                    {holding.name}
                  </h2>
                  <span className="text-[12px] font-bold uppercase tracking-[0.15em] text-white/35">
                    {holding.symbol}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close details"
                className="rounded-lg p-1.5 text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/65"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ── Price + change ──────────────────────────────────── */}
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[36px] font-black leading-none tracking-[-0.03em] tabular-nums">
                  {formatPrice(holding.priceUsd)}
                </div>
                <div
                  className={`mt-2 flex items-center gap-1.5 text-sm font-bold tabular-nums ${
                    isPositive ? 'text-emerald-400' : 'text-[#E0827A]'
                  }`}
                >
                  {isPositive ? (
                    <TrendingUp className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="h-4 w-4" aria-hidden="true" />
                  )}
                  {formatChange(holding.priceChange24h)}
                  <span className="font-semibold text-white/30">24h</span>
                </div>
              </div>
              {holding.marketCap !== undefined && holding.marketCap > 0 && (
                <div className="text-right">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/45">
                    Market Cap
                  </div>
                  <div className="mt-1 text-sm font-bold tabular-nums text-white/75">
                    {formatMarketCap(holding.marketCap)}
                  </div>
                </div>
              )}
            </div>

            {/* ── Mini chart ──────────────────────────────────────── */}
            <div className="mt-5 rounded-2xl border border-white/[0.05] bg-white/[0.015] p-4">
              {hasChart ? (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/45">
                      Price Trend
                    </span>
                    <span className="text-[11px] font-semibold text-white/40">24h</span>
                  </div>
                  <Sparkline
                    data={sparkline}
                    color={isPositive ? '#34d399' : '#E0827A'}
                    width={340}
                    height={96}
                  />
                </>
              ) : (
                <div className="flex h-[110px] items-center justify-center">
                  <span className="text-xs font-semibold text-white/25">
                    Chart data unavailable for this token
                  </span>
                </div>
              )}
            </div>

            {/* ── Balance + value + CP ────────────────────────────── */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/[0.05] bg-white/[0.015] px-3 py-3">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/40">
                  Balance
                </div>
                <div className="mt-1 truncate text-sm font-extrabold tabular-nums">
                  {formatBalance(holding.balance)}
                </div>
              </div>
              <div className="rounded-2xl border border-white/[0.05] bg-white/[0.015] px-3 py-3">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/40">
                  Value
                </div>
                <div className="mt-1 text-sm font-extrabold tabular-nums">
                  {formatPrice(holding.valueUsd)}
                </div>
              </div>
              <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] px-3 py-3">
                <div className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-amber-400/70">
                  <Coins className="h-3 w-3" aria-hidden="true" />
                  CP Balance
                </div>
                <div className="mt-1 text-sm font-extrabold tabular-nums text-amber-400/90">
                  {cpBalance.toLocaleString()}
                </div>
              </div>
            </div>

            {/* ── Actions ─────────────────────────────────────────── */}
            <div className="mt-5 flex flex-col gap-2">
              <a
                href={jupiterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-2xl bg-[#18BFFF] py-3.5 text-sm font-extrabold text-[#041018] transition-colors hover:bg-[#52D6FF]"
              >
                Buy / Sell
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <div className="flex gap-2">
                <a
                  href={dexScreenerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-white/[0.08] py-3 text-[13px] font-bold text-white/50 transition-colors hover:border-white/[0.15] hover:text-white/70"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  DexScreener
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-2xl border border-white/[0.08] py-3 text-[13px] font-bold text-white/50 transition-colors hover:border-white/[0.15] hover:text-white/70"
                >
                  Close
                </button>
              </div>
            </div>

            {/* ── Wallet note ─────────────────────────────────────── */}
            <p className="mt-4 text-center text-[11px] font-medium text-white/25">
              Swaps open in Jupiter. Always review the token mint before confirming.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
