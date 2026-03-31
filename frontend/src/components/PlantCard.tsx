import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plant, Reading, WateringSchedule } from '../types';
import { rawToPercent, timeAgo, getMetricRanges, getMetricStatus, getCalibration } from '../lib/calibration';

// ─── Explicit hex colors (CSS vars don't resolve in SVG stroke/fill) ──────────
const METRIC_HEX: Record<string, string> = {
  soil_moisture: '#14b8a6',  // teal
  temperature:   '#f59e0b',  // amber
  humidity:      '#60a5fa',  // blue
  co2_ppm:       '#a78bfa',  // purple
  tvoc_ppb:      '#f472b6',  // pink
  pressure_hpa:  '#94a3b8',  // slate
  light_lux:     '#a3e635',  // lime
};

// Keep CSS vars for HTML elements (they work fine there)
const METRIC_CSS: Record<string, string> = {
  soil_moisture: 'var(--metric-moisture)',
  temperature:   'var(--metric-temperature)',
  humidity:      'var(--metric-humidity)',
  co2_ppm:       'var(--metric-co2)',
  tvoc_ppb:      'var(--metric-tvoc)',
  pressure_hpa:  'var(--metric-pressure)',
  light_lux:     'var(--metric-light)',
};

// ─── Normalization ranges ──────────────────────────────────────────────────────
const DEFAULT_RANGES: Record<string, [number, number]> = {
  soil_moisture: [0, 100],
  temperature:   [0, 45],
  humidity:      [0, 100],
  light_lux:     [0, 20000],
  co2_ppm:       [300, 2500],
  tvoc_ppb:      [0, 600],
  pressure_hpa:  [940, 1060],
};

// ─── Ring config: semicircle arch (180° sweep) ────────────────────────────────
const ARC_METRICS = ['soil_moisture', 'temperature', 'humidity', 'light_lux'];
const CX = 100;
const CY = 135;
const SWEEP_DEG   = 180;
const START_ANGLE = 180; // start at 9 o'clock, sweep CW to 3 o'clock (upward arch)

// Fixed radial bounds (same regardless of ring count)
const ARCH_OUTER_EDGE = 92.5; // outer edge when 4 rings: r=86 + stroke/2=6.5
const ARCH_INNER_EDGE = 34.5; // inner edge when 4 rings: r=41 - stroke/2=6.5

// Compute radii + stroke so N rings always fill the same radial space
function computeRingLayout(n: number): { radii: number[]; stroke: number } {
  if (n === 0) return { radii: [], stroke: 13 };
  const gap    = 1.5; // small gap between ring edges
  const stroke = (ARCH_OUTER_EDGE - ARCH_INNER_EDGE - (n - 1) * gap) / n;
  const outerR = ARCH_OUTER_EDGE - stroke / 2;
  const radii  = Array.from({ length: n }, (_, i) => outerR - i * (stroke + gap));
  return { radii, stroke };
}

// ─── Metric display labels ─────────────────────────────────────────────────────
const METRIC_LABELS: Record<string, string> = {
  soil_moisture: 'SOIL',
  temperature:   'TEMP',
  humidity:      'HUM',
  light_lux:     'LIGHT',
  co2_ppm:       'CO₂',
  tvoc_ppb:      'TVOC',
  pressure_hpa:  'HPA',
};

// ─── Health indicator ─────────────────────────────────────────────────────────
type WaterState = 'blue' | 'green' | 'orange' | 'none';

const WATER_HEX: Record<WaterState, string> = {
  blue:   '#3b82f6',  // overwatered
  green:  '#22c55e',  // healthy
  orange: '#f97316',  // underwatered
  none:   '#4b5563',
};

// Maps to card border/glow CSS class
const WATER_CARD_CLASS: Record<WaterState, string> = {
  blue:   'health-blue',
  green:  'health-green',
  orange: 'health-orange',
  none:   '',
};

interface HealthIndicator {
  color: string;
  line1: string;  // days number or metric name
  line2: string;  // 'd' or direction ('HIGH'/'LOW')
  cardClass: string;
}

