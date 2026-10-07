import { useState, useCallback, useMemo, useEffect } from 'react';
import { useWallet, WalletContextState } from '@solana/wallet-adapter-react';
import type { TokenData } from './types/token';
import { useUsername } from './hooks/useUsername';
import { usePoints } from './hooks/usePoints';
import { recordSwipe, setWalletContext, clearWalletContext } from './services/pocketbase';
import CryinderLandingPage from './components/CryinderLandingPage';
import AuthModal from './components/terminal/AuthModal';
import TokenDeck from './components/TokenDeck';
import UsernameOnboardingModal from './components/UsernameOnboardingModal';
import CookieBanner from './components/CookieBanner';
import PrivacyPage from './components/PrivacyPage';
import TermsPage from './components/TermsPage';

type AppView = 'landing' | 'app' | 'privacy' | 'terms';

export default function App() {
  const wallet = useWallet() as WalletContextState;
  const { connected, publicKey, signMessage } = wallet;
  const [view, setView] = useState<AppView>('landing');
  // Privy social session (Google/Apple). Tracked separately from the
  // extension adapter so a stored session never yanks the user off landing —
  // the AuthModal drives every transition only when the user decides.
  const [privyAuthed, setPrivyAuthed] = useState(false);
  // Human verification (Turnstile) is completed inside AuthModal BEFORE
  // onAuthenticated fires — the token is single-use and validated within
  // seconds, never reused or left to age.
  const [humanVerified, setHumanVerified] = useState(false);

  // Inject the wallet adapter context into the PB facade so it can
  // sign the identity handshake without depending on React hooks.
  useEffect(() => {
    if (connected && publicKey && signMessage) {
      setWalletContext({
        publicKey: { toBase58: () => publicKey.toBase58() } as { toBase58(): string },
        signMessage: (msg: Uint8Array) => signMessage(msg),
      });
    } else {
      clearWalletContext();
    }
  }, [connected, publicKey, signMessage]);

  // Reset PB session when the wallet disconnects.
  useEffect(() => {
    if (!connected) {
      clearWalletContext();
      setHumanVerified(false);
    }
  }, [connected]);

  const walletAddress = useMemo(
    () => (connected ? publicKey?.toBase58() ?? null : null),
    [connected, publicKey],
  );

  const isAuthenticated = walletAddress !== null || privyAuthed;
  // Dev-only preview bypass: `npm run dev` + ?bypass=1 skips the landing +
  // human-verification gate and goes straight to the terminal. Stripped
  // from production builds so it can never ship to the public site.
  const bypassAuth = useMemo(() => {
    if (!import.meta.env.DEV) return false;
    try {
      return new URLSearchParams(window.location.search).get('bypass') === '1';
    } catch {
      return false;
    }
  }, []);

  // Identify only fires once the wallet is connected AND a fresh Turnstile
  // token was just minted — the token is single-use and validated within
  // seconds, never reused or left to age.
  const identifyAddress = connected && humanVerified ? walletAddress : null;

  const {
    user,
    loading: userLoading,
    needsOnboarding,
    errorStatus: usernameErrorStatus,
    setUsername,
    updateUsername,
    cooldownDaysLeft,
  } = useUsername(identifyAddress);

  const {
    balance,
    dailySwipes,
    dailyLimit,
    hourly,
    refreshPoints,
    refreshHourly,
  } = usePoints(user?.id ?? null);

  const [onboardingSkipped, setOnboardingSkipped] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const showOnboarding = needsOnboarding && !onboardingSkipped && !userLoading;

  const handleConnectClick = useCallback(() => {
    setAuthMode('signup');
    setAuthOpen(true);
  }, []);

  const handleLoginClick = useCallback(() => {
    setAuthMode('login');
    setAuthOpen(true);
  }, []);

  const handleSignupClick = useCallback(() => {
    setAuthMode('signup');
    setAuthOpen(true);
  }, []);

  // AuthModal fires this only after a wallet is picked AND the human check
  // passes, so landing → app happens strictly on user action. No gateway
  // screen exists anymore.
  const handleAuthenticated = useCallback(() => {
    setAuthOpen(false);
    setHumanVerified(true);
    setView('app');
  }, []);

  // Privy Google OAuth uses a full-page redirect back with
  // ?privy_oauth_code / ?privy_oauth_state. PrivyProvider (mounted in
  // main.tsx at the root) consumes those params automatically on load.
  // oauth-return reopens the modal after the reload; the authenticated event
  // only marks the session — it never navigates, so a stored session can't
  // yank the user off landing.
  useEffect(() => {
    const onOAuthReturn = () => setAuthOpen(true);
    const onPrivyAuthenticated = () => setPrivyAuthed(true);
    // Stale/invalid OAuth codes are stripped by the handler — keep the
    // modal open so the user can retry instead of hanging on landing.
    const onOAuthError = () => setAuthOpen(true);
    window.addEventListener('privy:oauth-return', onOAuthReturn);
    window.addEventListener('privy:authenticated', onPrivyAuthenticated);
    window.addEventListener('privy:oauth-error', onOAuthError);
    return () => {
      window.removeEventListener('privy:oauth-return', onOAuthReturn);
      window.removeEventListener('privy:authenticated', onPrivyAuthenticated);
      window.removeEventListener('privy:oauth-error', onOAuthError);
    };
  }, []);

  // A 403 from identify means the human verification failed (stale or
  // already-consumed token — every verification failure, local and
  // server-side, is a 403). Send the user back to a FRESH captcha instead
  // of stranding them: the gateway remounts with a new challenge, and the
  // next verify retries identify with a new single-use token.
  useEffect(() => {
    if (connected && humanVerified && usernameErrorStatus === 403 && !user && !userLoading) {
      setHumanVerified(false);
    }
  }, [connected, humanVerified, usernameErrorStatus, user, userLoading]);

  const handleOnboardingSkip = useCallback(() => {
    setOnboardingSkipped(true);
  }, []);

  // ─── Token Interaction Handlers ──────────────────────────────────

  // TokenDeck handles points — App only records swipe and refreshes UI
  const handleBuy = useCallback((_mint: string, _token: TokenData) => {
    if (user?.id) {
      // Record swipe in PocketBase
      recordSwipe({
        tokenId: _token.mintAddress,
        tokenName: _token.name,
        tokenSymbol: _token.symbol,
        tokenPrice: _token.priceUsd,
        swipeType: 'right',
      }).catch(() => {});

      // Refresh points after TokenDeck updates them
      setTimeout(() => refreshPoints(), 200);
    }
  }, [user?.id, refreshPoints]);

  const handlePass = useCallback((_mint: string, _token: TokenData) => {
    if (user?.id) {
      // Record swipe in PocketBase
      recordSwipe({
        tokenId: _token.mintAddress,
        tokenName: _token.name,
        tokenSymbol: _token.symbol,
        tokenPrice: _token.priceUsd,
        swipeType: 'left',
      }).catch(() => {});

      // Refresh points after TokenDeck updates them
      setTimeout(() => refreshPoints(), 200);
    }
  }, [user?.id, refreshPoints]);

  const handleFlip = useCallback((_mint: string, _isBack: boolean) => {
    // Flip tracking is intentionally a no-op until analytics are wired.
  }, []);

  // ─── Points Updated Callback ──────────────────────────────────

  const handlePointsUpdated = useCallback(() => {
    // Sync UI with the server's latest points state.
    refreshPoints();
    refreshHourly();
  }, [refreshPoints, refreshHourly]);

  // ─── Render ──────────────────────────────────────────────────────

  if (view === 'privacy') {
    return (
      <>
        <PrivacyPage onBack={() => setView('landing')} />
        <CookieBanner />
      </>
    );
  }

  if (view === 'terms') {
    return (
      <>
        <TermsPage onBack={() => setView('landing')} />
        <CookieBanner />
      </>
    );
  }

  if (!bypassAuth && (!isAuthenticated || !humanVerified)) {
    return (
      <>
        <CryinderLandingPage
          onConnectClick={handleConnectClick}
          onLoginClick={handleLoginClick}
          onSignupClick={handleSignupClick}
          onPrivacyClick={() => setView('privacy')}
          onTermsClick={() => setView('terms')}
        />
        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={handleAuthenticated}
          initialMode={authMode}
          onPrivacyClick={() => {
            setAuthOpen(false);
            setView('privacy');
          }}
          onTermsClick={() => {
            setAuthOpen(false);
            setView('terms');
          }}
        />
        <CookieBanner onPrivacyClick={() => setView('privacy')} />
      </>
    );
  }

  return (
    <>
      <TokenDeck
        onBuy={handleBuy}
        onPass={handlePass}
        onTokenFlip={handleFlip}
        username={user?.usernameSet ? user.username : null}
        userId={user?.id ?? null}
        onUpdateUsername={updateUsername}
        cooldownDaysLeft={cooldownDaysLeft}
        cpBalance={balance}
        dailySwipes={dailySwipes}
        dailyLimit={dailyLimit}
        hourly={hourly}
        onPointsUpdated={handlePointsUpdated}
        onHourlyUpdated={refreshHourly}
      />

      <UsernameOnboardingModal
        open={showOnboarding}
        onSubmit={setUsername}
        onSkip={handleOnboardingSkip}
      />

      <CookieBanner />
    </>
  );
}
