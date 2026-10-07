import { motion } from 'framer-motion';
import { riskLabel } from '../../utils/crypto';

interface RiskScoreBarProps {
  score: number;
}

const COLORS = {
  low: '#E2E8F0',
  medium: '#94A3B8',
  high: '#E0827A',
};

function riskColor(score: number): string {
  if (score <= 3.3) return COLORS.low;
  if (score <= 6.6) return COLORS.medium;
  return COLORS.high;
}

export default function RiskScoreBar({ score }: RiskScoreBarProps) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  const color = riskColor(score);
  const label = riskLabel(score);

  return (
    <div className="w-full">
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9px] font-semibold uppercase tracking-wider">
        <span className="text-white/20">Risk</span>
        <span style={{ color }}>{score.toFixed(1)}/10, {label}</span>
      </div>
    </div>
  );
}
