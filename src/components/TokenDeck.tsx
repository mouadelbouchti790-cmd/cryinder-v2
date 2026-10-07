import { Component, ReactNode, useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  Wallet,
  Trophy,
  Search,
  Sparkles,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import type { TokenData, DeckTab, AppMainView } from '../types/token';
import { useInfiniteTokenFeed } from '../hooks/useInfiniteTokenFeed';
import { usePortfolio } from '../hooks/usePortfolio';
import { useSwipeSounds } from '../hooks/useSwipeSounds';
import { fetchTokenSearch } from '../services/dexscreener';
import { STACK_DEPTH, CARD_W, CARD_H } from '../utils/constants';
import TokenCard from './TokenCard';
import TokenSearchBar from './TokenSearchBar';
import type { TokenSearchResult } from './TokenSearchBar';
import BuyModal from './BuyModal';
import SellModal from './SellModal';
import SponsoredCard from './SponsoredCard';
import PortfolioTab from './PortfolioTab';
import { CardSkeleton } from './ui/LoadingStates';
import EditUsernameModal from './EditUsernameModal';
import LeaderboardModal from './LeaderboardModal';
import { addPoints, getSwipeReward, DAILY_SWIPE_LIMIT } from '../services/pocketbase';
import { AD_EVERY_N_SWIPES, getWeightedAdSlot } from '../services/adSlots';
import { useSponsoredTokens } from '../hooks/useSponsoredTokens';
import { useLootBox } from '../hooks/useLootBox';
import type { AdSlot } from '../types/adSlots';
import type { HourlyCPState } from '../hooks/usePoints';
import type { PortfolioHolding } from '../types/token';
import LootBoxNavButton from './LootBoxNavButton';
import LootBoxModal from './LootBoxModal';
import DailyCaseModal from './daily/DailyCaseModal';
import DailyCaseNavButton from './daily/DailyCaseNavButton';
import TerminalSidebar from './terminal/TerminalSidebar';
import TerminalTopBar from './terminal/TerminalTopBar';
import TradingPanel from './terminal/TradingPanel';
import TopSwipersView from './terminal/TopSwipersView';
import LootboxTerminalView from './terminal/LootboxTerminalView';
import StatusStrip from './terminal/StatusStrip';

/* ── Props ──────────────────────────────────────────────────────── */

interface CryinderTokenDeckProps {
  onBuy?: (mintAddress: string, token: TokenData) => void;
  onBuyConfirm?: (mintAddress: string, token: TokenData) => void;
  onPass?: (mintAddress: string, token: TokenData) => void;
  onTokenFlip?: (mintAddress: string, isBack: boolean) => void;
  username: string | null;
  userId: string | null;
  onUpdateUsername: (newUsername: string) => Promise<{ success: boolean; error?: string }>;
  cooldownDaysLeft: number;
  cpBalance: number;
  dailySwipes: number;
  dailyLimit: number;
  hourly: HourlyCPState;
  onPointsUpdated?: (newBalance: number, newDailySwipes: number) => void;
  onHourlyUpdated?: () => void | Promise<void>;
}

/* ── Tabs ────────────────────────────────────────────────────────── */

const DECK_TABS: DeckTab[] = ['new', 'gainers', 'trending'];

const TAB_LABELS: Record<DeckTab, string> = {
  new: 'New Pairs',
  gainers: 'Top Gainers',
  trending: 'Trending',
};

/* ── Error Boundary ──────────────────────────────────────────────── */

class DeckErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: any) {
    console.error('Cryinder Deck crash:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#050505] p-10">
          <h2 className="mb-4 text-lg font-extrabold text-[#E0827A]">Something broke</h2>
          <p className="max-w-md text-sm text-white/40 mb-6">
            The deck encountered an unexpected error. Try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="min-h-[48px] rounded-2xl bg-white px-8 text-sm font-extrabold text-black"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Empty State ────────────────────────────────────────────────── */

function EmptyState({
  tab,
  count,
  onRefresh,
}: {
  tab: DeckTab;
  count: number;
  onRefresh: () => void;
}) {
  // Two flavours: exhausted a populated deck vs. nothing in the category.
  if (count === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -30 }}
        className="px-8 py-8 text-center"
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02]">
          <Search className="h-8 w-8 text-white/35" aria-hidden="true" />
        </div>
        <h2 className="mb-2 text-[22px] font-black tracking-[-0.02em] text-white">
          No tokens found
        </h2>
        <p className="mb-7 text-sm leading-relaxed text-white/55">
          No tokens found in this category for{' '}
          <strong className="text-white">{TAB_LABELS[tab]}</strong>. Check back
          shortly — new pairs and movers appear constantly.
        </p>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onRefresh}
          className="min-h-[48px] rounded-2xl bg-white px-8 text-[15px] font-extrabold text-black shadow-[0_4px_20px_rgba(255,255,255,0.12)]"
        >
          Refresh
        </motion.button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      className="px-8 py-8 text-center"
    >
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02]">
        <Sparkles className="h-8 w-8 text-white/35" aria-hidden="true" />
      </div>
      <h2 className="mb-2 text-[22px] font-black tracking-[-0.02em] text-white">
        All Caught Up
      </h2>
      <p className="mb-1.5 text-sm leading-relaxed text-white/55">
        You've reviewed all <strong className="text-white">{count}</strong> tokens in{' '}
        <strong className="text-white">{TAB_LABELS[tab]}</strong>.
      </p>
      <p className="mb-7 text-xs text-white/35">
        Check another tab or refresh for new opportunities.
      </p>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onRefresh}
        className="min-h-[48px] rounded-2xl bg-white px-8 text-[15px] font-extrabold text-black shadow-[0_4px_20px_rgba(255,255,255,0.12)]"
      >
        Refresh Feed
      </motion.button>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN DECK COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

