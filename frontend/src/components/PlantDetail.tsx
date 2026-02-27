import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Plant, Sensor, SoilType, PlantSpecies } from '../types';
import { MetricChart } from './MetricChart';
import { AlertsPanel } from './AlertsPanel';
import { AlertHistory } from './AlertHistory';

interface Props {
  plantId: string;
  onBack: () => void;
}

export function PlantDetail({ plantId, onBack }: Props) {
  const [plant, setPlant] = useState<Plant | null>(null);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [allSensors, setAllSensors] = useState<Sensor[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [soilTypes, setSoilTypes] = useState<SoilType[]>([]);
  const [plantSpecies, setPlantSpecies] = useState<PlantSpecies[]>([]);
  const [loading, setLoading] = useState(true);

  // Editing state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPlantSpeciesId, setEditPlantSpeciesId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editPhoto, setEditPhoto] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSoilTypeId, setEditSoilTypeId] = useState('');
  const [saving, setSaving] = useState(false);

  // Sensor rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Add sensor state
  const [addSensorId, setAddSensorId] = useState('');

  const [error, setError] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || '';

  const fetchPlant = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/plants/${plantId}`);
      if (!res.ok) return;
      const data: Plant = await res.json();
      setPlant(data);
      setEditName(data.name);
      setEditPlantSpeciesId(data.plant_species_id ?? '');
      setEditDate(data.planted_date ?? '');
      setEditPhoto(data.photo_url ?? '');
      setEditNotes(data.notes ?? '');
      setEditSoilTypeId(data.soil_type_id ?? '');
    } catch {
      // ignore
    }
  }, [plantId, apiUrl]);

  const fetchSensors = useCallback(async () => {
    // Get assigned sensors
    const { data: assignments } = await supabase
      .from('sensor_plant')
      .select('sensor_id')
      .eq('plant_id', plantId);

    const ids = new Set((assignments ?? []).map((a: { sensor_id: string }) => a.sensor_id));
    setAssignedIds(ids);

    if (ids.size > 0) {
      const { data: sensorData } = await supabase
        .from('sensors')
        .select('*')
        .in('id', Array.from(ids));
      setSensors(sensorData ?? []);
    } else {
      setSensors([]);
    }

    // Get all sensors for the "add sensor" dropdown
    const { data: all } = await supabase.from('sensors').select('*').order('display_name');
    setAllSensors(all ?? []);
  }, [plantId]);

  const fetchSoilTypes = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/soil-types`);
      if (!res.ok) return;
      const body = await res.json();
      setSoilTypes(body.data ?? []);
    } catch {
      // ignore
    }
  }, [apiUrl]);

  const fetchPlantSpecies = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/plant-species`);
      if (!res.ok) return;
      const body = await res.json();
      setPlantSpecies(body.data ?? []);
    } catch {
      // ignore
    }
  }, [apiUrl]);

  useEffect(() => {
    async function load() {
      await Promise.all([fetchPlant(), fetchSensors(), fetchSoilTypes(), fetchPlantSpecies()]);
      setLoading(false);
    }
    load();
  }, [fetchPlant, fetchSensors, fetchSoilTypes, fetchPlantSpecies]);

  const savePlant = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string | null> = { name: editName.trim() };
      body.plant_species_id = editPlantSpeciesId || null;
      body.planted_date = editDate || null;
      body.photo_url = editPhoto.trim() || null;
      body.notes = editNotes.trim() || null;
      body.soil_type_id = editSoilTypeId || null;

      const res = await fetch(`${apiUrl}/api/plants/${plantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to update plant');
      }
      setEditing(false);
      fetchPlant();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const deletePlant = async () => {
    if (!confirm('Delete this plant?')) return;
    try {
      const res = await fetch(`${apiUrl}/api/plants/${plantId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to delete plant');
      }
      onBack();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const renameSensor = async (sensorId: string) => {
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/sensors/${sensorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: renameValue.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to rename sensor');
      }
      setRenamingId(null);
      fetchSensors();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const addSensor = async () => {
    if (!addSensorId) return;
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/plants/${plantId}/sensors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensor_id: addSensorId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to add sensor');
      }
      setAddSensorId('');
      fetchSensors();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const removeSensor = async (sensorId: string) => {
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/plants/${plantId}/sensors/${sensorId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to remove sensor');
      }
      fetchSensors();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (loading) return <p className="status">Loading...</p>;
  if (!plant) return <p className="status error">Plant not found.</p>;

  const unassignedSensors = allSensors.filter((s) => !assignedIds.has(s.id));

  return (
    <div className="plant-detail">
      <button className="btn-back" onClick={onBack}>&larr; Back</button>

      {error && <p className="status error">{error}</p>}

      {/* Header */}
      <div className="plant-detail-header">
        {plant.photo_url ? (
          <img className="plant-detail-photo" src={plant.photo_url} alt={plant.name} />
        ) : (
          <div className="plant-detail-photo-placeholder" />
        )}
        <div className="plant-detail-info">
          {editing ? (
            <div className="plant-edit-form">
              <label>
                Name
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </label>
              <label>
                Plant Species
                <select value={editPlantSpeciesId} onChange={(e) => setEditPlantSpeciesId(e.target.value)}>
                  <option value="">None</option>
                  {plantSpecies.map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      {ps.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Planted Date
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </label>
              <label>
                Photo URL
                <input value={editPhoto} onChange={(e) => setEditPhoto(e.target.value)} />
              </label>
              <label>
                Notes
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} />
              </label>
              <label>
                Soil Type
                <select value={editSoilTypeId} onChange={(e) => setEditSoilTypeId(e.target.value)}>
                  <option value="">None (default calibration)</option>
                  {soilTypes.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} (dry={st.raw_dry}, wet={st.raw_wet})
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-actions">
                <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                <button className="btn-primary" onClick={savePlant} disabled={saving || !editName.trim()}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2>{plant.name}</h2>
              {plant.plant_species && <p className="plant-detail-species">{plant.plant_species.name}</p>}
              {plant.planted_date && (
                <p className="plant-detail-date">
                  Planted {new Date(plant.planted_date).toLocaleDateString()}
                </p>
              )}
              {plant.soil_type && (
                <p className="plant-detail-soil">Soil: {plant.soil_type.name}</p>
              )}
              {plant.notes && <p className="plant-detail-notes">{plant.notes}</p>}
              <div className="form-actions">
                <button className="btn-secondary" onClick={() => setEditing(true)}>Edit</button>
                <button className="delete-btn" onClick={deletePlant}>Delete Plant</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sensors section */}
      <section className="detail-section">
        <h3>Sensors</h3>
        {sensors.length === 0 ? (
          <p className="status">No sensors associated.</p>
        ) : (
          <ul className="sensor-list">
            {sensors.map((s) => (
              <li key={s.id} className="sensor-list-item">
                {renamingId === s.id ? (
                  <span className="sensor-rename">
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      placeholder="Display name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameSensor(s.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                    />
                    <button className="btn-small" onClick={() => renameSensor(s.id)}>Save</button>
                    <button className="btn-small btn-secondary" onClick={() => setRenamingId(null)}>Cancel</button>
                  </span>
                ) : (
                  <span className="sensor-name-row">
                    <span>{s.display_name || s.mac_address}</span>
                    <span className="sensor-location">{s.location}</span>
                    <button
                      className="btn-small btn-secondary"
                      onClick={() => {
                        setRenamingId(s.id);
                        setRenameValue(s.display_name ?? '');
                      }}
                    >
                      Rename
                    </button>
                    <button className="btn-small delete-btn" onClick={() => removeSensor(s.id)}>
                      Remove
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {unassignedSensors.length > 0 && (
          <div className="add-sensor-row">
            <select value={addSensorId} onChange={(e) => setAddSensorId(e.target.value)}>
              <option value="">Add a sensor...</option>
              {unassignedSensors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name || s.mac_address} — {s.location}
                </option>
              ))}
            </select>
            <button className="btn-primary btn-small" onClick={addSensor} disabled={!addSensorId}>
              Add
            </button>
          </div>
        )}
      </section>

      {/* Charts — one per sensor */}
      {sensors.length > 0 && (
        <section className="detail-section">
          <h3>Charts</h3>
          {sensors.map((s) => (
            <div key={s.id} className="sensor-chart-block">
              <h4>{s.display_name || s.mac_address}</h4>
              <MetricChart sensorId={s.id} soilType={plant?.soil_type} plantSpecies={plant?.plant_species} />
            </div>
          ))}
        </section>
      )}

      {/* Alerts — one per sensor */}
      {sensors.length > 0 && (
        <section className="detail-section">
          <h3>Alerts</h3>
          <div className="bottom-panels">
            {sensors.map((s) => (
              <div key={s.id}>
                <h4>{s.display_name || s.mac_address}</h4>
                <AlertsPanel sensorId={s.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Alert History */}
      {sensors.length > 0 && (
        <section className="detail-section">
          <h3>Alert History</h3>
          {sensors.map((s) => (
            <div key={s.id}>
              <h4>{s.display_name || s.mac_address}</h4>
              <AlertHistory sensorId={s.id} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
