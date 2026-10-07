export function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function riskLabel(score: number): string {
  if (score <= 3.3) return 'Low Risk';
  if (score <= 6.6) return 'Medium Risk';
  return 'High Risk';
}
