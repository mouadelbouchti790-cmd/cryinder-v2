import { useEffect, useState } from 'react';
import { motion, animate, useReducedMotion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Coins,
  Trophy,
  Sparkles,
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
} from 'lucide-react';
import type { PortfolioMetrics } from '../types/token';
import { formatPrice, formatChange } from '../utils/formatters';
import TokenLogo from './ui/TokenLogo';

const UP = '#22C55E';
const DOWN = '#E05263';

interface PortfolioHeaderProps {
  metrics: PortfolioMetrics;
  cpBalance: number;
  loading: boolean;
  hidden: boolean;
  onToggleHidden: () => void;
  onSend: () => void;
  onReceive: () => void;
  onSwap: () => void;
  hasHoldings: boolean;
}

/* ── Animated currency ──────────────────────────────────────────── */

function AnimatedCurrency({ value, masked }: { value: number; masked: boolean }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    const controls = animate(display, value, {
      duration: 0.8,
      ease: [0.25, 0.4, 0.25, 1],
      onUpdate: (latest) => setDisplay(latest),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduceMotion]);

  if (masked) return <span className="tracking-[0.1em]">••••••</span>;
  return <>{formatPrice(display)}</>;
}

/* ── Header skeleton ────────────────────────────────────────────── */

function PortfolioHeaderSkeleton() {
  return (
    <div
      className="rounded-2xl border border-[#1B2A3A] bg-[#0E1622] p-6"
      aria-busy="true"
      aria-label="Loading portfolio summary"
    >
      <div className="flex items-center justify-between">
        <div className="h-3 w-32 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-6 w-20 animate-pulse rounded-full bg-white/[0.06]" />
      </div>
      <div className="mt-4 h-11 w-52 animate-pulse rounded-lg bg-white/[0.08]" />
      <div className="mt-5 flex gap-2">
        <div className="h-12 flex-1 animate-pulse rounded-xl bg-white/[0.05]" />
        <div className="h-12 flex-1 animate-pulse rounded-xl bg-white/[0.05]" />
      </div>
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────────────── */

export default function PortfolioHeader({
  metrics,
  cpBalance,
  loading,
  hidden,
  onToggleHidden,
  onSend,
  onReceive,
  onSwap,
  hasHoldings,
}: PortfolioHeaderProps) {
  if (loading) return <PortfolioHeaderSkeleton />;

  const { totalValueUsd, change24hPct, topPerformer } = metrics;
  const isPositive = change24hPct >= 0;
  const moveColor = isPositive ? UP : DOWN;

  const actions = [
    { label: 'Receive', Icon: ArrowDownLeft, fn: onReceive, always: true },
    { label: 'Send', Icon: ArrowUpRight, fn: onSend, always: false },
    { label: 'Swap', Icon: ArrowLeftRight, fn: onSwap, always: false },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
      className="relative overflow-hidden rounded-2xl border border-[#1B2A3A] bg-[#0E1622] p-6"
    >
      {/* faint blue radial */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(24,191,255,0.07), transparent 60%)' }}
        aria-hidden="true"
      />

      <div className="relative z-10">
        {/* label + eye */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/35">
            Total Portfolio Value
          </span>
          <button
            onClick={onToggleHidden}
            title={hidden ? 'Show balances' : 'Hide balances'}
            aria-label={hidden ? 'Show balances' : 'Hide balances'}
            aria-pressed={hidden}
            className="rounded-lg border border-transparent p-1.5 text-white/30 transition-colors hover:border-[#263A4F] hover:bg-[#162333] hover:text-white/70"
          >
            {hidden ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        </div>

        {/* balance */}
        <div className="mt-2 text-[40px] font-black leading-none tracking-[-0.03em] tabular-nums text-white sm:text-[48px]">
          <AnimatedCurrency value={totalValueUsd} masked={hidden} />
        </div>

        {/* 24h move — green up / red down */}
        <div className="mt-3 flex items-center gap-2.5">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold tabular-nums"
            style={{ borderColor: `${moveColor}44`, background: `${moveColor}0F`, color: moveColor }}
          >
            {isPositive ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{hidden ? '••••••' : formatChange(change24hPct)}</span>
          </motion.div>
          <span className="font-mono text-[10px] tracking-[0.08em] text-white/25">PAST 24 HOURS</span>
        </div>

        {/* Send / Receive / Swap */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {actions.map(({ label, Icon, fn, always }) => {
            const disabled = !always && !hasHoldings;
            return (
              <button
                key={label}
                onClick={fn}
                disabled={disabled}
                className="group flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border border-[#263A4F] bg-[#162333] transition-all hover:border-[#35536D] hover:bg-[#1B2A3A] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon className="h-[18px] w-[18px] text-[#B9C7D3] transition-colors group-hover:text-[#18BFFF]" aria-hidden="true" />
                <span className="text-[11px] font-bold text-[#B9C7D3] group-hover:text-white">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {/* CP balance */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#18BFFF]/25 bg-[#18BFFF]/[0.07]">
              <Coins className="h-4 w-4 text-[#18BFFF]/80" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-extrabold tabular-nums leading-tight text-white">
                {hidden ? '••••••' : `${cpBalance.toLocaleString()} CP`}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
                Your balance
              </div>
            </div>
          </motion.div>

          {/* Top performer */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
          >
            {topPerformer ? (
              <>
                <div className="relative shrink-0">
                  <TokenLogo src={topPerformer.logoUrl} alt={topPerformer.symbol} size="sm" />
                  <span className="absolute -right-1 -top-1">
                    <Trophy className="h-3.5 w-3.5 text-[#18BFFF]/90" aria-hidden="true" />
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-extrabold leading-tight text-white">
                    {topPerformer.symbol}
                  </div>
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wider tabular-nums"
                    style={{ color: topPerformer.priceChange24h >= 0 ? UP : DOWN }}
                  >
                    {hidden ? '•••' : `Top · ${formatChange(topPerformer.priceChange24h)}`}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03]">
                  <Sparkles className="h-4 w-4 text-white/25" aria-hidden="true" />
                </div>
                <div className="text-xs font-semibold text-white/30">No top performer yet</div>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
