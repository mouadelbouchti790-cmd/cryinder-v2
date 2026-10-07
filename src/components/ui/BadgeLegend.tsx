import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Lock,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface LegendItem {
  icon: LucideIcon;
  label: string;
  meaning: string;
  tone: 'good' | 'neutral' | 'warning' | 'danger';
}

const LEGEND_ITEMS: LegendItem[] = [
  {
    icon: Lock,
    label: 'Liquidity Locked',
    meaning: 'Liquidity is locked — good sign of safety.',
    tone: 'good',
  },
  {
    icon: ShieldCheck,
    label: 'Verified',
    meaning: 'Verified data confirmed — good.',
    tone: 'good',
  },
  {
    icon: CheckCircle,
    label: 'High Liquidity',
    meaning: 'Good signal — plenty of liquidity.',
    tone: 'good',
  },
  {
    icon: AlertTriangle,
    label: 'Medium Liquidity',
    meaning: 'Caution — moderate liquidity.',
    tone: 'warning',
  },
  {
    icon: XCircle,
    label: 'Low Liquidity',
    meaning: 'Warning — low liquidity.',
    tone: 'danger',
  },
  {
    icon: AlertCircle,
    label: 'Unverified',
    meaning: 'No data available — neutral, not a failure.',
    tone: 'neutral',
  },
];

const TONE_STYLES: Record<LegendItem['tone'], string> = {
  good: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400',
  neutral: 'border-yellow-400/20 bg-yellow-400/10 text-yellow-400',
  warning: 'border-amber-400/20 bg-amber-400/10 text-amber-400',
  danger: 'border-red-400/20 bg-red-400/10 text-red-400',
};

/** Legend grid embedded inside the FAQ accordion panel. */
export default function BadgeLegendItems() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Token data badge legend">
      {LEGEND_ITEMS.map(({ icon: Icon, label, meaning, tone }) => (
        <li
          key={label}
          className="flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-white/[0.015] p-3"
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${TONE_STYLES[tone]}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-extrabold text-white/85">{label}</div>
            <div className="text-[11px] leading-snug text-white/45">{meaning}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
