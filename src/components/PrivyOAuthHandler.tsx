import { useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { usePrivyEmbeddedWallet } from '../hooks/usePrivyEmbeddedWallet';
import {
  dedupeOAuthUrl,
  getActiveOAuthParams,
  sanitizeOAuthUrl,
} from '../utils/privyOAuth';

/** Session-scoped guard so StrictMode remounts can't double-fire per code. */
function alreadyNotified(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return true;
    sessionStorage.setItem(key, '1');
    return false;
  } catch {
    return false;
  }
}

/**
 * Mount once inside <PrivyProvider> (see main.tsx).
 * Privy consumes ?privy_oauth_code / ?privy_oauth_state automatically on
 * mount — this bridge only ensures the app reacts after a full-page OAuth
 * redirect without looping on stacked duplicates.
 */
export default function PrivyOAuthHandler() {
  const { ready, authenticated } = usePrivy();
  const { privyUserId, walletAddress } = usePrivyEmbeddedWallet();
  const returnNotifiedRef = useRef(false);
  const authedNotifiedRef = useRef(false);

  // Normalize stacked duplicates on mount (main.tsx already ran this
  // synchronously pre-mount; this covers HMR / late-added params).
  // Then tell App to reopen AuthModal so the flow resumes off landing.
  useEffect(() => {
    dedupeOAuthUrl();
    const { hasCallback, code } = getActiveOAuthParams();
    if (!hasCallback || returnNotifiedRef.current) return;
    returnNotifiedRef.current = true;
    if (code && alreadyNotified(`privy_oauth_return_${code}`)) return;
    window.dispatchEvent(new CustomEvent('privy:oauth-return'));
  }, []);

  // Session ready — forward to App immediately so the user leaves landing.
  // Do NOT wait for the embedded wallet: wallet provisioning can lag or
  // require a manual create, and waiting here is what stranded users on
  // landing. Strip callback params once processed so reloads never re-run them.
  useEffect(() => {
    if (!ready || !authenticated || authedNotifiedRef.current) return;
    authedNotifiedRef.current = true;
    const { code } = getActiveOAuthParams();
    window.dispatchEvent(
      new CustomEvent('privy:authenticated', { detail: { privyUserId, walletAddress } }),
    );
    sanitizeOAuthUrl();
    try {
      if (code) sessionStorage.removeItem(`privy_oauth_return_${code}`);
    } catch {
      // ignore storage errors
    }
  }, [ready, authenticated, privyUserId, walletAddress]);

  // Hang guard: stale/invalid codes leave ready=true + authenticated=false
  // forever with params in the URL — a silent loop on every reload. After a
  // grace period, strip the params so the next load starts clean and the
  // user can retry instead of hanging.
  useEffect(() => {
    const { hasCallback } = getActiveOAuthParams();
    if (!hasCallback) return;
    const t = window.setTimeout(() => {
      try {
        const { hasCallback: stillThere } = getActiveOAuthParams();
        if (!stillThere) return;
        // Only clear when the SDK has settled but produced no session.
        // If already authenticated the success effect above handled it.
        sanitizeOAuthUrl();
        window.dispatchEvent(new CustomEvent('privy:oauth-error'));
      } catch {
        // ignore
      }
    }, 20000);
    return () => window.clearTimeout(t);
  }, [ready, authenticated]);

  return null;
}