/**
 * CardStage — fills the available vertical space between header tabs and
 * the footer nav, then scales a fixed CARD_W × CARD_H canvas proportionally
 * so the card always feels immersive (no letterboxing, no empty gaps).
 *
 * Touch/layout model:
 *   - The outer <div> stretches via flex-1 to consume every remaining px.
 *   - ResizeObserver measures its actual width/height and computes the
 *     uniform scale factor that fits the fixed-aspect canvas inside it.
 *   - The canvas is rendered at its natural CARD_W × CARD_H and scaled
 *     with `transform: scale(s)`, so all internal card layouts (drag,
 *     flip, stack offsets) keep their pixel-perfect coordinates.
 */
function CardStage({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const compute = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const s = Math.min(rect.width / CARD_W, rect.height / CARD_H);
      // On desktop (md+) allow a modest upscale so the card feels
      // intentional instead of stranded in black space. Mobile stays
      // capped at 1.0 — the natural card is already the right size
      // for a phone screen and we don't risk any sub-pixel blur.
      const cap = window.matchMedia('(min-width: 768px)').matches ? 1.15 : 1;
      setScale(Math.min(cap, s));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    const mq = window.matchMedia('(min-width: 768px)');
    mq.addEventListener('change', compute);
    window.addEventListener('orientationchange', compute);
    return () => {
      ro.disconnect();
      mq.removeEventListener('change', compute);
      window.removeEventListener('orientationchange', compute);
    };
  }, []);

  const scaledW = CARD_W * scale;
  const scaledH = CARD_H * scale;

  return (
    <div
      ref={wrapRef}
      className="relative flex w-full flex-1 items-center justify-center"
    >
      <div
        className="relative shrink-0"
        style={{
          width: scaledW,
          height: scaledH,
          // Pin to the top of the stage so the card grows downward into
          // the available space rather than recentering as it scales.
          marginTop: 0,
        }}
      >
        <div
          className="absolute left-1/2 top-0 origin-top"
          style={{
            width: CARD_W,
            height: CARD_H,
            transform: `translateX(-50%) scale(${scale})`,
            maxWidth: 'none',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default function CryinderTokenDeck({
  onBuy,
  onBuyConfirm,
  onPass,
  onTokenFlip,
  username,
  userId,
  onUpdateUsername,
  cooldownDaysLeft,
  cpBalance,
  dailySwipes,
  dailyLimit,
  hourly,
  onPointsUpdated,
  onHourlyUpdated,
}: CryinderTokenDeckProps) {
  const [activeTab, setActiveTab] = useState<DeckTab>('new');
  const {
    tokens,
    currentIndex,
    setCurrentIndex,
    loading,
    loadingMore,
    error,
    hasMore,
    fromMock,
    retry,
    injectToken,
  } = useInfiniteTokenFeed(activeTab);
  const { publicKey, disconnect } = useWallet();
  const walletAddress = publicKey?.toBase58() ?? null;

  const {
    holdings,
    metrics,
    loading: portfolioLoading,
    refreshing: portfolioRefreshing,
    error: portfolioError,
    lastUpdated: portfolioLastUpdated,
    retry: portfolioRetry,
    refresh: portfolioRefresh,
  } = usePortfolio(walletAddress);

  const [mainView, setMainView] = useState<AppMainView>('deck');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [buyToken, setBuyToken] = useState<TokenData | null>(null);
  const [sellHolding, setSellHolding] = useState<PortfolioHolding | null>(null);
  const [cardCount, setCardCount] = useState(0);
  const [editUsernameOpen, setEditUsernameOpen] = useState(false);
  const [isLootBoxOpen, setIsLootBoxOpen] = useState(false);
  const [isDailyCaseOpen, setIsDailyCaseOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  // Token counts per tab (remembered across tab switches).
  const [tabCounts, setTabCounts] = useState<Record<DeckTab, number>>({
    new: 0,
    gainers: 0,
    trending: 0,
  });
  // Slot injected directly from search (surfaces immediately as the top card)
  const [injectedAdSlot, setInjectedAdSlot] = useState<AdSlot | null>(null);
  // Weighted random pick per ad slot appearance (higher tier = more exposure)
  const [adSlot, setAdSlot] = useState<AdSlot | null>(null);
  // Whether the currently-open BuyModal was launched from a sponsored card.
  const [buyIsAd, setBuyIsAd] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { playLeft, playSuccess } = useSwipeSounds();
  const { slots: activeSlots, byMintAddress } = useSponsoredTokens();
  const { history: lootHistory } = useLootBox(userId);

  const currentToken = tokens[currentIndex] ?? null;
  const walletShort = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : '';

  // Cross-modal bridge: lootbox / portfolio can request the daily case.
  useEffect(() => {
    const handler = () => setIsDailyCaseOpen(true);
    window.addEventListener('cryinder:open-daily-case', handler);
    return () => window.removeEventListener('cryinder:open-daily-case', handler);
  }, []);

  // When an ad slot is due, weighted-pick one (platinum 3x, gold 2x, silver 1x)
  useEffect(() => {
    if (import.meta.env.DEV) console.log(`[AdSlots] Deck effect: cardCount=${cardCount}, injectedAdSlot=${injectedAdSlot?.id ?? 'null'}, activeSlots=${activeSlots.length}, adSlot=${adSlot?.id ?? 'null'}`);
    const isDue = cardCount > 0 && cardCount % AD_EVERY_N_SWIPES === 0;
    if (import.meta.env.DEV) console.log(`[AdSlots] isDue=${isDue} (cardCount=${cardCount} % ${AD_EVERY_N_SWIPES} === 0 && cardCount>0)`);
    if (injectedAdSlot !== null) {
      if (import.meta.env.DEV) console.log('[AdSlots] Skipping pick: injectedAdSlot present');
      return;
    }
    if (activeSlots.length === 0) {
      console.warn('[AdSlots] No active slots available to pick — check PocketBase: getActiveAdSlots returned 0');
      return;
    }
    // Proactively ensure adSlot is ready for next due interval (fixes delay where ad appears 1 render late)
      if (adSlot === null) {
      const picked = getWeightedAdSlot(activeSlots);
      if (import.meta.env.DEV) console.log(`[AdSlots] Pre-picking ad slot for next due (cardCount=${cardCount}): picked=${picked?.id ?? 'null'} (${picked?.token_symbol ?? '-'})`);
      setAdSlot(picked);
    } else {
      if (import.meta.env.DEV) console.log(`[AdSlots] adSlot already set (${adSlot.id}), isDue=${isDue} — ${isDue ? 'will display SponsoredCard' : 'waiting for next interval'}`);
    }
  }, [cardCount, injectedAdSlot, activeSlots, adSlot]);

  // Remember each tab's token count (survives tab switches).
  useEffect(() => {
    if (!loading) {
      setTabCounts((prev) => ({ ...prev, [activeTab]: tokens.length }));
    }
  }, [activeTab, tokens.length, loading]);

  const handleTabChange = useCallback((tab: DeckTab) => {
    setActiveTab(tab);
    setCardCount(0);
  }, []);

  const handleSearchClick = useCallback(() => {
    setSearchExpanded(true);
  }, []);

  const handleTokenInject = useCallback(
    async (result: TokenSearchResult) => {
      setSearchExpanded(false);
      setMainView('deck');

      // Sponsored hit: inject as SponsoredCard — identical to feed injection (every 7 swipes) — gated behind user setting
      const sponsored = result.sponsoredSlot ?? byMintAddress(result.mintAddress);
      if (import.meta.env.DEV) console.log(`[AdSlots] handleTokenInject: mint=${result.mintAddress}, sponsored=${sponsored?.id ?? 'null'} (${sponsored?.token_symbol ?? '-'})`);
      if (sponsored) {
        if (import.meta.env.DEV) console.log(`[AdSlots] Sponsored search hit ${sponsored.id} - injecting as SponsoredCard (identical to feed)`);
        setInjectedAdSlot(sponsored);
        return;
      }

      try {
        const searchResults = await fetchTokenSearch(result.mintAddress);
        const found = searchResults.find((t) => t.mintAddress === result.mintAddress) ?? searchResults[0];

        if (found) {
          injectToken(found);
          return;
        }
      } catch (e) {
        console.warn('Search fetch failed, injecting partial token:', e);
      }

      // Fallback: the search result itself has enough data to render a
      // swipeable card (risk score is recomputed from what we know).
      const fallback: TokenData = {
        id: result.pairAddress || result.mintAddress,
        mintAddress: result.mintAddress,
        name: result.name || 'Unknown Token',
        symbol: result.symbol || '???',
        description: result.name
          ? `${result.name} is actively traded on Solana via ${result.dexId || 'DEX'}.`
          : 'A Solana-based token actively traded on decentralized exchanges.',
        logoUrl: result.imageUrl ?? '',
        priceUsd: result.priceUsd ?? 0,
        priceChange24h: result.priceChange24h ?? 0,
        priceChange1h: 0,
        priceChange6h: 0,
        priceChange5m: 0,
        marketCap: 0,
        volume24h: 0,
        volume1h: 0,
        volume6h: 0,
        liquidityUsd: 0,
        fdv: 0,
        liquiditySource: 'none',
        liquidityLockedPct: null,
        auditStatus: 'Unverified',
        riskScore: 9,
        sparkline: [],
        chain: 'solana',
        dexId: result.dexId || 'dex',
        pairAddress: result.pairAddress || '',
        createdAt: Date.now(),
        labels: [],
        txnsBuys24h: 0,
        txnsSells24h: 0,
        txnsBuys1h: 0,
        txnsSells1h: 0,
      };
      injectToken(fallback);
    },
    [injectToken, byMintAddress],
  );

  const remainingCount = tokens.length - currentIndex;

  // Ad card shows when: (a) search injected one, or (b) every 7 swipes (after first 7, not at 0) — always on
  const showAd =
    injectedAdSlot !== null ||
    (adSlot !== null && cardCount > 0 && cardCount % AD_EVERY_N_SWIPES === 0);

  // Debug: trace ad insertion decision every render
  if (import.meta.env.DEV) console.log(`[AdSlots] Render check: cardCount=${cardCount}, injectedAdSlot=${injectedAdSlot?.id ?? 'null'}, adSlot=${adSlot?.id ?? 'null'}, showAd=${showAd}, activeSlots=${activeSlots.length}, remainingCount=${remainingCount}`);

  // Search injection wins; otherwise the weighted pick for this slot
  const displayAdSlot = injectedAdSlot ?? adSlot;

  // ─── Swipe Handlers (with Points + Recording) ──────────────────

  // ─── Sponsored → TokenData bridge ─────────────────────────────
  //
  //  A sponsored slot is just a TokenData in disguise. Convert it so the
  //  SAME BuyModal / buy flow applies, with zero special handling.
  const adSlotToToken = useCallback(
    (slot: AdSlot, live?: TokenData | null): TokenData | null => {
      if (import.meta.env.DEV) console.log(`[AdSlots] adSlotToToken: slot=${slot.id} (${slot.token_symbol}), live=${live?.symbol ?? 'null'}`);
      const mint = slot.token_address ?? live?.mintAddress;
      if (!mint) {
        console.warn(`[AdSlots] adSlotToToken: no mint for slot ${slot.id}`);
        return null;
      }
      if (live && live.mintAddress.toLowerCase() === mint.toLowerCase()) {
        if (import.meta.env.DEV) console.log(`[AdSlots] adSlotToToken: using live TokenData for ${mint}`);
        return live;
      }
      return {
        id: slot.id,
        mintAddress: mint,
        name: live?.name ?? slot.token_name,
        symbol: live?.symbol ?? slot.token_symbol,
        description:
          live?.description ??
          `${slot.token_name} is actively traded on Solana.`,
        logoUrl: live?.logoUrl ?? slot.card_image ?? '',
        priceUsd: live?.priceUsd ?? 0,
        priceChange24h: live?.priceChange24h ?? 0,
        priceChange1h: live?.priceChange1h ?? 0,
        priceChange6h: live?.priceChange6h ?? 0,
        priceChange5m: live?.priceChange5m ?? 0,
        marketCap: live?.marketCap ?? 0,
        volume24h: live?.volume24h ?? 0,
        volume1h: live?.volume1h ?? 0,
        volume6h: live?.volume6h ?? 0,
        liquidityUsd: live?.liquidityUsd ?? 0,
        fdv: live?.fdv ?? 0,
        liquiditySource: live?.liquiditySource ?? 'none',
        liquidityLockedPct: live?.liquidityLockedPct ?? null,
        auditStatus: live?.auditStatus ?? 'Unverified',
        riskScore: live?.riskScore ?? 9,
        sparkline: live?.sparkline ?? [],
        chain: live?.chain ?? 'solana',
        dexId: live?.dexId ?? '',
        pairAddress: live?.pairAddress ?? slot.pair_address ?? '',
        createdAt: live?.createdAt ?? Date.now(),
        labels: live?.labels ?? [],
        txnsBuys24h: live?.txnsBuys24h ?? 0,
        txnsSells24h: live?.txnsSells24h ?? 0,
        txnsBuys1h: live?.txnsBuys1h ?? 0,
        txnsSells1h: live?.txnsSells1h ?? 0,
      };
    },
    [],
  );

  const handleAdSwipeLeft = useCallback(
    (_tokenData: TokenData | null) => {
      if (import.meta.env.DEV) console.log(`[AdSlots] handleAdSwipeLeft: slot=${displayAdSlot?.id ?? 'null'}, cardCount=${cardCount}`);
      playLeft();
      setInjectedAdSlot(null);
      setAdSlot(null);
      setCardCount((c) => {
        if (import.meta.env.DEV) console.log(`[AdSlots] cardCount incremented (ad left): ${c} -> ${c + 1}`);
        return c + 1;
      });
    },
    [playLeft, displayAdSlot, cardCount],
  );

  const handleAdSwipeRight = useCallback(
    (tokenData: TokenData | null) => {
      const slot = displayAdSlot;
      if (import.meta.env.DEV) console.log(`[AdSlots] handleAdSwipeRight: slot=${slot?.id ?? 'null'} (${slot?.token_symbol ?? '-'}), tokenData=${tokenData?.symbol ?? 'null'}`);
      if (slot) {
        // Same flow as a normal card's right swipe: open BuyModal.
        const token = adSlotToToken(slot, tokenData);
        if (import.meta.env.DEV) console.log(`[AdSlots] handleAdSwipeRight: adSlotToToken result=${token?.symbol ?? 'null'}`);
        if (token) {
          onBuy?.(token.mintAddress, token);
          setBuyToken(token);
          setBuyIsAd(true);
        }
      }
      setInjectedAdSlot(null);
      setAdSlot(null);
      setCardCount((c) => {
        if (import.meta.env.DEV) console.log(`[AdSlots] cardCount incremented (ad right): ${c} -> ${c + 1}`);
        return c + 1;
      });
    },
    [displayAdSlot, adSlotToToken, onBuy, cardCount],
  );

  const handleSwipeLeft = useCallback(async () => {
    if (import.meta.env.DEV) console.log(`[AdSlots] handleSwipeLeft: showAd=${showAd}, cardCount=${cardCount}, currentIndex=${currentIndex}, token=${tokens[currentIndex]?.symbol ?? 'null'}`);
    if (showAd) {
      console.log('[AdSlots] handleSwipeLeft: delegating to handleAdSwipeLeft (ad is top)');
      handleAdSwipeLeft(null);
      return;
    }
    const token = tokens[currentIndex];
    if (!token || !userId) return;

    playLeft();

    // Advance the card IMMEDIATELY so the swipe feels instant. CP is
    // awarded in the background — no need to block the UI on the
    // backend round trip.
    onPass?.(token.mintAddress, token);
    setCardCount((c) => {
      if (import.meta.env.DEV) console.log(`[AdSlots] handleSwipeLeft: cardCount ${c} -> ${c + 1}`);
      return c + 1;
    });
    setCurrentIndex((i) => i + 1);

    try {
      // Award points (ONLY place this happens)
      const reward = getSwipeReward('left');
      const result = await addPoints(userId, reward, 'swipe-left');
      if (result.updated && onPointsUpdated) {
        onPointsUpdated(result.updated.balance, result.updated.daily_swipes);
      }
      onHourlyUpdated?.();
    } catch (error) {
      console.error('Error processing left swipe:', error);
    }
  }, [tokens, currentIndex, cardCount, userId, onPass, onPointsUpdated, onHourlyUpdated, setCurrentIndex, playLeft, showAd, handleAdSwipeLeft]);

  const handleSwipeRight = useCallback(() => {
    if (import.meta.env.DEV) console.log(`[AdSlots] handleSwipeRight: showAd=${showAd}, cardCount=${cardCount}, currentIndex=${currentIndex}, token=${tokens[currentIndex]?.symbol ?? 'null'}`);
    if (showAd) {
      console.log('[AdSlots] handleSwipeRight: delegating to handleAdSwipeRight (ad is top)');
      handleAdSwipeRight(null);
      return;
    }
    const token = tokens[currentIndex];
    if (!token) return;

    // Open the buy modal IMMEDIATELY. NO CP reward and NO success sound
    // here — those fire only when the swap confirms on-chain (see
    // handleSwapSuccess, wired to BuyModal's onSwapComplete).
    onBuy?.(token.mintAddress, token);
    setBuyToken(token);
    setBuyIsAd(false);
  }, [tokens, currentIndex, cardCount, onBuy, showAd, handleAdSwipeRight]);

  /**
   * Fired by BuyModal ONLY after the swap transaction confirms
   * successfully. Awards +25 CP and plays the success ding. Failed,
   * rejected, or abandoned swaps never reach this callback.
   */
  const handleSwapSuccess = useCallback(
    async (token: TokenData) => {
      playSuccess();
      if (!userId) return;
      try {
        const reward = getSwipeReward('right');
        const result = await addPoints(userId, reward, 'swipe-right');
        if (result.updated && onPointsUpdated) {
          onPointsUpdated(result.updated.balance, result.updated.daily_swipes);
        }
        onHourlyUpdated?.();
      } catch (error) {
        console.error('Error awarding CP after successful swap:', error);
      }
    },
    [userId, onPointsUpdated, onHourlyUpdated, playSuccess],
  );

  const handleBuyConfirm = useCallback((token: TokenData) => {
    onBuyConfirm?.(token.mintAddress, token);
    setBuyToken(null);
    setBuyIsAd(false);
    if (!buyIsAd) setCurrentIndex((i) => i + 1);
    setCardCount((c) => c + 1);
  }, [onBuyConfirm, setCurrentIndex, buyIsAd]);

  // Dismissing the buy modal no longer advances the deck — user can keep the card and decide later.
  const handleBuyModalClose = useCallback(() => {
    setBuyToken(null);
    setBuyIsAd(false);
  }, []);

  const visibleTokens = useMemo(
    () => tokens.slice(currentIndex, currentIndex + STACK_DEPTH),
    [tokens, currentIndex],
  );

  const isEmpty = currentIndex >= tokens.length && !loadingMore && !hasMore;

  const swipeRef = useRef({ handleSwipeLeft, handleSwipeRight });
  swipeRef.current = { handleSwipeLeft, handleSwipeRight };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (searchExpanded && document.activeElement === searchInputRef.current) return;
      if (mainView !== 'deck') return;
      if (e.key === 'ArrowLeft') swipeRef.current.handleSwipeLeft();
      if (e.key === 'ArrowRight') swipeRef.current.handleSwipeRight();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [searchExpanded, mainView]);

  return (
    <DeckErrorBoundary>
      <div className="flex min-h-[100dvh] overflow-hidden bg-[#070B12] text-white lg:h-[100dvh]">
        {/* Desktop sidebar rail (72px terminal nav) */}
        <div className="hidden shrink-0 lg:flex">
          <TerminalSidebar
            view={mainView}
            onSelect={setMainView}
            onOpenSettings={() => setEditUsernameOpen(true)}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop top bar */}
        <div className="hidden shrink-0 lg:block">
          <TerminalTopBar
            username={username}
            walletShort={walletShort}
            cpBalance={cpBalance}
            onSearchClick={() => { setMainView('deck'); setSearchExpanded(true); }}
            onOpenProfile={() => setEditUsernameOpen(true)}
            onOpenNotifications={() => setLeaderboardOpen(true)}
          />
        </div>
        {/* Header (mobile / tablet — desktop uses TerminalTopBar) */}
        <div className="lg:hidden">
        <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#050505]/90 px-5 pb-0 pt-4 backdrop-blur-xl sm:px-8">
          <div className="mx-auto mb-3 grid max-w-[480px] grid-cols-[1fr_auto_1fr] items-center sm:max-w-[600px] md:max-w-[720px]">
            {/* Left: Username / wallet fallback */}
            <div className="flex justify-start">
              {username ? (
                <button
                  onClick={() => setEditUsernameOpen(true)}
                  aria-label="Edit username"
                  className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 text-[13px] font-semibold text-white/65 transition-colors hover:text-white/85 hover:border-white/[0.10]"
                >
                  <span className="text-[11px] text-white/45">@</span>
                  {username}
                </button>
              ) : (
                <span className="text-[11px] text-white/30 tabular-nums">
                  {publicKey ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}` : ''}
                </span>
              )}
            </div>

            {/* Center: Title */}
            <motion.h1
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl font-black tracking-[-0.02em] text-center"
            >
              {mainView === 'portfolio' ? 'Portfolio' : mainView === 'swipers' ? 'Top Swipers' : mainView === 'lootbox' ? 'Lootbox' : 'Cryinder'}
            </motion.h1>

            {/* Right: Search */}
            <div className="flex justify-end">
              <div className="relative">
                {mainView === 'deck' && (
                  searchExpanded ? (
                    <motion.div
                      initial={{ width: 40, opacity: 0 }}
                      animate={{ width: 220, opacity: 1 }}
                      exit={{ width: 40, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    >
                      <TokenSearchBar
                        onTokenSelect={handleTokenInject}
                        placeholder="Search..."
                        autoFocus
                        className="w-[220px]"
                        sponsoredByMint={byMintAddress}
                      />
                    </motion.div>
                  ) : (
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={handleSearchClick}
                      aria-label="Search tokens"
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.04] text-white transition-colors hover:bg-white/[0.07]"
                    >
                      <Search className="h-[18px] w-[18px]" aria-hidden="true" />
                    </motion.button>
                  )
                )}
                {mainView === 'portfolio' && <div className="w-10" />}
              </div>
            </div>
          </div>

          {/* Stats bar (CP + counter) — aligned to card width */}
          {mainView === 'deck' && (
            <div className="mx-auto mb-2 flex max-w-[480px] items-center justify-between gap-3">
              <button
                onClick={() => setLeaderboardOpen(true)}
                title="View leaderboard"
                aria-label="View leaderboard"
                className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 transition-colors hover:border-white/[0.12]"
              >
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/40">CP</span>
                <span className="text-[13px] font-extrabold text-[#E2E8F0] tabular-nums">
                  {cpBalance.toLocaleString()}
                </span>
              </button>

              {/* Hourly CP earned (rolling 60 min, swipes only) — hidden from UI, state still ticks */}
              <div
                aria-hidden="true"
                style={{ display: 'none' }}
                className="flex min-h-[36px] items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3"
                title="CP earned from swipes in the last 60 minutes. Loot box rewards are bonus CP and do not count."
              >
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/40">
                  CP/HR
                </span>
                <div className="flex h-1.5 w-14 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      hourly.capped
                        ? 'bg-amber-400'
                        : hourly.nearLimit
                          ? 'bg-amber-300/80'
                          : 'bg-white/35'
                    }`}
                    style={{
                      width: `${Math.min((hourly.earned / hourly.limit) * 100, 100)}%`,
                    }}
                  />
                </div>
                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    hourly.capped ? 'text-amber-400' : 'text-white/40'
                  }`}
                >
                  {hourly.earned}/{hourly.limit}
                </span>
              </div>
            </div>
          )}

          {/* Hourly cap notices (deck only) — hidden from UI, logic still evaluates */}
          {mainView === 'deck' && hourly.capped && (
            <div aria-hidden="true" style={{ display: 'none' }} className="mx-auto mb-1 flex max-w-[480px] justify-center">
              <span className="text-[10px] font-semibold text-amber-400/80">
                Hourly CP limit reached. Swipes still count for the day.
              </span>
            </div>
          )}
          {mainView === 'deck' && !hourly.capped && hourly.nearLimit && (
            <div aria-hidden="true" style={{ display: 'none' }} className="mx-auto mb-1 flex max-w-[480px] justify-center">
              <span className="text-[10px] font-semibold text-amber-300/60">
                Approaching hourly CP limit
              </span>
            </div>
          )}

          {mainView === 'deck' && fromMock && (
            <div className="mx-auto mb-1 flex max-w-[480px] justify-center">
              <span className="text-[10px] font-semibold text-amber-300/60">
                Live data unavailable. Showing sample tokens for preview.
              </span>
            </div>
          )}

          {/* Tabs (deck only) — aligned to card width */}
          {mainView === 'deck' && (
            <div className="mx-auto flex max-w-[480px]">
              {DECK_TABS.map((tab) => {
                const count = tabCounts[tab];
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => handleTabChange(tab)}
                    className="relative min-h-[44px] flex-1 bg-transparent pb-2 pt-1 text-[13px] font-semibold transition-colors"
                    style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.4)' }}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      {TAB_LABELS[tab]}
                      {isActive && loading && (
                        <span className="inline-block h-3 w-3 rounded-full border-2 border-white/[0.08] border-t-white/60 animate-spin" />
                      )}
                      {count !== undefined && count > 0 && !loading && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${
                            isActive ? 'bg-white/[0.12] text-white/70' : 'bg-white/[0.05] text-white/35'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </span>
                    {isActive && (
                      <motion.div
                        layoutId="tabUnderline"
                        className="absolute bottom-0 left-[15%] right-[15%] h-0.5 rounded-sm bg-white"
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Portfolio header bar */}
          {mainView === 'portfolio' && <div className="pb-2" />}
        </header>
        </div>{/* /mobile header wrapper */}

        {/* Desktop content row: center discovery + right trading panel */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop deck tabs (mirrors mobile tabs — same state) */}
        {mainView === 'deck' && (
          <div className="mx-auto hidden w-full max-w-[560px] pt-3 lg:block">
            <div className="flex">
              {DECK_TABS.map((tab) => {
                const count = tabCounts[tab];
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => handleTabChange(tab)}
                    className="relative min-h-[40px] flex-1 bg-transparent pb-2 pt-1 font-mono text-[11px] font-bold tracking-[0.1em] transition-colors"
                    style={{ color: isActive ? '#18BFFF' : '#526373' }}
                  >
                    {TAB_LABELS[tab].toUpperCase()}
                    {count > 0 && !loading && (
                      <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] tabular-nums" style={{ background: '#162333', color: '#758696' }}>
                        {count}
                      </span>
                    )}
                    {isActive && (
                      <span className="absolute bottom-0 left-[20%] right-[20%] h-0.5 rounded-sm" style={{ background: '#18BFFF' }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main */}
        <main className="flex flex-1 items-center justify-center overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            {mainView === 'swipers' ? (
              <motion.div
                key="swipers"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full self-start"
              >
                <TopSwipersView userId={userId} />
              </motion.div>
            ) : mainView === 'lootbox' ? (
              <motion.div
                key="lootbox"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full self-start"
              >
                <LootboxTerminalView
                  userId={userId}
                  onOpenDailyCase={() => setIsDailyCaseOpen(true)}
                  onOpenLootBox={() => setIsLootBoxOpen(true)}
                />
              </motion.div>
            ) : mainView === 'portfolio' ? (
              <motion.div
                key="portfolio"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full max-w-[480px] pt-4 sm:max-w-[640px]"
              >
                <PortfolioTab
                  holdings={holdings}
                  metrics={metrics}
                  cpBalance={cpBalance}
                  loading={portfolioLoading}
                  refreshing={portfolioRefreshing}
                  error={portfolioError}
                  lastUpdated={portfolioLastUpdated}
                  onRetry={portfolioRetry}
                  onRefresh={portfolioRefresh}
                  walletAddress={publicKey?.toBase58()}
                  onDisconnect={() => { disconnect().catch(() => {}); }}
                />
              </motion.div>
            ) : loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-6"
              >
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-white/65">Scanning markets...</p>
                  <p className="mt-1 text-xs text-white/35">Finding the best Solana tokens</p>
                </div>
                <CardSkeleton />
              </motion.div>
            ) : error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-[400px] px-7 py-8 text-center"
              >
                <h2 className="mb-2 text-xl font-extrabold">Sync Error</h2>
                <p className="mb-6 text-sm leading-relaxed text-white/65">{error}</p>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={retry}
                  className="rounded-2xl bg-white px-8 py-3.5 text-[15px] font-extrabold text-black shadow-[0_4px_20px_rgba(255,255,255,0.15)]"
                >
                  Retry
                </motion.button>
              </motion.div>
            ) : isEmpty ? (
              <EmptyState key="empty" tab={activeTab} count={tokens.length} onRefresh={retry} />
            ) : (
              <CardStage key="cards">
                  <AnimatePresence>
                    {/* Sponsored card: every 7 swipes or injected from search */}
                    {showAd && displayAdSlot && (
                      <SponsoredCard
                        key={`ad-${displayAdSlot.id}-${cardCount}`}
                        slot={displayAdSlot}
                        isTop={true}
                        index={0}
                        onSwipeLeft={handleAdSwipeLeft}
                        onSwipeRight={handleAdSwipeRight}
                        onFlip={(isBack) => onTokenFlip?.('sponsored', isBack)}
                      />
                    )}
                    {visibleTokens.map((token, index) => (
                      <TokenCard
                        key={token.mintAddress}
                        token={token}
                        isTop={!showAd && index === 0}
                        activeTab={activeTab}
                        onSwipeLeft={handleSwipeLeft}
                        onSwipeRight={handleSwipeRight}
                        onFlip={(isBack) => onTokenFlip?.(token.mintAddress, isBack)}
                        index={showAd ? index + 1 : index}
                      />
                    ))}
                  </AnimatePresence>

                {/* Loading-more indicator — anchored at the bottom of the stage
                    so the card still owns the visual centre while we refill. */}
                {loadingMore && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-[#050505]/80 px-4 py-2 backdrop-blur"
                  >
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-white/[0.08] border-t-white/40 animate-spin" />
                    <span className="text-[11px] text-white/30">
                      Finding more tokens...
                    </span>
                  </motion.div>
                )}
              </CardStage>
            )}
          </AnimatePresence>
        </main>
        </div>{/* /center column */}

        {/* Right trading cockpit (desktop, deck only — portfolio/swipers/lootbox own the center) */}
        {mainView === 'deck' && (
          <aside className="hidden w-[340px] shrink-0 overflow-hidden xl:block">
            <TradingPanel
              currentToken={showAd ? null : currentToken}
              holdings={holdings}
              metrics={metrics}
              activity={lootHistory}
              onBuyCurrent={() => void handleSwipeRight()}
              onSellHolding={setSellHolding}
              onViewPortfolio={() => setMainView('portfolio')}
            />
          </aside>
        )}
        </div>{/* /desktop content row */}

        {/* Status strip (desktop) */}
        <StatusStrip
          dailySwipes={dailySwipes}
          dailyLimit={dailyLimit || DAILY_SWIPE_LIMIT}
          lastUpdated={portfolioLastUpdated}
          view={mainView}
        />

        {/* Footer nav (mobile / tablet — desktop uses the sidebar rail) */}
        <div className="lg:hidden">
        <footer className="relative z-40 mx-auto flex w-full max-w-[480px] items-center justify-around border-t border-white/[0.06] bg-[#050505]/90 px-5 pb-7 pt-3 backdrop-blur-xl sm:max-w-[600px] md:max-w-[720px]">
          {/* Deck */}
          <button
            onClick={() => setMainView('deck')}
            aria-label="Deck"
            aria-current={mainView === 'deck' ? 'page' : undefined}
            className={`flex min-h-[48px] min-w-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-3 transition-colors active:scale-[0.96] ${
              mainView === 'deck' ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
            }`}
          >
            <Layers className={`h-5 w-5 ${mainView === 'deck' ? 'text-white' : 'text-white/35'}`} aria-hidden="true" />
            <span className={`text-[11px] font-semibold ${mainView === 'deck' ? 'text-white' : 'text-white/35'}`}>
              Deck
            </span>
          </button>

          {/* Portfolio */}
          <button
            onClick={() => setMainView('portfolio')}
            aria-label="Portfolio"
            aria-current={mainView === 'portfolio' ? 'page' : undefined}
            className={`flex min-h-[48px] min-w-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-3 transition-colors active:scale-[0.96] ${
              mainView === 'portfolio' ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
            }`}
          >
            <Wallet className={`h-5 w-5 ${mainView === 'portfolio' ? 'text-white' : 'text-white/35'}`} aria-hidden="true" />
            <span className={`text-[11px] font-semibold ${mainView === 'portfolio' ? 'text-white' : 'text-white/35'}`}>
              Portfolio
            </span>
          </button>

          {/* Leaderboard */}
          <button
            onClick={() => setLeaderboardOpen(true)}
            aria-label="Leaderboard"
            className="flex min-h-[48px] min-w-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-3 transition-colors hover:bg-white/[0.02] active:scale-[0.96]"
          >
            <Trophy className="h-5 w-5 text-white/35" aria-hidden="true" />
            <span className="text-[11px] font-semibold text-white/35">
              Ranks
            </span>
          </button>

          {/* Loot Box */}
          <LootBoxNavButton
            onClick={() => setIsLootBoxOpen(true)}
            active={false}
            userId={userId}
          />

          {/* Daily Case */}
          <DailyCaseNavButton
            onClick={() => setIsDailyCaseOpen(true)}
            userId={userId}
          />
        </footer>
        </div>{/* /mobile footer wrapper */}

        {/* Keyboard hint (deck only, mobile) */}
        {mainView === 'deck' && (
          <div className="pointer-events-none fixed bottom-[88px] left-1/2 hidden -translate-x-1/2 items-center gap-2 text-[11px] text-white/35 lg:hidden">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-white/[0.04]"><ArrowLeft className="h-3 w-3" aria-hidden="true" /></span>
            <span>Pass. Swipe right to buy.</span>
            <span className="flex h-5 w-5 items-center justify-center rounded bg-white/[0.04]"><ArrowRight className="h-3 w-3" aria-hidden="true" /></span>
          </div>
        )}

        {/* Buy Modal (swipe-right flow) */}
        <AnimatePresence>
          {buyToken && (
            <BuyModal
              token={buyToken}
              onConfirm={handleBuyConfirm}
              onClose={handleBuyModalClose}
              onSwapComplete={handleSwapSuccess}
            />
          )}
        </AnimatePresence>

        {/* Sell Modal (trading panel / portfolio flow) */}
        <AnimatePresence>
          {sellHolding && (
            <SellModal
              holding={sellHolding}
              onClose={() => setSellHolding(null)}
              onSuccess={() => {
                setSellHolding(null);
                portfolioRefresh();
              }}
            />
          )}
        </AnimatePresence>

        {/* Edit Username Modal */}
        <EditUsernameModal
          open={editUsernameOpen}
          currentUsername={username ?? ''}
          cooldownDaysLeft={cooldownDaysLeft}
          onClose={() => setEditUsernameOpen(false)}
          onSubmit={onUpdateUsername}
        />

        {/* Loot Box Modal */}
        <LootBoxModal
          isOpen={isLootBoxOpen}
          onClose={() => setIsLootBoxOpen(false)}
          userId={userId}
          onPointsUpdated={() => onPointsUpdated?.(cpBalance, dailySwipes)}
        />

        {/* Daily Case Modal — portfolio + lootbox cross-links wired */}
        <DailyCaseModal
          open={isDailyCaseOpen}
          onClose={() => setIsDailyCaseOpen(false)}
          userId={userId}
          cpBalance={cpBalance}
          onClaimed={() => onPointsUpdated?.(cpBalance, dailySwipes)}
          onOpenPortfolio={() => setMainView('portfolio')}
          onOpenLootBox={() => setIsLootBoxOpen(true)}
        />

        {/* Leaderboard Modal */}
        <LeaderboardModal
          open={leaderboardOpen}
          onClose={() => setLeaderboardOpen(false)}
        />
        </div>{/* /terminal column */}
      </div>
    </DeckErrorBoundary>
  );
}
