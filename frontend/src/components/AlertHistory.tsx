import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { AlertHistoryEntry, Alert, METRICS } from '../types';
import { timeAgo } from '../lib/calibration';

interface Props {
  sensorId: string;
}

export function AlertHistory({ sensorId }: Props) {
  const [history, setHistory] = useState<(AlertHistoryEntry & { alert?: Alert })[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);

    // First get alert IDs for this sensor
    const { data: alerts } = await supabase
      .from('alerts')
      .select('id, metric, condition, threshold')
      .eq('sensor_id', sensorId);

    if (!alerts || alerts.length === 0) {
      setHistory([]);
      setLoading(false);
      return;
    }

    const alertIds = alerts.map((a) => a.id);
    const alertMap = new Map(alerts.map((a) => [a.id, a]));

    const { data: entries } = await supabase
      .from('alert_history')
      .select('*')
      .in('alert_id', alertIds)
      .order('triggered_at', { ascending: false })
      .limit(50);

    setHistory(
      (entries ?? []).map((e) => ({
        ...e,
        alert: alertMap.get(e.alert_id) as Alert | undefined,
      }))
    );
    setLoading(false);
  }, [sensorId]);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 60000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  return (
    <div className="alert-history">
      <h3>Alert History</h3>
      {loading ? (
        <p className="status">Loading...</p>
      ) : history.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon positive">&#10003;</div>
          <div className="empty-text">No alerts triggered</div>
          <div className="empty-subtext">All readings have been within range.</div>
        </div>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Metric</th>
              <th>Condition</th>
              <th>Threshold</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td title={new Date(h.triggered_at).toLocaleString()}>
                  {timeAgo(h.triggered_at).text}
                </td>
                <td>{h.alert?.metric ? (METRICS.find(m => m.key === h.alert!.metric)?.label ?? h.alert.metric) : '—'}</td>
                <td>{h.alert?.condition ?? '—'}</td>
                <td>{h.alert?.threshold ?? '—'}</td>
                <td>{h.value_at_trigger}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
