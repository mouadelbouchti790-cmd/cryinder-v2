export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;

/** Cloudflare Turnstile site key for the human-verification challenge. */
export const TURNSTILE_SITE_KEY = '0x4AAAAAAE60my9J-ArZ6jCC';

/**
 * Find the user's Privy embedded Solana wallet: prefer the linked account
 * flagged walletClientType 'privy' + chainType 'solana', else fall back to
 * the first connected Solana wallet address (auto-created wallets land here).
 */
export function findPrivyEmbeddedSolanaAddress(
  linkedAccounts: unknown,
  fallbackAddresses: Array<string | undefined>,
): string | null {
  if (Array.isArray(linkedAccounts)) {
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
  }
  return fallbackAddresses.find((a): a is string => typeof a === 'string') ?? null;
}

/**
 * True when the Privy user's linked accounts already contain this Solana
 * address (external Phantom or otherwise). Used to skip a redundant
 * siws/link that the server rejects with HTTP 400.
 */
export function isSolanaAddressLinked(linkedAccounts: unknown, address: string): boolean {
  if (!Array.isArray(linkedAccounts)) return false;
  const target = address.trim();
  if (!target) return false;
  for (const account of linkedAccounts) {
    if (typeof account !== 'object' || account === null) continue;
    const rec = account as { address?: unknown; chainType?: unknown; type?: unknown };
    if (typeof rec.address !== 'string') continue;
    if (rec.address !== target) continue;
    // Address match alone is sufficient; chain/type checks below only
    // narrow obvious non-wallet entries without risking a false negative
    // from SDK shape drift.
    if (typeof rec.chainType === 'string' && rec.chainType !== 'solana') continue;
    return true;
  }
  return false;
}

/** Gv9x...3xP style shortening. */
export function shortenAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 3)}...${address.slice(-3)}`;
}

/** localStorage key remembering the last login method that succeeded. */
const LAST_LOGIN_KEY = 'cryinder-last-login-method';

/** OAuth redirect survival flag: method chosen before leaving for Google/Apple. */
const OAUTH_INITIATED_KEY = 'privy_oauth_initiated';

export function getLastLoginMethod(): string | null {
  try {
    return localStorage.getItem(LAST_LOGIN_KEY);
  } catch {
    return null;
  }
}

export function setLastLoginMethod(method: string): void {
  try {
    localStorage.setItem(LAST_LOGIN_KEY, method);
  } catch {
    // Private mode — badge simply won't persist.
  }
}

export function markOAuthInitiated(method: string): void {
  try {
    sessionStorage.setItem(OAUTH_INITIATED_KEY, method);
  } catch {
    // Non-fatal; choice tracking degrades to in-page flows only.
  }
}

/** Consumes the pre-redirect choice flag (null = no active choice this session). */
export function consumeOAuthInitiated(): string | null {
  try {
    const method = sessionStorage.getItem(OAUTH_INITIATED_KEY);
    if (method) sessionStorage.removeItem(OAUTH_INITIATED_KEY);
    return method;
  } catch {
    return null;
  }
}
