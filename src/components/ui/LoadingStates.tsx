import { motion } from 'framer-motion';

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center">
      <div className="relative h-5 w-5">
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-white/60"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
        />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  const shimmerKeyframes = `
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `;

  const block = (w: string | number, h: string | number, br: string | number, mb?: number) => (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: br,
        marginBottom: mb ?? 0,
        background: 'linear-gradient(90deg, #141414 25%, #1f1f1f 50%, #141414 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
      }}
    />
  );

  return (
    <div
      style={{
        width: 360,
        height: 560,
        borderRadius: 24,
        background: '#0a0a0b',
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <style>{shimmerKeyframes}</style>
      {block(88, 88, 22, 20)}
      {block(160, 28, 8, 8)}
      {block(80, 16, 4, 20)}
      {block('100%', 60, 8, 20)}
      {block(120, 36, 18)}
    </div>
  );
}
