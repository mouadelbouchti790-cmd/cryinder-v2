import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { X, Check, AlertTriangle, ExternalLink, Send, Wallet } from 'lucide-react';
import type { PortfolioHolding } from '../types/token';
import { formatBalance } from '../utils/formatters';

interface SendModalProps {
  holding: PortfolioHolding;
  onClose: () => void;
  onSuccess?: () => void;
}

type SendState = 'idle' | 'sending' | 'done' | 'error';

function isValidPubkey(s: string): boolean {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

export default function SendModal({ holding, onClose, onSuccess }: SendModalProps) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [sendState, setSendState] = useState<SendState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sendState !== 'sending') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sendState]);

  const amountNum = parseFloat(amount) || 0;
  const isRecipientValid = recipient.trim().length >= 32 && isValidPubkey(recipient.trim());
  const isAmountValid = amountNum > 0 && amountNum <= holding.balance;
  const canSend = isRecipientValid && isAmountValid && sendState !== 'sending' && !!publicKey && !!sendTransaction;

  const handleMax = () => {
    setAmount(holding.balance.toString());
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRecipient(text.trim());
    } catch {
      /* clipboard access denied — leave field alone */
    }
  };

  const handleSend = async () => {
    if (!publicKey || !sendTransaction || !isRecipientValid || !isAmountValid) return;
    setError(null);
    setSendState('sending');
    try {
      const recipientPubkey = new PublicKey(recipient.trim());
      const mintPubkey = new PublicKey(holding.mint);

      // Dynamically import spl-token to avoid hard dependency if not installed
      let spl: any;
      try {
        spl = await import('@solana/spl-token');
      } catch {
        throw new Error('SPL Token library not available. Please install @solana/spl-token.');
      }

      const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, getAccount } = spl;

      const senderATA = await getAssociatedTokenAddress(mintPubkey, publicKey);
      const recipientATA = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

      const amountSmallest = BigInt(Math.floor(amountNum * Math.pow(10, holding.decimals)));

      const tx = new Transaction();

      // Create recipient ATA if it doesn't exist
      try {
        await getAccount(connection, recipientATA);
      } catch {
        tx.add(createAssociatedTokenAccountInstruction(publicKey, recipientATA, recipientPubkey, mintPubkey));
      }

      tx.add(
        createTransferInstruction(senderATA, recipientATA, publicKey, amountSmallest)
      );

      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;

      const sig = await sendTransaction(tx, connection);
      setSignature(sig);

      // Confirm
      const confirmation = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      if (confirmation.value.err) {
        throw new Error('Transaction failed on-chain');
      }

      setSendState('done');
      onSuccess?.();
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (/User rejected|rejected|declined|cancel/i.test(msg)) {
        setSendState('idle');
        return;
      }
      setError(msg);
      setSendState('error');
    }
  };

  const isSending = sendState === 'sending';
  const solscanUrl = signature ? `https://solscan.io/tx/${signature}` : '';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => !isSending && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Send ${holding.symbol}`}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[#263A4F] bg-[#0E1622] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#141414]">
              {holding.logoUrl ? (
                <img src={holding.logoUrl} alt={holding.symbol} className="h-8 w-8 object-contain" />
              ) : (
                <span className="text-lg font-black text-white/30">{holding.symbol[0]}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-extrabold tracking-[-0.01em]">Send {holding.symbol}</div>
              <div className="truncate text-xs font-medium text-white/35">{holding.name}</div>
            </div>
          </div>
          {!isSending && (
            <button
              onClick={onClose}
              aria-label="Close send modal"
              className="flex h-11 w-11 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {sendState === 'done' && signature ? (
          <div className="py-4 text-center">
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/[0.08]"
            >
              <Check className="h-8 w-8 text-emerald-400" aria-hidden="true" />
            </motion.div>
            <div className="mb-1 text-lg font-extrabold">Sent {holding.symbol}</div>
            <p className="mb-1 text-sm text-white/55">
              Sent <span className="font-bold text-white">{amount} {holding.symbol}</span> to {recipient.slice(0, 4)}...{recipient.slice(-4)}
            </p>
            <a
              href={solscanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-2xl border border-white/[0.08] text-sm font-bold text-white/70 transition-colors hover:border-white/[0.15] hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> View on Solscan
            </a>
            <button
              onClick={onClose}
              className="min-h-[48px] w-full rounded-2xl bg-[#18BFFF] text-sm font-extrabold text-[#041018] transition-colors hover:bg-[#52D6FF]"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Balance */}
            <div className="mb-4 flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40">
                <Wallet className="h-3 w-3" aria-hidden="true" /> Balance
              </span>
              <span className="text-[11px] font-bold text-white/70">
                {formatBalance(holding.balance)} {holding.symbol}
              </span>
            </div>

            {/* Recipient */}
            <div className="mb-4">
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/40">
                Recipient address
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  disabled={isSending}
                  placeholder="Enter Solana wallet address"
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 pr-16 text-sm font-medium text-white placeholder:text-white/20 outline-none transition-colors focus:border-white/[0.15] disabled:opacity-60"
                />
                {!recipient && (
                  <button
                    type="button"
                    onClick={handlePaste}
                    disabled={isSending}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-bold text-white/55 transition-colors hover:text-white disabled:opacity-40"
                  >
                    Paste
                  </button>
                )}
              </div>
              {recipient && !isRecipientValid && (
                <p className="mt-1.5 text-[11px] font-semibold text-[#E0827A]">Invalid Solana address.</p>
              )}
            </div>

            {/* Amount */}
            <div className="mb-5">
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/40">
                Amount
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={holding.balance}
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isSending}
                  placeholder="0.0"
                  className="min-w-0 flex-1 bg-transparent text-lg font-extrabold text-white outline-none placeholder:text-white/30"
                />
                <span className="shrink-0 rounded-lg bg-white/[0.06] px-2.5 py-1 text-xs font-bold text-white/70">
                  {holding.symbol}
                </span>
                <button
                  onClick={handleMax}
                  disabled={isSending}
                  className="shrink-0 rounded-lg border border-[#263A4F] bg-[#162333] px-2.5 py-1 text-xs font-bold text-white/70 transition-colors hover:text-white disabled:opacity-40"
                >
                  Max
                </button>
              </div>
              {amountNum > holding.balance && (
                <p className="mt-1.5 text-[11px] font-semibold text-[#E0827A]">Amount exceeds balance.</p>
              )}
            </div>

            <button
              onClick={handleSend}
              disabled={!canSend}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#18BFFF] text-[15px] font-extrabold text-[#041018] transition-all hover:bg-[#52D6FF] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSending ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-black/60" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden="true" /> Send {holding.symbol}
                </>
              )}
            </button>

            {sendState === 'error' && error && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#E0827A]/20 bg-[#E0827A]/[0.04] px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E0827A]" aria-hidden="true" />
                <span className="text-[11px] leading-relaxed text-white/65">{error}</span>
              </div>
            )}

            <p className="mt-3 text-center text-[10px] text-white/25">No fee · Only Solana network gas · 1 signature</p>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
