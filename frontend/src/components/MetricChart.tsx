import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label
} from 'recharts';
import { supabase } from '../lib/supabase';
import { Reading, Metric, METRICS, SoilType, PlantType } from '../types';
import { rawToPercent } from '../lib/calibration';

type Range = '24h' | '7d' | '30d' | 'custom';

interface Props {
  sensorId: string;
  soilType?: SoilType | null;
  plantType?: PlantType | null;
}

export function MetricChart({ sensorId, soilType, plantType }: Props) {
  const [metric, setMetric] = useState<Metric>('soil_moisture');
  const [availableMetrics, setAvailableMetrics] = useState<Set<Metric>>(new Set(['soil_moisture']));
  const [range, setRange] = useState<Range>('24h');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [readings, setReadings] = useState<Reading[]>([]);
  const [latest, setLatest] = useState<Reading | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        // If current metric not available, switch to first available
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

  useEffect(() => {
    fetchAvailableMetrics();
  }, [sensorId]);

  useEffect(() => {
    fetchReadings();
    fetchLatest();
    const interval = setInterval(() => {
      fetchReadings();
      fetchLatest();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchReadings, fetchLatest]);

  const convertValue = (v: number) =>
    metric === 'soil_moisture'
      ? rawToPercent(v, soilType?.raw_dry, soilType?.raw_wet)
      : v;

  const chartData = readings.map((r) => ({
    time: new Date(r.recorded_at).toLocaleString(),
    value: convertValue(r.value),
  }));

  const getReferenceLines = () => {
    if (!plantType) return null;

    let prefix = '';
    switch(metric) {
      case 'temperature': prefix = 'temp'; break;
      case 'humidity': prefix = 'humidity'; break;
      case 'soil_moisture': prefix = 'moisture'; break;
      case 'light_lux': prefix = 'light'; break;
      case 'co2_ppm': prefix = 'co2'; break;
    }

    const min = plantType[`min_${prefix}` as keyof PlantType] as number;
    const max = plantType[`max_${prefix}` as keyof PlantType] as number;
    const optMin = plantType[`optimal_min_${prefix}` as keyof PlantType] as number;
    const optMax = plantType[`optimal_max_${prefix}` as keyof PlantType] as number;

    return (
      <>
        {min !== null && <ReferenceLine y={min} stroke="#ef4444" strokeDasharray="3 3"><Label value="Min" position="insideLeft" fill="#ef4444" fontSize={10}/></ReferenceLine>}
        {max !== null && <ReferenceLine y={max} stroke="#ef4444" strokeDasharray="3 3"><Label value="Max" position="insideLeft" fill="#ef4444" fontSize={10}/></ReferenceLine>}
        {optMin !== null && <ReferenceLine y={optMin} stroke="#3b82f6" strokeDasharray="3 3"><Label value="Opt Min" position="insideLeft" fill="#3b82f6" fontSize={10}/></ReferenceLine>}
        {optMax !== null && <ReferenceLine y={optMax} stroke="#3b82f6" strokeDasharray="3 3"><Label value="Opt Max" position="insideLeft" fill="#3b82f6" fontSize={10}/></ReferenceLine>}
      </>
    );
  };

  return (
    <div className="metric-chart">
      <div className="metric-tabs">
        {METRICS.filter(m => availableMetrics.has(m.key)).map((m) => (
          <button
            key={m.key}
            className={metric === m.key ? 'tab active' : 'tab'}
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {latest && (
        <div className="current-reading">
          <span className="current-value">{convertValue(latest.value).toFixed(1)} {metricInfo.unit}</span>
          <span className="current-time">
            {new Date(latest.recorded_at).toLocaleString()}
          </span>
        </div>
      )}

      <div className="range-selector">
        {(['24h', '7d', '30d', 'custom'] as Range[]).map((r) => (
          <button
            key={r}
            className={range === r ? 'range active' : 'range'}
            onClick={() => setRange(r)}
          >
            {r === 'custom' ? 'Custom' : r}
          </button>
        ))}
        {range === 'custom' && (
          <span className="custom-dates">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </span>
        )}
      </div>

      {loading && <p className="status">Loading...</p>}
      {error && <p className="status error">Error: {error}</p>}

      {!loading && !error && readings.length === 0 && (
        <p className="status">No data for this range.</p>
      )}

      {readings.length > 0 && (
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="time" stroke="#888" tick={{ fontSize: 11 }} />
            <YAxis stroke="#888" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#1e1e1e', border: '1px solid #444' }}
            />
            {getReferenceLines()}
            <Line
              type="monotone"
              dataKey="value"
              stroke="#4ade80"
              strokeWidth={2}
              dot={false}
              name={`${metricInfo.label} (${metricInfo.unit})`}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
