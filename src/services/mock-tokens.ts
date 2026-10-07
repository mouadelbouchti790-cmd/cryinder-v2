import type { TokenData } from '../types/token';
import { seededRandom } from '../utils';

/** Synthetic 40-point sparkline shaped by the 24h change (mock data only). */
function generateSparkline(priceChange24h: number, points = 40): number[] {
  const data: number[] = [];
  let v = 50;
  const drift = (priceChange24h / 100) * 3;
  for (let i = 0; i < points; i++) {
    const noise = (Math.sin(i * 2.1) + Math.cos(i * 0.9)) * 6 + (Math.random() - 0.5) * 8;
    v = Math.max(8, Math.min(92, v + noise + drift));
    data.push(v);
  }
  return data;
}

/** Real memecoin logos (DexScreener CDN) so the hero deck shows actual
 *  recognizable assets instead of letter initials. */
const TOKEN_LOGOS: Record<string, string> = {
  WIF: 'https://cdn.dexscreener.com/cms/images/-XEhTwRYk_j-kgpB?width=800&height=800&quality=95&format=auto',
  BONK: 'https://cdn.dexscreener.com/cms/images/ba03c0370670d176dc33bbd212eb023337a460ad7edfa053ca96ae22f31c3dcf?width=800&height=800&quality=95&format=auto',
  POPCAT: 'https://cdn.dexscreener.com/cms/images/Pp6Fvh41hc0bHGK8?width=800&height=800&quality=95&format=auto',
  MYRO: 'https://cdn.dexscreener.com/cms/images/KSMWxVNJe9mwaeMU?width=800&height=800&quality=95&format=auto',
  PONKE: 'https://cdn.dexscreener.com/cms/images/cfbe2eabb540e7ba8651832435e968e12c9df2efb452e78358e64d8f73ae5760?width=800&height=800&quality=95&format=auto',
  SAMO: 'https://cdn.dexscreener.com/cms/images/a7198a45e447efcd154dabf476af8767d16a097780663380da3081aceefbb71e?width=800&height=800&quality=95&format=auto',
};

const MOCK_MEMECOINS: {
  name: string;
  symbol: string;
  price: number;
  mcap: number;
  vol24h: number;
  change24h: number;
  lipct: number;
  audit: string;
  labels: string[];
}[] = [
  {
    name: 'DogWifHat',
    symbol: 'WIF',
    price: 3.42,
    mcap: 3_420_000_000,
    vol24h: 580_000_000,
    change24h: 12.4,
    lipct: 88,
    audit: 'SlowMist ✓',
    labels: [],
  },
  {
    name: 'Bonk',
    symbol: 'BONK',
    price: 0.00003412,
    mcap: 2_180_000_000,
    vol24h: 320_000_000,
    change24h: 8.9,
    lipct: 92,
    audit: 'Hacken ✓',
    labels: ['verified'],
  },
  {
    name: 'Popcat',
    symbol: 'POPCAT',
    price: 1.87,
    mcap: 1_830_000_000,
    vol24h: 210_000_000,
    change24h: -3.2,
    lipct: 85,
    audit: 'Community',
    labels: [],
  },
  {
    name: 'Myro',
    symbol: 'MYRO',
    price: 0.26,
    mcap: 260_000_000,
    vol24h: 45_000_000,
    change24h: 21.7,
    lipct: 79,
    audit: 'SlowMist ✓',
    labels: [],
  },
  {
    name: 'Samoyed Coin',
    symbol: 'SAMO',
    price: 0.0123,
    mcap: 185_000_000,
    vol24h: 32_000_000,
    change24h: -5.8,
    lipct: 81,
    audit: 'Community',
    labels: [],
  },
  {
    name: 'Mumu The Bull',
    symbol: 'MUMU',
    price: 0.0000892,
    mcap: 142_000_000,
    vol24h: 28_000_000,
    change24h: 34.1,
    lipct: 76,
    audit: 'Community',
    labels: [],
  },
  {
    name: 'Wen',
    symbol: 'WEN',
    price: 0.000211,
    mcap: 210_000_000,
    vol24h: 41_000_000,
    change24h: 15.3,
    lipct: 87,
    audit: 'SlowMist ✓',
    labels: [],
  },
  {
    name: 'Smoking Chicken Fish',
    symbol: 'SCF',
    price: 0.00000471,
    mcap: 47_000_000,
    vol24h: 9_500_000,
    change24h: 62.8,
    lipct: 64,
    audit: 'Community',
    labels: [],
  },
  {
    name: 'Ponke',
    symbol: 'PONKE',
    price: 0.58,
    mcap: 325_000_000,
    vol24h: 67_000_000,
    change24h: -1.1,
    lipct: 90,
    audit: 'Hacken ✓',
    labels: ['verified'],
  },
  {
    name: 'CateCoin',
    symbol: 'CATE',
    price: 0.00000124,
    mcap: 89_000_000,
    vol24h: 14_000_000,
    change24h: 28.6,
    lipct: 71,
    audit: 'Community',
    labels: [],
  },
  {
    name: 'Toshi',
    symbol: 'TOSHI',
    price: 0.000798,
    mcap: 335_000_000,
    vol24h: 52_000_000,
    change24h: 5.2,
    lipct: 83,
    audit: 'SlowMist ✓',
    labels: [],
  },
  {
    name: 'Apu Apustaja',
    symbol: 'APU',
    price: 0.000342,
    mcap: 228_000_000,
    vol24h: 38_000_000,
    change24h: -8.4,
    lipct: 78,
    audit: 'Community',
    labels: [],
  },
  {
    name: 'Mog Coin',
    symbol: 'MOG',
    price: 0.00000281,
    mcap: 1_100_000_000,
    vol24h: 195_000_000,
    change24h: 18.9,
    lipct: 94,
    audit: 'Hacken ✓',
    labels: ['verified'],
  },
  {
    name: 'HarryPotterObamaSonic10Inu',
    symbol: 'BITCOIN',
    price: 0.093,
    mcap: 93_000_000,
    vol24h: 11_000_000,
    change24h: 41.2,
    lipct: 68,
    audit: 'Community',
    labels: [],
  },
  {
    name: 'Doland Tremp',
    symbol: 'TREMP',
    price: 0.0037,
    mcap: 37_000_000,
    vol24h: 5_800_000,
    change24h: -12.6,
    lipct: 60,
    audit: 'Community',
    labels: [],
  },
];

