import { useState, useEffect } from 'react';
import { SoilType, PlantSpecies, Room, Plant } from '../types';
import { PhotoUpload } from './PhotoUpload';
import { useToast } from './Toast';

interface Props {
  onCreated: () => void;
  onCancel: () => void;
}

export function AddPlantForm({ onCreated, onCancel }: Props) {
  const [name, setName] = useState('');
  const [plantSpeciesId, setPlantSpeciesId] = useState('');
  const [plantedDate, setPlantedDate] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [soilTypeId, setSoilTypeId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [referencePlantId, setReferencePlantId] = useState('');
  const [soilTypes, setSoilTypes] = useState<SoilType[]>([]);
  const [plantSpecies, setPlantSpecies] = useState<PlantSpecies[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allPlants, setAllPlants] = useState<Plant[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toast = useToast();
  const apiUrl = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    fetch(`${apiUrl}/api/soil-types`)
      .then((res) => res.json())
      .then((body) => setSoilTypes(body.data ?? []))
      .catch(() => {});

    fetch(`${apiUrl}/api/plant-species`)
      .then((res) => res.json())
      .then((body) => setPlantSpecies(body.data ?? []))
      .catch(() => {});

    fetch(`${apiUrl}/api/rooms`)
      .then((res) => res.json())
      .then((body) => setRooms(body.data ?? []))
      .catch(() => {});

    fetch(`${apiUrl}/api/plants`)
      .then((res) => res.json())
      .then((body) => setAllPlants(body.data ?? []))
      .catch(() => {});
  }, [apiUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, string | null> = { name: name.trim() };
      if (plantSpeciesId) body.plant_species_id = plantSpeciesId;
      if (plantedDate) body.planted_date = plantedDate;
      if (photoUrl.trim()) body.photo_url = photoUrl.trim();
      if (notes.trim()) body.notes = notes.trim();
      if (soilTypeId) body.soil_type_id = soilTypeId;
      body.room_id = roomId || null;
      body.reference_plant_id = referencePlantId || null;

      const res = await fetch(`${apiUrl}/api/plants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to create plant');
      }

      toast.success('Plant added successfully');
      onCreated();
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
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
            Plant Species
            <select value={plantSpeciesId} onChange={(e) => setPlantSpeciesId(e.target.value)}>
              <option value="">None</option>
              {plantSpecies.map((ps) => (
                <option key={ps.id} value={ps.id}>
                  {ps.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Room
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">None</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
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
            Photo
            <PhotoUpload currentUrl={photoUrl || null} onUrlChange={(url) => setPhotoUrl(url || '')} />
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
          <label>
            Reference sensor from
            <select value={referencePlantId} onChange={(e) => setReferencePlantId(e.target.value)}>
              <option value="">None</option>
              {allPlants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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
