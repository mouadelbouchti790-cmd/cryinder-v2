import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Lock,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TokenData } from '../../types/token';

/**
 * Small status pill for on-card metrics. Every state renders as an
 * intentional badge (icon + label), never as a bare "Unknown" string.
 *
 * When `tooltip` is set, hovering (or keyboard focus) reveals a subtle
 * explanation bubble. The bubble is rendered through a portal with
 * fixed positioning so the card's overflow-hidden flip faces can never
 * clip it; it flips below the badge when near the top of the viewport.
 */
export type VerificationBadgeVariant =
  | 'locked'
  | 'verified'
  | 'unverified'
  | 'caution'
  | 'good'
  | 'warning';

export interface VerificationBadgeProps {
  variant: VerificationBadgeVariant;
  label: ReactNode;
  /** Optional explanation shown in the hover tooltip. */
  tooltip?: string;
  className?: string;
}

const VARIANT_STYLES: Record<
  VerificationBadgeVariant,
  { icon: LucideIcon; className: string }
> = {
  locked: {
    icon: Lock,
    className: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400/40',
  },
  verified: {
    icon: ShieldCheck,
    className: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400/40',
  },
  unverified: {
    icon: AlertCircle,
    className: 'border-yellow-400/20 bg-yellow-400/10 text-yellow-400/40',
  },
  caution: {
    icon: AlertTriangle,
    className: 'border-amber-400/20 bg-amber-400/10 text-amber-400/40',
  },
  good: {
    icon: CheckCircle,
    className: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400/40',
  },
  warning: {
    icon: XCircle,
    className: 'border-red-400/20 bg-red-400/10 text-red-400/40',
  },
};

interface TipState {
  top: number;
  left: number;
  flip: boolean;
}

export default function VerificationBadge({
  variant,
  label,
  tooltip,
  className = '',
}: VerificationBadgeProps) {
  const { icon: Icon, className: toneClassName } = VARIANT_STYLES[variant];
  const badgeRef = useRef<HTMLSpanElement>(null);
  const [tip, setTip] = useState<TipState | null>(null);

  const showTip = () => {
    const el = badgeRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Flip below when there isn't enough room above (e.g. metrics near
    // the top of the card / viewport).
    const flip = rect.top < 96;
    setTip({
      top: flip ? rect.bottom + 8 : rect.top - 8,
      left: rect.left + rect.width / 2,
      flip,
    });
  };

  const hideTip = () => setTip(null);

  return (
    <>
      <span
        ref={badgeRef}
        className={`inline-flex ${className}`}
        onMouseEnter={tooltip ? showTip : undefined}
        onMouseLeave={tooltip ? hideTip : undefined}
        onFocus={tooltip ? showTip : undefined}
        onBlur={tooltip ? hideTip : undefined}
        tabIndex={tooltip ? 0 : undefined}
        aria-label={tooltip ?? undefined}
      >
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-extrabold leading-none tracking-wide ${toneClassName} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      </span>

      {tooltip &&
        tip &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[9999] w-max max-w-[220px] rounded-lg border border-white/[0.06] bg-[#050505] px-2.5 py-1.5 text-center text-[10px] font-medium leading-snug text-white/60 shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
            style={{
              top: tip.top,
              left: tip.left,
              transform: tip.flip
                ? 'translate(-50%, 0)'
                : 'translate(-50%, -100%)',
            }}
          >
            {tooltip}
          </div>,
          document.body,
        )}
    </>
  );
}

/* ── Domain helpers ────────────────────────────────────────────────
   Turn raw TokenData metrics into honest badges. Missing data renders
   as "Unverified" (neutral) — never fabricated and never "Unknown".   */

const NO_DATA_TOOLTIP = 'No liquidity/audit data available for this token';

/** Liquidity tiers. "High" uses the CheckCircle (good) treatment,
 *  "Medium" the AlertTriangle caution, "Low" the XCircle warning. */
const LIQUIDITY_TIER_LOW_USD = 10_000;
const LIQUIDITY_TIER_MEDIUM_USD = 100_000;

export type LiquidityTier = 'high' | 'medium' | 'low' | 'none';

export function liquidityTierOf(liquidityUsd: number): LiquidityTier {
  if (!Number.isFinite(liquidityUsd) || liquidityUsd <= 0) return 'none';
  if (liquidityUsd >= LIQUIDITY_TIER_MEDIUM_USD) return 'high';
  if (liquidityUsd >= LIQUIDITY_TIER_LOW_USD) return 'medium';
  return 'low';
}

export function liquidityBadge(token: TokenData): ReactNode {
  if (token.liquidityLockedPct != null) {
    return (
      <VerificationBadge
        variant="locked"
        label={`${token.liquidityLockedPct?.toFixed(0) ?? '?'}% Locked`}
        tooltip="Liquidity is locked (good)."
      />
    );
  }

  switch (liquidityTierOf(token.liquidityUsd)) {
    case 'high':
      return (
        <VerificationBadge
          variant="good"
          label="High Liq"
          tooltip="High liquidity — good signal."
        />
      );
    case 'medium':
      return (
        <VerificationBadge
          variant="caution"
          label="Med Liq"
          tooltip="Medium liquidity — caution."
        />
      );
    case 'low':
      return (
        <VerificationBadge
          variant="warning"
          label="Low Liq"
          tooltip="Low liquidity — warning."
        />
      );
    default:
      return (
        <VerificationBadge
          variant="unverified"
          label="Unverified"
          tooltip={NO_DATA_TOOLTIP}
        />
      );
  }
}

export function auditBadge(token: TokenData): ReactNode {
  const status = token.auditStatus;
  const audited =
    status !== 'Unverified' && /✓|verified|audited/i.test(status);
  if (audited) {
    return (
      <VerificationBadge
        variant="verified"
        label={status}
        tooltip="Verified data confirmed (good)."
      />
    );
  }
  return (
    <VerificationBadge
      variant="unverified"
      label="Unverified"
      tooltip={NO_DATA_TOOLTIP}
    />
  );
}
