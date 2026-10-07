import { motion, MotionConfig } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import BrandMark from './BrandMark';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.4, 0.25, 1] as const } },
};

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  onBack: () => void;
  children: React.ReactNode;
}

export default function LegalPage({ title, lastUpdated, onBack, children }: LegalPageProps) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-[100dvh] bg-[#050505] text-white antialiased">
        <header className="sticky top-0 z-50 border-b border-white/[0.04] bg-[#050505]/90 px-5 py-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <span className="flex items-center gap-2.5">
              <BrandMark alt="" />
              <span className="font-display text-sm font-bold uppercase tracking-[0.2em] text-white/65">
                Cryinder
              </span>
            </span>
            <button
              onClick={onBack}
              className="flex min-h-[40px] items-center gap-2 rounded-xl border border-white/[0.08] px-4 text-[12px] font-bold text-white/70 transition-colors hover:border-white/[0.2] hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back
            </button>
          </div>
        </header>

        <motion.main
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          className="mx-auto max-w-3xl px-5 py-12 sm:py-16"
        >
          <motion.h1
            variants={fadeUp}
            className="font-display text-3xl font-black tracking-[-0.02em] sm:text-4xl"
          >
            {title}
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-3 text-sm text-white/45">
            Last updated: {lastUpdated}
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8">{children}</motion.div>
        </motion.main>
      </div>
    </MotionConfig>
  );
}
