import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { useLoginWithOAuth, useLoginWithEmail, useLoginWithSiws, useLinkWithSiws, usePrivy } from '@privy-io/react-auth';
import { useWallets as usePrivySolanaWallets, useCreateWallet as useCreateSolanaWallet } from '@privy-io/react-auth/solana';
import { ArrowRight, Check, ShieldCheck, X } from 'lucide-react';
import TurnstileWidget from '../TurnstileWidget';
import { setTurnstileToken, clearTurnstileToken } from '../../services/pocketbase';
import { PRIVY_APP_ID, TURNSTILE_SITE_KEY, consumeOAuthInitiated, findPrivyEmbeddedSolanaAddress, getLastLoginMethod, isSolanaAddressLinked, markOAuthInitiated, setLastLoginMethod, shortenAddress } from './authUtils';

export type AuthMode = 'login' | 'signup';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired once a wallet is connected AND the human check passes. */
  onAuthenticated: () => void;
  /** Which view to show when the modal opens. Defaults to 'signup'. */
  initialMode?: AuthMode;
  onPrivacyClick?: () => void;
  onTermsClick?: () => void;
}

/** Google / Apple via Privy. Mounted only when a Privy app id is configured. */
function SocialLoginSection({ onEmbeddedWallet, lastMethod }: { onEmbeddedWallet: (address: string) => void; lastMethod: string | null }) {
  const { authenticated, user } = usePrivy();
  const { initOAuth } = useLoginWithOAuth();
  const { wallets } = usePrivySolanaWallets();
  const [pending, setPending] = useState<'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const embeddedAddress = useMemo(() => {
    return findPrivyEmbeddedSolanaAddress(user?.linkedAccounts, [wallets[0]?.address]);
  }, [user?.linkedAccounts, wallets]);

  useEffect(() => {
    if (!authenticated) return;
    // Clear the spinner as soon as the session exists — the address below
    // unlocks the human check, and CONTINUE fires only when the user decides.
    setPending(null);
    // Forward ONLY when the user chose this method pre-redirect (flag
    // survives the OAuth reload). A passively restored session stays on the
    // standard login options — no premature wallet display.
    const initiated = consumeOAuthInitiated();
    if (embeddedAddress && initiated) {
      setLastLoginMethod(initiated);
      onEmbeddedWallet(embeddedAddress);
    }
  }, [authenticated, embeddedAddress, onEmbeddedWallet]);

  const startOAuth = useCallback(
    async (provider: 'google') => {
      setError(null);
      setPending(provider);
      // Persist the choice across the full-page redirect so the return trip
      // can prove the user actively picked this method.
      markOAuthInitiated(provider);
      try {
        await initOAuth({ provider });
      } catch (err) {
        setPending(null);
        setError(err instanceof Error ? err.message.slice(0, 90) : 'Social login failed. Try again.');
      }
    },
    [initOAuth],
  );

  return (
    <div className="flex flex-col gap-2">
      {(['google'] as const).map((provider) => (
        <button
          key={provider}
          onClick={() => startOAuth(provider)}
          disabled={pending !== null}
          className="relative flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-sm border border-blue-900/60 bg-blue-950/20 px-5 py-3 font-mono text-sm font-semibold text-blue-200 transition-all hover:bg-blue-900/30 disabled:cursor-wait disabled:opacity-60"
        >
          {lastMethod === provider && (
            <span className="absolute left-3 rounded-sm bg-blue-500/15 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-blue-300">
              LAST USED
            </span>
          )}
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.6-5 3.6-8.9z" />
            <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.1.1-3.7 2.9v.1C3.4 21.5 7.4 24 12 24z" />
            <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8-.1.1C.5 8.7 0 10.2 0 12s.5 3.3 1.4 4.7l3.8-2.3z" />
            <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.4 0 3.4 2.5 1.4 6.8l3.8 2.9c1-2.9 3.7-5 6.8-5z" />
          </svg>
          {pending === provider ? 'WAITING…' : `CONTINUE WITH ${provider.toUpperCase()}`}
        </button>
      ))}
      {error && (
        <p role="alert" className="text-center text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

/** Email OTP via Privy. Provisions the same fresh embedded wallet as OAuth. */
function EmailLoginSection({ onEmbeddedWallet }: { onEmbeddedWallet: (address: string) => void }) {
  const { authenticated, user } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { wallets } = usePrivySolanaWallets();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set only when THIS opening completes a code verification — a passively
  // restored session must not surface a wallet the user didn't pick.
  const claimedHereRef = useRef(false);

  const embeddedAddress = useMemo(() => {
    return findPrivyEmbeddedSolanaAddress(user?.linkedAccounts, [wallets[0]?.address]);
  }, [user?.linkedAccounts, wallets]);

  useEffect(() => {
    if (authenticated && embeddedAddress && claimedHereRef.current) {
      setLastLoginMethod('email');
      onEmbeddedWallet(embeddedAddress);
    }
  }, [authenticated, embeddedAddress, onEmbeddedWallet]);

  const handleSendCode = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await sendCode({ email: trimmed });
      setCodeSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message.slice(0, 90) : 'Could not send code. Try again.');
    } finally {
      setPending(false);
    }
  }, [email, sendCode]);

  const handleVerifyCode = useCallback(async () => {
    if (!code.trim()) {
      setError('Enter the code from your email.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await loginWithCode({ code: code.trim() });
      claimedHereRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message.slice(0, 90) : 'Invalid code. Try again.');
    } finally {
      setPending(false);
    }
  }, [code, loginWithCode]);

  return (
    <div className="flex flex-col gap-2">
      {!codeSent ? (
        <>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendCode();
            }}
            placeholder="you@example.com"
            disabled={pending}
            aria-label="Email address"
            className="min-h-[48px] w-full rounded-sm border border-blue-950/60 bg-zinc-950/60 px-4 py-3 font-mono text-sm text-white placeholder:text-zinc-600 focus:border-blue-700 focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={handleSendCode}
            disabled={pending}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-sm border border-blue-900/60 bg-blue-950/20 px-5 py-3 font-mono text-sm font-semibold text-blue-200 transition-all hover:bg-blue-900/30 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? 'SENDING…' : 'CONTINUE WITH EMAIL'}
          </button>
        </>
      ) : (
        <>
          <p className="text-center font-mono text-[11px] leading-relaxed text-zinc-500">
            Code sent to {email.trim()}.{' '}
            <button
              onClick={() => {
                setCodeSent(false);
                setCode('');
                setError(null);
              }}
              className="text-blue-400 underline hover:text-blue-300"
            >
              Use a different email
            </button>
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleVerifyCode();
            }}
            placeholder="Enter code"
            disabled={pending}
            aria-label="One-time code"
            inputMode="numeric"
            className="min-h-[48px] w-full rounded-sm border border-blue-950/60 bg-zinc-950/60 px-4 py-3 text-center font-mono text-sm tracking-[0.3em] text-white placeholder:text-zinc-600 focus:border-blue-700 focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={handleVerifyCode}
            disabled={pending}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-sm bg-blue-600 px-8 py-3 font-mono text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? 'VERIFYING…' : 'VERIFY CODE'}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-center text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Best-effort extraction of the server validation message from a Privy SDK
 * error (status/body/message shapes vary by SDK version). Used only for
 * diagnostics and duplicate-link matching — never shown raw to users.
 */
function extractServerMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const rec = err as Record<string, unknown>;
  const candidates: unknown[] = [
    rec.message,
    (rec.response as Record<string, unknown> | undefined)?.data,
    (rec.response as Record<string, unknown> | undefined)?.body,
    rec.data,
    rec.body,
    rec.details,
    (rec.cause as Record<string, unknown> | undefined)?.message,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c.slice(0, 300);
    if (c && typeof c === 'object') {
      try {
        const s = JSON.stringify(c);
        if (s.length > 2) return s.slice(0, 300);
      } catch {
        // Non-serializable — try the next candidate.
      }
    }
  }
  return '';
}

/**
 * Base64-encode signature bytes without Node Buffer (externalized in the
 * browser build). Chunked so large arrays can't blow the call stack.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** "Connect with Phantom" driving the real extension plus Privy linking: * 1) opens the actual Phantom browser-extension permission popup and
 * connects the user's real account; 2) links that external wallet to the
 * Privy profile via SIWS (login when signed out, link when a session
 * exists); 3) provisions an app-managed embedded wallet on the same session.
 * Both wallets end up accessible under one Privy account. Explicit confirm
 * step first — nothing connects silently.
 */
function PhantomEmbeddedSection({ onEmbeddedWallet, lastMethod }: { onEmbeddedWallet: (address: string) => void; lastMethod: string | null }) {
  const { user, authenticated } = usePrivy();
  const { wallets } = usePrivySolanaWallets();
  const { generateSiwsMessage, loginWithSiws } = useLoginWithSiws();
  const { generateSiwsMessage: generateLinkMessage, linkWithSiws } = useLinkWithSiws();
  const { createWallet } = useCreateSolanaWallet();
  const { wallets: adapterWallets, wallet: adapterWallet, connected, publicKey: adapterPublicKey, select, connect, disconnect, signMessage: adapterSignMessage } = useWallet();
  const [step, setStep] = useState<'idle' | 'confirm' | 'working'>('idle');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // In-flight lock: only one SIWS handshake may run at a time. Click-level
  // disabling isn't enough — a rapid double-click can fire twice before the
  // re-render lands, duplicating siws/init + siws/link with clashing nonces.
  const flowLockRef = useRef(false);

  // Live mirrors: the async flow spans re-renders, so session reads must use
  // current values, not the click-time closure.
  const userRef = useRef(user);
  userRef.current = user;
  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;
  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;
  // Mirror of the selected adapter wallet — lets the flow wait until the
  // Phantom selection is actually active instead of guessing with a sleep.
  const adapterWalletRef = useRef(adapterWallet);
  adapterWalletRef.current = adapterWallet;
  // `connected` spans re-renders too — the flow must read the live value
  // after `connect()` resolves, not the click-time closure.
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const adapterPublicKeyRef = useRef(adapterPublicKey);
  adapterPublicKeyRef.current = adapterPublicKey;

  const embeddedAddress = useMemo(() => {
    return findPrivyEmbeddedSolanaAddress(user?.linkedAccounts, [wallets[0]?.address]);
  }, [user?.linkedAccounts, wallets]);

  // Runs only from the explicit confirm button below — every run opens the
  // real Phantom popup, so no wallet is ever used without fresh confirmation.
  const runFlow = useCallback(async () => {
    // Deduplicate: ignore re-entrant clicks while a handshake is active.
    if (flowLockRef.current) return;
    flowLockRef.current = true;
    // Captured for diagnostics if the server rejects the handshake.
    let siwsMessage: string | null = null;
    let siwsAddress: string | null = null;
    setError(null);
    setStep('working');
    try {
      // 1. Real Phantom extension permission popup for THIS action.
      const phantom = adapterWallets.find((w) => w.adapter.name === 'Phantom');
      if (!phantom) throw new Error('Phantom extension not detected. Install it from phantom.app.');
      if (
        phantom.readyState !== WalletReadyState.Installed &&
        phantom.readyState !== WalletReadyState.Loadable
      ) {
        throw new Error('Phantom extension is not ready. Install or unlock it, then try again.');
      }
      setStatus('Opening Phantom… approve the connection.');
      // 1a. Explicit wallet selection FIRST — calling connect() while
      // `wallet` is null throws WalletNotSelectedError. If Phantom isn't
      // the active selection, select it and wait for the adapter state to
      // settle before touching connect().
      if (adapterWalletRef.current?.adapter.name !== phantom.adapter.name) {
        select(phantom.adapter.name);
        // Wait until the selection is actually active — connecting before the
        // adapter state settles can sign/submit under the wrong wallet, which
        // the server rejects as an invalid SIWS message/nonce (HTTP 400).
        // NOTE: this relies on a re-render to refresh adapterWalletRef; if
        // the component unmounts mid-wait the loop simply times out below.
        const deadline = Date.now() + 5000;
        while (
          adapterWalletRef.current?.adapter.name !== phantom.adapter.name &&
          Date.now() <= deadline
        ) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      const selectedBeforeConnect = adapterWalletRef.current;
      if (!selectedBeforeConnect || selectedBeforeConnect.adapter.name !== phantom.adapter.name) {
        // Don't call connect() blindly with wallet === null — prompt the
        // user to pick Phantom explicitly instead.
        throw new Error('No wallet selected. Select Phantom first, then try again.');
      }
      // 1b. Connect only now that a wallet is selected. Skip the popup when
      // already connected to Phantom with an address.
      const alreadyConnected =
        connectedRef.current &&
        (adapterPublicKeyRef.current?.toBase58() ?? selectedBeforeConnect.adapter.publicKey?.toBase58() ?? phantom.adapter.publicKey?.toBase58());
      if (!alreadyConnected) {
        try {
          await connect();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/not selected|WalletNotSelected/i.test(msg)) {
            throw new Error('No wallet selected. Select Phantom first, then try again.');
          }
          throw err;
        }
      }
      // Verify the adapter is selected, connected, and ready BEFORE any
      // SIWS call — signing or linking with a null/stale wallet is what
      // surfaces as WalletNotSelectedError and invalid-nonce 400s.
      const selected = adapterWalletRef.current;
      if (!selected || selected.adapter.name !== phantom.adapter.name) {
        throw new Error('No wallet selected. Select Phantom first, then try again.');
      }
      const externalAddress =
        selected.adapter.publicKey?.toBase58() ??
        phantom.adapter.publicKey?.toBase58() ??
        adapterPublicKeyRef.current?.toBase58() ??
        null;
      if (!externalAddress) {
        throw new Error('Phantom is not connected yet. Approve the connection popup first.');
      }
      // Resolve the sign function from the hook or the adapter itself —
      // either may be undefined when no wallet is selected/connected.
      const signMessageFn =
        adapterSignMessage ??
        (typeof (selected.adapter as { signMessage?: unknown }).signMessage === 'function'
          ? (selected.adapter as { signMessage: (msg: Uint8Array) => Promise<Uint8Array> }).signMessage.bind(selected.adapter)
          : null);
      if (!signMessageFn) throw new Error('Phantom cannot sign here. Select Phantom first, then try again.');
      // 2. External wallet → Privy profile via SIWS. Branch on LIVE session
      // state (not the click-time closure): an active session LINKS, a
      // signed-out user LOGS IN. Mixing them up is a guaranteed HTTP 400 —
      // login-with-session and link-without-session both fail validation.
      // Guard: siws/init + siws/link run ONLY with a valid non-null address.
      const sessionUser = userRef.current;
      const hasSession = authenticatedRef.current || !!sessionUser;
      // Shared step 3: ensure the app-managed embedded wallet exists on this
      // session. Idempotent — a user that already has one hits the
      // "already has" path and continues with the existing wallet.
      const provisionEmbedded = async () => {
        setStatus('Provisioning your embedded app wallet…');
        try {
          const { wallet } = await createWallet();
          if (wallet.walletClientType && wallet.walletClientType !== 'privy') {
            throw new Error('Unexpected non-embedded wallet. Try again.');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!/already has|already exists/i.test(msg)) throw err;
        }
      };
      // Skip a redundant link: the server rejects re-linking an attached
      // address with 400. An already-linked wallet skips ONLY the SIWS
      // handshake (no new nonce is minted) — embedded provisioning still
      // runs so the app wallet is guaranteed to exist.
      if (hasSession && sessionUser && isSolanaAddressLinked(sessionUser.linkedAccounts, externalAddress)) {
        console.info('[Privy] SIWS handshake skipped — wallet already linked; ensuring embedded wallet', {
          privyUserId: typeof sessionUser.id === 'string' ? sessionUser.id : null,
          address: externalAddress,
        });
        siwsAddress = externalAddress;
        await provisionEmbedded();
        setLastLoginMethod('phantom');
        onEmbeddedWallet(externalAddress);
        setStep('idle');
        setStatus(null);
        return;
      }
      setStatus(hasSession ? 'Sign the message in Phantom to link your account.' : 'Sign the message in Phantom to connect your account.');
      const generate = hasSession ? generateLinkMessage : generateSiwsMessage;
      try {
        siwsMessage = await generate({ address: externalAddress });
      } catch (err) {
        // siws/init failed — log the server validation detail so the exact
        // reason (bad address shape, session mismatch) is inspectable.
        console.error('[Privy] siws/init failed', {
          address: externalAddress,
          hasSession,
          privyUserId:
            sessionUser && typeof sessionUser.id === 'string' ? sessionUser.id : null,
          detail: err,
          serverMessage: extractServerMessage(err),
        });
        throw err instanceof Error ? err : new Error('Could not start verification. Try again.');
      }
      siwsAddress = externalAddress;
      if (!siwsMessage || typeof siwsMessage !== 'string' || siwsMessage.length === 0) {
        throw new Error('Could not start verification. Try again.');
      }
      let signature: string;
      try {
        // Sign the EXACT bytes Privy issued via siws/init — never a
        // client-constructed EIP/Solana message. Any byte-level deviation
        // (prefix, wrapping, re-encoding) fails server validation as
        // "Invalid SIWS message and/or nonce".
        const sigBytes = await signMessageFn(new TextEncoder().encode(siwsMessage));
        if (!sigBytes || sigBytes.length === 0) throw new Error('empty signature');
        // Privy's SIWS API expects the signature BASE64-encoded
        // (`signature: base64.encode(signature)` per docs). bs58 here
        // produces bytes the server cannot decode, which it reports as
        // "Invalid SIWS message and/or nonce" HTTP 400 on every attempt.
        signature = bytesToBase64(sigBytes);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/not selected|WalletNotSelected/i.test(msg)) {
          throw new Error('No wallet selected. Select Phantom first, then try again.');
        }
        throw err instanceof Error ? err : new Error('Signature rejected. Try again.');
      }
      if (!signature || signature.length === 0) {
        throw new Error('Signature rejected. Try again.');
      }
      // Post-sign consistency check: the wallet must not have switched
      // accounts between siws/init and signing. Submitting a signature from
      // address B over a nonce minted for address A is a guaranteed
      // "Invalid SIWS message and/or nonce" 400 — and that nonce is then
      // consumed, so abort BEFORE the link call and let the retry mint a
      // fresh one.
      {
        const currentAddress =
          adapterWalletRef.current?.adapter.publicKey?.toBase58() ??
          phantom.adapter.publicKey?.toBase58() ??
          adapterPublicKeyRef.current?.toBase58() ??
          null;
        if (!currentAddress || currentAddress !== siwsAddress) {
          throw new Error('Wallet changed during signing — try again for a fresh signature.');
        }
      }
      if (hasSession) {
        try {
          // Correct linking payload for an ACTIVE session: base64 signature
          // over the exact siws/init message bytes, same address, Phantom
          // extension identifiers. Never the fresh-login shape.
          await linkWithSiws({ signature, message: siwsMessage, walletClientType: 'phantom', connectorType: 'injected' });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const serverMessage = extractServerMessage(err);
          // Dedicated link-step logging: surfaces the exact server
          // validation error (duplicate, nonce, address mismatch) instead
          // of collapsing everything into the generic catch below.
          console.error('[Privy] siws/link failed', {
            address: siwsAddress,
            message: siwsMessage,
            hasSession,
            detail: err,
            serverMessage,
          });
          if (/already|linked|duplicate|exist/i.test(`${msg} ${serverMessage}`)) {
            // Already linked — continue with the established link.
          } else {
            throw err;
          }
        }
      } else {
        try {
          await loginWithSiws({ signature, message: siwsMessage, walletClientType: 'phantom', connectorType: 'injected' });
        } catch (err) {
          console.error('[Privy] siws/login failed', {
            address: siwsAddress,
            message: siwsMessage,
            detail: err,
            serverMessage: extractServerMessage(err),
          });
          throw err;
        }
      }
      // 3. App-managed embedded wallet on the SAME session (both wallets
      // accessible under one Privy account). Tolerates already-has races.
      await provisionEmbedded();
      setLastLoginMethod('phantom');
      onEmbeddedWallet(externalAddress);
      setStep('idle');
      setStatus(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Full diagnostics to the console (never the signature): needed to pin
      // down server-side 400s that the short UI message can't explain.
      // NOTE: the SIWS message/nonce is single-use and short-lived — every
      // retry mints a FRESH one via siws/init inside the next runFlow call.
      // Nothing here is cached or reused across attempts.
      const serverMessage = extractServerMessage(err);
      console.error('[Privy] SIWS handshake failed', {
        address: siwsAddress,
        message: siwsMessage,
        detail: err,
        serverMessage,
      });
      // Invalidate the consumed nonce locally so no later code path can
      // accidentally resubmit it.
      siwsMessage = null;
      siwsAddress = null;
      // Match against both the SDK message and the server body: Privy often
      // carries "Invalid SIWS message and/or nonce" in response.data rather
      // than err.message, and checking only err.message misses the 400.
      const staleNonce = /invalid siws|invalid.*nonce|nonce|expired|stale|changed during signing|\b400\b/i.test(`${msg} ${serverMessage}`);
      if (staleNonce) {
        // Clear the stale handshake completely: drop the adapter session so
        // the retry starts clean (fresh connect + fresh server nonce) with
        // no page reload required.
        try {
          await disconnect();
        } catch {
          // Adapter already idle — proceed to the clean retry state.
        }
        setError('Verification expired — try again for a fresh signature.');
      } else if (/not selected|WalletNotSelected|Select Phantom first/i.test(msg)) {
        setError('No wallet selected. Select Phantom first, then try again.');
      } else if (/reject|cancel|denied|dismiss|closed|not detected|not ready|did not activate/i.test(msg)) {
        setError(msg.length > 90 ? `${msg.slice(0, 90)}` : msg || 'Action dismissed — nothing was connected.');
      } else {
        setError(msg.slice(0, 90));
      }
      // Back to the explicit confirm step — nothing auto-forwards or loops.
      setStep('confirm');
      setStatus(null);
    } finally {
      flowLockRef.current = false;
    }
  }, [adapterSignMessage, adapterWallets, connect, createWallet, disconnect, generateLinkMessage, generateSiwsMessage, linkWithSiws, loginWithSiws, onEmbeddedWallet, select]);

  const working = step === 'working';

  return (
    <div className="flex flex-col gap-2">
      {step === 'idle' && (
        <button
          onClick={() => {
            setError(null);
            setStep('confirm');
          }}
          className="relative flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-sm bg-[#18BFFF] px-5 py-3 font-mono text-sm font-semibold text-[#1a1b2e] transition-all hover:bg-[#52D6FF]"
        >
          {lastMethod === 'phantom' && (
            <span className="absolute left-3 rounded-sm bg-black/20 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-[#1a1b2e]">
              LAST USED
            </span>
          )}
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C8.1 2 5 5.1 5 9v11.3c0 .6.7 1 1.2.6l2.1-1.7c.2-.2.5-.3.8-.3h5.8c3.9 0 7-3.1 7-7V9c0-3.9-3.1-7-7-7h-3zm-1.2 9.5c-.7 0-1.2-.6-1.2-1.3 0-.7.5-1.2 1.2-1.2.7 0 1.2.5 1.2 1.2 0 .7-.5 1.3-1.2 1.3zm4.4 0c-.7 0-1.2-.6-1.2-1.3 0-.7.5-1.2 1.2-1.2.7 0 1.2.5 1.2 1.2 0 .7-.5 1.3-1.2 1.3z" />
          </svg>
          CONNECT WITH PHANTOM
        </button>
      )}
      {step === 'confirm' && (
        <div className="flex flex-col gap-2 rounded-sm border border-[#18BFFF]/40 bg-[#18BFFF]/5 px-4 py-3">
          <p className="text-center font-mono text-[11px] leading-relaxed text-zinc-300">
            {embeddedAddress ? (
              <>App wallet {shortenAddress(embeddedAddress)} found — connect your real Phantom too, link both to one account, then authorize.</>
            ) : (
              <>Opens your Phantom extension to connect &amp; link it, then provisions your embedded app wallet on the same account.</>
            )}
          </p>
          <button
            onClick={runFlow}
            disabled={working}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-sm bg-[#18BFFF] px-5 py-2.5 font-mono text-sm font-semibold text-[#1a1b2e] transition-all hover:bg-[#52D6FF] disabled:cursor-wait disabled:opacity-60"
          >
            CONNECT PHANTOM WALLET
          </button>
          <button
            onClick={() => {
              setStep('idle');
              setError(null);
            }}
            disabled={working}
            className="w-full py-1 text-center font-mono text-[11px] tracking-widest text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-60"
          >
            CANCEL
          </button>
        </div>
      )}
      {step === 'working' && (
        <p role="status" className="text-center font-mono text-[11px] leading-relaxed text-blue-200">
          {status ?? 'Working…'}
        </p>
      )}
      {error && (
        <p role="alert" className="text-center text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default function AuthModal({ open, onClose, onAuthenticated, initialMode = 'signup', onPrivacyClick, onTermsClick }: AuthModalProps) {
  const { publicKey } = useWallet();
  const [embeddedAddress, setEmbeddedAddress] = useState<string | null>(null);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  // True only after the user actively picks a login method in THIS opening
  // (Phantom button, social redirect return, or email verify). A passively
  // restored session shows the standard options — never a premature wallet
  // + Continue.
  const [hasChosen, setHasChosen] = useState(false);
  const [lastMethod, setLastMethodState] = useState<string | null>(null);
  // Human check lives here now that the gateway screen is gone — the token
  // is minted fresh and handed off the moment CONTINUE fires.
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [turnstileError, setTurnstileError] = useState(false);
  const firedRef = useRef(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset transient state each time the modal opens. Clearing the token on
  // close keeps a stale single-use token from ever being reused.
  useEffect(() => {
    if (open) {
      setEmbeddedAddress(null);
      setMode(initialMode);
      setHasChosen(false);
      setLastMethodState(getLastLoginMethod());
      setTurnstileVerified(false);
      setTurnstileError(false);
      firedRef.current = false;
    } else {
      clearTurnstileToken();
      setTurnstileVerified(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  const fireOnce = useCallback(() => {
    if (!firedRef.current) {
      firedRef.current = true;
      onAuthenticated();
    }
  }, [onAuthenticated]);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileVerified(true);
    setTurnstileError(false);
  }, []);

  const handleTurnstileError = useCallback(() => {
    clearTurnstileToken();
    setTurnstileError(true);
    setTurnstileVerified(false);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    clearTurnstileToken();
    setTurnstileVerified(false);
  }, []);

  const handleEmbeddedWallet = useCallback((address: string) => {
    setEmbeddedAddress(address);
    setHasChosen(true);
    setLastMethodState(getLastLoginMethod());
  }, []);

  if (!open) return null;

  // App-native session only: the address shown here always comes from the
  // Privy embedded flow (extension paths were removed). The adapter fallback
  // stays as a safety net and is otherwise unused.
  const activeAddress = embeddedAddress ?? publicKey?.toBase58() ?? null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect to Cryinder"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-sm border border-blue-950/60 bg-zinc-900 p-7 shadow-2xl shadow-blue-950/40"
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-xs font-bold tracking-widest text-blue-500">CRYINDER</span>
          <button
            onClick={onClose}
            aria-label="Close"
            autoFocus
            className="flex h-8 w-8 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">Connect to trade</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
          Pick a path below. Your keys stay with you either way.
        </p>

        {hasChosen && activeAddress ? (
          <div className="mt-6 flex flex-col items-center gap-2 py-2 text-center">
            <span className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1.5 font-mono text-xs text-blue-300">
              <Check className="h-3.5 w-3.5" />
              {shortenAddress(activeAddress)}
            </span>
            {!turnstileVerified ? (
              <div className="mt-2 flex flex-col items-center gap-2">
                <TurnstileWidget
                  sitekey={TURNSTILE_SITE_KEY}
                  onVerify={handleTurnstileVerify}
                  onError={handleTurnstileError}
                  onExpire={handleTurnstileExpire}
                  theme="dark"
                  size="normal"
                  appearance="execute"
                />
                {turnstileError && (
                  <p className="font-mono text-[11px] text-red-400">
                    Verification failed. Retrying automatically…
                  </p>
                )}
              </div>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 font-mono text-[11px] font-semibold text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                Human verified
              </span>
            )}
            <button
              onClick={fireOnce}
              disabled={!turnstileVerified}
              className="mt-2 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-sm bg-blue-600 px-8 py-3 font-mono text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              CONTINUE <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-5">
            {PRIVY_APP_ID ? (
              <>
                <SocialLoginSection onEmbeddedWallet={handleEmbeddedWallet} lastMethod={lastMethod} />
                <PhantomEmbeddedSection onEmbeddedWallet={handleEmbeddedWallet} lastMethod={lastMethod} />
                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-blue-950/60" />
                  <span className="font-mono text-[11px] tracking-widest text-zinc-500">
                    EMAIL{lastMethod === 'email' ? ' · LAST USED' : ''}
                  </span>
                  <span className="h-px flex-1 bg-blue-950/60" />
                </div>
                <EmailLoginSection onEmbeddedWallet={handleEmbeddedWallet} />
              </>
            ) : (
              <p className="rounded-sm border border-blue-950/60 bg-blue-950/10 px-4 py-3 text-center font-mono text-[11px] leading-relaxed text-blue-300/70">
                Login needs VITE_PRIVY_APP_ID. Set it and reload.
              </p>
            )}
          </div>
        )}

        {mode === 'login' ? (
          <div className="mt-6 flex flex-col items-center gap-1.5">
            <p className="text-center font-mono text-[11px] text-zinc-600">
              Buys need your approval.
            </p>
            <p className="text-center font-mono text-[11px] text-zinc-500">
              Don&apos;t have an account?{' '}
              <button onClick={() => setMode('signup')} className="text-blue-400 transition-colors hover:text-blue-300">
                Sign up
              </button>
            </p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col items-center gap-1.5">
            <p className="text-center font-mono text-[11px] text-zinc-500">
              Already have an account?{' '}
              <button onClick={() => setMode('login')} className="text-blue-400 transition-colors hover:text-blue-300">
                Login
              </button>
            </p>
            <p className="max-w-[300px] text-center font-mono text-[10px] leading-relaxed text-zinc-600">
              By creating an account you agree to Cryinder&apos;s{' '}
              {onPrivacyClick ? (
                <button onClick={onPrivacyClick} className="underline transition-colors hover:text-zinc-400">
                  Privacy Policy
                </button>
              ) : (
                'Privacy Policy'
              )}{' '}
              and{' '}
              {onTermsClick ? (
                <button onClick={onTermsClick} className="underline transition-colors hover:text-zinc-400">
                  Terms of Service
                </button>
              ) : (
                'Terms of Service'
              )}
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
