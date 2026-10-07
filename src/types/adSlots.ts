export type AdSlotTier = 'silver' | 'gold' | 'platinum';

export type AdSlotStatus = 'available' | 'booked' | 'expired';

export interface AdSlot {
  id: string;
  creator_name: string;
  creator_email: string;
  creator_wallet: string;
  token_name: string;
  token_symbol: string;
  token_address?: string;
  pair_address?: string | null;
  link_url?: string | null;
  slot_type: AdSlotTier;
  price: number;
  duration_hours: number;
  status: AdSlotStatus;
  booked_date: string;
  expires_at: string | null;
  impressions: number;
  clicks: number;
  txid: string | null;
  card_image: string | null;
  created: string;
  updated: string;
}

export interface AdSlotTierConfig {
  tier: AdSlotTier;
  label: string;
  border: string;
  glow: string;
  badgeBg: string;
  badgeText: string;
  accent: string;
}

export const AD_SLOT_TIERS: Record<AdSlotTier, AdSlotTierConfig> = {
  silver: {
    tier: 'silver',
    label: 'Silver',
    border: 'border-white/20',
    glow: 'rgba(255,255,255,0.14)',
    badgeBg: 'bg-white/[0.08]',
    badgeText: 'text-white/70',
    accent: '#CBD5E1',
  },
  gold: {
    tier: 'gold',
    label: 'Gold',
    border: 'border-yellow-400/50',
    glow: 'rgba(250,204,21,0.18)',
    badgeBg: 'bg-yellow-400/10',
    badgeText: 'text-yellow-400',
    accent: '#FACC15',
  },
  platinum: {
    tier: 'platinum',
    label: 'Platinum',
    border: 'border-purple-400/50',
    glow: 'rgba(192,132,252,0.18)',
    badgeBg: 'bg-purple-400/10',
    badgeText: 'text-purple-400',
    accent: '#C084FC',
  },
};
