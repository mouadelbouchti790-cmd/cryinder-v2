import { Flame } from 'lucide-react';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { TERM } from './terminalTheme';

/** Compact data-dense swiper leaderboard — real backend rankings only. */
export default function TopSwipersView({ userId }: { userId: string | null }) {
  const { swiperRankings, swipersLoading, swipersError, refreshSwipers } = useLeaderboard(userId);

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-8 pt-4">
      <div className="mb-1 flex items-center gap-2">
        <Flame className="h-4 w-4" style={{ color: TERM.blue }} aria-hidden="true" />
        <h2 className="text-[15px] font-black tracking-[-0.01em] text-white">Top Swipers</h2>
        <span className="ml-auto font-mono text-[10px] tracking-[0.1em]" style={{ color: TERM.disabled }}>
          ACTIVITY // LIVE
        </span>
      </div>
      <p className="mb-3 font-mono text-[10px]" style={{ color: TERM.muted }}>
        SWIPES · WIN RATE · DISCOVERED — strongest recent activity
      </p>

      <div className="overflow-hidden rounded-xl border" style={{ borderColor: TERM.borderSubtle, background: TERM.panel }}>
        {swipersLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0" style={{ borderColor: TERM.borderSubtle }}>
              <div className="h-4 w-6 animate-pulse rounded" style={{ background: TERM.card }} />
              <div className="h-7 w-7 animate-pulse rounded-full" style={{ background: TERM.card }} />
              <div className="h-3.5 flex-1 animate-pulse rounded" style={{ background: TERM.card }} />
            </div>
          ))
        ) : swipersError ? (
          <div className="px-4 py-8 text-center">
            <p className="mb-3 text-[13px]" style={{ color: TERM.muted }}>{swipersError}</p>
            <button
              onClick={() => void refreshSwipers()}
              className="rounded-lg border px-4 py-2 text-[12px] font-bold text-white"
              style={{ borderColor: TERM.border }}
            >
              Retry
            </button>
          </div>
        ) : swiperRankings.length === 0 ? (
          <div className="px-4 py-8 text-center font-mono text-[11px]" style={{ color: TERM.disabled }}>
            NO RANKINGS YET — BE THE FIRST TO SWIPE
          </div>
        ) : (
          swiperRankings.slice(0, 25).map((r) => (
            <div
              key={r.userId}
              className="flex items-center gap-3 border-b px-3 py-2 transition-colors last:border-b-0 hover:bg-white/[0.02]"
              style={{ borderColor: TERM.borderSubtle }}
            >
              <span className="w-6 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums" style={{ color: r.rank <= 3 ? TERM.blue : TERM.disabled }}>
                {r.rank}
              </span>
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
                style={{ background: TERM.card, border: `1px solid ${TERM.borderSubtle}`, color: TERM.text2 }}
              >
                {(r.userName ?? '?')[0]?.toUpperCase() ?? '?'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-white">
                {r.userName ? `@${r.userName}` : 'anon'}
              </span>
              {r.byline && (
                <span className="hidden truncate font-mono text-[10px] sm:block" style={{ color: TERM.disabled }}>
                  {r.byline}
                </span>
              )}
              <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums" style={{ color: TERM.cyan }}>
                {r.value.toLocaleString()} swipes
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
