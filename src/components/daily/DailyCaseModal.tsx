import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, Wallet, Gift, Info, ChevronRight } from 'lucide-react';
import { DAILY_REWARDS, CASE_TIERS, RARITY_COLORS, XP_PER_CASE_OPEN, type DailyReward } from '../../data/dailyCase';
import { useDailyCase } from '../../hooks/useDailyCase';

/* ── Cryinder palette (spec §2) ─────────────────────────────────── */
const C = {
  deepest: '#070B12',
  app: '#0A101A',
  panel: '#0E1622',
  elevated: '#111C29',
  card: '#162333',
  borderSubtle: '#1B2A3A',
  borderNormal: '#263A4F',
  borderActive: '#35536D',
  blue: '#18BFFF',
  deepBlue: '#0B78C8',
  blue2: '#149FE8',
  cyan: '#52D6FF',
  cyanTech: '#5DE2FF',
  text: '#F2F7FA',
  text2: '#B9C7D3',
  muted: '#758696',
  disabled: '#526373',
};

interface DailyCaseModalProps {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  cpBalance?: number;
  onClaimed?: (reward: DailyReward) => void;
  onOpenPortfolio?: () => void;
  onOpenLootBox?: () => void;
}

/* ── CP token ───────────────────────────────────────────────────── */
function CPCoin({ size = 56, accent = C.blue, small = false }: { size?: number; accent?: string; small?: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: '50%',
        background: `radial-gradient(circle at 35% 30%, #24394F 0%, #101B28 45%, #070D15 100%)`,
        border: `2px solid ${accent}`,
        boxShadow: `0 0 0 3px rgba(24,191,255,0.08), 0 0 14px rgba(24,191,255,0.25), inset 0 0 12px rgba(24,191,255,0.15)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', inset: 5, borderRadius: '50%',
        border: '1px dashed rgba(93,226,255,0.35)',
      }} />
      <div style={{ display: 'flex', gap: 2, position: 'absolute', top: 6 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 3, height: 3, background: accent, opacity: 0.7 }} />
        ))}
      </div>
      <span style={{
        fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800,
        fontSize: small ? size * 0.28 : size * 0.32, color: '#EAF6FF',
        letterSpacing: '-0.02em', textShadow: '0 0 8px rgba(24,191,255,0.6)',
      }}>CP</span>
      <span style={{
        position: 'absolute', bottom: 7, fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 6, color: accent, letterSpacing: '0.2em', opacity: 0.8,
      }}>CRY</span>
    </div>
  );
}

/* ── Cryinder hardware case ─────────────────────────────────────── */
function CryinderCase({ active, opening, size = 200 }: { active: boolean; opening: boolean; size?: number }) {
  return (
    <div
      className={opening ? 'cry-case-vibrate' : ''}
      aria-hidden="true"
      style={{ width: size, height: size * 0.86, position: 'relative' }}
    >
      {/* radial backdrop */}
      <div style={{
        position: 'absolute', inset: -40, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(24,191,255,${active ? 0.14 : 0.07}) 0%, transparent 65%)`,
        transition: 'background 0.4s',
      }} />
      {/* dotted ring */}
      <div style={{
        position: 'absolute', inset: -18, borderRadius: 18,
        border: '1px dashed rgba(24,191,255,0.18)',
      }} />
      {/* body */}
      <div style={{
        position: 'absolute', left: '8%', right: '8%', top: '22%', bottom: '12%',
        background: 'linear-gradient(180deg, #1B2C40 0%, #111C29 55%, #0A121C 100%)',
        border: `1px solid ${active ? C.blue : C.borderNormal}`,
        borderRadius: 14,
        boxShadow: active
          ? `0 0 24px rgba(24,191,255,0.28), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -8px 16px rgba(0,0,0,0.5)`
          : `inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -8px 16px rgba(0,0,0,0.5)`,
        transition: 'border-color 0.3s, box-shadow 0.3s',
        overflow: 'hidden',
      }}>
        {/* lid seam */}
        <div style={{ position: 'absolute', top: '30%', left: 0, right: 0, height: 2, background: active ? 'rgba(24,191,255,0.5)' : 'rgba(53,83,109,0.6)' }} />
        {/* terminal indicators */}
        <div style={{ position: 'absolute', top: 10, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: active ? C.cyanTech : C.muted, letterSpacing: '0.12em' }}>CRY-01</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{
                width: 6, height: 6, borderRadius: 1,
                background: opening ? C.cyanTech : active ? C.blue : '#263A4F',
                boxShadow: active ? '0 0 6px rgba(24,191,255,0.8)' : 'none',
                opacity: opening ? (i === 1 ? 1 : 0.4) : 1,
                animation: opening ? `cry-blink 0.4s ${i * 0.1}s infinite` : 'none',
              }} />
            ))}
          </div>
        </div>
        {/* center badge */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '44%', aspectRatio: '1', borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(24,191,255,0.16), rgba(11,120,200,0.10))',
            border: `1px solid ${active ? 'rgba(24,191,255,0.55)' : 'rgba(53,83,109,0.5)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: active ? '0 0 16px rgba(24,191,255,0.25)' : 'none',
          }}>
            <Package style={{ width: '42%', height: '42%', color: active ? C.cyanTech : C.muted }} strokeWidth={1.5} />
          </div>
        </div>
        {/* bottom edge light */}
        <div style={{
          position: 'absolute', bottom: 0, left: '10%', right: '10%', height: 3, borderRadius: 2,
          background: active ? `linear-gradient(90deg, transparent, ${C.blue}, transparent)` : 'transparent',
          boxShadow: active ? '0 0 12px rgba(24,191,255,0.7)' : 'none',
        }} />
        {/* pixel details */}
        <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 3 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span key={i} style={{ width: 4, height: 4, background: i % 3 === 0 ? 'rgba(24,191,255,0.5)' : 'rgba(53,83,109,0.5)' }} />
          ))}
        </div>
      </div>
      {/* feet */}
      <div style={{ position: 'absolute', bottom: '6%', left: '14%', width: '12%', height: 8, background: '#0A121C', border: '1px solid #263A4F', borderRadius: 2 }} />
      <div style={{ position: 'absolute', bottom: '6%', right: '14%', width: '12%', height: 8, background: '#0A121C', border: '1px solid #263A4F', borderRadius: 2 }} />
    </div>
  );
}

/* ── Reward card ────────────────────────────────────────────────── */
function RewardCard({ reward, selected, dimmed }: { reward: DailyReward; selected?: boolean; dimmed?: boolean }) {
  const accent = RARITY_COLORS[reward.rarity];
  return (
    <div
      className={selected ? 'cry-breath' : ''}
      style={{
        width: 124, height: 172, borderRadius: 12, flexShrink: 0,
        background: selected ? C.elevated : C.card,
        border: `1px solid ${selected ? C.blue : C.borderSubtle}`,
        boxShadow: selected ? '0 0 22px rgba(24,191,255,0.22)' : 'none',
        transform: selected ? 'scale(1.08)' : 'scale(1)',
        transition: 'transform 0.25s, border-color 0.25s, box-shadow 0.25s',
        opacity: dimmed && !selected ? 0.55 : 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '12px 8px 10px', position: 'relative',
      }}
    >
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700,
        letterSpacing: '0.14em', color: accent,
      }}>{reward.rarity}</span>
      <div style={{ margin: '10px 0 8px' }}>
        <CPCoin size={52} accent={accent} small />
      </div>
      <span style={{ fontWeight: 800, fontSize: 17, color: C.text, letterSpacing: '-0.01em' }}>{reward.label}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: C.muted, marginTop: 4 }}>
        {reward.chancePct}% DROP
      </span>
    </div>
  );
}

/* ── Main modal ─────────────────────────────────────────────────── */
export default function DailyCaseModal({
  open, onClose, userId, cpBalance = 0, onClaimed, onOpenPortfolio, onOpenLootBox,
}: DailyCaseModalProps) {
  const dc = useDailyCase(userId);
  const [phase, setPhase] = useState<'idle' | 'opening' | 'reveal'>('idle');
  const [strip, setStrip] = useState<DailyReward[]>(DAILY_REWARDS);
  const [winner, setWinner] = useState<DailyReward | null>(null);
  const [centerIndex, setCenterIndex] = useState(3);
  const [caseActive, setCaseActive] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  useEffect(() => {
    if (!open) {
      timers.current.forEach(clearTimeout); timers.current = [];
      setPhase('idle'); setWinner(null); setCaseActive(false);
      setStrip(DAILY_REWARDS); setCenterIndex(3);
      dc.resetDemo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase === 'idle') onClose(); };
    window.addEventListener('keydown', h);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', h); };
  }, [open, phase, onClose]);

  const statusLabel = dc.status === 'cooldown' ? 'NEXT CASE' : dc.status === 'revealed' || phase === 'reveal' ? 'REWARD UNLOCKED' : dc.status === 'opening' || phase === 'opening' ? 'OPENING...' : 'READY';
  const currentTier = CASE_TIERS[dc.currentTierIndex];
  const nextTier = CASE_TIERS[dc.nextTierIndex];

  const startOpen = useCallback((demo = false) => {
    if (phase === 'opening' || phase === 'reveal') return;
    if (!demo && dc.status === 'cooldown') return;
    const reward = dc.openCase(demo);
    if (!reward) return;

    // build strip: ~44 cards, winner locked at fixed index
    const pool = [...DAILY_REWARDS];
    const len = 44;
    const arr: DailyReward[] = [];
    for (let i = 0; i < len; i++) arr.push(pool[Math.floor(Math.random() * pool.length)]);
    const winIdx = len - 4;
    arr[winIdx] = reward;
    setStrip(arr);
    setWinner(reward);
    setCenterIndex(winIdx);
    setPhase('opening');
    setCaseActive(true);

    // reset position instantly
    requestAnimationFrame(() => {
      if (trackRef.current) {
        trackRef.current.style.transition = 'none';
        trackRef.current.style.transform = 'translateX(0px)';
      }
      // 0–300ms case activation, then accelerate
      later(() => {
        if (!trackRef.current || !viewportRef.current) return;
        const cardW = 124 + 12; // card + gap
        const trackPad = 24; // must match track padding '0 24px'
        const vpW = viewportRef.current.offsetWidth;
        const target = -(trackPad + winIdx * cardW + 124 / 2 - vpW / 2);
        // 3900ms lock per spec (700-2200 fast, 2200-3500 decel, 3500-3900 lock)
        trackRef.current.style.transition = 'transform 3.6s cubic-bezier(0.12, 0.8, 0.08, 1)';
        trackRef.current.style.transform = `translateX(${target}px)`;
      }, 320);
      later(() => setPhase('reveal'), 4300);
      later(() => setCaseActive(false), 4400);
    });
  }, [phase, dc, later]);

  const handleContinue = useCallback(() => {
    if (winner && !dc.demoMode) onClaimed?.(winner);
    dc.confirmReward();
    setPhase('idle');
    setWinner(null);
    setStrip(DAILY_REWARDS);
    setCenterIndex(3);
    if (dc.status === 'cooldown' || true) {
      // close after claim so updated CP is visible; keep open on demo
      if (!dc.demoMode) onClose();
    }
  }, [winner, dc, onClaimed, onClose]);

  const demoCount = useMemo(() => DAILY_REWARDS.length, []);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={() => { if (phase === 'idle') onClose(); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(4,7,12,0.72)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '4vw',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 8 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog" aria-modal="true" aria-label="Cryinder Daily Case"
          className="cry-modal-scroll"
          style={{
            width: '88vw', maxWidth: 1280, maxHeight: '92vh', overflowY: 'auto',
            background: C.panel, border: `1px solid ${C.borderSubtle}`,
            borderRadius: 18, position: 'relative',
          }}
        >
          {/* technical grid bg */}
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 18,
            backgroundImage: 'linear-gradient(rgba(24,80,120,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(24,80,120,0.06) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse at 50% 0%, black 55%, transparent 100%)',
          }} />

          <div style={{ position: 'relative', padding: '20px 24px 24px' }}>
            {/* ── top progression header ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 250, flex: '1 1 280px' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: C.card, border: `1px solid ${C.borderNormal}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Package size={20} style={{ color: C.blue }} strokeWidth={1.75} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.08em', color: C.text2, fontWeight: 600 }}>
                    NEXT CASE PROGRESSION
                  </div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.muted, marginTop: 4 }}>
                    <span style={{ color: C.text, fontWeight: 700 }}>{dc.xp.toLocaleString()} XP</span> / {nextTier.xpRequired.toLocaleString()} XP
                  </div>
                  <div style={{ marginTop: 8, height: 8, borderRadius: 99, background: C.card, overflow: 'hidden', border: `1px solid ${C.borderSubtle}` }}>
                    <div style={{
                      width: `${Math.round(dc.xpPct * 100)}%`, height: '100%',
                      background: `linear-gradient(90deg, ${C.deepBlue}, ${C.blue})`,
                      boxShadow: '0 0 8px rgba(24,191,255,0.5)',
                      borderRadius: 99, transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.muted }}>CURRENT: {currentTier.name}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.blue }}>NEXT: {nextTier.name}</span>
                  </div>
                </div>
              </div>

              {/* tier chain */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '1 1 320px', justifyContent: 'center', flexWrap: 'wrap', paddingTop: 6 }}>
                {CASE_TIERS.map((t, i) => {
                  const done = i < dc.currentTierIndex;
                  const cur = i === dc.currentTierIndex;
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 56 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 8,
                          background: cur ? 'rgba(24,191,255,0.14)' : C.card,
                          border: `1px solid ${cur ? C.blue : done ? '#2A4A66' : C.borderSubtle}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: cur ? '0 0 12px rgba(24,191,255,0.3)' : 'none',
                        }}>
                          <Package size={14} style={{ color: cur ? C.cyanTech : done ? '#6FA8CF' : '#3A4E63' }} />
                        </div>
                        <span style={{
                          fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                          color: cur ? C.blue : done ? '#6FA8CF' : C.disabled,
                        }}>{t.name}</span>
                      </div>
                      {i < CASE_TIERS.length - 1 && (
                        <span style={{ color: C.borderActive, fontSize: 12, marginBottom: 18 }}>→</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={onClose} aria-label="Close daily case"
                style={{
                  width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                  background: C.card, border: `1px solid ${C.borderNormal}`,
                  color: C.text2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#1C2E42'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = C.card; }}
              >
                <X size={15} />
              </button>
            </div>

            {/* ── hero ── */}
            <div className="cry-hero" style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 420px) 1fr', gap: 28, marginTop: 22, alignItems: 'center' }}>
              <div style={{
                background: `radial-gradient(ellipse at 50% 40%, rgba(24,191,255,0.06), transparent 70%), ${C.app}`,
                border: `1px solid ${C.borderSubtle}`, borderRadius: 14,
                padding: '28px 20px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                position: 'relative', overflow: 'hidden',
              }}>
                <div aria-hidden="true" style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: 'radial-gradient(rgba(24,191,255,0.16) 1px, transparent 1px)',
                  backgroundSize: '14px 14px', opacity: 0.25,
                }} />
                <CryinderCase active={dc.status !== 'cooldown' || phase !== 'idle'} opening={phase === 'opening'} size={210} />
                <div style={{ marginTop: 14, textAlign: 'center', position: 'relative' }}>
                  <div style={{
                    fontSize: 13, fontWeight: 800, letterSpacing: '0.18em',
                    color: statusLabel === 'READY' ? C.blue : statusLabel === 'REWARD UNLOCKED' ? C.cyanTech : C.text2,
                  }}>{statusLabel}</div>
                  {dc.status === 'cooldown' && phase === 'idle' ? (
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 700, color: C.text, marginTop: 4, letterSpacing: '0.04em' }}>
                      {dc.cooldownText}
                    </div>
                  ) : phase === 'idle' && (
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.muted, marginTop: 4 }}>
                      CASE_ID: {dc.caseId} · STATUS: READY
                    </div>
                  )}
                  {(phase === 'opening' || phase === 'reveal') && winner && (
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.blue, marginTop: 4 }}>
                      DROP_TABLE: ACTIVE · LOCKING…
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: C.blue }}>DAILY CASE</div>
                <h2 style={{
                  fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800,
                  fontSize: 'clamp(34px, 4.5vw, 52px)', lineHeight: 1.02, color: C.text,
                  letterSpacing: '-0.02em', margin: '8px 0 0',
                }}>
                  CRYINDER <span style={{ color: C.blue }}>//</span> {currentTier.name}
                </h2>
                <p style={{ color: C.text2, fontSize: 14, marginTop: 10, maxWidth: 520 }}>
                  Open your daily reward and continue your Cryinder progression. All rewards are internal <strong style={{ color: C.text }}>Cryinder Points (CP)</strong> — no crypto, no memecoins.
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => startOpen(false)}
                    disabled={phase !== 'idle' || dc.status === 'cooldown'}
                    style={{
                      height: 50, padding: '0 28px', borderRadius: 9,
                      background: phase !== 'idle' || dc.status === 'cooldown' ? '#15222F' : C.blue,
                      color: phase !== 'idle' || dc.status === 'cooldown' ? C.disabled : '#041018',
                      fontWeight: 800, fontSize: 14, letterSpacing: '0.02em',
                      border: 'none', cursor: phase !== 'idle' || dc.status === 'cooldown' ? 'not-allowed' : 'pointer',
                      boxShadow: phase === 'idle' && dc.status !== 'cooldown' ? '0 0 18px rgba(24,191,255,0.25)' : 'none',
                      fontFamily: "'Space Grotesk', sans-serif",
                    }}
                  >
                    {dc.status === 'cooldown' && phase === 'idle' ? 'LOCKED' : phase === 'opening' ? 'OPENING…' : '> OPEN FREE CASE'}
                  </button>
                  <button
                    onClick={() => startOpen(true)}
                    disabled={phase !== 'idle'}
                    style={{
                      height: 50, padding: '0 22px', borderRadius: 9,
                      background: 'transparent', color: C.text2,
                      border: `1px solid ${C.borderNormal}`, fontWeight: 700, fontSize: 13,
                      cursor: phase !== 'idle' ? 'not-allowed' : 'pointer',
                      opacity: phase !== 'idle' ? 0.5 : 1,
                    }}
                  >
                    DEMO
                  </button>
                </div>
                <div style={{
                  display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap',
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.muted,
                }}>
                  <span>CASE_ID: {dc.caseId}</span>
                  <span>REWARD_POOL: {demoCount.toString().padStart(2, '0')} ITEMS</span>
                  <span>NEXT_RESET: {dc.status === 'cooldown' ? dc.cooldownText : '23:59:48'}</span>
                  <span>BALANCE: {cpBalance.toLocaleString()} CP</span>
                </div>
              </div>
            </div>

            {/* ── carousel ── */}
            <div style={{ marginTop: 26 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: C.text2, fontWeight: 600 }}>
                  REWARD CAROUSEL
                </span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.muted }}>
                  {phase === 'opening' ? 'ROLLING…' : phase === 'reveal' && winner ? `LOCKED: ${winner.label}` : '08 OUTCOMES · CP ONLY'}
                </span>
              </div>
              <div
                ref={viewportRef}
                style={{
                  position: 'relative', overflow: 'hidden',
                  background: C.app, border: `1px solid ${C.borderSubtle}`,
                  borderRadius: 14, padding: '22px 0',
                }}
              >
                {/* center marker — sized to the selected card (124px @ 1.08 scale) */}
                <div aria-hidden="true" style={{
                  position: 'absolute', top: 8, bottom: 8, left: '50%', width: 136,
                  transform: 'translateX(-50%)', border: `1px solid rgba(24,191,255,0.35)`,
                  borderRadius: 12, pointerEvents: 'none', zIndex: 5,
                  boxShadow: '0 0 18px rgba(24,191,255,0.12)',
                }} />
                <div aria-hidden="true" style={{
                  position: 'absolute', top: 0, left: '50%', width: 2, height: 10,
                  background: C.blue, transform: 'translateX(-50%)', zIndex: 6, borderRadius: 2,
                }} />
                <div aria-hidden="true" style={{
                  position: 'absolute', bottom: 0, left: '50%', width: 2, height: 10,
                  background: C.blue, transform: 'translateX(-50%)', zIndex: 6, borderRadius: 2,
                }} />
                <div
                  ref={trackRef}
                  style={{ display: 'flex', gap: 12, padding: '0 24px', width: 'max-content', willChange: 'transform' }}
                >
                  {(phase === 'idle' ? DAILY_REWARDS : strip).map((r, i) => (
                    <RewardCard
                      key={`${r.id}-${i}`}
                      reward={r}
                      selected={phase === 'reveal' ? i === centerIndex : phase === 'idle' ? i === centerIndex : false}
                      dimmed={phase === 'reveal'}
                    />
                  ))}
                </div>
                {/* edge fades */}
                <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 70, background: `linear-gradient(90deg, ${C.app}, transparent)`, pointerEvents: 'none' }} />
                <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 70, background: `linear-gradient(-90deg, ${C.app}, transparent)`, pointerEvents: 'none' }} />
              </div>

              {/* reveal panel */}
              <AnimatePresence>
                {phase === 'reveal' && winner && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{
                      marginTop: 14, background: C.elevated,
                      border: `1px solid ${RARITY_COLORS[winner.rarity]}`,
                      borderRadius: 14, padding: '20px 22px',
                      display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
                    }}
                  >
                    <CPCoin size={64} accent={RARITY_COLORS[winner.rarity]} />
                    <div style={{ flex: '1 1 200px' }}>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.16em', color: RARITY_COLORS[winner.rarity], fontWeight: 700 }}>
                        REWARD UNLOCKED{dc.demoMode ? ' · DEMO — NO CREDIT' : ''}
                      </div>
                      <div style={{ fontSize: 30, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', fontFamily: "'Space Grotesk', sans-serif" }}>
                        {winner.label}
                      </div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {winner.rarity} · +{XP_PER_CASE_OPEN.toLocaleString()} XP{dc.demoMode ? '' : ' · CREDITED ON CONTINUE'}
                      </div>
                    </div>
                    <button
                      onClick={handleContinue}
                      style={{
                        height: 48, padding: '0 30px', borderRadius: 9,
                        background: C.blue, color: '#041018', fontWeight: 800, fontSize: 14,
                        border: 'none', cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      CONTINUE
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── potential rewards ── */}
            <div style={{ marginTop: 26 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', color: C.text }}>POTENTIAL REWARDS</span>
                <Info size={13} style={{ color: C.muted }} />
                <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.muted }} className="cry-hide-mobile">
                  Progress through cases to unlock higher reward tiers.
                </span>
              </div>
              <div className="cry-reward-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
                {DAILY_REWARDS.map((r) => {
                  const accent = RARITY_COLORS[r.rarity];
                  return (
                    <div key={r.id} style={{
                      height: 80, background: C.card, border: `1px solid ${C.borderSubtle}`,
                      borderLeft: `3px solid ${accent}`, borderRadius: 10,
                      display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px',
                      transition: 'border-color 0.2s, transform 0.2s',
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = accent; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = C.borderSubtle; }}
                    >
                      <CPCoin size={40} accent={accent} small />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{r.label}</div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: accent, fontWeight: 700, letterSpacing: '0.08em' }}>
                          {r.rarity} <span style={{ color: C.muted, fontWeight: 400 }}>· {r.chancePct}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── portfolio + lootbox cross-links ── */}
            <div style={{
              marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap',
              borderTop: `1px solid ${C.borderSubtle}`, paddingTop: 16,
            }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.muted, letterSpacing: '0.1em', alignSelf: 'center' }}>
                SYS://
              </span>
              {onOpenPortfolio && (
                <button
                  onClick={() => { onClose(); onOpenPortfolio(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: C.card, border: `1px solid ${C.borderNormal}`, color: C.text2,
                    borderRadius: 9, padding: '10px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  <Wallet size={14} /> View Portfolio <ChevronRight size={13} />
                </button>
              )}
              {onOpenLootBox && (
                <button
                  onClick={() => { onClose(); onOpenLootBox(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: C.card, border: `1px solid ${C.borderNormal}`, color: C.text2,
                    borderRadius: 9, padding: '10px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  <Gift size={14} /> Open Lootboxes <ChevronRight size={13} />
                </button>
              )}
              <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.disabled, alignSelf: 'center' }}>
                DROP_TABLE: ACTIVE · CP ONLY · NO CRYPTO
              </span>
            </div>
          </div>

          <style>{`
            .cry-modal-scroll::-webkit-scrollbar { width: 8px; }
            .cry-modal-scroll::-webkit-scrollbar-thumb { background: #263A4F; border-radius: 8px; }
            @keyframes cry-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
            @keyframes cry-vibrate {
              0%,100% { transform: translate(0,0) rotate(0); }
              20% { transform: translate(-1.5px,1px) rotate(-0.6deg); }
              40% { transform: translate(1.5px,-1px) rotate(0.6deg); }
              60% { transform: translate(-1px,-1px) rotate(-0.4deg); }
              80% { transform: translate(1px,1px) rotate(0.4deg); }
            }
            .cry-case-vibrate { animation: cry-vibrate 0.32s linear infinite; }
            @keyframes cry-breathe { 0%,100% { box-shadow: 0 0 18px rgba(24,191,255,0.20); } 50% { box-shadow: 0 0 28px rgba(24,191,255,0.32); } }
            .cry-breath { animation: cry-breathe 2.2s ease-in-out infinite; }
            @media (max-width: 900px) {
              .cry-hero { grid-template-columns: 1fr !important; }
              .cry-reward-grid { grid-template-columns: repeat(3, 1fr) !important; }
              .cry-hide-mobile { display: none; }
            }
            @media (max-width: 600px) {
              .cry-reward-grid { grid-template-columns: repeat(2, 1fr) !important; }
            }
          `}</style>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
