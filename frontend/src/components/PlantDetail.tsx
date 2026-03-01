import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Plant, Sensor, SoilType, PlantSpecies, Room, Reading } from '../types';
import { MetricChart } from './MetricChart';
import { AlertsPanel } from './AlertsPanel';
import { AlertHistory } from './AlertHistory';
import { PhotoUpload } from './PhotoUpload';
import { rawToPercent, timeAgo, getMetricStatus, getMetricRanges, getCalibration } from '../lib/calibration';
import { ZonedGradientBar } from './ZonedGradientBar';
import { useToast } from './Toast';

interface Props {
  plantId: string;
  onBack: () => void;
}

const DETAIL_METRICS = [
  { key: 'soil_moisture', label: 'Moisture', unit: '%', accent: '#14b8a6' },
  { key: 'temperature', label: 'Temperature', unit: '°C', accent: '#f59e0b' },
  { key: 'humidity', label: 'Humidity', unit: '%', accent: '#60a5fa' },
  { key: 'co2_ppm', label: 'CO\u2082', unit: ' ppm', accent: '#a78bfa' },
  { key: 'tvoc_ppb', label: 'TVOC', unit: ' ppb', accent: '#f472b6' },
  { key: 'pressure_hpa', label: 'Pressure', unit: ' hPa', accent: '#94a3b8' },
];

