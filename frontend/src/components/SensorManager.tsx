import { useState, useEffect, useCallback } from 'react';
import { Sensor } from '../types';

const apiUrl = import.meta.env.VITE_API_URL || '';

const SENSOR_TYPES = [
  { id: 'soil', label: 'Soil Moisture', icon: '🌱' },
  { id: 'ambient', label: 'Ambient (Temp/Hum)', icon: '🌡️' },
  { id: 'light', label: 'Light/Lux', icon: '☀️' },
  { id: 'all-in-one', label: 'All-in-One', icon: '🤖' },
  { id: 'co2', label: 'CO2 Sensor', icon: '☁️' },
];

export function SensorManager() {
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editType, setEditType] = useState('');

  const fetchSensors = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/sensors`);
      if (!res.ok) throw new Error('Failed to fetch sensors');
      const body = await res.json();
      setSensors(body.data ?? []);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSensors();
  }, [fetchSensors]);

  const handleUpdate = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/sensors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: editName.trim() || null,
          location: editLocation.trim(),
          sensor_type: editType || null,
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
    if (!confirm('Delete this sensor? This will remove all associated readings!')) return;
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
    setEditType(s.sensor_type ?? '');
  };

  const getSensorIcon = (type: string | null) => {
    return SENSOR_TYPES.find(t => t.id === type)?.icon || '📟';
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
            <div key={s.id} className="sensor-manage-card">
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
                    <label>Sensor Type</label>
                    <select value={editType} onChange={(e) => setEditType(e.target.value)}>
                      <option value="">Unknown</option>
                      {SENSOR_TYPES.map(t => (
                        <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-actions">
                    <button className="btn-small btn-primary" onClick={() => handleUpdate(s.id)}>Save</button>
                    <button className="btn-small btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="sensor-card-header">
                    <span className="sensor-type-icon" title={s.sensor_type || 'Unknown'}>
                      {getSensorIcon(s.sensor_type)}
                    </span>
                    <div className="sensor-ident">
                      <h3>{s.display_name || 'Unnamed Sensor'}</h3>
                      <code>{s.mac_address}</code>
                    </div>
                  </div>
                  <div className="sensor-details">
                    <p><strong>Location:</strong> {s.location || 'N/A'}</p>
                    <p><strong>Type:</strong> {SENSOR_TYPES.find(t => t.id === s.sensor_type)?.label || 'Unknown'}</p>
                    <p className="sensor-date">Added {new Date(s.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="sensor-actions">
                    <button className="btn-small btn-secondary" onClick={() => startEdit(s)}>Edit</button>
                    <button className="btn-small delete-btn" onClick={() => handleDelete(s.id)}>Delete</button>
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
