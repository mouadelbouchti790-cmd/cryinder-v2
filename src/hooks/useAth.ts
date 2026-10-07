import { useEffect, useRef, useState } from 'react';
import {
  recordPrice,
  getAthDiscount,
  type AthDiscount,
} from '../services/ath';

/**
 * Track ATH for a token and return discount info.
 *
 * On mount (and whenever price/address changes), the hook records the
 * current price with the ATH tracker and returns the discount tier.
 * The badge is hidden if no ATH has been recorded yet (first visit).
 */
export function useAth(
  tokenAddress: string,
  currentPrice: number,
): AthDiscount | null {
  const [discount, setDiscount] = useState<AthDiscount | null>(null);
  const prevAddress = useRef(tokenAddress);

  useEffect(() => {
    // Only record/re-evaluate when the token ADDRESS changes (new card).
    // Price ticks on the same token must not re-render the badge or write
    // localStorage on every frame — that caused visible flicker on swipes.
    if (prevAddress.current === tokenAddress) return;
    prevAddress.current = tokenAddress;

    if (!tokenAddress || currentPrice <= 0) {
      setDiscount(null);
      return;
    }

    // Record this price observation (updates ATH if it's a new high)
    const ath = recordPrice(tokenAddress, currentPrice);
    if (!ath) {
      setDiscount(null);
      return;
    }

    // Only show discount if we've seen this token before (ATH is
    // older than this render). On first sight the ATH == currentPrice
    // so discount is 0 — hide the badge to avoid "0% below ATH".
    const isFirstSight = ath.at > Date.now() - 2000;

    if (isFirstSight && ath.price === currentPrice) {
      setDiscount(null);
    } else {
      setDiscount(getAthDiscount(tokenAddress, currentPrice));
    }
  }, [tokenAddress, currentPrice]);

  return discount;
}
