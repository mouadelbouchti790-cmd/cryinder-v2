export interface TokenData {
  id: string;
  mintAddress: string;
  name: string;
  symbol: string;
  description: string;
  logoUrl: string;
  priceUsd: number;
  priceChange24h: number;
  priceChange1h: number;
  priceChange6h: number;
  priceChange5m: number;
  marketCap: number;
  volume24h: number;
  volume1h: number;
  volume6h: number;
  liquidityUsd: number;
  fdv: number;
  /** Which feed answered the liquidity lookup. `none` = no source had data. */
  liquiditySource: LiquiditySource;
  /** null = unknown (not provided by the data source). Never fabricated. */
  liquidityLockedPct: number | null;
  /** "Unverified" unless backed by a real audit data source. */
  auditStatus: string;
  riskScore: number;
  /** Empty array = no historical price data available. */
  sparkline: number[];
  chain: string;
  dexId: string;
  pairAddress: string;
  createdAt: number;
  labels: string[];
  txnsBuys24h: number;
  txnsSells24h: number;
  txnsBuys1h: number;
  txnsSells1h: number;
  isSponsored?: boolean;
  sponsoredTier?: import('./adSlots').AdSlotTier;
}

export interface TokenSearchResult {
  mintAddress: string;
  name: string;
  symbol: string;
  priceUsd: number | null;
  priceChange24h: number | null;
  pairAddress: string;
  dexId: string;
  imageUrl: string | null;
}

export type DeckTab = 'new' | 'gainers' | 'trending';

export type LiquiditySource = 'dexscreener' | 'geckoterminal' | 'none';

export type AppMainView = 'deck' | 'portfolio' | 'swipers' | 'lootbox';

export interface PortfolioHolding {
  mint: string;
  name: string;
  symbol: string;
  logoUrl: string;
  balance: number;
  decimals: number;
  priceUsd: number;
  valueUsd: number;
  priceChange24h: number;
  marketCap?: number;
  sparkline?: number[];
}

export interface PortfolioMetrics {
  totalValueUsd: number;
  change24hPct: number;
  topPerformer: PortfolioHolding | null;
  biggestGainer: PortfolioHolding | null;
  biggestLoser: PortfolioHolding | null;
  mostValuable: PortfolioHolding | null;
  tokenCount: number;
}

export interface PortfolioState {
  holdings: PortfolioHolding[];
  totalValueUsd: number;
  metrics: PortfolioMetrics;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdated: number | null;
  retry: () => void;
  refresh: () => void;
}

export interface DexScreenerState {
  tokens: TokenData[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}