function computeWaterState(moisture: number | undefined, species: PlantSpecies | null): WaterState {
  if (moisture === undefined) return 'none';
  if (species) {
    const r = getMetricRanges(species, 'soil_moisture');
    if (r.optMax != null && moisture > r.optMax) return 'blue';
    if (r.optMin != null && moisture < r.optMin) return 'orange';
    return 'green';
  }
  // Default thresholds when no species assigned
  if (moisture > 75) return 'blue';
  if (moisture < 30) return 'orange';
  return 'green';
}

function computeOtherRisk(
  values: Record<string, number>,
  species: PlantSpecies | null,
): { metric: string; dir: string } | null {
  if (!species) return null;
  for (const key of ['temperature', 'light_lux']) {
    if (values[key] === undefined) continue;
    const { status } = getMetricStatus(values[key], species, key);
    if (status === 'critical' || status === 'acceptable') {
      const r = getMetricRanges(species, key);
      const isHigh = r.optMax != null ? values[key] > r.optMax : false;
      const label = key === 'temperature' ? 'TEMP' : 'LIGHT';
      return { metric: label, dir: isHigh ? 'HIGH' : 'LOW' };
    }
  }
  return null;
}

function computeStreakDays(
  readings: { value: number; recorded_at: string }[],
  state: WaterState,
  species: PlantSpecies | null,
  rawDry: number,
  rawWet: number,
): { days: number; capped: boolean } {
  if (!readings.length) return { days: 0, capped: false };
  let oldestMatchIdx = 0;
  for (let i = 0; i < readings.length; i++) {
    const moisture = rawToPercent(readings[i].value, rawDry, rawWet);
    if (computeWaterState(moisture, species) !== state) break;
    oldestMatchIdx = i;
  }
  const startMs = new Date(readings[oldestMatchIdx].recorded_at).getTime();
  const days = Math.floor((Date.now() - startMs) / 86400000);
  const capped = oldestMatchIdx === readings.length - 1;
  return { days, capped };
}

// Extra metrics shown as pills below (not rings)
const EXTRA_METRICS = ['co2_ppm', 'tvoc_ppb', 'pressure_hpa'];

interface Props { plant: Plant; onClick: () => void; }

interface MetricFmt { key: string; unit: string; decimals: number; }
const METRIC_FMT: MetricFmt[] = [
  { key: 'soil_moisture', unit: '%',   decimals: 0 },
  { key: 'temperature',   unit: '°',   decimals: 1 },
  { key: 'humidity',      unit: '%',   decimals: 0 },
  { key: 'light_lux',     unit: 'lx',  decimals: 0 },
  { key: 'co2_ppm',       unit: 'ppm', decimals: 0 },
  { key: 'tvoc_ppb',      unit: 'ppb', decimals: 0 },
  { key: 'pressure_hpa',  unit: 'hPa', decimals: 0 },
];