export function createMockTokens(): TokenData[] {
  return MOCK_MEMECOINS.map((m, i) => {
    const seed = seededRandom(`${m.name}-${m.symbol}`);
    const liq = m.mcap * 0.15;
    const pairAddrSeed = `${m.name}-pair-${i}`;
    const mintAddrSeed = `${m.name}-mint-${i}`;

    const pairAddr =
      'PAIR' +
      Array.from({ length: 40 }, (_, j) => {
        const s = seededRandom(pairAddrSeed + j);
        return '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[
          Math.floor(s * 52)
        ];
      }).join('');

    const mintAddr =
      'MINT' +
      Array.from({ length: 40 }, (_, j) => {
        const s = seededRandom(mintAddrSeed + j);
        return '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[
          Math.floor(s * 52)
        ];
      }).join('');

    const riskScore = Math.round((seed * 4 + 4.5) * 10) / 10;

    return {
      id: pairAddr,
      mintAddress: mintAddr,
      name: m.name,
      symbol: m.symbol,
      description: `${m.name} is a community-driven memecoin on Solana with active trading on major DEX aggregators.`,
      logoUrl: TOKEN_LOGOS[m.symbol] ?? '',
      priceUsd: m.price,
      priceChange24h: m.change24h,
      priceChange1h: Math.round((m.change24h * (seededRandom(m.symbol + '1h') * 0.3 + 0.1)) * 10) / 10,
      priceChange6h: Math.round((m.change24h * (seededRandom(m.symbol + '6h') * 0.5 + 0.3)) * 10) / 10,
      priceChange5m: Math.round((m.change24h * (seededRandom(m.symbol + '5m') * 0.15 + 0.02)) * 100) / 100,
      marketCap: m.mcap,
      volume24h: m.vol24h,
      volume1h: Math.round(m.vol24h * (seededRandom(m.symbol + 'v1h') * 0.08 + 0.02)),
      volume6h: Math.round(m.vol24h * (seededRandom(m.symbol + 'v6h') * 0.3 + 0.1)),
      liquidityUsd: Math.round(liq),
      fdv: m.mcap,
      liquiditySource: Math.round(liq) > 0 ? 'dexscreener' : 'none',
      liquidityLockedPct: m.lipct,
      auditStatus: m.audit,
      riskScore,
      sparkline: generateSparkline(m.change24h),
      chain: 'solana',
      dexId: 'raydium',
      pairAddress: pairAddr,
      createdAt: Date.now() - Math.floor(seed * 180 * 24 * 60 * 60 * 1000),
      labels: m.labels,
      txnsBuys24h: Math.round(m.vol24h / m.price * (seededRandom(m.symbol + 'buys') * 0.3 + 0.35)),
      txnsSells24h: Math.round(m.vol24h / m.price * (seededRandom(m.symbol + 'sells') * 0.3 + 0.25)),
      txnsBuys1h: Math.round(m.vol24h / m.price * (seededRandom(m.symbol + 'buys1h') * 0.15 + 0.08) / 6),
      txnsSells1h: Math.round(m.vol24h / m.price * (seededRandom(m.symbol + 'sells1h') * 0.15 + 0.06) / 6),
    };
  });
}
