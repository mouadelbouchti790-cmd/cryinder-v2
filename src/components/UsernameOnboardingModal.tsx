import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { validateUsername } from '../services/pocketbase';
import BrandMark from './BrandMark';

interface OnboardingModalProps {
  open: boolean;
  onSubmit: (username: string) => Promise<{ success: boolean; error?: string }>;
  onSkip: () => void;
}

export default function UsernameOnboardingModal({
  open,
  onSubmit,
  onSkip,
}: OnboardingModalProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUsername('');
      setError(null);
      setSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  // Esc no longer closes — username is required, can't be skipped
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(val);
    if (error) setError(null);
  }, [error]);

  const handleSubmit = useCallback(async () => {
    // ✅ FIX: validateUsername returns { valid, error } — extract the error string
    const validation = validateUsername(username);
    if (!validation.valid) {
      setError(validation.error || 'Invalid username');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await onSubmit(username);

      if (!result.success) {
        setError(result.error || 'Something went wrong. Try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [username, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            /* backdrop click no longer skips — username is required */
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Choose your username"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-5"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[400px] rounded-2xl border border-[#263A4F] bg-[#0E1622] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
          >
            <div className="mb-5 flex items-center justify-center">
              <BrandMark className="h-14 w-14 rounded-2xl object-contain" />
            </div>

            <h2 className="mb-2 text-center text-[22px] font-black tracking-[-0.02em] text-white">
              Choose Your Username
            </h2>
            <p className="mb-6 text-center text-[13px] leading-relaxed text-white/35">
              This is how other traders will see you. You can change it later.
            </p>

            <div className="mb-4">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={username}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  placeholder="your_username"
                  maxLength={20}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={submitting}
                  className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 text-[15px] font-medium text-white placeholder-white/15 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.05] disabled:opacity-50"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-white/15">
                  {username.length}/20
                </span>
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2.5 text-[12px] font-medium text-[#E0827A]"
                >
                  {error}
                </motion.p>
              )}

              {!error && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {['3-20 characters', 'Letters & numbers', 'Underscores'].map(
                    (hint) => (
                      <span
                        key={hint}
                        className="rounded-lg border border-white/[0.04] bg-white/[0.02] px-2 py-0.5 text-[11px] text-white/35"
                      >
                        {hint}
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleSubmit}
              disabled={submitting || username.length < 3}
              className="w-full rounded-2xl bg-[#18BFFF] py-3.5 text-[15px] font-extrabold text-[#041018] transition-colors hover:bg-[#52D6FF] disabled:opacity-30"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-black/20 border-t-black/70 animate-spin" />
                  Setting up...
                </span>
              ) : (
                'Continue to Cryinder'
              )}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
