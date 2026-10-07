import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { TokenData, PortfolioHolding, PortfolioMetrics } from '../../types/token';
import type { LootBoxHistoryEntry } from '../../services/pocketbase';
import { formatPrice, formatMarketCap, formatChange, formatAge } from '../../utils/formatters';
import { TERM, TERM_FONT_MONO } from './terminalTheme';
import TokenLogo from '../ui/TokenLogo';

interface TradingPanelProps {
  currentToken: TokenData | null;
  holdings: PortfolioHolding[];
  metrics: PortfolioMetrics;
  activity: LootBoxHistoryEntry[];
  onBuyCurrent: () => void;
  onSellHolding: (h: PortfolioHolding) => void;
  onViewPortfolio: () => void;
}

const PCTS = [25, 50, 75, 100] as const;

function SectionLabel({ children, right }: { children: string; right?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="font-mono text-[10px] font-bold tracking-[0.14em]" style={{ color: TERM.muted }}>
        {children}
      </span>
      {right && (
        <span className="font-mono text-[10px]" style={{ color: TERM.disabled, fontFamily: TERM_FONT_MONO }}>
          {right}
        </span>
      )}
    </div>
  );
}

export default function TradingPanel({
  currentToken, holdings, metrics, activity, onBuyCurrent, onSellHolding, onViewPortfolio,
}: TradingPanelProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [pct, setPct] = useState<number>(50);
  const [focusedMint, setFocusedMint] = useState<string | null>(null);

  const holdingForCurrent = useMemo(
    () => (currentToken ? holdings.find((h) => h.mint === currentToken.mintAddress) ?? null : null),
    [holdings, currentToken],
  );
  const focusedHolding = useMemo(
    () => (focusedMint ? holdings.find((h) => h.mint === focusedMint) ?? null : null) ?? holdingForCurrent,
    [focusedMint, holdings, holdingForCurrent],
  );

  const pnlUsd = metrics.totalValueUsd * (metrics.change24hPct / 100);
  const positive = pnlUsd >= 0;

  // % refers to available balance (BUY) or open position (SELL) — the
  // existing Buy/Sell modals remain the execution path; this panel only
  // stages intent and never moves funds itself.
  const stagedNote =
    side === 'buy'
      ? `${pct}% OF BALANCE`
      : focusedHolding
        ? `${pct}% ≈ $${((focusedHolding.valueUsd * pct) / 100).toFixed(2)}`
        : `${pct}% OF POSITION`;

  return (
    <div
      className="flex h-full flex-col gap-4 overflow-y-auto border-l p-3"
      style={{ background: TERM.panel, borderColor: TERM.borderSubtle, fontFamily: "'Inter', system-ui, sans-serif" }}
      aria-label="Trading panel"
    >
      {/* ── PnL header ── */}
      <section className="rounded-xl border p-3" style={{ background: TERM.main, borderColor: TERM.borderSubtle }}>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold tracking-[0.14em]" style={{ color: TERM.muted }}>
            PORTFOLIO
          </span>
          <span
            className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums"
            style={{
              borderColor: positive ? 'rgba(24,191,255,0.25)' : 'rgba(224,82,99,0.3)',
              color: positive ? TERM.cyan : TERM.loss,
              background: positive ? 'rgba(24,191,255,0.06)' : 'rgba(224,82,99,0.06)',
            }}
          >
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {formatChange(metrics.change24hPct)}
          </span>
        </div>
        <div className="mt-1.5 text-[26px] font-black tabular-nums leading-none tracking-[-0.02em] text-white">
          ${metrics.totalValueUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </div>
        <div className="mt-1 font-mono text-[11px] tabular-nums" style={{ color: positive ? TERM.cyan : TERM.loss }}>
          {positive ? '+' : ''}${pnlUsd.toFixed(2)} <span style={{ color: TERM.disabled }}>24H</span>
        </div>
      </section>

      {/* ── Position + Buy/Sell ── */}
      <section className="rounded-xl border p-3" style={{ background: TERM.main, borderColor: TERM.borderSubtle }}>
        <SectionLabel right="POSITION // OPEN">
          {currentToken ? `$${currentToken.symbol}` : 'NO COIN'}
        </SectionLabel>
        {currentToken ? (
          <div className="mb-2.5 flex items-center gap-2">
            <TokenLogo src={currentToken.logoUrl} alt={currentToken.symbol} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-extrabold text-white">{currentToken.name}</div>
              <div className="font-mono text-[11px] tabular-nums" style={{ color: TERM.text2 }}>
                {formatPrice(currentToken.priceUsd)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[13px] font-extrabold tabular-nums text-white">
                {focusedHolding ? `$${focusedHolding.valueUsd.toFixed(2)}` : '$0.00'}
              </div>
              <div className="font-mono text-[10px]" style={{ color: TERM.disabled }}>
                {focusedHolding ? formatChange(focusedHolding.priceChange24h) : 'NO POSITION'}
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-2.5 font-mono text-[11px]" style={{ color: TERM.disabled }}>SWIPE // READY</div>
        )}

        {/* tabs */}
        <div className="mb-2 flex gap-4 border-b" style={{ borderColor: TERM.borderSubtle }}>
          {(['buy', 'sell'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className="relative pb-1.5 text-[12px] font-extrabold tracking-[0.08em]"
              style={{ color: side === s ? '#fff' : TERM.muted }}
              aria-pressed={side === s}
            >
              {s.toUpperCase()}
              {side === s && (
                <span
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full"
                  style={{ background: s === 'buy' ? TERM.blue : TERM.loss }}
                />
              )}
              {s === 'sell' && side === 'sell' && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: TERM.loss }} />
              )}
            </button>
          ))}
          <span className="ml-auto font-mono text-[10px]" style={{ color: TERM.disabled }}>{stagedNote}</span>
        </div>

        {/* % segmented */}
        <div className="grid grid-cols-4 overflow-hidden rounded-lg border" style={{ borderColor: TERM.border }}>
          {PCTS.map((p) => (
            <button
              key={p}
              onClick={() => setPct(p)}
              aria-pressed={pct === p}
              className="border-r py-1.5 font-mono text-[11px] font-bold transition-colors last:border-r-0"
              style={{
                borderColor: TERM.border,
                background: pct === p ? TERM.blue : TERM.card,
                color: pct === p ? '#041018' : TERM.text2,
              }}
            >
              {p}%
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            if (side === 'buy') onBuyCurrent();
            else if (focusedHolding) onSellHolding(focusedHolding);
          }}
          disabled={side === 'sell' && !focusedHolding}
          className="mt-2 min-h-[40px] w-full rounded-lg text-[13px] font-extrabold transition-all active:scale-[0.98] disabled:cursor-not-allowed"
          style={
            side === 'buy'
              ? { background: TERM.blue, color: '#041018' }
              : focusedHolding
                ? { background: TERM.card, color: TERM.text, border: `1px solid ${TERM.border}` }
                : { background: TERM.card, color: TERM.disabled, border: `1px solid ${TERM.borderSubtle}` }
          }
        >
          {side === 'buy' ? `BUY ${currentToken ? `$${currentToken.symbol}` : ''}` : focusedHolding ? `SELL ${pct}%` : 'NO POSITION TO SELL'}
        </button>
      </section>

      {/* ── Holdings ── */}
      <section>
        <SectionLabel right={`${holdings.length} HELD`}>
          YOUR COINS
        </SectionLabel>
        {holdings.length === 0 ? (
          <div className="rounded-xl border px-3 py-4 text-center text-[12px]" style={{ borderColor: TERM.borderSubtle, color: TERM.muted, background: TERM.main }}>
            No positions yet — swipe right to buy.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: TERM.borderSubtle }}>
            {holdings.slice(0, 6).map((h) => {
              const up = h.priceChange24h >= 0;
              const focused = focusedHolding?.mint === h.mint;
              return (
                <button
                  key={h.mint}
                  onClick={() => setFocusedMint(h.mint)}
                  className="flex w-full items-center gap-2.5 border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-white/[0.02]"
                  style={{ borderColor: TERM.borderSubtle, background: focused ? 'rgba(24,191,255,0.05)' : 'transparent' }}
                >
                  <TokenLogo src={h.logoUrl} alt={h.symbol} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-extrabold text-white">{h.symbol}</div>
                    <div className="font-mono text-[10px] tabular-nums" style={{ color: TERM.muted }}>
                      ${h.valueUsd.toFixed(2)}
                    </div>
                  </div>
                  <span
                    className="font-mono text-[11px] font-bold tabular-nums"
                    style={{ color: up ? TERM.cyan : TERM.loss }}
                  >
                    {formatChange(h.priceChange24h)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <button
          onClick={onViewPortfolio}
          className="mt-1.5 font-mono text-[10px] font-bold tracking-[0.1em] hover:underline"
          style={{ color: TERM.blue }}
        >
          VIEW ALL →
        </button>
      </section>

      {/* ── Activity (currency-agnostic, CP-only where applicable) ── */}
      <section className="pb-1">
        <SectionLabel right="ACTIVITY // LIVE">TRADE HISTORY</SectionLabel>
        {activity.length === 0 ? (
          <div className="rounded-xl border px-3 py-3 text-center font-mono text-[10px]" style={{ borderColor: TERM.borderSubtle, color: TERM.disabled, background: TERM.main }}>
            NO RECENT ACTIVITY
          </div>
        ) : (
          <div className="space-y-1">
            {activity.slice(0, 6).map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
                style={{ borderColor: TERM.borderSubtle, background: TERM.main }}
              >
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold"
                  style={{ background: 'rgba(24,191,255,0.1)', color: TERM.blue }}
                >
                  +CP
                </span>
                <span className="flex-1 truncate text-[11px] font-semibold" style={{ color: TERM.text2 }}>
                  {a.source}
                </span>
                <span className="font-mono text-[11px] font-bold tabular-nums text-white">
                  +{a.amount.toLocaleString()}
                </span>
                <span className="font-mono text-[9px]" style={{ color: TERM.disabled }}>
                  {formatAge(Date.now() - new Date(a.created).getTime())} ago
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 font-mono text-[9px]" style={{ color: TERM.disabled }}>
          MC {currentToken ? formatMarketCap(currentToken.marketCap) : '—'} · LIQ {currentToken ? formatMarketCap(currentToken.liquidityUsd) : '—'}
        </div>
      </section>
    </div>
  );
}
