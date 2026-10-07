import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, RefreshCw, X, AlertTriangle, Wallet } from 'lucide-react';
import type { PortfolioHolding, PortfolioMetrics } from '../types/token';
import PortfolioHeader from './PortfolioHeader';
import PortfolioTokenCard from './PortfolioTokenCard';
import PortfolioInsights from './PortfolioInsights';
import TokenDetailModal from './TokenDetailModal';
import SellModal from './SellModal';
import SendModal from './SendModal';
import ReceiveModal from './ReceiveModal';

/* ── Props ──────────────────────────────────────────────────────── */

interface PortfolioTabProps {
  holdings: PortfolioHolding[];
  metrics: PortfolioMetrics;
  cpBalance: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdated: number | null;
  onRetry: () => void;
  onRefresh: () => void;
  walletAddress?: string | null;
  onDisconnect?: () => void;
}

/* ── Skeleton ───────────────────────────────────────────────────── */

function PortfolioSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading tokens">
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06 }}
          className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-4"
        >
          <div
            className="h-11 w-11 shrink-0 rounded-xl"
            style={{
              background: 'linear-gradient(90deg, #141414 25%, #1f1f1f 50%, #141414 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 h-4 w-28 rounded" style={{ background: '#1f1f1f' }} />
            <div className="h-3 w-20 rounded" style={{ background: '#1f1f1f' }} />
          </div>
          <div className="text-right">
            <div className="mb-1.5 ml-auto h-4 w-20 rounded" style={{ background: '#1f1f1f' }} />
            <div className="ml-auto h-3 w-14 rounded" style={{ background: '#1f1f1f' }} />
          </div>
        </motion.div>
      ))}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}

/* ── Empty ──────────────────────────────────────────────────────── */

function PortfolioEmpty({
  onRetry,
  walletAddress,
  onDisconnect,
}: {
  onRetry: () => void;
  walletAddress?: string | null;
  onDisconnect?: () => void;
}) {
  const truncated = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03]">
        <Wallet className="h-7 w-7 text-white/20" aria-hidden="true" />
      </div>
      <h3 className="mb-2 text-base font-extrabold tracking-[-0.01em] text-white/60">
        No Tokens Found
      </h3>
      <p className="mb-6 max-w-[260px] text-[13px] leading-relaxed text-white/25">
        Your wallet doesn't hold any SPL tokens yet. Try swapping some SOL on a DEX.
      </p>
      <button
        onClick={onRetry}
        className="rounded-2xl border border-white/[0.08] px-6 py-3 text-[13px] font-bold text-white/40 transition-colors hover:border-white/[0.15] hover:text-white/70"
      >
        Refresh
      </button>

      {truncated && onDisconnect && (
        <div className="mt-5 w-full max-w-[300px] rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-white/35">
              Connected
            </span>
            <span className="font-mono text-[11px] font-semibold text-white/55">
              {truncated}
            </span>
          </div>
          <button
            onClick={onDisconnect}
            className="w-full rounded-xl border border-[#E0827A]/20 py-2.5 text-[12px] font-semibold text-[#E0827A]/70 transition-all hover:border-[#E0827A]/40 hover:bg-[#E0827A]/[0.06] hover:text-[#E0827A]/90"
          >
            Disconnect Wallet
          </button>
        </div>
      )}
    </motion.div>
  );
}

/* ── Error ──────────────────────────────────────────────────────── */

function PortfolioError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-[#E0827A]/20 bg-[#E0827A]/[0.04]">
        <AlertTriangle className="h-7 w-7 text-[#E0827A]/70" aria-hidden="true" />
      </div>
      <h3 className="mb-2 text-base font-extrabold tracking-[-0.01em] text-[#E0827A]">
        Failed to Load Portfolio
      </h3>
      <p className="mb-6 max-w-[280px] text-[13px] leading-relaxed text-white/45">
        {message}
      </p>
      <button
        onClick={onRetry}
        className="rounded-2xl bg-white px-6 py-3 text-[13px] font-extrabold text-black"
      >
        Retry
      </button>
    </motion.div>
  );
}

/* ── Wallet / Disconnect footer ─────────────────────────────────── */

function WalletFooter({
  walletAddress,
  onDisconnect,
}: {
  walletAddress?: string | null;
  onDisconnect?: () => void;
}) {
  const truncated = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : null;
  if (!truncated || !onDisconnect) return null;

  return (
    <div className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-white/40">
          Connected Wallet
        </span>
        <span className="font-mono text-[11px] font-semibold text-white/55">
          {truncated}
        </span>
      </div>
      <button
        onClick={onDisconnect}
        className="min-h-[44px] w-full rounded-xl border border-[#E0827A]/20 text-[12px] font-semibold text-[#E0827A]/70 transition-all hover:border-[#E0827A]/40 hover:bg-[#E0827A]/[0.06] hover:text-[#E0827A]/90"
      >
        Disconnect Wallet
      </button>
    </div>
  );
}

