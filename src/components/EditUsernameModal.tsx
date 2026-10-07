import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { validateUsername, USERNAME_COOLDOWN_DAYS } from '../services/pocketbase';

interface EditUsernameModalProps {
  open: boolean;
  currentUsername: string;
  cooldownDaysLeft: number;
  onClose: () => void;
  onSubmit: (newUsername: string) => Promise<{ success: boolean; error?: string }>;
}

export default function EditUsernameModal({
  open,
  currentUsername,
  cooldownDaysLeft,
  onClose,
  onSubmit,
}: EditUsernameModalProps) {
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

  // Esc to close (blocked while submitting)
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, submitting, onClose]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(val);
    if (error) setError(null);
  }, [error]);

  const handleSubmit = useCallback(async () => {
    const validation = validateUsername(username);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid username.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await onSubmit(username);

    if (result.success) {
      onClose();
    } else {
      setError(result.error || 'Something went wrong. Try again.');
    }
    setSubmitting(false);
  }, [username, onSubmit, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const isOnCooldown = cooldownDaysLeft > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !submitting && onClose()}
          role="dialog"
          aria-modal="true"
          aria-label="Edit username"
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
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[20px] font-black tracking-[-0.02em] text-white">
                Edit Username
              </h2>
              <button
                onClick={onClose}
                disabled={submitting}
                aria-label="Close edit username"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] text-white/45 transition-colors hover:text-white/75 disabled:opacity-30"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="mb-6 text-[13px] leading-relaxed text-white/35">
              Current username:{' '}
              <span className="font-semibold text-white">@{currentUsername}</span>
            </p>

            {isOnCooldown ? (
              <div className="mb-6 rounded-2xl border border-[#F59E0B]/10 bg-[#F59E0B]/[0.03] px-4 py-3.5">
                <p className="text-[13px] font-semibold text-[#F59E0B]">
                  Username change is on cooldown.
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#F59E0B]/50">
                  You can change your username in{' '}
                  <strong>{cooldownDaysLeft}</strong> day
                  {cooldownDaysLeft === 1 ? '' : 's'}. Changes are limited to once
                  every {USERNAME_COOLDOWN_DAYS} days.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <div className="relative">
                    <input
                      ref={inputRef}
                      type="text"
                      value={username}
                      onChange={handleChange}
                      onKeyDown={handleKeyDown}
                      placeholder="new_username"
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
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSubmit}
                  disabled={submitting || username.length < 3}
                  className="mb-2 w-full rounded-2xl bg-[#18BFFF] py-3.5 text-[15px] font-extrabold text-[#041018] transition-colors hover:bg-[#52D6FF] disabled:opacity-30"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-black/20 border-t-black/70 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    'Save Username'
                  )}
                </motion.button>
              </>
            )}

            <button
              onClick={onClose}
              disabled={submitting}
              className="w-full rounded-2xl py-3 text-[13px] font-semibold text-white/20 transition-colors hover:text-white/35 disabled:opacity-30"
            >
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
