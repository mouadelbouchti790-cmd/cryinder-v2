import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Flame, X, Coins, Diamond, Gem, Dices, TrendingUp } from 'lucide-react';
import type { LootBoxResult, LootTierConfig } from '../services/pocketbase';
import { LOOT_TIERS, getTierConfig, getBoxCost } from '../services/pocketbase';
import { useLootBox } from '../hooks/useLootBox';
import LootBoxDisplay from './LootBoxDisplay';
import RevealAnimation from './RevealAnimation';

const TIER_ICONS: Record<LootTierConfig['icon'], typeof Coins> = {
  coin: Coins,
  diamond: Diamond,
  flame: Flame,
  gem: Gem,
  slot: Dices,
};

interface LootBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  onPointsUpdated?: () => void;
}

type Phase = 'idle' | 'shaking' | 'opening' | 'reveal' | 'result';

const SHAKE_MS = 1400;
const OPEN_MS = 900;

export default function LootBoxModal({ isOpen, onClose, userId, onPointsUpdated }: LootBoxModalProps) {
  const {
    available,
    streak,
    totalOpened,
    cooldownHours,
    cooldownMinutes,
    history,
    loading,
    error,
    open,
    boxCost,
    balance,
  } = useLootBox(userId);

  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<LootBoxResult | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPhase('idle');
        setResult(null);
        setOpenError(null);
        onClose();
        return;
      }
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
    const timer = window.setTimeout(() => closeBtnRef.current?.focus(), 50);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
      window.clearTimeout(timer);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  const canAfford = balance >= boxCost;

  const handleOpen = useCallback(async () => {
    if (!available || phase !== 'idle' || !canAfford) return;

    setPhase('shaking');
    setOpenError(null);

    const res = await open();

    if (!res) {
      setPhase('idle');
      setOpenError('Failed to open box. Try again.');
      return;
    }

    window.setTimeout(() => {
      setPhase('opening');

      window.setTimeout(() => {
        setResult(res);
        setPhase('reveal');
        onPointsUpdated?.();
      }, OPEN_MS);
    }, Math.max(0, SHAKE_MS));
  }, [available, phase, canAfford, open, onPointsUpdated]);

  const handleRevealComplete = useCallback(() => {
    setPhase('result');
  }, []);

  const handleClose = useCallback(() => {
    setPhase('idle');
    setResult(null);
    setOpenError(null);
    onClose();
  }, [onClose]);

  const multiplier =
    streak >= 15 ? 10 : Math.round((1 + ((Math.max(streak, 1) - 1) / 14) * 9) * 10) / 10;

  const cooldownText =
    cooldownHours > 0 ? `${cooldownHours}h ${cooldownMinutes}m` : `${cooldownMinutes}m`;

  const streakPct = Math.min(streak / 15, 1);

  const displayTier = result ? getTierConfig(result.tier) : getTierConfig('common');

  const nextCost = getBoxCost(totalOpened + 1);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(10, 11, 16, 0.92)', backdropFilter: 'blur(12px)' }}
        >
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Loot Box"
            className="relative w-full max-w-[420px] overflow-hidden rounded-2xl"
            style={{
              background: '#0E1622',
              border: '1px solid #1B2A3A',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              aria-hidden="true"
              style={{
                backgroundImage: 'linear-gradient(rgba(24,80,120,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(24,80,120,0.05) 1px, transparent 1px)',
                backgroundSize: '32px 32px',
                maskImage: 'radial-gradient(ellipse at 50% 0%, black 40%, transparent 90%)',
              }}
            />

            <div className="relative z-10 flex items-center justify-between px-5 pt-5">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ background: 'rgba(24, 191, 255, 0.15)', border: '1px solid rgba(24, 191, 255, 0.25)' }}
                >
                  <Gift className="h-5 w-5" style={{ color: '#18BFFF' }} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-[-0.02em] text-white">Cryinder Box</h2>
                  <span className="text-[11px] font-semibold" style={{ color: 'rgba(24, 191, 255, 0.6)' }}>In-App Utility Points</span>
                </div>
              </div>

              <button
                ref={closeBtnRef}
                onClick={handleClose}
                aria-label="Close loot box"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white/50 transition-colors hover:text-white/85"
                style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' }}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="relative z-10 mx-5 mt-4 flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" style={{ color: '#18BFFF' }} />
                <span className="text-[12px] font-bold text-white/60">Cost</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black tabular-nums" style={{ color: '#18BFFF' }}>{boxCost.toLocaleString()}</span>
                <span className="text-[11px] font-extrabold" style={{ color: 'rgba(24, 191, 255, 0.5)' }}>CP</span>
              </div>
            </div>

            <div className="relative z-10 px-5 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-bold text-white/80">
                  <Flame className="h-4 w-4" style={{ color: '#E05263' }} aria-hidden="true" />
                  {streak} day{streak !== 1 ? 's' : ''}
                </span>
                <span className="text-xs font-black" style={{ color: '#52D6FF' }}>{multiplier}x bonus</span>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${streakPct * 100}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #0B78C8, #18BFFF)' }}
                />
              </div>

              <div className="mt-1 flex justify-between text-[10px] font-bold text-white/25">
                <span>1x</span>
                <span>10x</span>
              </div>
            </div>

            <div className="relative z-10 flex flex-col items-center px-5 pb-6 pt-4">
              <AnimatePresence mode="wait">
                {phase === 'idle' && (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex w-full flex-col items-center"
                  >
                    <LootBoxDisplay phase="idle" available={available && canAfford} accent="#18BFFF" />

                    {error || openError ? (
                      <div className="mb-3 mt-2 text-center text-[13px] font-semibold text-red-400">
                        {error || openError}
                      </div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-1 text-center"
                      >
                        {!available ? (
                          <div className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-white/30">
                            Available in {cooldownText}
                          </div>
                        ) : !canAfford ? (
                          <div className="text-[13px] font-extrabold uppercase tracking-[0.14em]" style={{ color: '#E05263' }}>
                            Need {boxCost} CP
                          </div>
                        ) : (
                          <div className="text-[13px] font-extrabold uppercase tracking-[0.14em] animate-pulse" style={{ color: '#18BFFF' }}>
                            Ready to open
                          </div>
                        )}
                      </motion.div>
                    )}

                    <div className="mt-3 w-full rounded-2xl px-3 py-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-[0.15em] text-white/25">Reward Tiers</div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {LOOT_TIERS.map((t) => {
                          const TierGlyph = TIER_ICONS[t.icon];
                          return (
                            <div
                              key={t.tier}
                              className="flex flex-col items-center rounded-xl py-2 px-1"
                              style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${t.color}15` }}
                              title={`${t.label}: ${t.minReward.toLocaleString()}-${t.maxReward.toLocaleString()} CP (${t.chancePct}%)`}
                            >
                              <TierGlyph size={16} style={{ color: t.color }} aria-hidden="true" />
                              <span className="mt-1 text-[9px] font-black" style={{ color: t.color }}>{t.label}</span>
                              <span className="text-[8px] font-bold text-white/30">{t.chancePct}%</span>
                              <span className="mt-0.5 text-[8px] font-bold tabular-nums text-white/40">{t.minReward}+</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <motion.button
                      whileHover={available && canAfford ? { scale: 1.03 } : {}}
                      whileTap={available && canAfford ? { scale: 0.96 } : {}}
                      onClick={handleOpen}
                      disabled={!available || !canAfford || phase !== 'idle' || loading}
                      className="mt-4 w-full rounded-2xl px-10 py-4 text-base font-black tracking-[-0.01em] transition-all disabled:cursor-not-allowed"
                      style={{
                        background: available && canAfford
                          ? '#18BFFF'
                          : 'rgba(255,255,255,0.04)',
                        color: available && canAfford ? '#041018' : 'rgba(255,255,255,0.15)',
                        boxShadow: 'none',
                        border: '1px solid #1B2A3A',
                      }}
                    >
                      {available ? (canAfford ? `Open for ${boxCost} CP` : `Need ${boxCost} CP`) : `${cooldownText} remaining`}
                    </motion.button>

                    <div className="mt-3 flex w-full items-center justify-between px-2 text-[11px]">
                      <span className="text-white/25">
                        Opened <strong className="tabular-nums text-white/50">{totalOpened}</strong>
                      </span>
                      <button
                        onClick={() => {
                          handleClose();
                          window.dispatchEvent(new CustomEvent('cryinder:open-daily-case'));
                        }}
                        className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#18BFFF]/80 hover:text-[#18BFFF]"
                      >
                        Daily Case →
                      </button>
                      <span className="text-white/25">
                        Next <strong className="tabular-nums" style={{ color: '#18BFFF' }}>{nextCost} CP</strong>
                      </span>
                    </div>

                    <div className="mt-2 flex w-full items-center justify-center px-2 text-[11px]">
                      <span className="text-white/25">
                        Balance <strong className="tabular-nums" style={{ color: '#52D6FF' }}>{balance.toLocaleString()} CP</strong>
                      </span>
                    </div>
                    {history.length > 0 && (
                      <div className="mt-3 flex w-full gap-1.5">
                        {history.slice(0, 5).map((h) => {
                          const tierCfg = LOOT_TIERS.find(t => t.tier === h.source) || LOOT_TIERS[0];
                          return (
                            <div
                              key={h.id}
                              className="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-center"
                              style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${tierCfg.color}20` }}
                            >
                              <div className="text-[11px] font-black tabular-nums" style={{ color: tierCfg.color }}>
                                +{h.amount >= 1000 ? `${(h.amount / 1000).toFixed(1)}k` : h.amount}
                              </div>
                              <div className="text-[8px] font-bold text-white/25">CP</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}

                {phase === 'shaking' && (
                  <motion.div
                    key="shaking"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center py-4"
                  >
                    <LootBoxDisplay phase="shaking" available={true} accent="#18BFFF" size={110} />
                    <motion.div
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                      className="mt-6 text-sm font-black"
                      style={{ color: '#52D6FF' }}
                    >
                      Shaking...
                    </motion.div>
                  </motion.div>
                )}

                {phase === 'opening' && (
                  <motion.div
                    key="opening"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center py-4"
                  >
                    <LootBoxDisplay phase="opening" available={true} accent="#52D6FF" size={110} />
                    <motion.div
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                      className="mt-6 text-sm font-black"
                      style={{ color: '#18BFFF' }}
                    >
                      Opening...
                    </motion.div>
                  </motion.div>
                )}

                {phase === 'reveal' && result && (
                  <motion.div
                    key="reveal"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex w-full flex-col items-center py-2"
                  >
                    <RevealAnimation result={result} onComplete={handleRevealComplete} />
                  </motion.div>
                )}

                {phase === 'result' && result && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className="flex w-full flex-col items-center"
                  >
                    <RevealAnimation result={result} static />

                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="mt-4 w-full rounded-2xl p-4"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div className="mb-1.5 flex justify-between text-[13px] text-white/50">
                        <span>Base reward</span>
                        <span className="font-bold text-white">
                          {result.baseReward.toLocaleString()} CP
                        </span>
                      </div>
                      <div className="mb-1.5 flex justify-between text-[13px] text-white/50">
                        <span>Box cost</span>
                        <span className="font-bold" style={{ color: '#E05263' }}>
                          -{result.boxCost?.toLocaleString() ?? boxCost} CP
                        </span>
                      </div>
                      {result.bonusReward > 0 && (
                        <div className="mb-1.5 flex justify-between text-[13px] text-white/50">
                          <span>Streak bonus ({result.streakMultiplier}x)</span>
                          <span className="font-bold" style={{ color: displayTier.color }}>
                            +{result.bonusReward.toLocaleString()} CP
                          </span>
                        </div>
                      )}
                      <div className="my-2 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                      <div className="flex justify-between text-sm">
                        <span className="font-extrabold text-white">Net CP</span>
                        <span className="font-black" style={{ color: displayTier.color }}>
                          {result.awardedCP.toLocaleString()} CP
                        </span>
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="mt-4 text-center"
                    >
                      <span className="inline-flex items-center gap-1.5 text-sm text-white/50">
                        <Flame className="h-4 w-4" style={{ color: '#E05263' }} aria-hidden="true" />
                        {result.streak} day streak · {result.streakMultiplier}x bonus
                      </span>
                    </motion.div>

                    <motion.button
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={handleClose}
                      className="mt-5 w-full rounded-xl px-10 py-3.5 text-base font-black tracking-[-0.01em]"
                      style={{
                        background: '#18BFFF',
                        color: '#041018',
                        border: '1px solid #18BFFF',
                        boxShadow: 'none',
                      }}
                    >
                      Claim
                    </motion.button>

                    <div className="mt-3 text-xs text-white/25">
                      Total opened:{' '}
                      <strong className="text-white/40">{result.totalOpened}</strong>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
