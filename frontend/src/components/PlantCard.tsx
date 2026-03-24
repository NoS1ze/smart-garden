import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plant, Reading, WateringSchedule } from '../types';
import { rawToPercent, timeAgo, getMetricRanges, getOverallHealth, getCalibration } from '../lib/calibration';

// ─── Explicit hex colors (CSS vars don't resolve in SVG stroke/fill) ──────────
const METRIC_HEX: Record<string, string> = {
  soil_moisture: '#14b8a6',  // teal
  temperature:   '#f59e0b',  // amber
  humidity:      '#60a5fa',  // blue
  co2_ppm:       '#a78bfa',  // purple
  tvoc_ppb:      '#f472b6',  // pink
  pressure_hpa:  '#94a3b8',  // slate
  light_lux:     '#a3e635',  // lime (distinct from amber temperature)
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

// ─── Normalization ranges (always use these — species ranges only for highlight) ─
const DEFAULT_RANGES: Record<string, [number, number]> = {
  soil_moisture: [0, 100],
  temperature:   [0, 45],
  humidity:      [0, 100],
  light_lux:     [0, 20000],
  co2_ppm:       [300, 2500],
  tvoc_ppb:      [0, 600],
  pressure_hpa:  [940, 1060],
};

// ─── Ring config: 4 primary rings, outermost first ──────────────────────────
const ARC_METRICS  = ['soil_moisture', 'temperature', 'humidity', 'light_lux'];
const RING_RADII   = [84, 70, 56, 42];
const RING_STROKE  = 10;
const CX = 100;
const CY = 100;
const SWEEP_DEG    = 270;
const START_ANGLE  = 135; // arc starts bottom-left (7:30), sweeps CW 270° to bottom-right

// Legend: right-side panel in the 40-unit extension (viewBox 0 0 240 200)
// 4 rows symmetric around CY=100: y = 76, 92, 108, 124
const LEGEND_OFFSETS = [-24, -8, 8, 24];

// Extra metrics shown as pills below (not rings)
const EXTRA_METRICS = ['co2_ppm', 'tvoc_ppb', 'pressure_hpa'];

// Health color → hex
const HEALTH_HEX: Record<string, string> = {
  green: '#22c55e',
  amber: '#f59e0b',
  red:   '#ef4444',
  none:  '#4ade80',
};

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
  defMin:   number;   // DEFAULT_RANGES min (normalization scale)
  defMax:   number;   // DEFAULT_RANGES max
  specMin:  number | null; // species min/max for range highlight
  specMax:  number | null;
  hexColor: string;
  radius:   number;
  isStale:  boolean;
}

