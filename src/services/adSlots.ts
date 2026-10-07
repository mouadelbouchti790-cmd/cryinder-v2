import { getActiveAdSlots as fetchActiveAdSlots, trackAdEvent } from './pocketbase';
import type { AdSlot, AdSlotTier } from '../types/adSlots';

export const AD_SLOTS_COLLECTION = 'ad_slots';

/**
 * Get ALL active booked ad slots (status = "booked" AND expires_at > now).
 * Soft-fails to [] so the deck silently falls back to regular cards.
 */
export async function getActiveAdSlots(): Promise<AdSlot[]> {
  if (import.meta.env.DEV) console.log('[AdSlots] getActiveAdSlots: fetching from PocketBase...');
  try {
    const slots = await fetchActiveAdSlots();
    if (import.meta.env.DEV) console.log(`[AdSlots] getActiveAdSlots: received ${slots.length} slot(s)`, slots.map(s => ({
      id: s.id,
      symbol: s.token_symbol,
      tier: s.slot_type,
      status: s.status,
      expires_at: s.expires_at,
      impressions: s.impressions,
      clicks: s.clicks,
    })));
    if (slots.length === 0) {
      console.warn('[AdSlots] No active ad slots returned — check PocketBase: status must be "booked" and expires_at must be null/empty or > now');
    } else if (import.meta.env.DEV) {
      // Client-side expiry check for debugging
      const now = new Date();
      slots.forEach(s => {
        const expired = s.expires_at ? new Date(s.expires_at) < now : false;
        console.log(`[AdSlots] Slot ${s.id} (${s.token_symbol}): status=${s.status}, expired=${expired}, expires_at=${s.expires_at}`);
      });
    }
    return slots;
  } catch (err) {
    console.warn('[AdSlots] Failed to load active ad slots:', err);
    return [];
  }
}

/**
 * Get one active booked ad slot (status = "booked" AND expires_at > now).
 * Kept for compatibility: returns the most recently booked active slot.
 */
export async function getActiveAdSlot(): Promise<AdSlot | null> {
  const slots = await getActiveAdSlots();
  return slots.length > 0 ? slots[0] : null;
}

/**
 * Increment the impression counter. Soft-fails: tracking must never
 * break the deck experience.
 */
export async function trackImpression(slotId: string): Promise<void> {
  if (import.meta.env.DEV) console.log(`[AdSlots] trackImpression: slotId=${slotId}`);
  try {
    await trackAdEvent(slotId, 'impression');
    if (import.meta.env.DEV) console.log(`[AdSlots] trackImpression: success for ${slotId}`);
  } catch (err) {
    console.warn('[AdSlots] Impression tracking failed:', err);
  }
}

/**
 * Increment the click counter. Soft-fails.
 */
export async function trackClick(slotId: string): Promise<void> {
  if (import.meta.env.DEV) console.log(`[AdSlots] trackClick: slotId=${slotId}`);
  try {
    await trackAdEvent(slotId, 'click');
    if (import.meta.env.DEV) console.log(`[AdSlots] trackClick: success for ${slotId}`);
  } catch (err) {
    console.warn('[AdSlots] Click tracking failed:', err);
  }
}

/** Tier price map (silver / gold / platinum). */
export const AD_SLOT_PRICES: Record<AdSlotTier, number> = {
  silver: 0.5,
  gold: 2,
  platinum: 5,
};

/** Exposure weights: platinum shows 3x more than silver, gold 2x more. */
export const AD_TIER_WEIGHTS: Record<AdSlotTier, number> = {
  platinum: 3,
  gold: 2,
  silver: 1,
};

let _lastPickedId: string | null = null;

/**
 * Weighted random pick: builds a pool where platinum appears 3x, gold 2x,
 * silver 1x, then picks uniformly from the pool. Fair exposure proportional
 * to tier without starving lower tiers entirely. Never shows the same slot
 * twice in a row if an alternative exists.
 */
export function getWeightedAdSlot(slots: AdSlot[]): AdSlot | null {
  if (slots.length === 0) {
    if (import.meta.env.DEV) console.log('[AdSlots] getWeightedAdSlot: no slots available, returning null');
    return null;
  }
  if (slots.length === 1) {
    _lastPickedId = slots[0].id;
    if (import.meta.env.DEV) console.log(`[AdSlots] getWeightedAdSlot: only one slot, returning ${slots[0].id}`);
    return slots[0];
  }

  const pool: AdSlot[] = [];
  for (const slot of slots) {
    const weight = AD_TIER_WEIGHTS[slot.slot_type] ?? AD_TIER_WEIGHTS.silver;
    if (import.meta.env.DEV) console.log(`[AdSlots] getWeightedAdSlot: slot ${slot.id} (${slot.token_symbol}) tier=${slot.slot_type} weight=${weight}`);
    for (let i = 0; i < weight; i++) {
      pool.push(slot);
    }
  }

  let picked = pool[Math.floor(Math.random() * pool.length)] ?? null;
  if (import.meta.env.DEV) console.log(`[AdSlots] getWeightedAdSlot: pool size=${pool.length}, picked=${picked?.id ?? 'null'} (${picked?.token_symbol ?? '-'}) last=${_lastPickedId ?? 'null'}`);

  // Avoid repeating the same ad twice in a row if alternative exists
  if (picked && picked.id === _lastPickedId) {
    const distinctIds = new Set(slots.map((s) => s.id));
    if (distinctIds.size > 1) {
      const filteredPool = pool.filter((s) => s.id !== _lastPickedId);
      if (filteredPool.length > 0) {
        const retryPicked = filteredPool[Math.floor(Math.random() * filteredPool.length)] ?? picked;
        if (import.meta.env.DEV) console.log(`[AdSlots] Avoiding duplicate, re-picked ${retryPicked?.id ?? 'null'} (${retryPicked?.token_symbol ?? '-'}) instead of ${picked.id}`);
        picked = retryPicked;
      }
    }
  }

  _lastPickedId = picked?.id ?? null;
  return picked;
}

/** How many swipes between sponsored cards. */
export const AD_EVERY_N_SWIPES = 7;
