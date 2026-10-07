import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, ArrowDownLeft } from 'lucide-react';

interface ReceiveModalProps {
  walletAddress: string | null;
  onClose: () => void;
}

/** Receive — show the wallet address for incoming SPL transfers. */
export default function ReceiveModal({ walletAddress, onClose }: ReceiveModalProps) {
  const [copied, setCopied] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 50);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      window.clearTimeout(t);
    };
  }, [onClose]);

  const copy = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const truncated = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}`
    : 'No wallet connected';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Receive tokens"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[#263A4F] bg-[#0E1622] p-6"
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#18BFFF]/25 bg-[#18BFFF]/[0.07]">
              <ArrowDownLeft className="h-5 w-5 text-[#18BFFF]" aria-hidden="true" />
            </div>
            <div>
              <div className="text-base font-extrabold tracking-[-0.01em] text-white">Receive</div>
              <div className="font-mono text-[10px] tracking-[0.1em] text-white/35">SPL · SOLANA ONLY</div>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close receive modal"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#263A4F] bg-[#162333] text-white/55 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mb-2 font-mono text-[10px] font-bold tracking-[0.14em] text-white/40">
          YOUR WALLET ADDRESS
        </div>
        <button
          onClick={copy}
          disabled={!walletAddress}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#263A4F] bg-[#0A101A] px-4 py-3.5 transition-colors hover:border-[#35536D] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="truncate font-mono text-[13px] font-semibold tabular-nums text-white">
            {truncated}
          </span>
          {copied ? (
            <Check className="h-4 w-4 shrink-0 text-[#22C55E]" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
          )}
        </button>
        <div className="mt-1.5 text-right font-mono text-[10px] text-white/25">
          {copied ? 'COPIED' : 'TAP TO COPY'}
        </div>

        <p className="mt-4 rounded-xl border border-[#263A4F] bg-[#162333] px-3.5 py-3 text-[11px] leading-relaxed text-white/50">
          Send only Solana (SPL) tokens to this address. Anything sent on another
          network will be lost.
        </p>

        <button
          onClick={onClose}
          className="mt-4 min-h-[48px] w-full rounded-xl bg-[#18BFFF] text-sm font-extrabold text-[#041018] transition-colors hover:bg-[#52D6FF]"
        >
          Done
        </button>
      </motion.div>
    </motion.div>
  );
}
