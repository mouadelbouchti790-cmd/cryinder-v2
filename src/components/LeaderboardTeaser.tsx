import { motion } from 'framer-motion';
import { Crown, Trophy, ArrowRight } from 'lucide-react';
import { useLeaderboard } from '../hooks/useLeaderboard';

const crownColorMap = {
  1: 'text-yellow-400',
  2: 'text-gray-400',
  3: 'text-amber-600',
} as const;

interface LeaderboardTeaserProps {
  currentUserId?: string;
  onViewFull: () => void;
}

export default function LeaderboardTeaser({
  currentUserId,
  onViewFull,
}: LeaderboardTeaserProps) {
  const { cpRankings, loading, error, refresh } = useLeaderboard(currentUserId);

  const top5 = cpRankings.slice(0, 5);

  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px 0px' }}
          transition={{ duration: 0.6 }}
          className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-1.5"
        >
          <Trophy className="h-3.5 w-3.5 text-white/60" aria-hidden="true" />
          <span className="text-[11px] font-semibold tracking-wide text-white/70">
            Leaderboard
          </span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px 0px' }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-display text-3xl font-black tracking-[-0.02em] sm:text-5xl"
        >
          Top CP Earners
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px 0px' }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base"
        >
          CP = Cryinder Points. Every swipe earns CP. These are the best swipers in the game.
        </motion.p>
      </div>

      {/* ── Top 5 ─────────────────────────────────────────────────── */}
      <div className="mx-auto mt-10 max-w-3xl">
        {loading ? (
          <div
            className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#050505]"
            aria-busy="true"
            aria-label="Loading rankings"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-white/[0.06]' : ''}`}
              >
                <div className="h-4 w-4 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
                <div className="ml-auto h-4 w-12 animate-pulse rounded bg-white/[0.06]" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-white/[0.06] bg-[#050505] py-16 text-center">
            <p className="max-w-sm text-sm leading-relaxed text-white/60">{error}</p>
            <button
              onClick={refresh}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 text-[12px] font-semibold text-white/70 transition-colors hover:border-white/[0.15] hover:text-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
            >
              Retry
            </button>
          </div>
        ) : top5.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-[#050505] py-16 text-center">
            <p className="text-sm font-semibold text-white/35">
              No users yet. Be the first!
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px 0px' }}
            transition={{ duration: 0.6 }}
            className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#050505]"
          >
            <div role="list" aria-label="Top 5 CP earners" className="divide-y divide-white/[0.06]">
              {top5.map((entry) => {
                const displayName =
                  entry.userName || `User ${entry.userId.slice(0, 6)}`;
                const showCrown = entry.rank <= 3;
                const crownColor = showCrown
                  ? crownColorMap[entry.rank as 1 | 2 | 3]
                  : undefined;
                const isCurrentUser = currentUserId === entry.userId;

                return (
                  <div
                    key={entry.userId}
                    role="listitem"
                    className={`flex items-center gap-3 px-4 py-3 ${
                      isCurrentUser ? 'bg-white/[0.04]' : ''
                    }`}
                  >
                    <div className="flex w-14 items-center justify-center gap-1">
                      <span className="w-5 shrink-0 text-right text-sm font-extrabold tabular-nums text-white/75">
                        {entry.rank}
                      </span>
                      {showCrown && crownColor ? (
                        <Crown className={`h-4 w-4 shrink-0 ${crownColor}`} aria-hidden="true" />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-extrabold text-white">
                        {displayName}
                        {isCurrentUser && (
                          <span className="ml-2 text-[12px] font-semibold text-white/40">
                            (you)
                          </span>
                        )}
                      </p>
                      {entry.byline ? (
                        <p className="truncate text-[12px] text-white/35">{entry.byline}</p>
                      ) : null}
                    </div>

                    <p className="leading-none text-[14px] font-extrabold tabular-nums text-white">
                      {entry.value.toLocaleString()}
                      <span className="ml-1 text-[11px] font-medium text-white/35">CP</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── View Full Button ────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px 0px' }}
          transition={{ duration: 0.6 }}
          className="mt-6 text-center"
        >
          <button
            onClick={onViewFull}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-8 text-sm font-bold text-white/70 transition-colors hover:border-white/[0.15] hover:text-white/90"
          >
            View Full Leaderboard
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}
