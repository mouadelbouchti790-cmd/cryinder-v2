import { Coins, Gift, Trophy } from 'lucide-react';

const leaderboard = [
  { rank: '1', name: '7Kx…9Q2', cp: '12,400 CP', you: false },
  { rank: '2', name: 'Degen…4F8a', cp: '9,850 CP', you: false },
  { rank: '3', name: 'You', cp: '0 CP', you: true },
];

export default function RewardsFeaturesSection() {
  return (
    <section className="bg-[#0a0a0a] px-4 py-20 sm:py-28" aria-labelledby="rewards-heading">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-none border border-neutral-800 bg-neutral-900/60 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400">
            The Problem
          </span>
          <h2 id="rewards-heading" className="mt-6 text-balance text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            <span className="text-white">You miss runners in chart tabs. </span>
            <span className="text-neutral-500">Swipe to find them.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-neutral-400">
            Cryinder puts one live token on each card. Swipe right to buy, left to pass.
            You earn CP either way.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto px-4 mt-16">
          <article className="group relative overflow-hidden rounded-none border border-neutral-800 bg-neutral-900/40 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-neutral-700 hover:bg-neutral-900/70">
            <div
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              aria-hidden="true"
            />
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-none border border-neutral-800 bg-neutral-900 text-white">
              <Coins className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="mt-6 text-center text-[15px] font-semibold tracking-tight text-white">Earn CP</h3>
            <p className="mt-3 text-center text-sm leading-relaxed text-neutral-400">
              3 CP per pass, 25 CP per buy. Streaks multiply.
            </p>
          </article>

          <article className="group relative overflow-hidden rounded-none border border-neutral-800 bg-neutral-900/40 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-neutral-700 hover:bg-neutral-900/70">
            <div
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              aria-hidden="true"
            />
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-none border border-neutral-800 bg-neutral-900 text-white">
              <Gift className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="mt-6 text-center text-[15px] font-semibold tracking-tight text-white">Daily loot box</h3>
            <p className="mt-3 text-center text-sm leading-relaxed text-neutral-400">
              One free open every 24 hours. Bonus CP inside. Connect to claim.
            </p>
          </article>

          <article className="group relative overflow-hidden rounded-none border border-neutral-800 bg-neutral-900/40 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-neutral-700 hover:bg-neutral-900/70">
            <div
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              aria-hidden="true"
            />
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-none border border-neutral-800 bg-neutral-900 text-white">
              <Trophy className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="mt-6 text-center text-[15px] font-semibold tracking-tight text-white">Weekly leaderboard</h3>
            <p className="mt-3 text-center text-sm leading-relaxed text-neutral-400">
              The board resets weekly. High CP ranks you for future airdrops.
            </p>
            <ul className="mt-6 space-y-2" aria-label="Top earners preview">
              {leaderboard.map((row) => (
                <li
                  key={row.rank}
                  className={`flex items-center justify-between rounded-none border px-3 py-2 text-xs ${
                    row.you
                      ? 'border-dashed border-neutral-700 bg-transparent text-neutral-500'
                      : 'border-neutral-800 bg-black/40 text-neutral-300'
                  }`}
                >
                  <span className="font-mono tabular-nums">
                    {row.rank} · {row.name}
                  </span>
                  <span className="font-mono tabular-nums text-neutral-100">{row.cp}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
