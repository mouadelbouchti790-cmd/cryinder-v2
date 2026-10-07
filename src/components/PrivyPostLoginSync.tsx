import { usePrivyEmbeddedWallet } from '../hooks/usePrivyEmbeddedWallet';

/**
 * Post-login listener: resolves the Privy embedded wallet via `useWallets`,
 * auto-provisions one via `createWallet()` when missing, and persists
 * `{ privyUserId, walletAddress }` (see hook for details).
 * Mount once inside <PrivyProvider>; renders nothing.
 */
export default function PrivyPostLoginSync() {
  usePrivyEmbeddedWallet();
  return null;
}
