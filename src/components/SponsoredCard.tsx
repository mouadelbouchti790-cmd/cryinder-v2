import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import {
  X,
  ArrowRight,
  ShieldCheck,
  Flame,
  DollarSign,
  Store,
  Clock,
  Link as LinkIcon,
  Copy,
  Info,
} from 'lucide-react';
import type { AdSlot } from '../types/adSlots';
import type { TokenData } from '../types/token';
import { formatPrice, formatMarketCap, formatVolume, formatAge } from '../utils/formatters';
import { SWIPE_THRESHOLD, CARD_W, CARD_H, COLORS } from '../utils/constants';
import { trackImpression, trackClick } from '../services/adSlots';
import { fetchTokenSearch } from '../services/dexscreener';
import Sparkline from './ui/Sparkline';
import { useAth } from '../hooks/useAth';

interface SponsoredCardProps {
  slot: AdSlot;
  isTop: boolean;
  index: number;
  onSwipeLeft: (tokenData: TokenData | null) => void;
  onSwipeRight: (tokenData: TokenData | null) => void;
  onFlip?: (isBack: boolean) => void;
}

const NEUTRAL_GRADIENT = { accent: '#C4B5A0', glow: 'rgba(196,181,160,0.2)' };

export default function SponsoredCard({
  slot,
  isTop,
  index,
  onSwipeLeft,
  onSwipeRight,
  onFlip,
}: SponsoredCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const isFlipping = useRef(false);

  const x = useMotionValue(0);
  const rotateZ = useTransform(x, [-CARD_W / 2, 0, CARD_W / 2], [-14, 0, 14]);
  const springRotate = useSpring(rotateZ, { stiffness: 300, damping: 25 });

  const buyOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const passOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);

  // Impressions count as soon as the card mounts (visible in the stack)
  useEffect(() => {
    if (slot.id) trackImpression(slot.id).catch(() => {});
  }, [slot.id]);

  // Fetch live token metrics from DexScreener using pair_address (preferred) then token_address
  useEffect(() => {
    let cancelled = false;
    const query = slot.pair_address || slot.token_address;
    if (!query) {
      setTokenData(null);
      return;
    }
    // Use fetchTokenSearch which handles both mint and pair lookups via DexScreener
    // Prefer pair_address for exact pair match, fallback to token_address
    const primaryQuery = slot.pair_address || slot.token_address!;
    const fallbackQuery = slot.pair_address && slot.token_address ? slot.token_address : null;

    if (import.meta.env.DEV) console.log(`[AdSlots] SponsoredCard fetching live data: pair_address=${slot.pair_address ?? 'null'}, token_address=${slot.token_address ?? 'null'}, query=${primaryQuery}`);

    fetchTokenSearch(primaryQuery)
      .then((tokens) => {
        if (cancelled) return;
        if (tokens.length > 0) {
          if (import.meta.env.DEV) console.log(`[AdSlots] SponsoredCard live data found for ${primaryQuery}: ${tokens[0].symbol} price=${tokens[0].priceUsd}`);
          setTokenData(tokens[0]);
        } else if (fallbackQuery) {
          if (import.meta.env.DEV) console.log(`[AdSlots] SponsoredCard no data for pair, trying fallback token_address=${fallbackQuery}`);
          return fetchTokenSearch(fallbackQuery).then((fbTokens) => {
            if (!cancelled && fbTokens.length > 0) setTokenData(fbTokens[0]);
            else if (!cancelled) setTokenData(null);
          });
        } else {
          setTokenData(null);
        }
      })
      .catch((err) => {
        console.warn('[AdSlots] SponsoredCard fetch failed:', err);
        if (!cancelled) setTokenData(null);
        if (fallbackQuery && !cancelled) {
          fetchTokenSearch(fallbackQuery)
            .then((fbTokens) => {
              if (!cancelled && fbTokens.length > 0) setTokenData(fbTokens[0]);
            })
            .catch(() => {});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slot.pair_address, slot.token_address]);

  const grad = NEUTRAL_GRADIENT;
  const symbol = tokenData?.symbol ?? slot.token_symbol;
  const name = tokenData?.name ?? slot.token_name;
  const logoUrl = slot.card_image || tokenData?.logoUrl || '';
  const priceUsd = tokenData?.priceUsd ?? 0;
  const changeVal = tokenData?.priceChange24h ?? 0;
  const description =
    tokenData?.description ??
    `${name} is actively traded on Solana. Double-click for live metrics.`;

  const athDiscount = useAth(tokenData?.mintAddress ?? slot.token_address ?? '', priceUsd);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number } }) => {
      if (info.offset.x > SWIPE_THRESHOLD) {
        trackClick(slot.id).catch(() => {});
        x.set(window.innerWidth + 200);
        setTimeout(() => onSwipeRight(tokenData), 200);
      } else if (info.offset.x < -SWIPE_THRESHOLD) {
        x.set(-window.innerWidth - 200);
        setTimeout(() => onSwipeLeft(tokenData), 200);
      } else {
        x.set(0);
      }
    },
    [x, onSwipeLeft, onSwipeRight, slot.id, tokenData],
  );

  const handleDoubleClick = useCallback(() => {
    if (isFlipping.current) return;
    isFlipping.current = true;
    setIsFlipped((prev) => {
      const next = !prev;
      onFlip?.(next);
      return next;
    });
    setTimeout(() => {
      isFlipping.current = false;
    }, 600);
  }, [onFlip]);

  const stackOffset = index * 8;
  const stackScale = 1 - index * 0.04;
  const stackOpacity = 1 - index * 0.35;

  const faceBase: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
  };

  // ─── Front content (mirrors TokenCard FrontContent) ──────────────
  const FrontContent = () => (
    <div
      className="overflow-hidden rounded-3xl bg-[#0a0a0b]"
      style={{
        width: '100%',
        height: '100%',
        boxShadow: isTop
          ? '0 4px 12px rgba(0,0,0,0.5), 0 16px 40px rgba(0,0,0,0.4), 0 32px 64px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08)'
          : '0 2px 8px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.3)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${grad.glow}, transparent 70%)`,
        }}
      />

      {/* Top-anchored disclosure — as strong as BUY pill */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-1.5 border-b border-emerald-400/20 bg-emerald-400/10 px-3 py-2.5 backdrop-blur-md">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-400">Verified · Sponsored</span>
      </div>

      <div className="relative z-10 flex h-full flex-col items-center px-7 pb-9 pt-14">

        <div
          className="mb-5 flex h-[92px] w-[92px] items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141414]"
          style={{ boxShadow: `0 0 0 1px ${grad.glow}, 0 4px 20px ${grad.glow}` }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={symbol}
              className="h-16 w-16 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span className="text-[28px] font-black" style={{ color: grad.accent }}>
              {symbol[0] || '?'}
            </span>
          )}
        </div>

        <h2 className="max-w-full truncate text-center text-[26px] font-black leading-tight tracking-[-0.02em]">
          {name}
        </h2>

        <span className="mt-1 text-[13px] font-bold uppercase tracking-[0.2em] text-white/55">
          {symbol}
        </span>

        <p className="mt-4 line-clamp-3 px-3 text-center text-sm leading-relaxed text-white/55">
          {description}
        </p>

        <div className="mt-5 flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 backdrop-blur-md">
          <span className="text-[15px] font-extrabold text-white">
            {changeVal >= 0 ? '+' : ''}
            {Math.abs(changeVal).toFixed(1)}%
          </span>
          <span className="text-[11px] font-semibold text-white/45">24h</span>
        </div>

        <div className="mt-3 text-sm font-semibold text-white/45">
          {formatPrice(priceUsd)}
        </div>

        {/* Buy/sell pressure + 1h buy volume — same as TokenCard front */}
        {tokenData &&
          (() => {
            const has1h = (tokenData.txnsBuys1h + tokenData.txnsSells1h) > 0;
            const has24h = (tokenData.txnsBuys24h + tokenData.txnsSells24h) > 0;
            let buys: number;
            let sells: number;
            let windowLabel: string;
            if (has1h) {
              buys = tokenData.txnsBuys1h;
              sells = tokenData.txnsSells1h;
              windowLabel = '1h';
            } else if (has24h) {
              buys = tokenData.txnsBuys24h;
              sells = tokenData.txnsSells24h;
              windowLabel = '24h';
            } else return null;

            const total = buys + sells;
            if (total < 5) return null;
            const buyPct = Math.round((buys / total) * 100);
            const sellPct = 100 - buyPct;
            const isBuyDominant = buyPct > sellPct;
            const isHot = buys >= 5;
            const label = isHot
              ? `${buyPct}% Buy · ${buys.toLocaleString()} txns (${windowLabel})`
              : `${buyPct}% Buy / ${sellPct}% Sell (${windowLabel})`;

            return (
              <div className={`mt-2.5 flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                  isBuyDominant
                    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400'
                    : 'border-[#E0827A]/20 bg-[#E0827A]/10 text-[#E0827A]'
                }`}
              >
                {isHot && <Flame className="h-3 w-3 shrink-0" aria-hidden="true" />}
                <span className="text-[10px] font-extrabold tracking-wide">{label}</span>
              </div>
            );
          })()}

        <div className="flex-1" />

        <div className="flex w-full items-center justify-between px-1 pb-4">
          <span className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[11px] font-bold tracking-wide text-white/35">
            <X className="h-3 w-3" aria-hidden="true" /> PASS
          </span>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-sm transition-all duration-300"
                style={{
                  width: i === 0 ? 18 : 5,
                  height: 5,
                  background: i === 0 ? COLORS.accent : 'rgba(255,255,255,0.12)',
                }}
              />
            ))}
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[12px] font-black tracking-wide text-black shadow-[0_2px_12px_rgba(255,255,255,0.12)]">
            BUY <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>

        <span className="text-[11px] font-medium text-white/35">
          Double-click for metrics
        </span>
      </div>

      <motion.div
        className="absolute right-6 top-11 rounded-xl border-2 border-[#C4B5A0]/40 bg-[#C4B5A0]/[0.06] px-6 py-2.5 backdrop-blur-md"
        style={{ opacity: buyOpacity }}
      >
        <span className="text-[22px] font-black tracking-wide text-[#C4B5A0]">BUY</span>
      </motion.div>
      <motion.div
        className="absolute left-6 top-11 rounded-xl border-2 border-[#E0827A]/40 bg-[#E0827A]/[0.06] px-6 py-2.5 backdrop-blur-md"
        style={{ opacity: passOpacity }}
      >
        <span className="text-[22px] font-black tracking-wide text-[#E0827A]">PASS</span>
      </motion.div>
    </div>
  );

  // ─── Back content (mirrors TokenCard BackContent) ────────────
  const BackContent = () => {
    const totalTxns = tokenData ? tokenData.txnsBuys24h + tokenData.txnsSells24h : 0;
    const buyPct = totalTxns > 0 ? (tokenData!.txnsBuys24h / totalTxns) * 100 : 50;
    const sellPct = 100 - buyPct;
    const pairAge = tokenData?.createdAt ? formatAge(Date.now() - tokenData.createdAt) : null;

    const changeColor = (v: number) =>
      v > 0 ? 'text-emerald-400' : v < 0 ? 'text-[#E0827A]' : 'text-white/40';

    const copyAddress = () => {
      const addr = tokenData?.mintAddress || slot.token_address || '';
      if (addr) navigator.clipboard.writeText(addr).catch(() => {});
    };

    const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
      <div className="mb-3">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-white/30">
            {title}
          </span>
          <div className="h-px flex-1 bg-white/[0.05]" />
        </div>
        {children}
      </div>
    );

    const Row = ({
      icon: Icon,
      label,
      value,
      color,
    }: {
      icon: typeof DollarSign;
      label: string;
      value: string;
      color?: string;
    }) => (
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-white/30" aria-hidden="true" />
          <span className="text-[11px] font-semibold text-white/45">{label}</span>
        </div>
        <span className={`text-[12px] font-extrabold ${color ?? 'text-white/80'}`}>{value}</span>
      </div>
    );

    return (
      <div
        className="flex h-full w-full flex-col overflow-y-auto overflow-x-hidden rounded-3xl border border-white/[0.06] bg-[#0c0c0c]"
        style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.5), 0 16px 40px rgba(0,0,0,0.4)' }}
      >
        <div className="p-4 pb-2">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#141414]">
                {logoUrl ? (
                  <img src={logoUrl} alt={symbol} className="h-6 w-6 object-contain" />
                ) : (
                  <span className="text-xs font-extrabold text-white/30">{symbol[0]}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-extrabold">{name}</div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35">
                  {symbol}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-[14px] font-black ${changeColor(changeVal)}`}>
                {tokenData ? formatPrice(priceUsd) : '-'}
              </div>
              <div className={`text-[11px] font-bold ${changeColor(changeVal)}`}>
                {tokenData ? `${changeVal >= 0 ? '+' : ''}${changeVal.toFixed(1)}%` : '-'}
              </div>
            </div>
          </div>

          {/* Verified by Cryinder badge — differentiator */}
          <div className="mb-3 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            <span className="text-[11px] font-extrabold tracking-wide text-emerald-400">
              Verified by Cryinder
            </span>
            <span className="text-[10px] font-medium text-emerald-400/60">· Sponsored</span>
          </div>
        </div>

        <div className="flex-1 space-y-0 overflow-y-auto px-4 pb-2">
          {/* Section 1: Trading Activity — same as TokenCard */}
          <Section title="Trading Activity">
            <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] px-3 py-2">
              <Row
                icon={DollarSign}
                label="24h Volume"
                value={tokenData ? formatVolume(tokenData.volume24h) : '-'}
              />
              {tokenData && totalTxns > 0 && (
                <div className="my-1">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-white/35">Buy/Sell Ratio</span>
                    <span className="text-[10px] font-bold text-white/45">
                      {tokenData.txnsBuys24h.toLocaleString()} / {tokenData.txnsSells24h.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 flex overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-l-full bg-emerald-400/60 transition-all duration-500"
                      style={{ width: `${buyPct}%` }}
                    />
                    <div
                      className="h-full rounded-r-full bg-[#E0827A]/60 transition-all duration-500"
                      style={{ width: `${sellPct}%` }}
                    />
                  </div>
                  <div className="mt-0.5 flex justify-between text-[9px] font-semibold text-white/25">
                    <span className="text-emerald-400/50">{buyPct.toFixed(0)}% buys</span>
                    <span className="text-[#E0827A]/50">{sellPct.toFixed(0)}% sells</span>
                  </div>
                </div>
              )}
              {tokenData ? (
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {[
                    { label: '5m', val: tokenData.priceChange5m },
                    { label: '1h', val: tokenData.priceChange1h },
                    { label: '6h', val: tokenData.priceChange6h },
                    { label: '24h', val: tokenData.priceChange24h },
                  ].map((c) => (
                    <div key={c.label} className="rounded-lg bg-white/[0.02] px-1 py-1.5 text-center">
                      <div className="text-[8px] font-bold text-white/30">{c.label}</div>
                      <div className={`text-[10px] font-extrabold ${changeColor(c.val)}`}>
                        {c.val >= 0 ? '+' : ''}{c.val.toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pt-1 text-center text-[11px] text-white/30">Live data loading…</div>
              )}
            </div>
          </Section>

          {/* Section 2: Token Economics — same as TokenCard */}
          <Section title="Token Economics">
            <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] px-3 py-2">
              <Row
                icon={DollarSign}
                label="Market Cap"
                value={tokenData ? formatMarketCap(tokenData.marketCap) : '-'}
              />
              <Row icon={DollarSign} label="FDV" value={tokenData ? formatMarketCap(tokenData.fdv) : '-'} />
              <Row icon={Clock} label="Pair Age" value={pairAge ?? '-'} />
            </div>
          </Section>

          {/* Section 3: Details — same as TokenCard */}
          <Section title="Details">
            <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] px-3 py-2">
              <Row icon={Store} label="DEX" value={tokenData?.dexId || '-'} />
              {tokenData?.labels && tokenData.labels.length > 0 && (
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-1.5">
                    <Info className="h-3 w-3 text-white/30" aria-hidden="true" />
                    <span className="text-[11px] font-semibold text-white/45">Labels</span>
                  </div>
                  <div className="flex gap-1">
                    {tokenData.labels.map((l) => (
                      <span
                        key={l}
                        className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-bold text-white/40"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-1.5">
                  <Copy className="h-3 w-3 text-white/30" aria-hidden="true" />
                  <span className="text-[11px] font-semibold text-white/45">Mint</span>
                </div>
                <button
                  onClick={copyAddress}
                  className="group flex items-center gap-1 text-[10px] font-bold text-white/40 transition-colors hover:text-white/70"
                >
                  <span className="max-w-[100px] truncate">
                    {tokenData?.mintAddress || slot.token_address || '-'}
                  </span>
                  <Copy className="h-2.5 w-2.5 opacity-50 group-hover:opacity-100" aria-hidden="true" />
                </button>
              </div>
              {(tokenData?.pairAddress || slot.pair_address) && (
                <a
                  href={`https://dexscreener.com/solana/${tokenData?.pairAddress || slot.pair_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between py-1 transition-colors hover:bg-white/[0.01]"
                >
                  <div className="flex items-center gap-1.5">
                    <LinkIcon className="h-3 w-3 text-white/30" aria-hidden="true" />
                    <span className="text-[11px] font-semibold text-white/45">DexScreener</span>
                  </div>
                  <span className="text-[10px] font-bold text-[#C4B5A0]/60">View</span>
                </a>
              )}
            </div>
          </Section>
        </div>

        {/* Sparkline — same as TokenCard */}
        {tokenData?.sparkline && tokenData.sparkline.length > 0 && (
          <div className="px-4 pb-2">
            <Sparkline data={tokenData.sparkline} color={COLORS.accent} width={320} height={50} />
          </div>
        )}

        <div className="shrink-0 px-4 pb-3 text-center">
          <span className="text-[10px] font-medium text-white/25">Double-click to flip back</span>
        </div>
      </div>
    );
  };

  return (
    <motion.div
      // Same model as TokenCard: stacked cards snap to their slot
      // (zero-duration) so index changes never flicker; the top card
      // springs up from its stack position into the full slot.
      initial={false}
      animate={
        isTop
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: stackOpacity, y: stackOffset, scale: stackScale }
      }
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.18 } }}
      transition={
        isTop
          ? { type: 'spring', stiffness: 380, damping: 34 }
          : { duration: 0 }
      }
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: CARD_W,
        height: CARD_H,
        zIndex: 30 - index,
        perspective: 1200,
        transformStyle: 'preserve-3d',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <motion.div
        drag={isTop ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.85}
        onDragEnd={handleDragEnd}
        whileTap={{ cursor: 'grabbing' }}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          transformStyle: 'preserve-3d',
          rotateZ: springRotate,
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        <div
          onDoubleClick={handleDoubleClick}
          role="button"
          tabIndex={isTop ? 0 : -1}
          aria-label={isFlipped ? 'Show overview' : 'Show details — flip card'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleDoubleClick();
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* FRONT */}
          <div style={{ ...faceBase, transform: 'rotateY(0deg)' }}>
            <FrontContent />
          </div>

          {/* BACK */}
          <div style={{ ...faceBase, transform: 'rotateY(180deg)' }}>
            <BackContent />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
