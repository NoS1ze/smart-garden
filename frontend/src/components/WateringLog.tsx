import { useState, useEffect } from 'react';
import { WateringEvent } from '../types';

interface Props {
  plantId: string;
  apiUrl: string;
  onWateringLogged?: () => void;
}

export function WateringLog({ plantId, apiUrl, onWateringLogged }: Props) {
  const [events, setEvents] = useState<WateringEvent[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchEvents() {
    const res = await fetch(`${apiUrl}/api/plants/${plantId}/watering-events?limit=20`);
    if (res.ok) {
      const json = await res.json();
      setEvents(json.data);
    }
    setLoading(false);
  }

  useEffect(() => { fetchEvents(); }, [plantId]);

  async function logWatering() {
    const res = await fetch(`${apiUrl}/api/plants/${plantId}/watering-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plant_id: plantId }),
    });
    if (res.ok) {
      fetchEvents();
      onWateringLogged?.();
    }
  }

  async function deleteEvent(eventId: string) {
    await fetch(`${apiUrl}/api/watering-events/${eventId}`, { method: 'DELETE' });
    fetchEvents();
  }

  if (loading) return <div className="loading-text">Loading watering history...</div>;

  return (
    <div className="watering-log">
      <div className="watering-log-header">
        <h3>Watering Log</h3>
        <button className="btn-primary btn-small" onClick={logWatering}>
          Log Watering
        </button>
      </div>
      {events.length === 0 ? (
        <p className="text-muted" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No watering events recorded yet.</p>
      ) : (
        <div className="watering-timeline">
          {events.map((e) => (
            <div key={e.id} className="watering-event">
              <div className="watering-event-dot" />
              <div className="watering-event-content">
                <div className="watering-event-header">
                  <span className="watering-event-date">
                    {new Date(e.detected_at).toLocaleDateString()} {new Date(e.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className={`watering-source-badge ${e.source}`}>
                    {e.source === 'auto' ? 'Auto-detected' : 'Manual'}
                  </span>
                </div>
                {(e.moisture_before != null || e.moisture_after != null) && (
                  <div className="watering-moisture">
                    {e.moisture_before != null && <span>Before: {e.moisture_before.toFixed(0)}</span>}
                    {e.moisture_before != null && e.moisture_after != null && <span> &rarr; </span>}
                    {e.moisture_after != null && <span>After: {e.moisture_after.toFixed(0)}</span>}
                  </div>
                )}
              </div>
              <button className="watering-event-delete" onClick={() => deleteEvent(e.id)} title="Delete">&times;</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
