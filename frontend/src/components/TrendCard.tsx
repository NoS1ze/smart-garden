import { useState, useEffect } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

interface TrendPoint {
  day: string;
  avg: number;
  min: number;
  max: number;
}

interface TrendData {
  metric: string;
  period: string;
  current_avg: number;
  previous_avg: number | null;
  trend: 'up' | 'down' | 'stable';
  change_pct: number | null;
  points: TrendPoint[];
}

interface Props {
  sensorId: string;
  metric: string;
  label: string;
  unit: string;
  period: string;
  apiUrl: string;
  color?: string;
  convertValue?: (raw: number) => number;
}

const TREND_ARROWS: Record<string, string> = {
  up: '\u2191',
  down: '\u2193',
  stable: '\u2192',
};

const TREND_COLORS: Record<string, string> = {
  up: 'var(--green-vivid)',
  down: 'var(--red-alert)',
  stable: 'var(--text-muted)',
};

export function TrendCard({ sensorId, metric, label, unit, period, apiUrl, color = '#4ade80', convertValue }: Props) {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrend() {
      try {
        const res = await fetch(
          `${apiUrl}/api/readings/trends?sensor_id=${sensorId}&metric=${metric}&period=${period}`
        );
        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        // ignore
      }
      setLoading(false);
    }
    fetchTrend();
  }, [sensorId, metric, period, apiUrl]);

  if (loading) return <div className="trend-card trend-card-loading">Loading...</div>;
  if (!data) return null;

  // Filter corrupted data points and optionally convert values (e.g. raw soil → %)
  const cv = convertValue || ((v: number) => v);
  const cleanPoints = data.points
    .filter(p => p.avg != null && isFinite(p.avg) && !isNaN(p.avg))
    .map(p => ({ ...p, avg: cv(p.avg), min: cv(p.min), max: cv(p.max) }));
  if (cleanPoints.length === 0) return null;
  const cleanAvg = (data.current_avg != null && isFinite(data.current_avg)) ? cv(data.current_avg) : null;
  // Recompute change_pct from converted values if converter provided
  let cleanChange = (data.change_pct != null && isFinite(data.change_pct)) ? data.change_pct : null;
  if (convertValue && data.current_avg != null && data.previous_avg != null && isFinite(data.previous_avg)) {
    const curConv = cv(data.current_avg);
    const prevConv = cv(data.previous_avg);
    if (prevConv !== 0) {
      cleanChange = Math.round(((curConv - prevConv) / Math.abs(prevConv)) * 1000) / 10;
    }
  }

  const trendColor = TREND_COLORS[data.trend] || TREND_COLORS.stable;

  return (
    <div className="trend-card">
      <div className="trend-card-header">
        <span className="trend-card-label">{label}</span>
        {cleanAvg != null && (
          <span className="trend-card-avg">
            {cleanAvg.toFixed(metric === 'temperature' ? 1 : 0)}{unit}
          </span>
        )}
      </div>
      <div className="trend-card-sparkline">
        <ResponsiveContainer width="100%" height={52}>
          <AreaChart data={cleanPoints}>
            <Area
              type="natural"
              dataKey="avg"
              stroke={color}
              fill={color}
              fillOpacity={0.08}
              strokeWidth={2.5}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="trend-card-footer">
        <span className="trend-arrow" style={{ color: trendColor }}>
          {TREND_ARROWS[data.trend]}
        </span>
        {cleanChange != null && (
          <span className="trend-change" style={{ color: trendColor }}>
            {cleanChange > 0 ? '+' : ''}{cleanChange}%
          </span>
        )}
        <span className="trend-period">vs prev {period.replace('d', ' days')}</span>
      </div>
    </div>
  );
}
