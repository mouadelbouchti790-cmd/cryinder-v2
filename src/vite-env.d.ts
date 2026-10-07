/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Helius RPC API key (replaces public mainnet-beta endpoint). */
  readonly VITE_HELIUS_API_KEY?: string;
  /** Jupiter API key (x-api-key). Client-side by design. */
  readonly VITE_JUPITER_API_KEY?: string;
  /** Referral account that collects the 1% fee on every swap. */
  readonly VITE_JUPITER_REFERRAL_ACCOUNT?: string;
  /** Cryinder treasury wallet that receives platform fees (display only). */
  readonly VITE_CRYINDER_TREASURY_PUBLIC_KEY?: string;
  /** Referral fee in basis points (100 = 1%). Range 50–255. */
  readonly VITE_JUPITER_REFERRAL_FEE_BPS?: string;
  /** Debug: "false" disables referral params entirely (isolation test). */
  readonly VITE_JUPITER_REFERRAL_ENABLED?: string;
  /** Debug: fee param name. Spec-correct is "referralFee". */
  readonly VITE_JUPITER_REFERRAL_PARAM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
