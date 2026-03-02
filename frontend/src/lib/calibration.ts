import { PlantSpecies, SoilType } from '../types';

export function rawToPercent(raw: number, rawDry = 800, rawWet = 400): number {
  if (rawDry === rawWet) return 0;
  const pct = ((rawDry - raw) / (rawDry - rawWet)) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function getCalibration(
  soilType: SoilType | null | undefined,
  adcBits: number = 10,
): { rawDry: number; rawWet: number } {
  if (!soilType) {
    return adcBits === 12 ? { rawDry: 3430, rawWet: 1360 } : { rawDry: 800, rawWet: 400 };
  }
  return adcBits === 12
    ? { rawDry: soilType.raw_dry_12bit, rawWet: soilType.raw_wet_12bit }
    : { rawDry: soilType.raw_dry, rawWet: soilType.raw_wet };
}

export function timeAgo(isoString: string): { text: string; staleness: 'fresh' | 'stale' | 'dead' } {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  let text: string;
  if (diffMin < 1) text = 'Just now';
  else if (diffMin < 60) text = `${diffMin}m ago`;
  else if (diffHr < 24) text = `${diffHr}h ago`;
  else if (diffDay < 7) text = `${diffDay}d ago`;
  else text = new Date(isoString).toLocaleDateString();

  const staleness = diffMin < 75 ? 'fresh' : diffMin < 180 ? 'stale' : 'dead';
  return { text, staleness };
}

export function metricSuffix(metricKey: string): string {
  switch (metricKey) {
    case 'soil_moisture': return 'moisture';
    case 'temperature': return 'temp';
    case 'pressure_hpa': return 'pressure';
    case 'light_lux': return 'light';
    case 'co2_ppm': return 'co2';
    case 'tvoc_ppb': return 'tvoc';
    default: return metricKey;
  }
}

export function getMetricRanges(
  species: PlantSpecies | null,
  metricKey: string,
): { min: number | null; optMin: number | null; optMax: number | null; max: number | null } {
  if (!species) return { min: null, optMin: null, optMax: null, max: null };

  const suffix = metricSuffix(metricKey);
  return {
    min: species[`min_${suffix}` as keyof PlantSpecies] as number | null,
    optMin: species[`optimal_min_${suffix}` as keyof PlantSpecies] as number | null,
    optMax: species[`optimal_max_${suffix}` as keyof PlantSpecies] as number | null,
    max: species[`max_${suffix}` as keyof PlantSpecies] as number | null,
  };
}

export function getMetricStatus(
  value: number,
  species: PlantSpecies | null,
  metricKey: string,
): { status: 'optimal' | 'acceptable' | 'critical' | 'unknown'; label: string } {
  if (!species) return { status: 'unknown', label: '' };

  const suffix = metricSuffix(metricKey);
  const min = species[`min_${suffix}` as keyof PlantSpecies] as number | null;
  const max = species[`max_${suffix}` as keyof PlantSpecies] as number | null;
  const optMin = species[`optimal_min_${suffix}` as keyof PlantSpecies] as number | null;
  const optMax = species[`optimal_max_${suffix}` as keyof PlantSpecies] as number | null;

  if (min == null || max == null || optMin == null || optMax == null) {
    return { status: 'unknown', label: '' };
  }

  const name = species.name;
  if (value >= optMin && value <= optMax) return { status: 'optimal', label: `Optimal for ${name}` };
  if (value >= min && value < optMin) return { status: 'acceptable', label: `Low for ${name}` };
  if (value > optMax && value <= max) return { status: 'acceptable', label: `High for ${name}` };
  if (value < min) return { status: 'critical', label: 'Critical — below minimum' };
  return { status: 'critical', label: 'Critical — above maximum' };
}

export function getOverallHealth(
  values: Record<string, number>,
  species: PlantSpecies | null,
  metricKeys: string[],
): 'green' | 'amber' | 'red' | 'none' {
  if (!species || metricKeys.length === 0) return 'none';

  let worst: 'optimal' | 'acceptable' | 'unknown' = 'optimal';
  for (const key of metricKeys) {
    if (values[key] === undefined) continue;
    const { status } = getMetricStatus(values[key], species, key);
    if (status === 'critical') return 'red';
    if (status === 'acceptable') worst = 'acceptable';
  }
  return worst === 'acceptable' ? 'amber' : 'green';
}
