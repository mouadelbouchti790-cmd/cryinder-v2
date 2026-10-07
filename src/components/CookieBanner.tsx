import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, MotionConfig, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';

export const COOKIE_CONSENT_KEY = 'cryinder-cookie-consent';

export type CookieConsent = 'accepted' | 'rejected';

export function getCookieConsent(): CookieConsent | null {
  try {
    const value = localStorage.getItem(COOKIE_CONSENT_KEY);
    return value === 'accepted' || value === 'rejected' ? value : null;
  } catch {
    return null;
  }
}

export function setCookieConsent(value: CookieConsent): void {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
  } catch {
    console.warn('[Cookies] localStorage unavailable; choice will not persist.');
  }
}

const COOKIE_CATEGORIES = [
  { name: 'Essential', desc: 'Required for the app to work. Always active.', optional: false },
  { name: 'Preferences', desc: 'Remember your choices and settings.', optional: true },
  { name: 'Analytics', desc: 'Help us understand how Cryinder is used.', optional: true },
] as const;

interface CookieBannerProps {
  onPrivacyClick?: () => void;
}

export default function CookieBanner({ onPrivacyClick }: CookieBannerProps) {
  const [visible, setVisible] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setVisible(getCookieConsent() === null);
  }, []);

  const handleChoice = useCallback((choice: CookieConsent) => {
    setCookieConsent(choice);
    setVisible(false);
  }, []);

  const handleDismiss = useCallback(() => handleChoice('rejected'), [handleChoice]);

  const handlePrivacyClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (onPrivacyClick) {
        e.preventDefault();
        onPrivacyClick();
      }
    },
    [onPrivacyClick],
  );

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {visible && (
          <motion.aside
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 48 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.25, 0.4, 0.25, 1] }}
            aria-label="Cookie consent"
            className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 sm:bottom-4 sm:left-auto sm:right-4 sm:w-[380px] sm:px-0 sm:pb-0"
          >
            <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#050505]/95 p-3.5 shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-4">
              <div className="flex items-center gap-3 sm:items-start sm:justify-between">
                <p className="min-w-0 flex-1 text-[12px] leading-snug text-white/70 sm:text-[13px] sm:leading-relaxed">
                  We use cookies to improve your experience. By using Cryinder, you agree to our{' '}
                  <a
                    href="/privacy"
                    onClick={handlePrivacyClick}
                    className="font-semibold text-white/90 underline underline-offset-2 transition-colors hover:text-white"
                  >
                    Privacy Policy
                  </a>
                  .
                </p>
                <button
                  onClick={handleDismiss}
                  aria-label="Dismiss cookie banner"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-white/40 transition-all hover:text-white/70 active:scale-[0.95] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 sm:hidden"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => handleChoice('rejected')}
                    className="min-h-[36px] rounded-xl border border-white/[0.06] px-3 text-[12px] font-bold text-white/40 transition-all hover:border-white/[0.15] hover:text-white/70 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 sm:min-h-[40px] sm:px-4"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleChoice('accepted')}
                    className="min-h-[36px] rounded-xl bg-white px-3 text-[12px] font-bold text-black transition-all hover:bg-white/90 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 sm:min-h-[40px] sm:px-4"
                  >
                    Accept All
                  </button>
                </div>
              </div>

              <div className="mt-2.5 flex items-center gap-3 sm:mt-3">
                <button
                  onClick={() => setDetailsOpen((v) => !v)}
                  aria-expanded={detailsOpen}
                  className="text-[11px] font-semibold text-white/40 transition-colors hover:text-white/70"
                >
                  {detailsOpen ? 'Hide details' : 'Cookie details'}
                </button>
              </div>

              <AnimatePresence initial={false}>
                {detailsOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 space-y-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      {COOKIE_CATEGORIES.map(({ name, desc, optional }) => (
                        <div key={name} className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[12px] font-bold text-white/85">{name}</div>
                            <div className="mt-0.5 text-[11px] leading-relaxed text-white/45">
                              {desc}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              optional
                                ? 'border border-white/[0.08] text-white/40'
                                : 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-400/80'
                            }`}
                          >
                            {optional ? 'Optional' : 'Always on'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
