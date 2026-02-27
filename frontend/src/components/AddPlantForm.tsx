import { useState, useEffect } from 'react';
import { SoilType, PlantType } from '../types';

interface Props {
  onCreated: () => void;
  onCancel: () => void;
}

export function AddPlantForm({ onCreated, onCancel }: Props) {
  const [name, setName] = useState('');
  const [plantTypeId, setPlantTypeId] = useState('');
  const [plantedDate, setPlantedDate] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [soilTypeId, setSoilTypeId] = useState('');
  const [soilTypes, setSoilTypes] = useState<SoilType[]>([]);
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    fetch(`${apiUrl}/api/soil-types`)
      .then((res) => res.json())
      .then((body) => setSoilTypes(body.data ?? []))
      .catch(() => {});

    fetch(`${apiUrl}/api/plant-types`)
      .then((res) => res.json())
      .then((body) => setPlantTypes(body.data ?? []))
      .catch(() => {});
  }, [apiUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, string> = { name: name.trim() };
      if (plantTypeId) body.plant_type_id = plantTypeId;
      if (plantedDate) body.planted_date = plantedDate;
      if (photoUrl.trim()) body.photo_url = photoUrl.trim();
      if (notes.trim()) body.notes = notes.trim();
      if (soilTypeId) body.soil_type_id = soilTypeId;

      const res = await fetch(`${apiUrl}/api/plants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to create plant');
      }

      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Plant</h2>
        {error && <p className="status error">{error}</p>}
        <form onSubmit={handleSubmit} className="plant-form">
          <label>
            Name *
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            Plant Type
            <select value={plantTypeId} onChange={(e) => setPlantTypeId(e.target.value)}>
              <option value="">None</option>
              {plantTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Planted Date
            <input
              type="date"
              value={plantedDate}
              onChange={(e) => setPlantedDate(e.target.value)}
            />
          </label>
          <label>
            Photo URL
            <input
              type="url"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
          <label>
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </label>
          <label>
            Soil Type
            <select value={soilTypeId} onChange={(e) => setSoilTypeId(e.target.value)}>
              <option value="">None (default calibration)</option>
              {soilTypes.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} (dry={st.raw_dry}, wet={st.raw_wet})
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !name.trim()}>
              {submitting ? 'Creating...' : 'Add Plant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
