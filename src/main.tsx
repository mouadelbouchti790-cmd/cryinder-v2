import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import AppWalletProvider from './components/AppWalletProvider';
import PrivyPostLoginSync from './components/PrivyPostLoginSync';
import PrivyOAuthHandler from './components/PrivyOAuthHandler';
import App from './App';
import './index.css';
import { dedupeOAuthUrl } from './utils/privyOAuth';

// Collapse stacked ?privy_oauth_code/state duplicates synchronously BEFORE
// PrivyProvider mounts, so the SDK sees one clean callback instead of
// concatenated values that fail silently or loop.
dedupeOAuthUrl();

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;

function Providers() {
  const app = (
    <AppWalletProvider>
      <App />
    </AppWalletProvider>
  );
  if (!privyAppId) return app;
  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: { theme: 'dark', accentColor: '#2563eb' },
        // Social + email first: these trigger a fresh Privy embedded wallet
        // (see embeddedWallets.createOnLogin below). Extension wallets are
        // strictly opt-in from inside AuthModal — never the default path.
        loginMethods: ['google', 'apple', 'email'],
        externalWallets: {
          solana: { connectors: toSolanaWalletConnectors() },
        },
        embeddedWallets: {
          ethereum: { createOnLogin: 'all-users' },
          solana: { createOnLogin: 'all-users' },
        },
      }}
    >
      <PrivyPostLoginSync />
      <PrivyOAuthHandler />
      {app}
    </PrivyProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers />
  </StrictMode>
);
