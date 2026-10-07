import { motion } from 'framer-motion';
import { Package } from 'lucide-react';
import { useDailyCase } from '../../hooks/useDailyCase';

interface DailyCaseNavButtonProps {
  onClick: () => void;
  userId: string | null;
}

/** Footer nav entry — blue accent when the daily case is claimable. */
export default function DailyCaseNavButton({ onClick, userId }: DailyCaseNavButtonProps) {
  const { status } = useDailyCase(userId);
  const ready = status === 'available';

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      aria-label="Daily Case"
      className="relative flex min-h-[48px] min-w-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-3 transition-colors hover:bg-white/[0.02]"
    >
      {ready && (
        <motion.div
          animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.12, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute -inset-1 rounded-2xl"
          style={{
            border: '2px solid rgba(24,191,255,0.45)',
            boxShadow: '0 0 12px rgba(24,191,255,0.5), inset 0 0 12px rgba(24,191,255,0.25)',
          }}
        />
      )}
      <Package
        className="h-5 w-5"
        style={{ color: ready ? '#18BFFF' : 'rgba(255,255,255,0.35)' }}
        aria-hidden="true"
      />
      {ready && (
        <span
          className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full"
          style={{ background: '#18BFFF', boxShadow: '0 0 8px rgba(24,191,255,0.9)' }}
        />
      )}
      <span className="text-[11px] font-semibold text-white/35">Case</span>
    </motion.button>
  );
}
