import { Package, Gift } from 'lucide-react';
import { DAILY_REWARDS, CASE_TIERS, RARITY_COLORS } from '../../data/dailyCase';
import { useDailyCase } from '../../hooks/useDailyCase';
import { TERM } from './terminalTheme';

interface LootboxTerminalViewProps {
  userId: string | null;
  onOpenDailyCase: () => void;
  onOpenLootBox: () => void;
}

/**
 * Lootbox terminal view — surfaces the CP-only case system.
 * Rewards are Cryinder Points; XP is progression. No crypto rewards.
 */
export default function LootboxTerminalView({ userId, onOpenDailyCase, onOpenLootBox }: LootboxTerminalViewProps) {
  const dc = useDailyCase(userId);
  const tier = CASE_TIERS[dc.currentTierIndex];

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-8 pt-4">
      <div className="mb-1 flex items-center gap-2">
        <Package className="h-4 w-4" style={{ color: TERM.blue }} aria-hidden="true" />
        <h2 className="text-[15px] font-black tracking-[-0.01em] text-white">Lootbox</h2>
        <span className="ml-auto font-mono text-[10px] tracking-[0.1em]" style={{ color: TERM.disabled }}>
          XP → PROGRESSION · CP → REWARDS
        </span>
      </div>

      {/* progression */}
      <div className="mb-3 rounded-xl border p-3" style={{ borderColor: TERM.borderSubtle, background: TERM.panel }}>
        <div className="flex items-center justify-between font-mono text-[10px]" style={{ color: TERM.muted }}>
          <span>NEXT CASE PROGRESSION</span>
          <span><strong style={{ color: TERM.text }}>{dc.xp.toLocaleString()} XP</strong> / {CASE_TIERS[dc.nextTierIndex].xpRequired.toLocaleString()} XP</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: TERM.card }}>
          <div className="h-full rounded-full" style={{ width: `${Math.round(dc.xpPct * 100)}%`, background: `linear-gradient(90deg, ${TERM.deepBlue}, ${TERM.blue})` }} />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px]" style={{ color: TERM.disabled }}>
          <span>CURRENT: {tier.name}</span>
          <span style={{ color: TERM.blue }}>NEXT: {CASE_TIERS[dc.nextTierIndex].name}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={onOpenDailyCase}
            className="min-h-[44px] rounded-lg text-[13px] font-extrabold"
            style={{ background: TERM.blue, color: '#041018' }}
          >
            {dc.status === 'cooldown' ? `NEXT ${dc.cooldownText}` : '> OPEN DAILY CASE'}
          </button>
          <button
            onClick={onOpenLootBox}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border text-[13px] font-bold"
            style={{ borderColor: TERM.border, color: TERM.text2, background: TERM.card }}
          >
            <Gift className="h-4 w-4" aria-hidden="true" /> Lootbox
          </button>
        </div>
      </div>

      {/* tiers */}
      <div className="mb-1 font-mono text-[10px] font-bold tracking-[0.14em]" style={{ color: TERM.muted }}>
        POTENTIAL CP REWARDS
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DAILY_REWARDS.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border px-2 py-2.5 text-center"
            style={{ borderColor: TERM.borderSubtle, borderTop: `2px solid ${RARITY_COLORS[r.rarity]}`, background: TERM.panel }}
          >
            <div className="text-[14px] font-extrabold tabular-nums text-white">{r.label}</div>
            <div className="mt-0.5 font-mono text-[9px] font-bold tracking-[0.08em]" style={{ color: RARITY_COLORS[r.rarity] }}>
              {r.rarity}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 font-mono text-[9px]" style={{ color: TERM.disabled }}>
        INTERNAL CRYINDER POINTS ONLY — NO SOL / ETH / BTC / MEMECOIN REWARDS
      </p>
    </div>
  );
}
