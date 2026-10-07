import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Medal, Star, Gem, Trophy, Flame } from 'lucide-react';

type RewardTab = 'cp' | 'swipers';

interface RewardTier {
  rank: number;
  amount: number;
}

const CP_REWARDS: RewardTier[] = [
  { rank: 1, amount: 100_000 },
  { rank: 2, amount: 75_000 },
  { rank: 3, amount: 50_000 },
  { rank: 4, amount: 25_000 },
  { rank: 5, amount: 20_000 },
  { rank: 6, amount: 15_000 },
  { rank: 7, amount: 12_500 },
  { rank: 8, amount: 10_000 },
  { rank: 9, amount: 7_500 },
  { rank: 10, amount: 5_000 },
];

// Top Swipers pay out exactly double the CP board.
const SWIPER_REWARDS: RewardTier[] = CP_REWARDS.map((r) => ({
  ...r,
  amount: r.amount * 2,
}));

const TAB_COPY: Record<RewardTab, { label: string; subtext: string }> = {
  cp: {
    label: 'Top CP',
    subtext: 'Rewards distributed weekly to the top 10 CP earners.',
  },
  swipers: {
    label: 'Top Swipers',
    subtext: 'Double rewards for the top 10 swipers!',
  },
};

function tierVisual(rank: number): { Icon: typeof Crown; color: string } {
  if (rank === 1) return { Icon: Crown, color: 'text-yellow-400' };
  if (rank === 2) return { Icon: Medal, color: 'text-gray-400' };
  if (rank === 3) return { Icon: Medal, color: 'text-amber-600' };
  if (rank <= 5) return { Icon: Star, color: rank === 4 ? 'text-blue-400' : 'text-blue-300' };
  const purpleShade =
    rank <= 7 ? 'text-purple-400' : rank <= 9 ? 'text-purple-300' : 'text-purple-200';
  return { Icon: Gem, color: purpleShade };
}

function formatReward(amount: number): string {
  return `${amount.toLocaleString()} CP`;
}

export default function LeaderboardRewards() {
  const [tab, setTab] = useState<RewardTab>('cp');
  const rewards = tab === 'cp' ? CP_REWARDS : SWIPER_REWARDS;

  return (
    <section
      aria-label="Weekly leaderboard rewards"
      className="relative mx-auto w-full max-w-4xl px-5 py-16 sm:py-20"
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] shadow-[0_0_28px_rgba(196,181,160,0.08)]">
          <Trophy className="h-5 w-5 text-white/60" aria-hidden="true" />
        </div>
        <h2 className="font-display text-3xl font-black tracking-[-0.02em] sm:text-4xl">
          Weekly Rewards
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/55">
          The best swipers and biggest CP earners get paid every week.
        </p>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <div className="mb-2 flex justify-center">
        <div
          role="tablist"
          aria-label="Reward leaderboard"
          className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] p-1"
        >
          {(['cp', 'swipers'] as const).map((key) => {
            const isActive = tab === key;
            const copy = TAB_COPY[key];
            return (
              <button
                key={key}
                role="tab"
                aria-selected={isActive}
                aria-controls="rewards-panel"
                onClick={() => setTab(key)}
                className={`relative flex min-h-[40px] items-center gap-2 rounded-full px-5 text-[13px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 ${
                  isActive ? 'text-white' : 'text-white/45 hover:text-white/70'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="rewards-tab-pill"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    className="absolute inset-0 rounded-full bg-white/[0.08]"
                    aria-hidden="true"
                  />
                )}
                <span className="relative">{copy.label}</span>
                {key === 'swipers' && (
                  <span className="relative rounded-full bg-yellow-400/10 px-1.5 py-0.5 text-[10px] font-extrabold text-yellow-400/60">
                    2x
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Subtext ─────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.p
          key={`${tab}-subtext`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="mb-8 flex items-center justify-center gap-1.5 text-center text-[13px] font-semibold text-white/45"
        >
          {tab === 'swipers' && (
            <Flame className="h-3.5 w-3.5 shrink-0 text-yellow-400/70" aria-hidden="true" />
          )}
          {TAB_COPY[tab].subtext}
        </motion.p>
      </AnimatePresence>

      {/* ── Reward grid ─────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          id="rewards-panel"
          role="tabpanel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
        >
          {rewards.map((tier) => {
            const { Icon, color } = tierVisual(tier.rank);
            const isWinner = tier.rank === 1;
            return (
              <div
                key={tier.rank}
                className={`group flex flex-col items-center rounded-2xl border bg-white/[0.02] px-3 py-5 text-center transition-all hover:-translate-y-0.5 hover:bg-white/[0.04] ${
                  isWinner
                    ? 'border-yellow-400/[0.18] shadow-[0_0_24px_rgba(250,204,21,0.05)]'
                    : 'border-white/[0.06] hover:border-white/[0.12] hover:shadow-[0_0_24px_rgba(196,181,160,0.06)]'
                }`}
              >
                <Icon
                  className={`mb-3 h-5 w-5 transition-transform group-hover:scale-110 ${color}`}
                  aria-hidden="true"
                />
                <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/85">
                  Rank #{tier.rank}
                </span>
                <span className="mt-2 text-[15px] font-black tabular-nums tracking-[-0.02em] text-white">
                  {formatReward(tier.amount)}
                </span>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
