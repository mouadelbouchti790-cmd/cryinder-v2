import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Coins, Diamond, Flame, Gem, Dices } from 'lucide-react';
import type { LootBoxResult, LootTierConfig } from '../services/pocketbase';
import { LOOT_TIERS, getTierConfig } from '../services/pocketbase';
import { useLootBoxSounds } from '../hooks/useLootBox';

interface RevealAnimationProps {
  result: LootBoxResult;
  onComplete?: () => void;
  static?: boolean;
}

type RevealPhase = 'spinning' | 'landed';

const SPIN_MS = 1400;

const TIER_ICONS: Record<LootTierConfig['icon'], typeof Coins> = {
  coin: Coins,
  diamond: Diamond,
  flame: Flame,
  gem: Gem,
  slot: Dices,
};

function TierIcon({ icon, size }: { icon: LootTierConfig['icon']; size: number }) {
  const Icon = TIER_ICONS[icon];
  return <Icon size={size} aria-hidden="true" />;
}

export default function RevealAnimation({ result, onComplete, static: isStatic = false }: RevealAnimationProps) {
  const [phase, setPhase] = useState<RevealPhase>(isStatic ? 'landed' : 'spinning');
  const [tick, setTick] = useState(0);
  const tier = getTierConfig(result.tier);
  const { play, stop } = useLootBoxSounds();

  useEffect(() => {
    if (isStatic || phase !== 'spinning') return;

    play('spin');

    const fastInterval = setInterval(() => setTick((t) => t + 1), 70);
    const stopTimer = setTimeout(() => {
      clearInterval(fastInterval);
      stop('spin');
      play('coins');
      setPhase('landed');
      onComplete?.();
    }, SPIN_MS);

    return () => {
      clearInterval(fastInterval);
      clearTimeout(stopTimer);
      stop('spin');
    };
  }, [isStatic, phase, onComplete, play, stop]);

  const cycledTier = LOOT_TIERS[tick % LOOT_TIERS.length];
  const displayTier = phase === 'spinning' ? cycledTier : tier;

  return (
    <div className="flex w-full flex-col items-center">
      <div
        className="mb-4 flex h-9 items-center justify-center rounded-lg px-4"
        style={{ border: '1px solid #263A4F', background: '#111C29' }}
      >
        <motion.div
          key={`${phase}-${displayTier.tier}`}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.08 }}
          className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.14em] uppercase"
          style={{ color: displayTier.color }}
        >
          <TierIcon icon={displayTier.icon} size={13} />
          {displayTier.label}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={phase === 'landed' ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.97 }}
        transition={phase === 'landed' ? { duration: 0.25, ease: 'easeOut' } : { duration: 0.15 }}
        className="relative w-full rounded-xl border p-5 text-center"
        style={{ borderColor: '#263A4F', background: '#0A101A' }}
      >
        <div className="relative">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={phase === 'landed' ? { scale: 1, opacity: 1 } : { scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="mb-2 flex justify-center"
            style={{ color: tier.color }}
          >
            <TierIcon icon={tier.icon} size={36} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={phase === 'landed' ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ delay: phase === 'landed' ? 0.2 : 0, duration: 0.3 }}
          >
            <div className="font-mono text-[10px] font-bold tracking-[0.18em]" style={{ color: tier.color }}>
              REWARD UNLOCKED
            </div>
            <div className="mt-1 text-4xl font-black tracking-[-0.03em] text-white">
              +{result.awardedCP.toLocaleString()} CP
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={phase === 'landed' ? { opacity: 1 } : { opacity: 0 }}
            transition={{ delay: phase === 'landed' ? 0.4 : 0 }}
            className="mt-2 font-mono text-[11px] text-white/40"
          >
            BASE {result.baseReward.toLocaleString()} CP
            {result.bonusReward > 0 && (
              <span>
                {' '}· +{result.bonusReward.toLocaleString()} CP STREAK ({result.streakMultiplier}x)
              </span>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
