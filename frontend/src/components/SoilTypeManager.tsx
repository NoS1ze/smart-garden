import { useState, useEffect, useCallback } from 'react';
import { SoilType } from '../types';

const apiUrl = import.meta.env.VITE_API_URL || '';

export function SoilTypeManager() {
  const [soilTypes, setSoilTypes] = useState<SoilType[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDry, setAddDry] = useState('800');
  const [addWet, setAddWet] = useState('400');
  const [addDry12, setAddDry12] = useState('3200');
  const [addWet12, setAddWet12] = useState('600');
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDry, setEditDry] = useState('');
  const [editWet, setEditWet] = useState('');
  const [editDry12, setEditDry12] = useState('');
  const [editWet12, setEditWet12] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSoilTypes = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/soil-types`);
      if (!res.ok) throw new Error('Failed to fetch soil types');
      const body = await res.json();
      setSoilTypes(body.data ?? []);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSoilTypes();
  }, [fetchSoilTypes]);

  const handleAdd = async () => {
    if (!addName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/soil-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addName.trim(),
          raw_dry: parseInt(addDry) || 800,
          raw_wet: parseInt(addWet) || 400,
          raw_dry_12bit: parseInt(addDry12) || 3200,
          raw_wet_12bit: parseInt(addWet12) || 600,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to create soil type');
      }
      setShowAdd(false);
      setAddName('');
      setAddDry('800');
      setAddWet('400');
      setAddDry12('3200');
      setAddWet12('600');
      fetchSoilTypes();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/soil-types/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim() || undefined,
          raw_dry: parseInt(editDry) || undefined,
          raw_wet: parseInt(editWet) || undefined,
          raw_dry_12bit: parseInt(editDry12) || undefined,
          raw_wet_12bit: parseInt(editWet12) || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to update soil type');
      }
      setEditingId(null);
      fetchSoilTypes();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(null);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/soil-types/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to delete soil type');
      }
      fetchSoilTypes();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startEdit = (st: SoilType) => {
    setEditingId(st.id);
    setEditName(st.name);
    setEditDry(String(st.raw_dry));
    setEditWet(String(st.raw_wet));
    setEditDry12(String(st.raw_dry_12bit));
    setEditWet12(String(st.raw_wet_12bit));
  };

  if (loading) return <p className="status">Loading soil types...</p>;

  return (
    <div className="soil-type-manager">
      <div className="dashboard-header">
        <h2>Soil Types</h2>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Soil Type'}
        </button>
      </div>

      {error && <p className="status error">{error}</p>}

      {showAdd && (
        <div className="soil-type-form">
          <input
            type="text"
            placeholder="Name (e.g. Sandy Soil)"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            autoFocus
          />
          <div className="cal-group-label">10-bit (ESP8266)</div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{ flex: 1 }}>
              Raw Dry
              <input type="number" value={addDry} onChange={(e) => setAddDry(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>
              Raw Wet
              <input type="number" value={addWet} onChange={(e) => setAddWet(e.target.value)} />
            </label>
          </div>
          <div className="cal-group-label">12-bit (ESP32)</div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{ flex: 1 }}>
              Raw Dry
              <input type="number" value={addDry12} onChange={(e) => setAddDry12(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>
              Raw Wet
              <input type="number" value={addWet12} onChange={(e) => setAddWet12(e.target.value)} />
            </label>
          </div>
          <button className="btn-primary" onClick={handleAdd} disabled={submitting || !addName.trim()}>
            {submitting ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}

      {soilTypes.length === 0 ? (
        <div className="empty-state">
          <p>No soil types defined yet.</p>
          <p className="status">Default calibration (dry=800, wet=400) will be used.</p>
        </div>
      ) : (
        <div className="soil-types-list">
          {soilTypes.map((st) => (
            <div key={st.id} className="soil-card">
              {editingId === st.id ? (
                <div>
                  <div className="form-group">
                    <label className="form-label">Name</label>
                    <input className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div className="cal-group-label">10-bit (ESP8266)</div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Raw Dry</label>
                      <input className="form-input" type="number" value={editDry} onChange={(e) => setEditDry(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Raw Wet</label>
                      <input className="form-input" type="number" value={editWet} onChange={(e) => setEditWet(e.target.value)} />
                    </div>
                  </div>
                  <div className="cal-group-label">12-bit (ESP32)</div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Raw Dry</label>
                      <input className="form-input" type="number" value={editDry12} onChange={(e) => setEditDry12(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Raw Wet</label>
                      <input className="form-input" type="number" value={editWet12} onChange={(e) => setEditWet12(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button className="btn-sm btn-primary" onClick={() => handleEdit(st.id)}>Save</button>
                    <button className="btn-sm btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="soil-header">
                    <h3>{st.name}</h3>
                    <div className="soil-actions">
                      <button className="btn-sm btn-secondary" onClick={() => startEdit(st)}>Edit</button>
                      {confirmDeleteId === st.id ? (
                        <>
                          <button className="btn-sm btn-danger" onClick={() => handleDelete(st.id)}>Confirm</button>
                          <button className="btn-sm btn-secondary" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn-sm btn-danger" onClick={() => setConfirmDeleteId(st.id)}>Delete</button>
                      )}
                    </div>
                  </div>
                  <div className="calibration-bar">
                    <span className="cal-bit-label">10-bit</span>
                    <div className="cal-track">
                      <div className="cal-wet" style={{ width: `${(st.raw_wet / 1023) * 100}%` }} />
                      <div className="cal-dry" style={{ width: `${((st.raw_dry - st.raw_wet) / 1023) * 100}%` }} />
                    </div>
                    <span className="cal-values">{st.raw_wet} → {st.raw_dry}</span>
                  </div>
                  <div className="calibration-bar">
                    <span className="cal-bit-label">12-bit</span>
                    <div className="cal-track">
                      <div className="cal-wet" style={{ width: `${(st.raw_wet_12bit / 4095) * 100}%` }} />
                      <div className="cal-dry" style={{ width: `${((st.raw_dry_12bit - st.raw_wet_12bit) / 4095) * 100}%` }} />
                    </div>
                    <span className="cal-values">{st.raw_wet_12bit} → {st.raw_dry_12bit}</span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
