import { useState, useEffect, useCallback } from 'react';
import { Sensor, BoardType } from '../types';
import { supabase } from '../lib/supabase';
import { timeAgo } from '../lib/calibration';

const apiUrl = import.meta.env.VITE_API_URL || '';

const METRIC_LABELS: Record<string, string> = {
  soil_moisture: 'Moisture',
  temperature: 'Temp',
  humidity: 'Humidity',
  pressure_hpa: 'Pressure',
  light_lux: 'Light',
  co2_ppm: 'CO₂',
  tvoc_ppb: 'TVOC',
};

export function SensorManager() {
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [boardTypes, setBoardTypes] = useState<BoardType[]>([]);
  const [sensorMetrics, setSensorMetrics] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editBoardTypeId, setEditBoardTypeId] = useState('');

  // Delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchBoardTypes = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/board-types`);
      if (res.ok) {
        const body = await res.json();
        setBoardTypes(body.data ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchSensors = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/sensors`);
      if (!res.ok) throw new Error('Failed to fetch sensors');
      const body = await res.json();
      const sensorList: Sensor[] = body.data ?? [];
      setSensors(sensorList);

      // Fetch distinct metrics per sensor in parallel
      const entries = await Promise.all(
        sensorList.map(async (s) => {
          const { data } = await supabase
            .from('readings')
            .select('metric')
            .eq('sensor_id', s.id);
          const unique = data ? [...new Set(data.map((d: { metric: string }) => d.metric))] : [];
          return [s.id, unique] as const;
        })
      );
      setSensorMetrics(Object.fromEntries(entries));
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSensors();
    fetchBoardTypes();
  }, [fetchSensors, fetchBoardTypes]);

  const handleUpdate = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/sensors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: editName.trim() || null,
          location: editLocation.trim(),
          sensor_type: null,
          board_type_id: editBoardTypeId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to update sensor');
      }
      setEditingId(null);
      fetchSensors();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(null);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/sensors/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to delete sensor');
      }
      fetchSensors();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startEdit = (s: Sensor) => {
    setEditingId(s.id);
    setEditName(s.display_name ?? '');
    setEditLocation(s.location);
    setEditBoardTypeId(s.board_type_id ?? '');
  };

  if (loading) return <p className="status">Loading sensors...</p>;

  return (
    <div className="sensor-manager">
      <div className="dashboard-header">
        <h2>Manage Sensors</h2>
      </div>

      {error && <p className="status error">{error}</p>}

      <div className="sensor-grid">
        {sensors.length === 0 ? (
          <p className="status">No sensors found. Power on an ESP8266 to auto-register.</p>
        ) : (
          sensors.map((s) => (
            <div key={s.id} className="sensor-tile">
              {editingId === s.id ? (
                <div className="sensor-edit-form">
                  <div className="form-group">
                    <label>Display Name</label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder={s.mac_address}
                    />
                  </div>
                  <div className="form-group">
                    <label>Location</label>
                    <input
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      placeholder="e.g. Living Room"
                    />
                  </div>
                  <div className="form-group">
                    <label>Board Type</label>
                    <select value={editBoardTypeId} onChange={(e) => setEditBoardTypeId(e.target.value)}>
                      <option value="">None</option>
                      {boardTypes.map((bt) => (
                        <option key={bt.id} value={bt.id}>{bt.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-actions">
                    <button className="btn-sm btn-primary" onClick={() => handleUpdate(s.id)}>Save</button>
                    <button className="btn-sm btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="sensor-card-header">
                    <div className="sensor-ident">
                      <h3>{s.display_name || 'Unnamed Sensor'}</h3>
                      <code>{s.mac_address}</code>
                    </div>
                  </div>
                  <div className="sensor-details">
                    {s.board_type && (
                      <div className="board-type-info">
                        <span className="board-type-badge">{s.board_type.name}</span>
                        <span className="board-mcu-badge">{s.board_type.mcu}</span>
                        <span className="board-adc-badge">{s.board_type.adc_bits}-bit</span>
                      </div>
                    )}
                    {s.board_type?.sensors && s.board_type.sensors.length > 0 && (
                      <div className="board-chips">
                        {s.board_type.sensors.map((chip, i) => (
                          <span key={i} className="chip-badge" title={`${chip.interface} on ${chip.pins}`}>
                            {chip.chip}
                          </span>
                        ))}
                      </div>
                    )}
                    <p><strong>Location:</strong> {s.location || 'N/A'}</p>
                    <p><strong>Active:</strong> {(sensorMetrics[s.id] ?? []).map(m => METRIC_LABELS[m] || m).join(', ') || 'None detected'}</p>
                    {s.last_seen_at && (() => {
                      const { text, staleness } = timeAgo(s.last_seen_at);
                      return (
                        <p className="sensor-date">
                          <span className="staleness-indicator">
                            <span className={`staleness-dot ${staleness}`} />
                            Last seen {text}
                          </span>
                        </p>
                      );
                    })()}
                    <p className="sensor-date">Added {new Date(s.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="sensor-actions">
                    <button className="btn-sm btn-secondary" onClick={() => startEdit(s)}>Edit</button>
                    {confirmDeleteId === s.id ? (
                      <span className="confirm-inline">
                        <span>Delete sensor &amp; readings?</span>
                        <button className="btn-sm btn-danger" onClick={() => handleDelete(s.id)}>Confirm</button>
                        <button className="btn-sm btn-secondary" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                      </span>
                    ) : (
                      <button className="btn-sm btn-danger" onClick={() => setConfirmDeleteId(s.id)}>Delete</button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
