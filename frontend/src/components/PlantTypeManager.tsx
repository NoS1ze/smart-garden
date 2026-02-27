import { useState, useEffect, useCallback } from 'react';
import { PlantType, METRICS } from '../types';

const apiUrl = import.meta.env.VITE_API_URL || '';

export function PlantTypeManager() {
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
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

  const fetchPlantTypes = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/plant-types`);
      if (!res.ok) throw new Error('Failed to fetch plant types');
      const body = await res.json();
      setPlantTypes(body.data ?? []);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlantTypes();
  }, [fetchPlantTypes]);

  const handleAdd = async () => {
    if (!addName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: any = { name: addName.trim() };
      Object.entries(addRanges).forEach(([key, val]) => {
        if (val.trim() !== '') body[key] = parseFloat(val);
      });

      const res = await fetch(`${apiUrl}/api/plant-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to create plant type');
      }
      setShowAdd(false);
      setAddName('');
      setAddRanges({});
      fetchPlantTypes();
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

      const res = await fetch(`${apiUrl}/api/plant-types/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to update plant type');
      }
      setEditingId(null);
      fetchPlantTypes();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this plant type?')) return;
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/plant-types/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to delete plant type');
      }
      fetchPlantTypes();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startEdit = (pt: PlantType) => {
    setEditingId(pt.id);
    setEditName(pt.name);
    const ranges: Record<string, string> = {};
    const suffixes = ['min_temp', 'max_temp', 'optimal_min_temp', 'optimal_max_temp',
                      'min_humidity', 'max_humidity', 'optimal_min_humidity', 'optimal_max_humidity',
                      'min_moisture', 'max_moisture', 'optimal_min_moisture', 'optimal_max_moisture',
                      'min_light', 'max_light', 'optimal_min_light', 'optimal_max_light',
                      'min_co2', 'max_co2', 'optimal_min_co2', 'optimal_max_co2'];
    suffixes.forEach(s => {
      ranges[s] = pt[s as keyof PlantType] !== null ? String(pt[s as keyof PlantType]) : '';
    });
    setEditRanges(ranges);
  };

  const renderRangeInputs = (values: Record<string, string>, setter: (v: Record<string, string>) => void) => {
    const metrics_map = [
      { label: 'Temp (°C)', prefix: 'temp' },
      { label: 'Humidity (%)', prefix: 'humidity' },
      { label: 'Moisture (%)', prefix: 'moisture' },
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

  if (loading) return <p className="status">Loading plant types...</p>;

  return (
    <div className="plant-type-manager">
      <div className="dashboard-header">
        <h2>Plant Types</h2>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Plant Type'}
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
            {submitting ? 'Creating...' : 'Create Plant Type'}
          </button>
        </div>
      )}

      <div className="plant-types-list">
        {plantTypes.length === 0 ? (
          <p className="status">No plant types defined yet.</p>
        ) : (
          plantTypes.map((pt) => (
            <div key={pt.id} className="plant-type-card">
              {editingId === pt.id ? (
                <div className="plant-type-edit-mode">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className="name-edit" />
                  {renderRangeInputs(editRanges, setEditRanges)}
                  <div className="form-actions">
                    <button className="btn-small btn-primary" onClick={() => handleEdit(pt.id)}>Save</button>
                    <button className="btn-small btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="plant-type-card-header">
                    <h3>{pt.name}</h3>
                    <div className="actions">
                      <button className="btn-small btn-secondary" onClick={() => startEdit(pt)}>Edit</button>
                      <button className="btn-small delete-btn" onClick={() => handleDelete(pt.id)}>Delete</button>
                    </div>
                  </div>
                  <div className="ranges-summary">
                    {['temp', 'humidity', 'moisture', 'light', 'co2'].map(m => {
                      const min = pt[`min_${m}` as keyof PlantType];
                      const max = pt[`max_${m}` as keyof PlantType];
                      const optMin = pt[`optimal_min_${m}` as keyof PlantType];
                      const optMax = pt[`optimal_max_${m}` as keyof PlantType];
                      if (min === null && max === null && optMin === null && optMax === null) return null;
                      return (
                        <div key={m} className="summary-item">
                          <span className="summary-label">{m}:</span>
                          <span className="summary-values">
                            {min ?? '?'} → {optMin ?? '?' } | {optMax ?? '?'} ← {max ?? '?'}
                          </span>
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
