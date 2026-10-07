import { useEffect, useMemo } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets as usePrivySolanaWallets } from '@privy-io/react-auth/solana';

export interface PrivyEmbeddedWalletLink {
  privyUserId: string;
  walletAddress: string;
}

const STORAGE_KEY = 'privy-wallet-link';

function getLinkedEmbeddedSolanaAddress(linkedAccounts: unknown): string | null {
  if (!Array.isArray(linkedAccounts)) return null;
  for (const account of linkedAccounts) {
    if (
      typeof account === 'object' &&
      account !== null &&
      'walletClientType' in account &&
      (account as { walletClientType?: string }).walletClientType === 'privy' &&
      'chainType' in account &&
      (account as { chainType?: string }).chainType === 'solana' &&
      'address' in account &&
      typeof (account as { address?: unknown }).address === 'string'
    ) {
      return (account as { address: string }).address;
    }
  }
  return null;
}

/**
 * Post-login sync: resolves the Privy embedded Solana wallet via `useWallets`
 * and logs/saves `{ privyUserId, walletAddress }` when one exists.
 * Never auto-creates or auto-reveals anything — wallet creation and display
 * stay strictly user-initiated via AuthModal.
 * Must be mounted inside <PrivyProvider>.
 */
export function usePrivyEmbeddedWallet(): PrivyEmbeddedWalletLink & { ready: boolean } {
  const { authenticated, user } = usePrivy();
  const { wallets } = usePrivySolanaWallets();

  const embeddedAddress = useMemo(() => {
    const fromUser = getLinkedEmbeddedSolanaAddress(user?.linkedAccounts);
    if (fromUser) return fromUser;
    // Fallback to connected Solana wallets (auto-created embedded wallet
    // appears here once provisioning completes).
    return wallets[0]?.address ?? null;
  }, [user?.linkedAccounts, wallets]);

  const privyUserId = authenticated ? (user?.id ?? null) : null;
  const ready = privyUserId !== null && embeddedAddress !== null;

  useEffect(() => {
    if (!ready || !privyUserId || !embeddedAddress) return;
    const link: PrivyEmbeddedWalletLink = { privyUserId, walletAddress: embeddedAddress };
    console.log('[Privy] post-login embedded wallet', link);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...link, savedAt: new Date().toISOString() }),
      );
    } catch {
      // Storage unavailable (private mode) — log is sufficient.
    }
  }, [ready, privyUserId, embeddedAddress]);

  return {
    privyUserId: privyUserId ?? '',
    walletAddress: embeddedAddress ?? '',
    ready,
  };
}
