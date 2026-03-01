import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Alert, Metric, METRICS } from '../types';

interface Props {
  sensorId: string;
}

export function AlertsPanel({ sensorId }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formMetric, setFormMetric] = useState<Metric>('soil_moisture');
  const [formCondition, setFormCondition] = useState<'above' | 'below'>('below');
  const [formThreshold, setFormThreshold] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || '';

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('alerts')
      .select('*')
      .eq('sensor_id', sensorId)
      .eq('active', true);

    if (err) {
      setError(err.message);
    } else {
      setAlerts(data ?? []);
    }
    setLoading(false);
  }, [sensorId]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const createAlert = async () => {
    if (!formThreshold || !formEmail) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${apiUrl}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sensor_id: sensorId,
          metric: formMetric,
          condition: formCondition,
          threshold: parseFloat(formThreshold),
          email: formEmail,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.detail || 'Failed to create alert');
      }

      setShowForm(false);
      setFormThreshold('');
      setFormEmail('');
      fetchAlerts();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteAlert = async (id: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/alerts/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.detail || 'Failed to delete alert');
      }
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const metricLabel = (key: string) =>
    METRICS.find((m) => m.key === key)?.label ?? key;

  return (
    <div className="alerts-panel">
      <div className="panel-header">
        <h3>Alert Rules</h3>
        <button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Alert'}
        </button>
      </div>

      {error && <p className="status error">{error}</p>}

      {showForm && (
        <div className="alert-form">
          <select value={formMetric} onChange={(e) => setFormMetric(e.target.value as Metric)}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
          <select value={formCondition} onChange={(e) => setFormCondition(e.target.value as 'above' | 'below')}>
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
          <input
            type="number"
            placeholder="Threshold"
            value={formThreshold}
            onChange={(e) => setFormThreshold(e.target.value)}
          />
          <input
            type="email"
            placeholder="Email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
          />
          <button onClick={createAlert} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="status">Loading alerts...</p>
      ) : alerts.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon">&#128276;</div>
          <div className="empty-text">No alert rules yet</div>
          <div className="empty-subtext">Add a rule to get notified when readings go out of range.</div>
        </div>
      ) : (
        <table className="alerts-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Condition</th>
              <th>Threshold</th>
              <th>Email</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id}>
                <td>{metricLabel(a.metric)}</td>
                <td>{a.condition}</td>
                <td>{a.threshold}</td>
                <td>{a.email}</td>
                <td>
                  <button className="delete-btn" onClick={() => deleteAlert(a.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
