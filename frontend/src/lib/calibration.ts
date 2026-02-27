export function rawToPercent(raw: number, rawDry = 800, rawWet = 400): number {
  if (rawDry === rawWet) return 0;
  const pct = ((rawDry - raw) / (rawDry - rawWet)) * 100;
  return Math.max(0, Math.min(100, pct));
}
