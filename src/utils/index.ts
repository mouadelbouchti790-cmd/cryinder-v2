export { formatPrice, formatMarketCap, formatChange, formatVolume } from './formatters';
export { seededRandom, riskLabel } from './crypto';
export { COLORS, CARD_W, CARD_H, SWIPE_THRESHOLD, STACK_DEPTH } from './constants';

export function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