function fmtValue(key: string, value: number, decimals: number, unit: string): string {
  if (key === 'light_lux' && value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${value.toFixed(decimals)}${unit}`;
}

// ─── ArcRing ─────────────────────────────────────────────────────────────────
interface ArcRingProps {
  value:    number;
  defMin:   number;
  defMax:   number;
  specMin:  number | null;
  specMax:  number | null;
  hexColor: string;
  radius:   number;
  stroke:   number;
  isStale:  boolean;
}

function ArcRing({ value, defMin, defMax, specMin, specMax, hexColor, radius, stroke, isStale }: ArcRingProps) {
  const circumference = 2 * Math.PI * radius;
  const sweepLen      = circumference * (SWEEP_DEG / 360);
  const normalized    = Math.max(0, Math.min(1, (value - defMin) / (defMax - defMin)));
  const dashFill      = normalized * sweepLen;

  let rangeHighlight: React.ReactNode = null;
  if (specMin != null && specMax != null && specMax > specMin) {
    const n0 = Math.max(0, Math.min(1, (specMin - defMin) / (defMax - defMin)));
    const n1 = Math.max(0, Math.min(1, (specMax - defMin) / (defMax - defMin)));
    const len = (n1 - n0) * sweepLen;
    if (len > 1) {
      const startA = START_ANGLE + n0 * SWEEP_DEG;
      rangeHighlight = (
        <circle cx={CX} cy={CY} r={radius}
          fill="none"
          stroke={hexColor}
          strokeWidth={stroke}
          strokeOpacity={0.28}
          strokeLinecap="butt"
          strokeDasharray={`${len} ${circumference}`}
          transform={`rotate(${startA} ${CX} ${CY})`}
        />
      );
    }
  }

  return (
    <g opacity={isStale ? 0.4 : 1}>
      {/* Track */}
      <circle cx={CX} cy={CY} r={radius}
        fill="none"
        stroke={hexColor}
        strokeWidth={stroke}
        strokeOpacity={0.13}
        strokeDasharray={`${sweepLen} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(${START_ANGLE} ${CX} ${CY})`}
      />
      {rangeHighlight}
      {/* Fill */}
      {dashFill > 0.5 && (
        <circle cx={CX} cy={CY} r={radius}
          fill="none"
          stroke={hexColor}
          strokeWidth={stroke}
          strokeDasharray={`${dashFill} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(${START_ANGLE} ${CX} ${CY})`}
          style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        />
      )}
    </g>
  );
}

// ─── PlantCard ────────────────────────────────────────────────────────────────
export function PlantCard({ plant, onClick }: Props) {
  const [latestValues,    setLatestValues]    = useState<Record<string, number>>({});
  const [lastReadingTime, setLastReadingTime] = useState<string | null>(null);
  const [needsAttention,  setNeedsAttention]  = useState(false);
  const [wateringOverdue, setWateringOverdue] = useState(false);
  const [healthIndicator, setHealthIndicator] = useState<HealthIndicator | null>(null);

  useEffect(() => {
    async function fetchData() {
      const { data: assignments } = await supabase
        .from('sensor_plant').select('sensor_id').eq('plant_id', plant.id);

      let sensorIds = (assignments ?? []).map((a: { sensor_id: string }) => a.sensor_id);

      const useReference = sensorIds.length === 0 && plant.reference_plant_id;
      if (useReference) {
        const { data: refAssign } = await supabase
          .from('sensor_plant').select('sensor_id').eq('plant_id', plant.reference_plant_id!);
        sensorIds = (refAssign ?? []).map((a: { sensor_id: string }) => a.sensor_id);
      }
      if (sensorIds.length === 0) return;

      let adcBits  = plant.sensors?.[0]?.adc_bits ?? 10;
      let sensorCal: { raw_dry: number | null; raw_wet: number | null } | null = plant.sensors?.[0] ?? null;
      if (!plant.sensors?.length && sensorIds.length > 0) {
        const { data: sd } = await supabase
          .from('sensors').select('adc_bits, raw_dry, raw_wet').in('id', sensorIds).limit(1);
        if (sd?.[0]) { adcBits = sd[0].adc_bits ?? 10; sensorCal = sd[0]; }
      }

      const { rawDry, rawWet } = getCalibration(plant.soil_type, adcBits, sensorCal);

      const { data: readings } = await supabase
        .from('readings').select('*').in('sensor_id', sensorIds)
        .order('recorded_at', { ascending: false }).limit(20);

      const values: Record<string, number> = {};
      if (readings?.length) {
        let latestTime: string | null = null;
        for (const r of readings as Reading[]) {
          if (useReference && r.metric === 'soil_moisture') continue;
          if (values[r.metric] !== undefined) continue;
          values[r.metric] = r.metric === 'soil_moisture'
            ? rawToPercent(r.value, rawDry, rawWet) : r.value;
          if (!latestTime || r.recorded_at > latestTime) latestTime = r.recorded_at;
        }
        setLatestValues(values);
        setLastReadingTime(latestTime);

        // Compute health indicator
        const otherRisk = computeOtherRisk(values, plant.plant_species ?? null);
        if (otherRisk) {
          setHealthIndicator({
            color: '#ef4444',
            line1: otherRisk.metric,
            line2: otherRisk.dir,
            cardClass: 'health-red',
          });
        } else {
          const waterState = computeWaterState(values.soil_moisture, plant.plant_species ?? null);
          if (waterState !== 'none') {
            // Fetch soil history to compute streak
            const { data: soilHist } = await supabase
              .from('readings').select('value, recorded_at')
              .in('sensor_id', sensorIds).eq('metric', 'soil_moisture')
              .order('recorded_at', { ascending: false }).limit(250);

            const streak = computeStreakDays(soilHist ?? [], waterState, plant.plant_species ?? null, rawDry, rawWet);
            const daysStr = streak.capped ? `>${streak.days}` : `${streak.days}`;
            setHealthIndicator({
              color: WATER_HEX[waterState],
              line1: daysStr,
              line2: '',
              cardClass: WATER_CARD_CLASS[waterState],
            });
          } else {
            setHealthIndicator(null);
          }
        }
      }

      const apiUrl = import.meta.env.VITE_API_URL || '';
      try {
        const res = await fetch(`${apiUrl}/api/plants/${plant.id}/watering-schedule`);
        if (res.ok) {
          const body = await res.json();
          const sched = body.data?.[0] as WateringSchedule | undefined;
          if (sched?.enabled && sched.next_due_at && new Date(sched.next_due_at) < new Date())
            setWateringOverdue(true);
        }
      } catch { /* ignore */ }

      if (!useReference) {
        const { data: alerts } = await supabase
          .from('alerts').select('id, metric, condition, threshold')
          .in('sensor_id', sensorIds).eq('active', true);
        if (alerts?.length) {
          const alertIds = alerts.map((a: { id: string }) => a.id);
          const since = new Date(Date.now() - 86400000).toISOString();
          const { data: triggers } = await supabase
            .from('alert_history').select('alert_id')
            .in('alert_id', alertIds).gte('triggered_at', since);
          if (triggers?.length) {
            const ids = new Set(triggers.map((t: { alert_id: string }) => t.alert_id));
            const still = alerts.some((a: { id: string; metric: string; condition: string; threshold: number }) => {
              if (!ids.has(a.id)) return false;
              const v = values[a.metric];
              return v !== undefined && (a.condition === 'above' ? v > a.threshold : v < a.threshold);
            });
            if (still) setNeedsAttention(true);
          }
        }
      }
    }
    fetchData();
  }, [plant.id, plant.soil_type, plant.reference_plant_id]);

  const isStale     = lastReadingTime ? timeAgo(lastReadingTime).staleness === 'dead' : false;

  const extraMetrics = EXTRA_METRICS.flatMap(key => {
    if (latestValues[key] === undefined) return [];
    const m = METRIC_FMT.find(m => m.key === key)!;
    return [{ key, label: fmtValue(key, latestValues[key], m.decimals, m.unit) }];
  });

  const availRingMetrics = ARC_METRICS.filter(k => latestValues[k] !== undefined);
  const { radii, stroke: ringStroke } = computeRingLayout(availRingMetrics.length);

  const hasAnyData = availRingMetrics.length > 0 || extraMetrics.length > 0;
  const clipId     = `clip-${plant.id.replace(/-/g, '')}`;

  const cardClasses = ['plant-circle-card',
    needsAttention && 'attention',
    healthIndicator?.cardClass || null,
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses} onClick={onClick}>
      <div className="arc-rings-container">
        {/* viewBox 200×140: photo background, arch at CY=135, health indicator in center */}
        <svg viewBox="0 0 200 140" width="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">

          {/* ClipPath: upper semicircle matching ARCH_INNER_EDGE exactly */}
          {healthIndicator && (
            <defs>
              <clipPath id={`hi-${clipId}`}>
                <rect x={CX - ARCH_INNER_EDGE} y={CY - ARCH_INNER_EDGE}
                      width={ARCH_INNER_EDGE * 2} height={ARCH_INNER_EDGE} />
              </clipPath>
            </defs>
          )}

          {/* Photo as full background */}
          {plant.photo_url && (
            <>
              <image href={plant.photo_url} x={0} y={0} width={200} height={140}
                preserveAspectRatio="xMidYMid slice" />
              <rect x={0} y={0} width={200} height={140} fill="rgba(8,18,10,0.70)" />
            </>
          )}

          {/* Health indicator fill — circle clipped to upper semicircle + rect to fill viewBox bottom strip */}
          {healthIndicator && (
            <>
              <circle cx={CX} cy={CY} r={ARCH_INNER_EDGE}
                fill={healthIndicator.color}
                clipPath={`url(#hi-${clipId})`} />
              <rect x={CX - ARCH_INNER_EDGE} y={CY}
                width={ARCH_INNER_EDGE * 2} height={140 - CY}
                fill={healthIndicator.color} />
            </>
          )}

          {/* Plant name — top-left */}
          <text x="10" y="18"
            fontFamily="DM Sans, sans-serif" fontSize="13" fontWeight="800"
            fill="rgba(255,255,255,0.92)">
            {plant.name}
          </text>

          {/* Last reading time — top-right */}
          {lastReadingTime && (() => {
            const { text, staleness } = timeAgo(lastReadingTime);
            const compact = text.replace(/ ago$/, '').replace('Just now', 'now');
            const fill = staleness === 'fresh' ? '#4ade80' : staleness === 'stale' ? '#f59e0b' : '#ef4444';
            return (
              <text x="190" y="18"
                textAnchor="end"
                fontFamily="DM Sans, sans-serif" fontSize="9.5" fontWeight="500"
                fill={fill}>
                {compact}
              </text>
            );
          })()}

          {/* Arc rings — N rings scale to fill the same radial space */}
          {availRingMetrics.map((key, i) => {
            const ranges = getMetricRanges(plant.plant_species, key);
            const def    = DEFAULT_RANGES[key] ?? [0, 100];
            return (
              <ArcRing key={key}
                value={latestValues[key]}
                defMin={def[0]} defMax={def[1]}
                specMin={ranges.min} specMax={ranges.max}
                hexColor={METRIC_HEX[key]}
                radius={radii[i]}
                stroke={ringStroke}
                isStale={isStale}
              />
            );
          })}

          {/* Alert dots */}
          {needsAttention && <circle cx={CX + 22} cy={68} r={4} fill="#ef4444" />}
          {wateringOverdue && <circle cx={CX - 22} cy={68} r={4} fill="#14b8a6" />}

          {/* Health indicator text — rendered on top of rings */}
          {healthIndicator && (
            healthIndicator.line2 ? (
              // Two-line risk label (e.g. TEMP / HIGH)
              <>
                <text x={CX} y={113}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="9.5" fontWeight="700" fontFamily="DM Sans, sans-serif"
                  fill="rgba(0,0,0,0.82)">
                  {healthIndicator.line1}
                </text>
                <text x={CX} y={124}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="9.5" fontWeight="700" fontFamily="DM Sans, sans-serif"
                  fill="rgba(0,0,0,0.82)">
                  {healthIndicator.line2.toUpperCase()}
                </text>
              </>
            ) : (
              // Single large number (water state days)
              <text x={CX} y={119}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="18" fontWeight="800" fontFamily="DM Sans, sans-serif"
                fill="rgba(0,0,0,0.82)">
                {healthIndicator.line1}
              </text>
            )
          )}
        </svg>
      </div>

      {/* 4-column metric row */}
      {hasAnyData && (
        <div className="card-metrics-row">
          {ARC_METRICS.filter(k => latestValues[k] !== undefined).map((key) => {
            const m = METRIC_FMT.find(m => m.key === key)!;
            const label = fmtValue(key, latestValues[key], m.decimals, m.unit);
            return (
              <div key={key} className="card-metric-col">
                <span className="metric-col-dot" style={{ background: METRIC_HEX[key] }} />
                <span className="metric-col-value" style={{ color: METRIC_HEX[key] }}>{label}</span>
                <span className="metric-col-label">{METRIC_LABELS[key] ?? key}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Extra metrics pills (CO₂, TVOC, pressure) + no-data fallback */}
      {(extraMetrics.length > 0 || !hasAnyData) && (
        <div className="circle-card-info">
          {extraMetrics.length > 0 && (
            <div className="circle-card-metrics">
              {extraMetrics.map(({ key, label }) => (
                <span key={key} className="circle-metric-pill"
                  style={{ '--pill-color': METRIC_CSS[key] } as React.CSSProperties}>
                  <span className="pill-dot" />{label}
                </span>
              ))}
            </div>
          )}
          {!hasAnyData && <span className="circle-card-no-data">no readings yet</span>}
        </div>
      )}
    </div>
  );
}
