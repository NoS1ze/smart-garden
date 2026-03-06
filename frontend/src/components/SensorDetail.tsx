import { useState, useEffect } from 'react';
import { Sensor } from '../types';
import { supabase } from '../lib/supabase';
import { timeAgo } from '../lib/calibration';
import { MetricIcon } from './Icons';

const apiUrl = import.meta.env.VITE_API_URL || '';

const METRIC_LABELS: Record<string, string> = {
  soil_moisture: 'Soil Moisture',
  temperature: 'Temperature',
  humidity: 'Humidity',
  co2_ppm: 'CO\u2082',
  tvoc_ppb: 'TVOC',
  pressure_hpa: 'Pressure',
  light_lux: 'Light',
};

const METRIC_UNITS: Record<string, string> = {
  temperature: '\u00b0C',
  humidity: '%',
  soil_moisture: ' raw',
  co2_ppm: ' ppm',
  tvoc_ppb: ' ppb',
  pressure_hpa: ' hPa',
  light_lux: ' lux',
};

interface Reading {
  id: string;
  recorded_at: string;
  metric: string;
  value: number;
}

interface SensorDetailProps {
  sensorId: string;
  onBack: () => void;
}

export function SensorDetail({ sensorId, onBack }: SensorDetailProps) {
  const [sensor, setSensor] = useState<Sensor | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // Fetch sensor info from API
        const res = await fetch(`${apiUrl}/api/sensors`);
        if (!res.ok) throw new Error('Failed to fetch sensors');
        const body = await res.json();
        const found = (body.data ?? []).find((s: Sensor) => s.id === sensorId);
        if (!found) throw new Error('Sensor not found');
        setSensor(found);

        // Fetch recent readings from Supabase
        const { data, error: dbErr } = await supabase
          .from('readings')
          .select('id, recorded_at, metric, value')
          .eq('sensor_id', sensorId)
          .order('recorded_at', { ascending: false })
          .limit(100);
        if (dbErr) throw new Error(dbErr.message);
        setReadings(data ?? []);
      } catch (e: any) {
        setError(e.message);
      }
      setLoading(false);
    }
    fetchData();
  }, [sensorId]);

  async function handleDeleteReading(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`${apiUrl}/api/readings/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete reading');
      setReadings((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // silently ignore — row stays in list
    }
    setDeleting(null);
    setConfirmDeleteId(null);
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mon = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    const s = d.getSeconds().toString().padStart(2, '0');
    return `${mon} ${day}, ${year} ${h}:${m}:${s}`;
  }

  function formatValue(metric: string, value: number): string {
    const unit = METRIC_UNITS[metric] ?? '';
    const display = Number.isInteger(value) ? value.toString() : value.toFixed(1);
    return `${display}${unit}`;
  }

  if (loading) return <p className="status">Loading sensor details...</p>;
  if (error) return <p className="status error">{error}</p>;
  if (!sensor) return <p className="status">Sensor not found.</p>;

  const staleness = sensor.last_seen_at ? timeAgo(sensor.last_seen_at) : null;

  return (
    <div className="sensor-detail">
      <button className="btn-back" onClick={onBack}>
        &larr; Back to Sensors
      </button>

      <div className="section-card sensor-detail-header">
        <div className="sensor-ident">
          <h2>{sensor.display_name || 'Unnamed Sensor'}</h2>
          <code>{sensor.mac_address}</code>
        </div>
        <div className="sensor-detail-meta">
          {sensor.board_type && (
            <div className="board-type-info">
              <span className="board-type-badge">{sensor.board_type.name}</span>
              <span className="board-mcu-badge">{sensor.board_type.mcu}</span>
              <span className="board-adc-badge">{sensor.board_type.adc_bits}-bit</span>
            </div>
          )}
          <p><strong>Location:</strong> {sensor.location || 'N/A'}</p>
          {staleness && (
            <p className="sensor-date">
              <span className="staleness-indicator">
                <span className={`staleness-dot ${staleness.staleness}`} />
                Last seen {staleness.text}
              </span>
            </p>
          )}
          <p className="sensor-date">
            🔋 Battery changed:{' '}
            {sensor.battery_changed_at
              ? new Date(sensor.battery_changed_at).toLocaleString()
              : 'not recorded'}
          </p>
        </div>
      </div>

      <div className="section-card">
        <h3>Recent Readings</h3>
        {readings.length === 0 ? (
          <p className="status">No readings recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="readings-table">
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>Metric</th>
                  <th>Value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {readings.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.recorded_at)}</td>
                    <td className="metric-cell">
                      <MetricIcon metric={r.metric} size={16} />
                      <span>{METRIC_LABELS[r.metric] || r.metric}</span>
                    </td>
                    <td>{formatValue(r.metric, r.value)}</td>
                    <td className="reading-delete-cell">
                      {confirmDeleteId === r.id ? (
                        <span className="confirm-inline">
                          <span>Delete?</span>
                          <button
                            className="btn-sm btn-danger"
                            disabled={deleting === r.id}
                            onClick={() => handleDeleteReading(r.id)}
                          >
                            {deleting === r.id ? '…' : 'Confirm'}
                          </button>
                          <button
                            className="btn-sm btn-secondary"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          className="reading-delete-btn"
                          onClick={() => setConfirmDeleteId(r.id)}
                          title="Delete reading"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
