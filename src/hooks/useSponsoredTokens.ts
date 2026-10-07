import { useState, useEffect, useCallback, useMemo } from 'react';
import type { AdSlot } from '../types/adSlots';
import { getActiveAdSlots } from '../services/adSlots';

/**
 * Loads all active sponsored ad slots (booked + not expired) and exposes
 * lookup helpers for the search bar and deck injection. Soft-fails to an
 * empty list so the deck never breaks when PocketBase is unreachable.
 */
export function useSponsoredTokens() {
  const [slots, setSlots] = useState<AdSlot[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (import.meta.env.DEV) console.log('[AdSlots] useSponsoredTokens: refresh() called');
    try {
      const raw = await getActiveAdSlots();
      const active = Array.isArray(raw) ? raw : (raw?.items ?? []);
      if (import.meta.env.DEV) console.log(`[AdSlots] useSponsoredTokens: refresh received ${active.length} active slot(s)`);
      setSlots(active);
    } catch (err) {
      console.warn('[AdSlots] useSponsoredTokens: refresh failed', err);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Case-insensitive mint address lookup. */
  const byMintAddress = useCallback(
    (mint: string | null | undefined): AdSlot | null => {
      if (!mint) return null;
      const needle = mint.toLowerCase();
      const found = slots.find((s) => s.token_address?.toLowerCase() === needle) ?? null;
      if (import.meta.env.DEV) console.log(`[AdSlots] byMintAddress lookup: mint=${mint}, found=${found?.id ?? 'null'}`);
      return found;
    },
    [slots],
  );

  /** Case-insensitive symbol lookup (prefers exact symbol match). */
  const bySymbol = useCallback(
    (symbol: string | null | undefined): AdSlot | null => {
      if (!symbol) return null;
      const needle = symbol.toLowerCase();
      return (
        slots.find((s) => s.token_symbol.toLowerCase() === needle) ??
        slots.find((s) => s.token_symbol.toLowerCase().includes(needle)) ??
        null
      );
    },
    [slots],
  );

  /** The primary slot injected into the deck every N swipes. */
  const activeSlot = useMemo<AdSlot | null>(
    () => (slots.length > 0 ? slots[0] : null),
    [slots],
  );

  return { slots, loading, refresh, byMintAddress, bySymbol, activeSlot };
}
