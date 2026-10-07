import { motion } from 'framer-motion';
import { Gift } from 'lucide-react';
import { useLootBox } from '../hooks/useLootBox';

interface LootBoxNavButtonProps {
  onClick: () => void;
  active: boolean;
  userId: string | null;
}

export default function LootBoxNavButton({ onClick, active, userId }: LootBoxNavButtonProps) {
  const { available, streak } = useLootBox(userId);

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      aria-label="Loot Box"
      className={`relative flex min-h-[48px] min-w-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-3 transition-colors ${
        active ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
      }`}
    >
      {available && (
        <motion.div
          animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.12, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute -inset-1 rounded-2xl"
          style={{
            border: '2px solid rgba(24, 191, 255, 0.4)',
            boxShadow: '0 0 12px rgba(24, 191, 255, 0.5), inset 0 0 12px rgba(24, 191, 255, 0.3)',
          }}
        />
      )}

      <Gift
        className="h-5 w-5"
        style={{ color: available ? '#18BFFF' : active ? '#fff' : 'rgba(255,255,255,0.35)' }}
        aria-hidden="true"
      />

      {streak > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white"
          style={{
            background: '#18BFFF',
            boxShadow: '0 0 8px rgba(24, 191, 255, 0.5)',
          }}
        >
          {streak}
        </motion.span>
      )}

      <span className={`text-[11px] font-semibold ${active ? 'text-white' : 'text-white/35'}`}>
        Box
      </span>
    </motion.button>
  );
}
