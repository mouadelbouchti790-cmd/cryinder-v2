import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Crown,
  Coins,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import type { PortfolioMetrics } from '../types/token';
import { formatPrice, formatChange } from '../utils/formatters';
import TokenLogo from './ui/TokenLogo';

interface PortfolioInsightsProps {
  metrics: PortfolioMetrics;
  cpBalance: number;
}

interface InsightCard {
  id: string;
  label: string;
  symbol: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: 'up' | 'down' | 'accent' | 'cp';
  logoUrl?: string;
}

export default function PortfolioInsights({ metrics, cpBalance }: PortfolioInsightsProps) {
  const { biggestGainer, biggestLoser, mostValuable } = metrics;

  const cards: InsightCard[] = [
    {
      id: 'gainer',
      label: 'Biggest Gainer',
      symbol: biggestGainer?.symbol ?? '-',
      value: biggestGainer ? formatChange(biggestGainer.priceChange24h) : '-',
      detail: biggestGainer && biggestGainer.valueUsd > 0 ? `${formatPrice(biggestGainer.valueUsd)} held` : 'No movers',
      icon: <ArrowUpRight className="h-4 w-4" aria-hidden="true" />,
      tone: 'up',
      logoUrl: biggestGainer?.logoUrl,
    },
    {
      id: 'loser',
      label: 'Biggest Loser',
      symbol: biggestLoser?.symbol ?? '-',
      value: biggestLoser ? formatChange(biggestLoser.priceChange24h) : '-',
      detail: biggestLoser && biggestLoser.valueUsd > 0 ? `${formatPrice(biggestLoser.valueUsd)} held` : 'No movers',
      icon: <ArrowDownRight className="h-4 w-4" aria-hidden="true" />,
      tone: 'down',
      logoUrl: biggestLoser?.logoUrl,
    },
    {
      id: 'valuable',
      label: 'Most Valuable',
      symbol: mostValuable?.symbol ?? '-',
      value: mostValuable ? formatPrice(mostValuable.valueUsd) : '-',
      detail: mostValuable && mostValuable.priceUsd > 0 ? `${formatPrice(mostValuable.priceUsd)} per token` : 'No holdings',
      icon: <Crown className="h-4 w-4" aria-hidden="true" />,
      tone: 'accent',
      logoUrl: mostValuable?.logoUrl,
    },
    {
      id: 'cp',
      label: 'CP Balance',
      symbol: 'Your balance',
      value: `${cpBalance.toLocaleString()} CP`,
      detail: 'Earned from swiping',
      icon: <Coins className="h-4 w-4" aria-hidden="true" />,
      tone: 'cp',
    },
  ];

  const toneClasses: Record<InsightCard['tone'], { icon: string; value: string; detail: string }> = {
    up: {
      icon: 'border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-400',
      value: 'text-emerald-400',
      detail: 'text-white/30',
    },
    down: {
      icon: 'border-[#E0827A]/15 bg-[#E0827A]/[0.06] text-[#E0827A]',
      value: 'text-[#E0827A]',
      detail: 'text-white/30',
    },
    accent: {
      icon: 'border-white/[0.08] bg-white/[0.04] text-white/60',
      value: 'text-white',
      detail: 'text-white/30',
    },
    cp: {
      icon: 'border-amber-400/15 bg-amber-400/[0.06] text-amber-400',
      value: 'text-amber-400/90',
      detail: 'text-white/30',
    },
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      aria-label="Portfolio insights"
    >
      <h3 className="mb-3 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/45">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
        Portfolio Insights
      </h3>

      <div className="grid grid-cols-2 gap-2">
        {cards.map((card, i) => {
          const tone = toneClasses[card.tone];
          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.06 }}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/45">
                  {card.label}
                </span>
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border ${tone.icon}`}
                >
                  {card.icon}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                {card.logoUrl ? (
                  <TokenLogo src={card.logoUrl} alt={card.symbol} size="sm" />
                ) : null}
                <div className="min-w-0">
                  <div className={`truncate text-base font-extrabold tabular-nums leading-tight ${tone.value}`}>
                    {card.value}
                  </div>
                  <div className={`truncate text-[11px] font-semibold ${tone.detail}`}>
                    {card.symbol !== 'Your balance' && card.symbol !== '-' ? card.symbol : ''}
                    {card.symbol !== 'Your balance' && card.symbol !== '-' ? ', ' : ''}
                    {card.detail}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
