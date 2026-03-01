import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Label
} from 'recharts';
import { supabase } from '../lib/supabase';
import { Reading, Metric, METRICS, SoilType, PlantSpecies, WateringEvent } from '../types';
import { rawToPercent, timeAgo, getCalibration } from '../lib/calibration';

type Range = '24h' | '7d' | '30d' | 'custom';

const METRIC_COLORS: Record<string, string> = {
  soil_moisture: '#14b8a6',
  temperature: '#f59e0b',
  humidity: '#60a5fa',
  pressure_hpa: '#c084fc',
  co2_ppm: '#a78bfa',
  tvoc_ppb: '#f472b6',
  light_lux: '#eab308',
};

interface Props {
  sensorId: string;
  soilType?: SoilType | null;
  plantSpecies?: PlantSpecies | null;
  adcBits?: number;
  plantId?: string;
}

export function MetricChart({ sensorId, soilType, plantSpecies, adcBits = 10, plantId }: Props) {
  const [metric, setMetric] = useState<Metric>('soil_moisture');
  const [availableMetrics, setAvailableMetrics] = useState<Set<Metric>>(new Set(['soil_moisture']));
  const [range, setRange] = useState<Range>('24h');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [readings, setReadings] = useState<Reading[]>([]);
  const [latest, setLatest] = useState<Reading | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wateringEvents, setWateringEvents] = useState<WateringEvent[]>([]);

  const apiUrl = import.meta.env.VITE_API_URL || '';
  const metricInfo = METRICS.find((m) => m.key === metric)!;

  const fetchReadings = useCallback(async () => {
    setLoading(true);
    setError(null);

    let from: string;
    let to: string = new Date().toISOString();

    if (range === 'custom') {
      if (!customFrom || !customTo) {
        setLoading(false);
        return;
      }
      from = new Date(customFrom).toISOString();
      to = new Date(customTo + 'T23:59:59').toISOString();
    } else {
      const now = Date.now();
      const ms = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 }[range];
      from = new Date(now - ms).toISOString();
    }

    const { data, error: err } = await supabase
      .from('readings')
      .select('*')
      .eq('sensor_id', sensorId)
      .eq('metric', metric)
      .gte('recorded_at', from)
      .lte('recorded_at', to)
      .order('recorded_at', { ascending: true })
      .limit(1000);

    if (err) {
      setError(err.message);
    } else {
      setReadings(data ?? []);
    }
    setLoading(false);
  }, [sensorId, metric, range, customFrom, customTo]);

  const fetchAvailableMetrics = useCallback(async () => {
    const { data } = await supabase
      .from('readings')
      .select('metric')
      .eq('sensor_id', sensorId);

    if (data) {
      const metrics = new Set(data.map(d => d.metric as Metric));
      if (metrics.size > 0) {
        setAvailableMetrics(metrics);
        if (!metrics.has(metric)) {
          setMetric(Array.from(metrics)[0]);
        }
      }
    }
  }, [sensorId, metric]);

  const fetchLatest = useCallback(async () => {
    const { data } = await supabase
      .from('readings')
      .select('*')
      .eq('sensor_id', sensorId)
      .eq('metric', metric)
      .order('recorded_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      setLatest(data[0]);
    } else {
      setLatest(null);
    }
  }, [sensorId, metric]);

  const fetchWateringEvents = useCallback(async () => {
    if (metric !== 'soil_moisture' || !plantId) {
      setWateringEvents([]);
      return;
    }
    try {
      const res = await fetch(`${apiUrl}/api/plants/${plantId}/watering-events?limit=50`);
      if (res.ok) {
        const json = await res.json();
        setWateringEvents(json.data ?? []);
      }
    } catch {
      // ignore
    }
  }, [metric, plantId, apiUrl]);

  useEffect(() => {
    fetchAvailableMetrics();
  }, [sensorId]);

  useEffect(() => {
    fetchReadings();
    fetchLatest();
    fetchWateringEvents();
    const interval = setInterval(() => {
      fetchReadings();
      fetchLatest();
      fetchWateringEvents();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchReadings, fetchLatest, fetchWateringEvents]);

  const { rawDry, rawWet } = getCalibration(soilType, adcBits);
  const convertValue = (v: number) =>
    metric === 'soil_moisture'
      ? rawToPercent(v, rawDry, rawWet)
      : v;

  const chartData = readings.map((r) => ({
    time: new Date(r.recorded_at).getTime(),
    value: convertValue(r.value),
  }));

  const getRefValues = (): number[] => {
    if (!plantSpecies) return [];
    let prefix = '';
    switch (metric) {
      case 'temperature': prefix = 'temp'; break;
      case 'humidity': prefix = 'humidity'; break;
      case 'soil_moisture': prefix = 'moisture'; break;
      case 'light_lux': prefix = 'light'; break;
      case 'co2_ppm': prefix = 'co2'; break;
      case 'pressure_hpa': prefix = 'pressure'; break;
      case 'tvoc_ppb': prefix = 'tvoc'; break;
    }
    return [
      plantSpecies[`min_${prefix}` as keyof PlantSpecies],
      plantSpecies[`max_${prefix}` as keyof PlantSpecies],
      plantSpecies[`optimal_min_${prefix}` as keyof PlantSpecies],
      plantSpecies[`optimal_max_${prefix}` as keyof PlantSpecies],
    ].filter((v): v is number => v !== null && v !== undefined && typeof v === 'number');
  };

  const computeYDomain = (): [number, number] | undefined => {
    const dataValues = chartData.map(d => d.value);
    const refValues = getRefValues();
    const allValues = [...dataValues, ...refValues];
    if (allValues.length === 0) return undefined;
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const padding = (maxVal - minVal) * 0.05 || 1;
    return [Math.floor(minVal - padding), Math.ceil(maxVal + padding)];
  };

  const yDomain = computeYDomain();

  const formatXTick = (timestamp: number) => {
    const d = new Date(timestamp);
    if (range === '24h') {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    if (range === '7d') {
      const day = d.toLocaleDateString([], { weekday: 'short' });
      const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${day} ${time}`;
    }
    if (range === '30d') {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    // custom: auto-detect based on range span
    const span = customFrom && customTo
      ? new Date(customTo).getTime() - new Date(customFrom).getTime()
      : 0;
    if (span <= 86400000) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    if (span <= 604800000) {
      const day = d.toLocaleDateString([], { weekday: 'short' });
      const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${day} ${time}`;
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const metricColor = METRIC_COLORS[metric] || '#22c55e';

  const getSpeciesPrefix = () => {
    switch(metric) {
      case 'temperature': return 'temp';
      case 'humidity': return 'humidity';
      case 'soil_moisture': return 'moisture';
      case 'light_lux': return 'light';
      case 'co2_ppm': return 'co2';
      case 'pressure_hpa': return 'pressure';
      case 'tvoc_ppb': return 'tvoc';
      default: return '';
    }
  };

  const refLabel = (text: string, fill: string) =>
    (props: any) => {
      const { viewBox } = props;
      if (!viewBox) return null;
      const x = (viewBox.x || 0) + 6;
      const y = (viewBox.y || 0);
      const w = text.length * 6 + 10;
      return (
        <g>
          <rect x={x - 3} y={y - 9} width={w} height={16} rx={3} fill="rgba(10,15,12,0.85)" />
          <text x={x} y={y + 3} fill={fill} fontSize={10} fontFamily="DM Sans, sans-serif">{text}</text>
        </g>
      );
    };

  const getReferenceLines = () => {
    if (!plantSpecies) return null;
    const prefix = getSpeciesPrefix();

    const min = plantSpecies[`min_${prefix}` as keyof PlantSpecies] as number;
    const max = plantSpecies[`max_${prefix}` as keyof PlantSpecies] as number;
    const optMin = plantSpecies[`optimal_min_${prefix}` as keyof PlantSpecies] as number;
    const optMax = plantSpecies[`optimal_max_${prefix}` as keyof PlantSpecies] as number;

    return (
      <>
        {optMin != null && optMax != null && (
          <ReferenceArea y1={optMin} y2={optMax} fill={metricColor} fillOpacity={0.06} />
        )}
        {min != null && <ReferenceLine y={min} stroke="#ef4444" strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.4}><Label content={refLabel('Min', '#ef4444')} /></ReferenceLine>}
        {max != null && <ReferenceLine y={max} stroke="#ef4444" strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.4}><Label content={refLabel('Max', '#ef4444')} /></ReferenceLine>}
        {optMin != null && <ReferenceLine y={optMin} stroke={metricColor} strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.5}><Label content={refLabel('Optimal', metricColor)} /></ReferenceLine>}
        {optMax != null && <ReferenceLine y={optMax} stroke={metricColor} strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.5} />}
      </>
    );
  };

  return (
    <div className="metric-chart">
      <div className="chart-title">Historical Readings</div>

      <div className="metric-tabs">
        {METRICS.filter(m => availableMetrics.has(m.key)).map((m) => (
          <button
            key={m.key}
            className={metric === m.key ? 'tab active' : 'tab'}
            style={metric === m.key ? { background: METRIC_COLORS[m.key] || '#22c55e' } : undefined}
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="chart-controls-row">
        <div className="time-selector">
          {(['24h', '7d', '30d', 'custom'] as Range[]).map((r) => (
            <button
              key={r}
              className={range === r ? 'time-btn active' : 'time-btn'}
              onClick={() => setRange(r)}
            >
              {r === 'custom' ? 'Custom' : r}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <span className="custom-dates">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </span>
        )}
        {latest && (
          <div className="metric-hero">
            <span className="metric-value">Latest: {convertValue(latest.value).toFixed(1)}{metricInfo.unit}</span>
            <span className="metric-timestamp staleness-indicator" title={new Date(latest.recorded_at).toLocaleString()}>
              <span className={`staleness-dot ${timeAgo(latest.recorded_at).staleness}`} />
              {timeAgo(latest.recorded_at).text}
            </span>
          </div>
        )}
      </div>

      {loading && <div className="chart-skeleton" />}
      {!loading && error && <p className="status error">Error: {error}</p>}

      {!loading && !error && readings.length === 0 && (
        <p className="status">No data for this range.</p>
      )}

      {readings.length > 0 && (
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={chartData} margin={{ right: 20 }}>
            <defs>
              <linearGradient id={`chartGradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={metricColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={metricColor} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={{ fill: '#4b7a5a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatXTick}
              angle={-30}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fill: '#4b7a5a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={35}
              domain={yDomain}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(14, 20, 16, 0.95)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                color: '#f0fdf4',
                fontSize: '13px',
              }}
              labelFormatter={(ts) => new Date(ts as number).toLocaleString()}
            />
            {getReferenceLines()}
            {metric === 'soil_moisture' && wateringEvents.map((we) => {
              const ts = new Date(we.detected_at).getTime();
              return (
                <ReferenceLine
                  key={we.id}
                  x={ts}
                  stroke="#3b82f6"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                >
                  <Label value="W" position="top" fill="#3b82f6" fontSize={10} />
                </ReferenceLine>
              );
            })}
            <Area
              type="monotone"
              dataKey="value"
              stroke={metricColor}
              strokeWidth={2}
              fill={`url(#chartGradient-${metric})`}
              dot={false}
              activeDot={{ r: 5, fill: metricColor, stroke: '#080c0a', strokeWidth: 2 }}
              name={`${metricInfo.label} (${metricInfo.unit})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
