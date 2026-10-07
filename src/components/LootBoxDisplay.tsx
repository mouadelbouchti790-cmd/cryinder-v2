import { motion } from 'framer-motion';

type BoxPhase = 'idle' | 'shaking' | 'opening' | 'open';

interface LootBoxDisplayProps {
  phase: BoxPhase;
  available: boolean;
  accent: string;
  size?: number;
}

/**
 * Cryinder hardware case — industrial terminal container, not a fantasy chest.
 * - idle: static, blue edge only when claimable
 * - shaking: short mechanical vibration, indicators blink
 * - opening: lid slides up, thin light line escapes
 * - open: lid raised, steady indicator glow
 * No neon rims, no particle spam.
 */
export default function LootBoxDisplay({
  phase,
  available,
  accent,
  size = 96,
}: LootBoxDisplayProps) {
  const scale = size / 96;
  const active = available || phase === 'shaking' || phase === 'opening';
  const shake = phase === 'shaking';
  const opening = phase === 'opening' || phase === 'open';
  const edge = active ? accent : '#263A4F';

  return (
    <div
      className={shake ? 'cry-lb-vibrate' : ''}
      style={{ width: size, height: size + 10, position: 'relative' }}
      aria-hidden="true"
    >
      {/* faint radial backing */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: size * 1.4,
          height: size * 1.4,
          background: `radial-gradient(circle, ${accent}${active ? '1F' : '0D'}, transparent 65%)`,
        }}
      />

      {/* escaping light line */}
      {opening && (
        <motion.div
          initial={{ opacity: 0, scaleX: 0.4 }}
          animate={{ opacity: [0, 0.9, 0.5], scaleX: 1 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: size * 0.3,
            width: size * 0.8,
            height: 2,
            background: accent,
            boxShadow: `0 0 10px ${accent}`,
          }}
        />
      )}

      {/* lid */}
      <motion.div
        className="absolute left-1/2 top-0 -translate-x-1/2"
        style={{
          width: size,
          height: 34 * scale,
          background: 'linear-gradient(180deg, #1B2C40, #111C29)',
          border: `1px solid ${edge}`,
          borderBottom: 'none',
          borderRadius: '10px 10px 0 0',
        }}
        animate={
          opening
            ? { y: -size * 0.55, transition: { type: 'spring', stiffness: 260, damping: 18 } }
            : { y: 0 }
        }
      >
        {/* lid indicator strip */}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 10 * scale,
                height: 4,
                borderRadius: 1,
                background: active ? accent : '#263A4F',
                opacity: shake ? (i === 1 ? 1 : 0.35) : 1,
                animation: shake ? `cry-lb-blink 0.4s ${i * 0.1}s infinite` : 'none',
              }}
            />
          ))}
        </div>
      </motion.div>

      {/* body */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          top: '26%',
          width: size,
          height: 62 * scale,
          background: 'linear-gradient(180deg, #16293C, #0A121C)',
          border: `1px solid ${edge}`,
          borderRadius: '0 0 10px 10px',
          boxShadow: active ? `0 0 14px ${accent}33` : 'none',
          transition: 'border-color 0.3s, box-shadow 0.3s',
        }}
      >
        {/* seam */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `${accent}66` }} />
        {/* CP badge */}
        <div
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          style={{
            width: size * 0.52,
            height: size * 0.24,
            background: 'rgba(24,191,255,0.06)',
            border: `1px solid ${edge}`,
            borderRadius: 6,
          }}
        >
          <span
            className="font-mono"
            style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', color: active ? accent : '#526373' }}
          >
            CP
          </span>
        </div>
        {/* pixel footer */}
        <div className="absolute bottom-[10%] left-1/2 flex -translate-x-1/2 gap-[5px]">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              style={{ width: 4, height: 4, background: i % 3 === 0 && active ? `${accent}88` : '#263A4F' }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes cry-lb-vibrate {
          0%,100% { transform: translate(0,0); }
          25% { transform: translate(-1px, 1px); }
          50% { transform: translate(1px, -1px); }
          75% { transform: translate(-1px, -1px); }
        }
        .cry-lb-vibrate { animation: cry-lb-vibrate 0.3s linear infinite; }
        @keyframes cry-lb-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
      `}</style>
    </div>
  );
}
