import { useEffect, useRef, useCallback } from 'react';

const LEFT_SWIPE_URL = '/sounds/left-swipe.mp3';
const RIGHT_SWIPE_URL = '/sounds/right-swipe.mp3';

export function useSwipeSounds() {
  const leftRef = useRef<HTMLAudioElement | null>(null);
  const rightRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const left = new Audio(LEFT_SWIPE_URL);
    const right = new Audio(RIGHT_SWIPE_URL);
    left.preload = 'auto';
    right.preload = 'auto';
    leftRef.current = left;
    rightRef.current = right;
    return () => {
      leftRef.current = null;
      rightRef.current = null;
    };
  }, []);

  const playLeft = useCallback(() => {
    const audio = leftRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  /**
   * The "ding" — ONLY played after a swap confirms on-chain. It is NOT
   * played on the swipe itself anymore (a failed swap must stay silent).
   */
  const playSuccess = useCallback(() => {
    const audio = rightRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  return { playLeft, playSuccess };
}