/* ── Last updated ───────────────────────────────────────────────── */

function LastUpdated({
  timestamp,
  refreshing,
}: {
  timestamp: number | null;
  refreshing: boolean;
}) {
  if (!timestamp) return null;
  const time = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <span className="text-[11px] font-semibold text-white/35">
      {refreshing ? 'Updating…' : `Updated ${time}`}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PORTFOLIO TAB
   ═══════════════════════════════════════════════════════════════════ */

export default function PortfolioTab({
  holdings,
  metrics,
  cpBalance,
  loading,
  refreshing,
  error,
  lastUpdated,
  onRetry,
  onRefresh,
  walletAddress,
  onDisconnect,
}: PortfolioTabProps) {
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<PortfolioHolding | null>(null);
  const [sellHolding, setSellHolding] = useState<PortfolioHolding | null>(null);
  const [sendHolding, setSendHolding] = useState<PortfolioHolding | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);

  // Header quick actions operate on the most valuable holding.
  const primaryHolding = metrics.mostValuable ?? holdings[0] ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return holdings;
    return holdings.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.symbol.toLowerCase().includes(q),
    );
  }, [holdings, query]);

  const body = loading ? (
    <PortfolioSkeleton />
  ) : error ? (
    <PortfolioError message={error} onRetry={onRetry} />
  ) : holdings.length === 0 ? (
    <PortfolioEmpty
      onRetry={onRetry}
      walletAddress={walletAddress}
      onDisconnect={onDisconnect}
    />
  ) : (
    <>
      {/* ── Search ───────────────────────────────────────────────── */}
      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25"
          aria-hidden="true"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tokens…"
          aria-label="Search tokens"
          className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.02] py-3 pl-10 pr-9 text-sm font-semibold text-white placeholder:text-white/20 outline-none transition-colors focus:border-white/[0.15]"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/30 transition-colors hover:text-white/60"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Token list ───────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-12 text-center"
        >
          <p className="text-sm font-semibold text-white/30">
            No tokens match “{query.trim()}”
          </p>
          <button
            onClick={() => setQuery('')}
            className="mt-3 text-[12px] font-bold text-white/40 underline-offset-2 hover:text-white/60 hover:underline"
          >
            Clear search
          </button>
        </motion.div>
      ) : (
        <AnimatePresence initial={false}>
          <motion.div layout className="space-y-2">
            {filtered.map((holding, i) => (
              <PortfolioTokenCard
                key={holding.mint}
                holding={holding}
                index={i}
                hidden={hidden}
                onOpen={setSelected}
                onSell={setSellHolding}
                onSend={setSendHolding}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}

      {/* ── Refresh control ──────────────────────────────────────── */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-2.5 text-[12px] font-bold text-white/40 transition-colors hover:border-white/[0.12] hover:text-white/70 disabled:opacity-60"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <LastUpdated timestamp={lastUpdated} refreshing={refreshing} />
      </div>

      {/* ── Insights ─────────────────────────────────────────────── */}
      <div className="mt-6">
        <PortfolioInsights metrics={metrics} cpBalance={cpBalance} />
      </div>

      <WalletFooter walletAddress={walletAddress} onDisconnect={onDisconnect} />
    </>
  );

  return (
    <div className="px-4 pb-6">
      <PortfolioHeader
        metrics={metrics}
        cpBalance={cpBalance}
        loading={loading}
        hidden={hidden}
        onToggleHidden={() => setHidden((v) => !v)}
        onSend={() => primaryHolding && setSendHolding(primaryHolding)}
        onReceive={() => setReceiveOpen(true)}
        onSwap={() => primaryHolding && setSellHolding(primaryHolding)}
        hasHoldings={holdings.length > 0}
      />

      <div className="mt-5">{body}</div>

      <TokenDetailModal
        holding={selected}
        cpBalance={cpBalance}
        onClose={() => setSelected(null)}
      />

      <AnimatePresence>
        {sellHolding && (
          <SellModal
            holding={sellHolding}
            onClose={() => setSellHolding(null)}
            onSuccess={() => {
              onRefresh();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sendHolding && (
          <SendModal
            holding={sendHolding}
            onClose={() => setSendHolding(null)}
            onSuccess={() => {
              onRefresh();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {receiveOpen && (
          <ReceiveModal
            walletAddress={walletAddress ?? null}
            onClose={() => setReceiveOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
