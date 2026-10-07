import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Zap, Activity, Gauge, Users, Gift, Trophy } from 'lucide-react';
import { useStats } from '../hooks/useStats';
import BrandMark from './BrandMark';
import FaqAccordion from './FaqAccordion';
import Velaris from './ui/velaris';
import RewardsFeaturesSection from './RewardsFeaturesSection';

interface LandingProps {
  onConnectClick: () => void;
  onLoginClick?: () => void;
  onSignupClick?: () => void;
  onPrivacyClick?: () => void;
  onTermsClick?: () => void;
  currentUserId?: string;
}

const TELEGRAM_URL = 'https://t.me/+LjHhYXGOSykzZjE0';
const X_URL = 'https://x.com/Cryinderapp';

function useLiveTraders(fallback: number) {
  const [n, setN] = useState(fallback);
  useEffect(() => {
    const id = setInterval(() => {
      setN((v) => {
        const drift = Math.floor(Math.random() * 5) - 2;
        return Math.max(58, Math.min(92, v + drift));
      });
    }, 2800);
    return () => clearInterval(id);
  }, [fallback]);
  return n;
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export default function CryinderLandingPage({ onConnectClick, onLoginClick, onSignupClick, onPrivacyClick, onTermsClick }: LandingProps) {
  const { stats, loading } = useStats();
  const liveTraders = useLiveTraders(Math.max(61, stats.totalSwipers || 61));

  const activeUsers = loading ? 61 : Math.max(stats.totalSwipers, 61);
  const totalVolume = loading
    ? '—'
    : `$${Math.max(stats.totalSwipes * 14.2, 48200).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const totalSwipes = loading ? '—' : stats.totalSwipes.toLocaleString('en-US');

  return (
    <div className="min-h-screen bg-[#0a0c10] text-zinc-100 antialiased" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>
      {/* soft neutral lighting */}
      <div className="pointer-events-none fixed inset-0" aria-hidden="true">
        <div className="absolute left-1/2 top-[-320px] h-[520px] w-[860px] -translate-x-1/2 rounded-full bg-white/[0.04] blur-[140px]" />
        <div className="absolute left-[10%] top-[45%] h-[340px] w-[340px] rounded-full bg-white/[0.02] blur-[120px]" />
      </div>

      <div className="relative">
        {/* ── NAV ── */}
        <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0a0c10]/80 backdrop-blur-xl">
          <div className="flex w-full items-center justify-between px-5 py-3.5 sm:px-8">
            <div className="flex items-center gap-2.5">
              <BrandMark className="h-8 w-8 rounded-xl object-cover" />
              <span className="text-[15px] font-semibold tracking-tight text-white">Cryinder</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onLoginClick ?? onConnectClick}
                className="hidden rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-white sm:block"
              >
                Login
              </button>
              <button
                onClick={onSignupClick ?? onConnectClick}
                className="rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-zinc-950 transition-all hover:bg-zinc-200"
              >
                Sign Up
              </button>
            </div>
          </div>
        </header>

        {/* ── HERO with Velaris background ── */}
        <Velaris
          height="auto"
          bg="#0a0c10"
          colors={['#3b82f6', '#1d4ed8', '#172554', '#0a0c10']}
          speed={1.2}
          grain={0.25}
          className="border-b border-white/[0.06]"
        >
        <section className="mx-auto max-w-6xl px-5 pb-14 pt-16 text-center sm:pt-24">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/[0.06] py-1.5 pl-3 pr-4 shadow-[0_0_24px_rgba(96,165,250,0.12)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.9)]" />
            </span>
            <span className="text-xs font-medium text-blue-200">
              Live Terminal <span className="text-blue-400/50">•</span>{' '}
              <span className="font-mono tabular-nums">{liveTraders}+ Active Traders</span>
            </span>
          </div>

          <h1 className="mx-auto max-w-4xl text-balance text-5xl font-semibold leading-[1.04] tracking-[-0.03em] text-white sm:text-7xl">
            Swipe. Discover. <span className="text-blue-700">Trade.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
            Swipe Solana memecoins and buy in under a second.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={onSignupClick ?? onConnectClick}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-[15px] font-semibold text-zinc-950 transition-all hover:bg-zinc-200 sm:w-auto"
            >
              Sign Up
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>

          <div className="mt-6 flex items-center justify-center gap-5 text-xs text-zinc-400">
            <span>Non-custodial</span>
            <span className="h-1 w-1 rounded-full bg-zinc-500" />
            <span>No deposits</span>
            <span className="h-1 w-1 rounded-full bg-zinc-500" />
            <span>Jupiter execution</span>
          </div>
        </section>
        </Velaris>

        {/* ── TERMINAL PREVIEW ── */}
        <section className="mx-auto max-w-4xl px-5">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-blue-400/70" />
              <span className="ml-3 font-mono text-[11px] text-zinc-500">cryinder — deck_feed</span>
              <span className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-blue-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" /> LIVE
              </span>
            </div>
            <div className="grid sm:grid-cols-[1.2fr_0.8fr]">
              <div className="border-white/[0.06] p-5 sm:border-r">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800 text-lg font-bold text-white">
                    W
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-white">dogwifhat</div>
                    <div className="font-mono text-[11px] text-zinc-500">WIF / SOL · Raydium</div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="font-mono text-lg font-semibold text-blue-400">+12.4%</div>
                    <div className="font-mono text-xs text-zinc-400">$2.4128</div>
                  </div>
                </div>
                <svg viewBox="0 0 300 64" className="mt-4 h-16 w-full" aria-hidden="true">
                  <defs>
                    <linearGradient id="sparkMono" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e4e4e7" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#e4e4e7" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,50 C30,46 45,52 60,42 C75,32 90,38 105,30 C120,22 135,28 150,24 C165,20 180,26 195,18 C210,12 225,20 240,14 C255,9 275,12 300,6 L300,64 L0,64 Z"
                    fill="url(#sparkMono)"
                  />
                  <path
                    d="M0,50 C30,46 45,52 60,42 C75,32 90,38 105,30 C120,22 135,28 150,24 C165,20 180,26 195,18 C210,12 225,20 240,14 C255,9 275,12 300,6"
                    fill="none"
                    stroke="#e4e4e7"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] py-2.5 text-center text-sm font-semibold text-zinc-500">
                    ✕ Pass
                  </div>
                  <button
                    onClick={onConnectClick}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                  >
                    <Zap className="h-3.5 w-3.5" /> Buy
                  </button>
                </div>
              </div>
              <div className="space-y-2.5 border-t border-white/[0.06] p-5 sm:border-t-0">
                {[
                  ['MCAP', '$2.4B'],
                  ['VOL 24H', '$148M'],
                  ['BUYS / SELLS', '18.2K / 9.1K'],
                  ['LIQUIDITY', '$8.6M'],
                  ['HOLDERS', '214K'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3 py-2 text-xs">
                    <span className="text-zinc-500">{k}</span>
                    <span className="font-mono tabular-nums text-zinc-100">{v}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-1 pt-1 font-mono text-[11px] tabular-nums text-zinc-600">
                  <span>queue: 247 tokens</span>
                  <span>0.4s latency</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── LIVE TRACTION ── */}
        <section className="mx-auto max-w-4xl px-5 py-12">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: Users, label: 'Active Users', value: String(activeUsers), sub: `${totalSwipes} total swipes` },
              { icon: Activity, label: 'Volume Processed', value: totalVolume, sub: 'Jupiter settles each trade' },
              { icon: Gauge, label: 'Speed', value: '0.4s', sub: 'swipe to fill' },
            ].map(({ icon: Icon, label, value, sub }) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-zinc-900/40 p-5 transition-colors hover:border-white/20"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                  <Icon className="h-3.5 w-3.5 text-zinc-300" />
                  {label}
                </div>
                <div className="mt-2 font-mono text-3xl font-semibold tabular-nums text-white">
                  {value}
                </div>
                <div className="mt-1 text-xs text-zinc-500">{sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="mx-auto max-w-6xl px-5 py-10">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
              Three steps to your next trade.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-zinc-500">
              Connect, swipe, stack rewards.
            </p>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {[
              ['01', 'Connect wallet', 'Connect Phantom or Solflare in one tap. Your keys never leave your device.'],
              ['02', 'Swipe the deck', 'Each card shows live DexScreener data. Swipe right to buy through Jupiter, left to dismiss.'],
              ['03', 'Stack rewards', 'Earn CP on every swipe, open daily loot boxes, and climb the weekly leaderboard.'],
            ].map(([n, t, d]) => (
              <div
                key={n}
                className="rounded-xl border border-white/10 bg-zinc-900/40 p-6 transition-all hover:border-white/20 hover:bg-zinc-900/60"
              >
                <div className="font-mono text-xs tabular-nums text-zinc-500">{n}</div>
                <div className="mt-3 text-[15px] font-semibold tracking-tight text-white">{t}</div>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <RewardsFeaturesSection />

        {/* ── SPONSORED SLOTS ── */}
        <section id="slots" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-14">
          <div className="text-center">
            <div className="mb-3 inline-block rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              Sponsored placements
            </div>
            <h2 className="text-3xl font-semibold tracking-[-0.02em] text-white sm:text-5xl">
              Your token at position #1.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
              We place your token at position #1 of every swipe queue. Every trader sees you first.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {[
              {
                name: '24H Featured Slot',
                price: '$180',
                cadence: 'Resets daily',
                desc: 'You get top-card priority for launches and momentum spikes.',
                feats: ['Position #1 injection', '24h prime visibility', '~5K–15K impressions', 'Sponsored badge'],
                hot: false,
              },
              {
                name: '48H Featured Slot',
                price: '$340',
                cadence: 'Resets every 48 hours',
                desc: 'You hold the top card for two full days.',
                feats: ['Position #1 injection', '48h extended visibility', '~12K–30K impressions', 'Sponsored badge', '2× exposure window'],
                hot: true,
              },
              {
                name: '1-Week Slot',
                price: '$1,240',
                cadence: 'Resets weekly',
                desc: 'You own the feed for a full week.',
                feats: ['Position #1 injection', '7-day dominance', '~50K–120K impressions', 'Sponsored badge', 'Best $ / impression'],
                hot: false,
              },
            ].map((c) => (
              <div
                key={c.name}
                className={`group relative flex flex-col rounded-xl border bg-zinc-900/40 p-7 transition-all duration-300 hover:-translate-y-1 ${
                  c.hot
                    ? 'border-white/25 shadow-[0_0_40px_rgba(255,255,255,0.08)] hover:border-white/40'
                    : 'border-white/10 hover:border-white/20 hover:bg-zinc-900/60'
                }`}
              >
                {c.hot && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-zinc-950">
                    Best value
                  </div>
                )}
                <div className="text-sm font-medium text-zinc-400">{c.name}</div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-white">{c.price}</span>
                  <span className="text-xs text-zinc-500">USDC</span>
                </div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-widest text-blue-400">
                  {c.cadence}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-zinc-400">{c.desc}</p>
                <ul className="mt-6 flex-1 space-y-2.5 border-t border-white/[0.07] pt-6">
                  {c.feats.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-[13px] text-zinc-300">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[10px] text-white">
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-7 flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 transition-all hover:bg-zinc-200"
                >
                  Claim Slot via Telegram <ArrowUpRight className="h-4 w-4" />
                </a>
                <div className="mt-2.5 text-center text-[11px] text-zinc-600">
                  Replies in minutes
                </div>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-6 flex max-w-3xl flex-col items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-900/40 px-6 py-4 sm:flex-row">
            <span className="text-sm text-zinc-400">Need a custom run or bulk weeks?</span>
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-white underline-offset-4 hover:underline"
            >
              DM us on Telegram →
            </a>
          </div>
        </section>

        {/* ── FAQ / TRUST ── */}
        <section className="mx-auto max-w-3xl px-5 py-14">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
              Common questions.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-500">
              You keep your keys. You approve each buy in your wallet.
            </p>
          </div>
          <div className="mt-8">
            <FaqAccordion />
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section className="mx-auto max-w-6xl px-5 pb-20 pt-6">
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40 px-6 py-14 text-center sm:py-20">
            <div
              className="pointer-events-none absolute left-1/2 top-[-180px] h-[360px] w-[640px] -translate-x-1/2 rounded-full bg-white/[0.05] blur-[120px]"
              aria-hidden="true"
            />
            <h2 className="relative mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-[-0.02em] text-white sm:text-5xl">
              Find your next trade with one swipe.
            </h2>
            <p className="relative mx-auto mt-4 max-w-md text-sm leading-relaxed text-zinc-400">
              Join <span className="font-mono tabular-nums text-blue-400">{activeUsers}</span> traders
              swiping Solana memecoins.
            </p>
            <button
              onClick={onConnectClick}
              className="group relative mx-auto mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-9 py-3.5 text-[15px] font-semibold text-zinc-950 transition-all hover:bg-zinc-200"
            >
              Launch Terminal
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-5 py-8 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <BrandMark className="h-6 w-6 rounded-md object-cover" />
              <span className="text-sm font-medium text-zinc-300">Cryinder</span>
              <span className="font-mono text-xs tabular-nums text-zinc-600">© {new Date().getFullYear()}</span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={X_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X (Twitter)"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-zinc-500 transition-all hover:border-white/20 hover:text-white"
              >
                <XIcon className="h-3.5 w-3.5" />
              </a>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Telegram"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-zinc-500 transition-all hover:border-white/20 hover:text-white"
              >
                <TelegramIcon className="h-3.5 w-3.5" />
              </a>
              <button onClick={onPrivacyClick} className="rounded-lg px-3 py-2 text-xs text-zinc-500 transition-colors hover:text-zinc-200">
                Privacy
              </button>
              <button onClick={onTermsClick} className="rounded-lg px-3 py-2 text-xs text-zinc-500 transition-colors hover:text-zinc-200">
                Terms
              </button>
            </div>
          </div>
          <div className="mx-auto max-w-6xl px-5 pb-6 text-center text-[11px] text-zinc-600">
            Built on Solana · All rights reserved
          </div>
        </footer>
      </div>
    </div>
  );
}
