import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  ArrowDownRight,
  Send,
  TrendingDown,
} from 'lucide-react';
import type { PortfolioHolding } from '../types/token';
import { formatPrice, formatChange, formatBalance } from '../utils/formatters';
import TokenLogo from './ui/TokenLogo';

const UP = '#22C55E';
const DOWN = '#E05263';

interface PortfolioTokenCardProps {
  holding: PortfolioHolding;
  index: number;
  hidden: boolean;
  onOpen: (holding: PortfolioHolding) => void;
  onSell: (holding: PortfolioHolding) => void;
  onSend: (holding: PortfolioHolding) => void;
}

export default function PortfolioTokenCard({
  holding,
  index,
  hidden,
  onOpen,
  onSell,
  onSend,
}: PortfolioTokenCardProps) {
  const isPositive = holding.priceChange24h >= 0;
  const isFlat = holding.priceChange24h === 0;
  const moveColor = isFlat ? 'rgba(255,255,255,0.25)' : isPositive ? UP : DOWN;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4), type: 'spring', stiffness: 320, damping: 28 }}
      className="group rounded-2xl border border-[#1B2A3A] bg-[#0E1622] p-4 transition-colors hover:border-[#35536D]"
    >
      {/* Clickable main row */}
      <button
        type="button"
        onClick={() => onOpen(holding)}
        className="flex w-full items-center gap-3 text-left"
        aria-label={`Open ${holding.name} details`}
      >
        <TokenLogo src={holding.logoUrl} alt={holding.symbol} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-extrabold tracking-[-0.01em] text-white">
              {holding.name}
            </span>
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-white/30">
              {holding.symbol}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[12px] font-semibold tabular-nums text-white/35">
            <span>{hidden ? '•••' : formatBalance(holding.balance)}</span>
            <span className="text-white/20">·</span>
            <span>{hidden ? '••••••' : formatPrice(holding.priceUsd)}</span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[15px] font-extrabold tabular-nums tracking-[-0.01em] text-white">
            {hidden ? '••••••' : formatPrice(holding.valueUsd)}
          </div>
          {/* green up / red down */}
          <div
            className="mt-0.5 flex items-center justify-end gap-1 text-[12px] font-bold tabular-nums"
            style={{ color: moveColor }}
          >
            {!isFlat &&
              (isPositive ? (
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
              ))}
            {hidden ? '•••' : isFlat ? '-' : formatChange(holding.priceChange24h)}
          </div>
        </div>
      </button>

      {/* Quick actions — Swap (sell) + Send */}
      <div className="mt-3 flex items-center gap-2 border-t border-[#1B2A3A] pt-3">
        <button
          type="button"
          onClick={() => onSell(holding)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#E05263]/25 bg-[#162333] py-2.5 text-[11px] font-extrabold text-[#E05263] transition-colors hover:bg-[#1B2A3A]"
        >
          <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
          Swap
        </button>
        <button
          type="button"
          onClick={() => onSend(holding)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#263A4F] bg-[#162333] py-2.5 text-[11px] font-bold text-white/60 transition-colors hover:border-[#35536D] hover:text-white/85"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          Send
        </button>
      </div>
    </motion.div>
  );
}