function ArcRing({ value, defMin, defMax, specMin, specMax, hexColor, radius, isStale }: ArcRingProps) {
  const circumference = 2 * Math.PI * radius;
  const sweepLen      = circumference * (SWEEP_DEG / 360);
  const normalized    = Math.max(0, Math.min(1, (value - defMin) / (defMax - defMin)));
  const dashFill      = normalized * sweepLen;

  // Species min→max range highlight on track
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
          strokeWidth={RING_STROKE}
          strokeOpacity={0.30}
          strokeLinecap="butt"
          strokeDasharray={`${len} ${circumference}`}
          transform={`rotate(${startA} ${CX} ${CY})`}
        />
      );
    }
  }

  return (
    <g opacity={isStale ? 0.4 : 1}>
      {/* Track — dim 270° arc */}
      <circle cx={CX} cy={CY} r={radius}
        fill="none"
        stroke={hexColor}
        strokeWidth={RING_STROKE}
        strokeOpacity={0.15}
        strokeDasharray={`${sweepLen} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(${START_ANGLE} ${CX} ${CY})`}
      />
      {/* Species range highlight */}
      {rangeHighlight}
      {/* Fill arc */}
      {dashFill > 0.5 && (
        <circle cx={CX} cy={CY} r={radius}
          fill="none"
          stroke={hexColor}
          strokeWidth={RING_STROKE}
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
  const healthColor = getOverallHealth(latestValues, plant.plant_species,
    ARC_METRICS.filter(k => latestValues[k] !== undefined));
  const centerHex   = HEALTH_HEX[healthColor] ?? HEALTH_HEX.none;

  const extraMetrics = EXTRA_METRICS.flatMap(key => {
    if (latestValues[key] === undefined) return [];
    const m = METRIC_FMT.find(m => m.key === key)!;
    return [{ key, label: fmtValue(key, latestValues[key], m.decimals, m.unit) }];
  });

  const hasAnyData = ARC_METRICS.some(k => latestValues[k] !== undefined) || extraMetrics.length > 0;
  const clipId     = `clip-${plant.id.replace(/-/g, '')}`;

  const cardClasses = ['plant-circle-card',
    needsAttention && 'attention',
    healthColor !== 'none' && `health-${healthColor}`,
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses} onClick={onClick}>
      <div className="arc-rings-container">
        {/* viewBox 240×200: left 200px for rings, right 40px for side legend */}
        <svg viewBox="0 0 240 200" width="100%" height="100%" overflow="visible" aria-hidden="true">
          <defs>
            <clipPath id={clipId}><circle cx={CX} cy={CY} r={33} /></clipPath>
          </defs>

          {/* Rings — only for metrics with data */}
          {ARC_METRICS.map((key, idx) => {
            if (latestValues[key] === undefined) return null;
            const ranges = getMetricRanges(plant.plant_species, key);
            const def    = DEFAULT_RANGES[key] ?? [0, 100];
            return (
              <ArcRing key={key}
                value={latestValues[key]}
                defMin={def[0]} defMax={def[1]}
                specMin={ranges.min} specMax={ranges.max}
                hexColor={METRIC_HEX[key]}
                radius={RING_RADII[idx]}
                isStale={isStale}
              />
            );
          })}

          {/* Right-side legend: color bar + value, one row per ring slot */}
          {ARC_METRICS.map((key, idx) => {
            if (latestValues[key] === undefined) return null;
            const m     = METRIC_FMT.find(m => m.key === key)!;
            const label = fmtValue(key, latestValues[key], m.decimals, m.unit);
            const color = METRIC_HEX[key];
            const ly    = CY + LEGEND_OFFSETS[idx];
            return (
              <g key={`legend-${key}`} opacity={isStale ? 0.4 : 1}>
                <rect x={207} y={ly - 2} width={6} height={4} rx={1} fill={color} opacity={0.85} />
                <text x={216} y={ly + 1}
                  textAnchor="start" dominantBaseline="middle"
                  fontSize="8.5" fontFamily="DM Sans, sans-serif" fontWeight="600"
                  fill={color}>
                  {label}
                </text>
              </g>
            );
          })}

          {/* Center circle backdrop */}
          <circle cx={CX} cy={CY} r={34}
            fill="#131c15"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />

          {/* Plant photo or health-colored initial */}
          {plant.photo_url ? (
            <image href={plant.photo_url}
              x={CX - 33} y={CY - 33} width={66} height={66}
              clipPath={`url(#${clipId})`}
              preserveAspectRatio="xMidYMid slice"
            />
          ) : (
            <text x={CX} y={CY + 9}
              textAnchor="middle"
              fontSize="26"
              fontFamily="DM Serif Display, serif"
              fill={centerHex}
            >
              {plant.name.charAt(0).toUpperCase()}
            </text>
          )}

          {needsAttention && (
            <circle cx={CX + 26} cy={CY - 26} r={5} fill="#ef4444" />
          )}
          {wateringOverdue && (
            <circle cx={CX - 26} cy={CY - 26} r={5} fill="#14b8a6" />
          )}

          {/* Staleness indicator anchored to the bottom gap of the rings */}
          {lastReadingTime && (() => {
            const { text, staleness } = timeAgo(lastReadingTime);
            const staleHex = staleness === 'fresh' ? '#4ade80'
                           : staleness === 'stale'  ? '#f59e0b'
                           : '#ef4444';
            return (
              <g>
                <circle cx={CX - 6} cy={192} r={2.5} fill={staleHex} />
                <text x={CX - 1} y={192}
                  textAnchor="start" dominantBaseline="middle"
                  fontSize="7.5" fontFamily="DM Sans, sans-serif" fontWeight="500"
                  fill="rgba(255,255,255,0.38)">
                  {text}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      <div className="circle-card-info">
        <h3 className="circle-card-name">{plant.name}</h3>
        {plant.plant_species && (
          <p className="circle-card-species">{plant.plant_species.name}</p>
        )}

        {/* Extra metrics not in rings (CO₂, TVOC, pressure) */}
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
    </div>
  );
}
