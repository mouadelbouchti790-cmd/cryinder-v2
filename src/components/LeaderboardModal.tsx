import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Crown, Coins, Zap, TrendingUp } from 'lucide-react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { formatPrice } from '../utils/formatters';
import {
  LeaderboardRankings,
  type LeaderboardRankingItem,
} from './ui/leaderboard-rankings';

type LeaderboardTab = 'cp' | 'swipers' | 'tokens';

const TABS: { id: LeaderboardTab; label: string; Icon: typeof Crown }[] = [
  { id: 'cp', label: 'Top CP', Icon: Crown },
  { id: 'swipers', label: 'Top Swipers', Icon: Zap },
  { id: 'tokens', label: 'Top Tokens', Icon: TrendingUp },
];

interface LeaderboardModalProps {
  open: boolean;
  onClose: () => void;
  currentUserId?: string | null;
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-white/[0.06] bg-[#050505] py-16">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-[3px] border-white/[0.06]" />
        <motion.div
          className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-white/60"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
        />
      </div>
      <p className="text-sm font-semibold text-white/40">{label}</p>
    </div>
  );
}

function TabError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-white/[0.06] bg-[#050505] py-16 text-center">
      <p className="max-w-sm text-sm leading-relaxed text-white/40">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-6 py-2.5 text-sm font-bold text-white/60 transition-colors hover:border-white/[0.15] hover:text-white/80"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#050505] py-16 text-center">
      <p className="text-sm font-semibold text-white/35">{message}</p>
    </div>
  );
}

function formatTokenPrice(price: number): string {
  if (!price || price <= 0) return '-';
  return formatPrice(price);
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

export default function LeaderboardModal({
  open,
  onClose,
  currentUserId,
}: LeaderboardModalProps) {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('cp');
  const {
    cpRankings,
    swiperRankings,
    tokenRankings,
    loading,
    swipersLoading,
    tokensLoading,
    error,
    swipersError,
    tokensError,
    refresh,
    refreshSwipers,
    refreshTokens,
  } = useLeaderboard(currentUserId);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const previouslyFocused = document.activeElement as HTMLElement | null;
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    // Move focus into the dialog
    const timer = window.setTimeout(() => closeBtnRef.current?.focus(), 50);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
      window.clearTimeout(timer);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      refresh();
      refreshSwipers();
      refreshTokens();
    }
  }, [open, refresh, refreshSwipers, refreshTokens]);

  const cpItems: LeaderboardRankingItem[] = cpRankings.map((entry) => ({
    userId: entry.userId,
    userName: entry.userName,
    rank: entry.rank,
    value: entry.value,
    byline: entry.byline,
    displayed: true,
  }));

  const swiperItems: LeaderboardRankingItem[] = swiperRankings.map((entry) => ({
    userId: entry.userId,
    userName: entry.userName,
    rank: entry.rank,
    value: entry.value,
    byline: entry.byline,
    displayed: true,
  }));

  const renderTokensTab = () => {
    if (tokensLoading) return <Spinner label="Loading top tokens..." />;
    if (tokenRankings.length === 0) {
      return <EmptyState message="No tokens swiped yet. Be the first!" />;
    }

    return (
      <div
        role="list"
        aria-label="Top tokens leaderboard"
        className="divide-y divide-white/[0.06]"
      >
        {tokenRankings.map((token) => {
          const showCrown = token.rank <= 3;
          const crownColor =
            token.rank === 1
              ? 'text-yellow-400'
              : token.rank === 2
                ? 'text-gray-400'
                : 'text-amber-600';

          return (
            <div
              key={token.tokenId}
              role="listitem"
              className="flex items-center gap-3 px-4 py-3 transition-colors"
            >
              <div className="flex w-14 items-center justify-center gap-1">
                <span className="w-5 shrink-0 text-right text-sm font-extrabold tabular-nums text-white/75">
                  {token.rank}
                </span>
                {showCrown ? (
                  <Crown className={`h-4 w-4 ${crownColor}`} aria-hidden="true" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-extrabold text-white">
                  ${token.tokenSymbol}
                </p>
                <p className="truncate text-[12px] text-white/35">{token.tokenName}</p>
              </div>

              <div className="flex items-center gap-3 text-right">
                <div>
                  <p className="leading-none text-[14px] font-extrabold tabular-nums text-white">
                    {formatCount(token.value)}
                    <span className="ml-1 text-[11px] font-medium text-white/35">swipes</span>
                  </p>
                  <p className="mt-1 flex items-center justify-end gap-1 text-[11px] font-semibold text-white/40">
                    <Coins className="h-3 w-3" aria-hidden="true" />
                    {formatTokenPrice(token.tokenPrice)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Full leaderboard"
          className="fixed inset-0 z-[400] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:items-center"
        >
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="my-8 w-full max-w-2xl rounded-2xl border border-[#263A4F] bg-[#0E1622] shadow-[0_32px_64px_rgba(0,0,0,0.6)]"
          >
            {/* ── Header ──────────────────────────────────────────── */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <h2 className="text-lg font-extrabold tracking-[-0.01em]">Leaderboard</h2>
              <button
                ref={closeBtnRef}
                onClick={onClose}
                aria-label="Close leaderboard"
                className="rounded-lg p-1.5 text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ── Tabs ────────────────────────────────────────────── */}
            <div
              role="tablist"
              aria-label="Leaderboard tabs"
              className="flex border-b border-white/[0.06]"
            >
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex flex-1 items-center justify-center gap-1.5 px-2 py-3.5 text-sm font-semibold transition-colors ${
                      isActive ? 'text-white' : 'text-white/40 hover:text-white/60'
                    }`}
                  >
                    <tab.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {tab.label}
                    {isActive && (
                      <motion.div
                        layoutId="leaderboard-tab-underline"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#18BFFF]"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Tab Content ─────────────────────────────────────── */}
            <div className="max-h-[60vh] overflow-y-auto p-4 sm:p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === 'cp' && (
                    error ? (
                      <TabError message={error} onRetry={refresh} />
                    ) : loading ? (
                      <Spinner label="Loading rankings..." />
                    ) : cpItems.length === 0 ? (
                      <EmptyState message="No users yet. Be the first!" />
                    ) : (
                      <LeaderboardRankings
                        rankings={cpItems}
                        currentUserId={currentUserId}
                        showPagination
                        defaultPageSize={10}
                      />
                    )
                  )}

                  {activeTab === 'swipers' && (
                    swipersError ? (
                      <TabError message={swipersError} onRetry={refreshSwipers} />
                    ) : swipersLoading ? (
                      <Spinner label="Loading top swipers..." />
                    ) : swiperItems.length === 0 ? (
                      <EmptyState message="No swipes yet. Be the first!" />
                    ) : (
                      <LeaderboardRankings
                        rankings={swiperItems}
                        currentUserId={currentUserId}
                        showPagination
                        defaultPageSize={10}
                      />
                    )
                  )}

                  {activeTab === 'tokens' &&
                    (tokensError ? (
                      <TabError message={tokensError} onRetry={refreshTokens} />
                    ) : (
                      renderTokensTab()
                    ))}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
