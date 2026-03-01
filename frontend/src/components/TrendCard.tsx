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

export function TrendCard({ sensorId, metric, label, unit, period, apiUrl, color = '#4ade80' }: Props) {
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
  if (!data || data.points.length === 0) return null;

  const trendColor = TREND_COLORS[data.trend] || TREND_COLORS.stable;

  return (
    <div className="trend-card">
      <div className="trend-card-header">
        <span className="trend-card-label">{label}</span>
        <span className="trend-card-avg">
          {data.current_avg.toFixed(metric === 'temperature' ? 1 : 0)}{unit}
        </span>
      </div>
      <div className="trend-card-sparkline">
        <ResponsiveContainer width="100%" height={40}>
          <AreaChart data={data.points}>
            <Area
              type="monotone"
              dataKey="avg"
              stroke={color}
              fill={color}
              fillOpacity={0.15}
              strokeWidth={1.5}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="trend-card-footer">
        <span className="trend-arrow" style={{ color: trendColor }}>
          {TREND_ARROWS[data.trend]}
        </span>
        {data.change_pct != null && (
          <span className="trend-change" style={{ color: trendColor }}>
            {data.change_pct > 0 ? '+' : ''}{data.change_pct}%
          </span>
        )}
        <span className="trend-period">vs prev {period.replace('d', ' days')}</span>
      </div>
    </div>
  );
}
