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
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDry, setEditDry] = useState('');
  const [editWet, setEditWet] = useState('');

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
    if (!confirm('Delete this soil type? Plants using it will revert to default calibration.')) return;
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
          <label>
            Raw Dry
            <input type="number" value={addDry} onChange={(e) => setAddDry(e.target.value)} />
          </label>
          <label>
            Raw Wet
            <input type="number" value={addWet} onChange={(e) => setAddWet(e.target.value)} />
          </label>
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
        <table className="soil-types-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Raw Dry</th>
              <th>Raw Wet</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {soilTypes.map((st) => (
              <tr key={st.id}>
                {editingId === st.id ? (
                  <>
                    <td>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </td>
                    <td>
                      <input type="number" value={editDry} onChange={(e) => setEditDry(e.target.value)} style={{ width: 80 }} />
                    </td>
                    <td>
                      <input type="number" value={editWet} onChange={(e) => setEditWet(e.target.value)} style={{ width: 80 }} />
                    </td>
                    <td>
                      <button className="btn-small btn-primary" onClick={() => handleEdit(st.id)}>Save</button>
                      <button className="btn-small btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{st.name}</td>
                    <td>{st.raw_dry}</td>
                    <td>{st.raw_wet}</td>
                    <td>
                      <button className="btn-small btn-secondary" onClick={() => startEdit(st)}>Edit</button>
                      <button className="btn-small delete-btn" onClick={() => handleDelete(st.id)}>Delete</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
