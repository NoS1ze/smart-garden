import { useState, useEffect, useCallback } from 'react';
import { PlantSpecies, METRICS } from '../types';

const apiUrl = import.meta.env.VITE_API_URL || '';

export function PlantSpeciesManager() {
  const [plantSpecies, setPlantSpecies] = useState<PlantSpecies[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addRanges, setAddRanges] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRanges, setEditRanges] = useState<Record<string, string>>({});

  const [error, setError] = useState<string | null>(null);

  const fetchPlantSpecies = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/plant-species`);
      if (!res.ok) throw new Error('Failed to fetch plant species');
      const body = await res.json();
      setPlantSpecies(body.data ?? []);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlantSpecies();
  }, [fetchPlantSpecies]);

  const handleAdd = async () => {
    if (!addName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: any = { name: addName.trim() };
      Object.entries(addRanges).forEach(([key, val]) => {
        if (val.trim() !== '') body[key] = parseFloat(val);
      });

      const res = await fetch(`${apiUrl}/api/plant-species`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to create plant species');
      }
      setShowAdd(false);
      setAddName('');
      setAddRanges({});
      fetchPlantSpecies();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (id: string) => {
    setError(null);
    try {
      const body: any = { name: editName.trim() };
      Object.entries(editRanges).forEach(([key, val]) => {
        body[key] = val.trim() !== '' ? parseFloat(val) : null;
      });

      const res = await fetch(`${apiUrl}/api/plant-species/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to update plant species');
      }
      setEditingId(null);
      fetchPlantSpecies();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this plant species?')) return;
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/plant-species/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to delete plant species');
      }
      fetchPlantSpecies();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startEdit = (ps: PlantSpecies) => {
    setEditingId(ps.id);
    setEditName(ps.name);
    const ranges: Record<string, string> = {};
    const suffixes = ['min_temp', 'max_temp', 'optimal_min_temp', 'optimal_max_temp',
                      'min_humidity', 'max_humidity', 'optimal_min_humidity', 'optimal_max_humidity',
                      'min_moisture', 'max_moisture', 'optimal_min_moisture', 'optimal_max_moisture',
                      'min_light', 'max_light', 'optimal_min_light', 'optimal_max_light',
                      'min_co2', 'max_co2', 'optimal_min_co2', 'optimal_max_co2',
                      'min_pressure', 'max_pressure', 'optimal_min_pressure', 'optimal_max_pressure'];
    suffixes.forEach(s => {
      ranges[s] = ps[s as keyof PlantSpecies] !== null ? String(ps[s as keyof PlantSpecies]) : '';
    });
    setEditRanges(ranges);
  };

  const renderRangeInputs = (values: Record<string, string>, setter: (v: Record<string, string>) => void) => {
    const metrics_map = [
      { label: 'Temp (°C)', prefix: 'temp' },
      { label: 'Humidity (%)', prefix: 'humidity' },
      { label: 'Moisture (%)', prefix: 'moisture' },
      { label: 'Pressure (hPa)', prefix: 'pressure' },
      { label: 'Light (lux)', prefix: 'light' },
      { label: 'CO2 (ppm)', prefix: 'co2' },
    ];

    return (
      <div className="range-inputs-grid">
        {metrics_map.map(m => (
          <div key={m.prefix} className="metric-range-group">
            <h4>{m.label}</h4>
            <div className="range-row">
              <label>Min <input type="number" step="0.1" value={values[`min_${m.prefix}`] || ''} onChange={e => setter({ ...values, [`min_${m.prefix}`]: e.target.value })} /></label>
              <label>Opt Min <input type="number" step="0.1" value={values[`optimal_min_${m.prefix}`] || ''} onChange={e => setter({ ...values, [`optimal_min_${m.prefix}`]: e.target.value })} /></label>
              <label>Opt Max <input type="number" step="0.1" value={values[`optimal_max_${m.prefix}`] || ''} onChange={e => setter({ ...values, [`optimal_max_${m.prefix}`]: e.target.value })} /></label>
              <label>Max <input type="number" step="0.1" value={values[`max_${m.prefix}`] || ''} onChange={e => setter({ ...values, [`max_${m.prefix}`]: e.target.value })} /></label>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return <p className="status">Loading plant species...</p>;

  return (
    <div className="plant-type-manager">
      <div className="dashboard-header">
        <h2>Plant Species</h2>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Plant Species'}
        </button>
      </div>

      {error && <p className="status error">{error}</p>}

      {showAdd && (
        <div className="plant-type-form-large">
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              placeholder="e.g. Monstera Deliciosa"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              autoFocus
            />
          </div>
          {renderRangeInputs(addRanges, setAddRanges)}
          <button className="btn-primary" onClick={handleAdd} disabled={submitting || !addName.trim()}>
            {submitting ? 'Creating...' : 'Create Plant Species'}
          </button>
        </div>
      )}

      <div className="plant-types-list">
        {plantSpecies.length === 0 ? (
          <p className="status">No plant species defined yet.</p>
        ) : (
          plantSpecies.map((ps) => (
            <div key={ps.id} className="plant-type-card">
              {editingId === ps.id ? (
                <div className="plant-type-edit-mode">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className="name-edit" />
                  {renderRangeInputs(editRanges, setEditRanges)}
                  <div className="form-actions">
                    <button className="btn-small btn-primary" onClick={() => handleEdit(ps.id)}>Save</button>
                    <button className="btn-small btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="plant-type-card-header">
                    <h3>{ps.name}</h3>
                    <div className="actions">
                      <button className="btn-small btn-secondary" onClick={() => startEdit(ps)}>Edit</button>
                      <button className="btn-small delete-btn" onClick={() => handleDelete(ps.id)}>Delete</button>
                    </div>
                  </div>
                  <div className="species-metrics">
                    {([
                      { key: 'temp', label: 'Temp', scaleMin: 0, scaleMax: 50, color: '#ef4444' },
                      { key: 'humidity', label: 'Humidity', scaleMin: 0, scaleMax: 100, color: '#60a5fa' },
                      { key: 'moisture', label: 'Moisture', scaleMin: 0, scaleMax: 100, color: '#22c55e' },
                      { key: 'pressure', label: 'Pressure', scaleMin: 900, scaleMax: 1100, color: '#c084fc' },
                      { key: 'light', label: 'Light', scaleMin: 0, scaleMax: 100000, color: '#f59e0b' },
                      { key: 'co2', label: 'CO2', scaleMin: 0, scaleMax: 2000, color: '#14b8a6' },
                    ] as const).map(m => {
                      const optMin = ps[`optimal_min_${m.key}` as keyof PlantSpecies] as number | null;
                      const optMax = ps[`optimal_max_${m.key}` as keyof PlantSpecies] as number | null;
                      if (optMin === null && optMax === null) return null;
                      const lo = optMin ?? m.scaleMin;
                      const hi = optMax ?? m.scaleMax;
                      const left = ((lo - m.scaleMin) / (m.scaleMax - m.scaleMin)) * 100;
                      const width = ((hi - lo) / (m.scaleMax - m.scaleMin)) * 100;
                      return (
                        <div key={m.key} className="metric-row">
                          <span className="metric-label">{m.label}</span>
                          <div className="metric-bar-track">
                            <div
                              className="metric-bar-fill"
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                '--color': m.color,
                              } as React.CSSProperties}
                            />
                          </div>
                          <span className="metric-range">{lo}–{hi}</span>
                        </div>
                      );
                    })}
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