export function PlantDetail({ plantId, onBack }: Props) {
  const [plant, setPlant] = useState<Plant | null>(null);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [soilTypes, setSoilTypes] = useState<SoilType[]>([]);
  const [plantSpecies, setPlantSpecies] = useState<PlantSpecies[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allPlants, setAllPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);

  // Current readings for hero display
  const [latestValues, setLatestValues] = useState<Record<string, number>>({});
  const [lastReadingTime, setLastReadingTime] = useState<string | null>(null);

  // Editing state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPlantSpeciesId, setEditPlantSpeciesId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editPhoto, setEditPhoto] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSoilTypeId, setEditSoilTypeId] = useState('');
  const [editRoomId, setEditRoomId] = useState('');
  const [editReferencePlantId, setEditReferencePlantId] = useState('');
  const [saving, setSaving] = useState(false);
  const [allSensors, setAllSensors] = useState<Sensor[]>([]);
  const [editSensorIds, setEditSensorIds] = useState<Set<string>>(new Set());

  const [usingReference, setUsingReference] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const toast = useToast();
  const apiUrl = import.meta.env.VITE_API_URL || '';

  // Escape key closes dialogs
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDeleteConfirm(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

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
      setEditRoomId(data.room_id ?? '');
      setEditReferencePlantId(data.reference_plant_id ?? '');
    } catch {
      // ignore
    }
  }, [plantId, apiUrl]);

  const fetchSensors = useCallback(async () => {
    const { data: assignments } = await supabase
      .from('sensor_plant')
      .select('sensor_id')
      .eq('plant_id', plantId);

    let ids = new Set((assignments ?? []).map((a: { sensor_id: string }) => a.sensor_id));
    let isRef = false;

    // Fall back to reference plant's sensors if none directly assigned
    if (ids.size === 0) {
      const { data: plantData } = await supabase
        .from('plants')
        .select('reference_plant_id')
        .eq('id', plantId)
        .single();

      if (plantData?.reference_plant_id) {
        const { data: refAssignments } = await supabase
          .from('sensor_plant')
          .select('sensor_id')
          .eq('plant_id', plantData.reference_plant_id);
        ids = new Set((refAssignments ?? []).map((a: { sensor_id: string }) => a.sensor_id));
        isRef = true;
      }
    }

    setUsingReference(isRef);

    if (ids.size > 0) {
      const { data: sensorData } = await supabase
        .from('sensors')
        .select('*')
        .in('id', Array.from(ids));
      setSensors(sensorData ?? []);
    } else {
      setSensors([]);
    }

    // Fetch all sensors for the edit form
    const { data: allSensorData } = await supabase
      .from('sensors')
      .select('*')
      .order('display_name', { ascending: true });
    setAllSensors(allSensorData ?? []);

    // Initialize edit sensor IDs from direct assignments (not reference)
    if (!isRef) {
      setEditSensorIds(ids);
    } else {
      setEditSensorIds(new Set());
    }

  }, [plantId]);

  const fetchLatestReadings = useCallback(async () => {
    const { data: assignments } = await supabase
      .from('sensor_plant')
      .select('sensor_id')
      .eq('plant_id', plantId);

    let sensorIds = (assignments ?? []).map((a: { sensor_id: string }) => a.sensor_id);
    let isRef = false;

    // Fall back to reference plant's sensors
    if (sensorIds.length === 0) {
      const { data: plantData } = await supabase
        .from('plants')
        .select('reference_plant_id')
        .eq('id', plantId)
        .single();

      if (plantData?.reference_plant_id) {
        const { data: refAssignments } = await supabase
          .from('sensor_plant')
          .select('sensor_id')
          .eq('plant_id', plantData.reference_plant_id);
        sensorIds = (refAssignments ?? []).map((a: { sensor_id: string }) => a.sensor_id);
        isRef = true;
      }
    }

    if (sensorIds.length === 0) return;

    const { data: readings } = await supabase
      .from('readings')
      .select('*')
      .in('sensor_id', sensorIds)
      .order('recorded_at', { ascending: false })
      .limit(20);

    if (readings && readings.length > 0) {
      const values: Record<string, number> = {};
      let latestTime: string | null = null;

      for (const r of readings as Reading[]) {
        // Skip soil_moisture from reference sensors (not relevant to this plant)
        if (isRef && r.metric === 'soil_moisture') continue;
        if (values[r.metric] !== undefined) continue;
        values[r.metric] = r.value;
        if (!latestTime || r.recorded_at > latestTime) {
          latestTime = r.recorded_at;
        }
      }

      setLatestValues(values);
      setLastReadingTime(latestTime);
    }
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

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/rooms`);
      if (!res.ok) return;
      const body = await res.json();
      setRooms(body.data ?? []);
    } catch {
      // ignore
    }
  }, [apiUrl]);

  const fetchAllPlants = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/plants`);
      if (!res.ok) return;
      const body = await res.json();
      setAllPlants((body.data ?? []).filter((p: Plant) => p.id !== plantId));
    } catch {
      // ignore
    }
  }, [apiUrl, plantId]);

  useEffect(() => {
    async function load() {
      await Promise.all([fetchPlant(), fetchSensors(), fetchLatestReadings(), fetchSoilTypes(), fetchPlantSpecies(), fetchRooms(), fetchAllPlants()]);
      setLoading(false);
    }
    load();
  }, [fetchPlant, fetchSensors, fetchLatestReadings, fetchSoilTypes, fetchPlantSpecies, fetchRooms, fetchAllPlants]);

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
      body.room_id = editRoomId || null;
      body.reference_plant_id = editReferencePlantId || null;

      const res = await fetch(`${apiUrl}/api/plants/${plantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to update plant');
      }

      // Sync sensor associations
      const currentIds = new Set(sensors.filter(() => !usingReference).map(s => s.id));
      const toAdd = [...editSensorIds].filter(id => !currentIds.has(id));
      const toRemove = [...currentIds].filter(id => !editSensorIds.has(id));

      for (const id of toAdd) {
        await fetch(`${apiUrl}/api/plants/${plantId}/sensors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sensor_id: id }),
        });
      }
      for (const id of toRemove) {
        await fetch(`${apiUrl}/api/plants/${plantId}/sensors/${id}`, { method: 'DELETE' });
      }

      setEditing(false);
      fetchPlant();
      fetchSensors();
      fetchLatestReadings();
      toast.success('Plant updated successfully');
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const deletePlant = async () => {
    setShowDeleteConfirm(false);
    try {
      const res = await fetch(`${apiUrl}/api/plants/${plantId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to delete plant');
      }
      toast.success('Plant deleted');
      onBack();
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
    }
  };


  if (loading) return <p className="status">Loading...</p>;
  if (!plant) return <p className="status error">Plant not found.</p>;

  const referencePlant = allPlants.find((p) => p.id === plant.reference_plant_id);
  const singleSensor = sensors.length === 1;

  // Convert raw values to display values
  const adcBits = sensors.length > 0 ? (sensors[0].adc_bits ?? 10) : 10;
  const { rawDry, rawWet } = getCalibration(plant.soil_type, adcBits);
  const displayValues: Record<string, number> = {};
  for (const key of Object.keys(latestValues)) {
    displayValues[key] = key === 'soil_moisture'
      ? rawToPercent(latestValues[key], rawDry, rawWet)
      : latestValues[key];
  }
  const availableMetrics = DETAIL_METRICS.filter((m) => displayValues[m.key] !== undefined);

  // Info tags for compact display
  const tags: { label: string; value: string; color?: string }[] = [];
  if (plant.plant_species) tags.push({ label: 'Species', value: plant.plant_species.name });
  if (plant.room) tags.push({ label: 'Room', value: plant.room.name });
  if (plant.soil_type) tags.push({ label: 'Soil', value: plant.soil_type.name, color: 'var(--green-vivid)' });
  if (plant.planted_date) tags.push({ label: 'Planted', value: new Date(plant.planted_date).toLocaleDateString() });
  if (referencePlant) tags.push({ label: 'Ambient from', value: referencePlant.name, color: 'var(--blue-data)' });
  if (sensors.length > 0) {
    const sensorLabel = sensors.map(s => s.display_name || s.location || 'Sensor').join(', ');
    tags.push({ label: usingReference ? 'Ref sensor' : 'Sensor', value: sensorLabel, color: 'var(--teal)' });
  }

  return (
    <div className="plant-detail">
      <button className="btn-back" onClick={onBack}>&larr; Back</button>

      {error && <p className="status error">{error}</p>}

      {/* Unified Header: Image | Info | Metrics Panel */}
      <div className="plant-detail-header">
        {plant.photo_url ? (
          <img className="plant-detail-photo" src={plant.photo_url} alt={plant.name} />
        ) : (
          <div className="plant-detail-photo-placeholder">&#127807;</div>
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
                    <option key={ps.id} value={ps.id}>{ps.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Room
                <select value={editRoomId} onChange={(e) => setEditRoomId(e.target.value)}>
                  <option value="">None</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Sensor source
                <div className="sensor-source-toggle">
                  <button
                    type="button"
                    className={`source-btn ${editSensorIds.size > 0 ? 'active' : ''}`}
                    onClick={() => { setEditReferencePlantId(''); }}
                  >
                    Direct sensor
                  </button>
                  <button
                    type="button"
                    className={`source-btn ${editReferencePlantId ? 'active' : ''}`}
                    onClick={() => { setEditSensorIds(new Set()); }}
                  >
                    Reference plant
                  </button>
                </div>
              </label>
              {!editReferencePlantId ? (
                <label>
                  Sensors
                  <div className="sensor-checklist">
                    {allSensors.map((s) => (
                      <label key={s.id} className="sensor-check-item">
                        <input
                          type="checkbox"
                          checked={editSensorIds.has(s.id)}
                          onChange={(e) => {
                            const next = new Set(editSensorIds);
                            if (e.target.checked) next.add(s.id);
                            else next.delete(s.id);
                            setEditSensorIds(next);
                            setEditReferencePlantId('');
                          }}
                        />
                        {s.display_name || s.location || s.mac_address}
                      </label>
                    ))}
                    {allSensors.length === 0 && <span className="sensor-check-empty">No sensors registered yet</span>}
                  </div>
                </label>
              ) : (
                <label>
                  Reference sensor from
                  <select value={editReferencePlantId} onChange={(e) => {
                    setEditReferencePlantId(e.target.value);
                    if (e.target.value) setEditSensorIds(new Set());
                  }}>
                    <option value="">None</option>
                    {allPlants.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Planted Date
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </label>
              <label>
                Photo
                <PhotoUpload currentUrl={editPhoto || null} onUrlChange={(url) => setEditPhoto(url || '')} />
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
              {tags.length > 0 && (
                <div className="detail-tags">
                  {tags.map((t) => (
                    <span key={t.label} className="detail-tag" style={t.color ? { color: t.color } : undefined}>
                      <span className="detail-tag-label">{t.label}</span> {t.value}
                    </span>
                  ))}
                </div>
              )}
              {plant.notes ? (
                <p className="plant-detail-notes">
                  <span className="quote-mark">&ldquo;</span>{plant.notes}
                </p>
              ) : (
                <p className="plant-detail-notes empty">
                  No description added yet — tap Edit to add care notes.
                </p>
              )}
              <div>
                <button className="btn-edit" onClick={() => {
                  setEditSensorIds(new Set(usingReference ? [] : sensors.map(s => s.id)));
                  setEditing(true);
                }}>&#9998; Edit</button>
              </div>
            </>
          )}
        </div>

        {/* Right column: Metrics Panel */}
        {availableMetrics.length > 0 ? (() => {
          const PANEL_ICONS: Record<string, JSX.Element> = {
            soil_moisture: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color:'#14b8a6'}}><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>,
            temperature: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color:'#f59e0b'}}><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>,
            humidity: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color:'#60a5fa'}}><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/><path d="M6 14h12" opacity="0.5"/><path d="M7.5 18h9" opacity="0.5"/></svg>,
            co2_ppm: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color:'#a78bfa'}}><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>,
            tvoc_ppb: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color:'#f472b6'}}><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/></svg>,
            pressure_hpa: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color:'#94a3b8'}}><path d="M12 2v20M2 12h20"/></svg>,
          };
          const PANEL_LABELS: Record<string, string> = { soil_moisture: 'MOISTURE', temperature: 'TEMP', humidity: 'HUMIDITY', co2_ppm: 'CO\u2082', tvoc_ppb: 'TVOC', pressure_hpa: 'PRESSURE' };
          const metricStatuses = availableMetrics.map((m) =>
            getMetricStatus(displayValues[m.key], plant.plant_species, m.key)
          );
          const worstStatus = metricStatuses.some(s => s.status === 'critical') ? 'critical'
            : metricStatuses.some(s => s.status === 'acceptable') ? 'warning' : 'optimal';
          const badgeText = worstStatus === 'optimal' ? '\u25CF All readings optimal'
            : worstStatus === 'warning' ? '\u26A0 Needs attention' : '\u2717 Action required';
          const badgeClass = worstStatus;
          const panelStale = lastReadingTime ? timeAgo(lastReadingTime).staleness === 'dead' : false;

          return (
            <div className="metrics-panel">
              <div className={`metrics-panel-badge ${badgeClass}`}>{badgeText}</div>
              {availableMetrics.map((m) => {
                const val = displayValues[m.key];
                const ranges = getMetricRanges(plant.plant_species, m.key);
                return (
                  <div key={m.key} className="metrics-panel-row">
                    <span className="metrics-panel-icon">{PANEL_ICONS[m.key] || null}</span>
                    <span className="metrics-panel-label">{PANEL_LABELS[m.key] || m.label}</span>
                    <div className="metrics-panel-bar">
                      <ZonedGradientBar
                        value={val}
                        min={ranges.min}
                        optMin={ranges.optMin}
                        optMax={ranges.optMax}
                        max={ranges.max}
                        isStale={panelStale}
                      />
                    </div>
                    <span className="metrics-panel-value">
                      {val.toFixed(m.key === 'temperature' ? 1 : 0)}{m.unit}
                    </span>
                  </div>
                );
              })}
              {lastReadingTime && (() => {
                const { text, staleness } = timeAgo(lastReadingTime);
                const dotColor = worstStatus === 'optimal' ? '#4ade80' : worstStatus === 'warning' ? '#f59e0b' : '#ef4444';
                return (
                  <div className="metrics-panel-footer" title={new Date(lastReadingTime).toLocaleString()}>
                    <span className={`staleness-dot ${staleness}`} style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
                    {text}
                  </div>
                );
              })()}
            </div>
          );
        })() : <div />}
      </div>

      {/* Charts */}
      {sensors.length > 0 && (
        <section className="detail-section">
          <h3>Charts</h3>
          {sensors.map((s) => (
            <div key={s.id} className="chart-section">
              {!singleSensor && <h4>{s.display_name || s.location || 'Sensor'}</h4>}
              <MetricChart sensorId={s.id} soilType={plant?.soil_type} plantSpecies={plant?.plant_species} adcBits={s.adc_bits ?? 10} />
            </div>
          ))}
        </section>
      )}

      {/* Alerts + History — only for directly assigned sensors */}
      {sensors.length > 0 && !usingReference && (
        <section className="detail-section">
          <h3>Alerts</h3>
          {sensors.map((s) => (
            <div key={s.id}>
              {!singleSensor && <h4>{s.display_name || s.location || 'Sensor'}</h4>}
              <div className="bottom-panels">
                <AlertsPanel sensorId={s.id} />
                <AlertHistory sensorId={s.id} />
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Delete Plant — bottom of page */}
      <div className="danger-zone">
        <hr className="danger-divider" />
        <button className="btn-text-danger" onClick={() => setShowDeleteConfirm(true)}>
          Delete this plant
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Delete {plant.name}?</h3>
            <p>This will permanently remove this plant and all its sensor associations. This cannot be undone.</p>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn-danger" onClick={deletePlant}>Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
