import { ReactNode, useCallback, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletAdapterNetwork, type WalletError } from '@solana/wallet-adapter-base';
import {
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
} from '@solana-mobile/wallet-adapter-mobile';
import { AppIdentity } from '@solana-mobile/mobile-wallet-adapter-protocol';

interface AppWalletProviderProps {
  children: ReactNode;
}

const APP_IDENTITY: AppIdentity = {
  name: 'Cryinder',
  uri: 'https://cryinder.xyz',
  // Mobile wallets show this icon in the authorization prompt. It must be
  // a real fetchable URL or data URI — an empty data URI renders blank.
  icon: 'https://cryinder.xyz/logo.png',
};

export default function AppWalletProvider({ children }: AppWalletProviderProps) {
  const network = WalletAdapterNetwork.Mainnet;

  const endpoint = useMemo(() => {
    const heliusKey = import.meta.env.VITE_HELIUS_API_KEY;
    if (heliusKey) {
      return `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
    }
    console.warn(
      'VITE_HELIUS_API_KEY not set; falling back to public RPC (will rate-limit).',
    );
    return 'https://api.mainnet-beta.solana.com';
  }, []);

  const wallets = useMemo(() => {
    // authorizationResultCache is required by LocalSolanaMobileWalletAdapter.
    // Using the correct key name (not authorizationCache) so the runtime
    // adapter can access it before the page renders.
    const mobileAdapter = new SolanaMobileWalletAdapter({
      addressSelector: createDefaultAddressSelector(),
      authorizationResultCache: createDefaultAuthorizationResultCache(),
      appIdentity: APP_IDENTITY,
    });

    const adapters = [
      mobileAdapter,
      // NOTE: no explicit Phantom/Solflare adapters. Both extensions register
      // themselves via the Standard Wallet API and the adapter layer logs
      // "can be removed from your app" when duplicates exist. Keeping the
      // legacy instances alongside the standard registrations yields TWO
      // 'Phantom' entries, so select-by-name + sign can resolve to different
      // underlying handles — exactly the kind of signer/address mismatch the
      // SIWS server rejects as "Invalid SIWS message and/or nonce".
    ];

    // WalletConnect lets iOS/mobile wallets (Phantom, Solflare, Trust,
    // Coinbase, …) connect via QR/deep-link when there's no browser
    // extension. Requires a free project id from
    // https://cloud.walletconnect.com — only enabled when configured.
    const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as
      | string
      | undefined;
    if (projectId) {
      adapters.push(
        new WalletConnectWalletAdapter({
          network,
          options: { projectId },
        }),
      );
    }

    return adapters;
  }, [network]);

  // wallet-adapter logs every failed connect() via onError by default, so a
  // user dismissing the Phantom popup (or a guarded no-selection call)
  // prints a scary raw WalletNotSelectedError even though AuthModal already
  // surfaces a friendly prompt for it. Filter that one expected case; every
  // other adapter error still logs loud.
  const handleWalletError = useCallback((error: WalletError) => {
    if (error?.name === 'WalletNotSelectedError') return;
    console.error('[wallet-adapter]', error);
  }, []);

  return (
    // @ts-expect-error React 18 bigint incompatibility with Solana wallet-adapter
    <ConnectionProvider endpoint={endpoint}>
      {/* Manual connect only: autoConnect stays off so a previously used
          Phantom/Solflare extension never auto-reconnects and hijacks a
          fresh Privy embedded-wallet session on reload. Users who prefer an
          external wallet can still connect explicitly via AuthModal/Gateway. */}
      <WalletProvider wallets={wallets} autoConnect={false} onError={handleWalletError}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
