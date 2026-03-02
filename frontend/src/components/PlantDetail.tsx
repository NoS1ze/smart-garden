import { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { Plant, Sensor, SoilType, PlantSpecies, Room, Reading, WateringSchedule } from '../types';
import { MetricChart } from './MetricChart';
import { AlertsPanel } from './AlertsPanel';
import { AlertHistory } from './AlertHistory';
import { WateringLog } from './WateringLog';
import { PhotoUpload } from './PhotoUpload';
import { rawToPercent, timeAgo, getMetricStatus, getMetricRanges, getCalibration } from '../lib/calibration';
import { ZonedGradientBar, getZoneLabel } from './ZonedGradientBar';
import { MetricIcon } from './Icons';
import { useToast } from './Toast';

interface Props {
  plantId: string;
  onBack: () => void;
}

const DETAIL_METRICS = [
  { key: 'soil_moisture', label: 'Moisture', unit: '%' },
  { key: 'temperature', label: 'Temperature', unit: '°C' },
  { key: 'humidity', label: 'Humidity', unit: '%' },
  { key: 'co2_ppm', label: 'CO\u2082', unit: ' ppm' },
  { key: 'tvoc_ppb', label: 'TVOC', unit: ' ppb' },
  { key: 'pressure_hpa', label: 'Pressure', unit: ' hPa' },
];

const ACCENT_COLORS: Record<string, string> = {
  soil_moisture: 'var(--metric-moisture)',
  temperature: 'var(--metric-temperature)',
  humidity: 'var(--metric-humidity)',
  co2_ppm: 'var(--metric-co2)',
  tvoc_ppb: 'var(--metric-tvoc)',
  pressure_hpa: 'var(--metric-pressure)',
  light_lux: 'var(--metric-light)',
};

const cssVar = (name: string, fallback: string) => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch { return fallback; }
};

const resolveColor = (color: string): string => {
  const match = color.match(/^var\(([^)]+)\)$/);
  if (match) return cssVar(match[1], '#22c55e');
  return color;
};

function useTrendData(apiUrl: string, sensorId: string | undefined, metric: string, convertValue?: (raw: number) => number) {
  const [trendData, setTrendData] = useState<{ points: { avg: number }[]; trend: string; change_pct: number | null } | null>(null);
  useEffect(() => {
    if (!sensorId) return;
    fetch(`${apiUrl}/api/readings/trends?sensor_id=${sensorId}&metric=${metric}&period=7d`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const cv = convertValue || ((v: number) => v);
        const points = (data.points || [])
          .filter((p: any) => p.avg != null && isFinite(p.avg))
          .map((p: any) => ({ avg: cv(p.avg) }));
        let change_pct = data.change_pct;
        if (convertValue && data.current_avg != null && data.previous_avg != null && isFinite(data.previous_avg)) {
          const cur = cv(data.current_avg);
          const prev = cv(data.previous_avg);
          change_pct = prev !== 0 ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10 : 0;
        }
        setTrendData({ points, trend: data.trend || 'stable', change_pct });
      })
      .catch(() => {});
  }, [apiUrl, sensorId, metric]);
  return trendData;
}

interface MetricTileProps {
  metricKey: string;
  label: string;
  unit: string;
  value: number;
  ranges: { min: number | null; optMin: number | null; optMax: number | null; max: number | null };
  status: { status: string };
  panelStale: boolean;
  sensorId: string | undefined;
  apiUrl: string;
  convertValue?: (raw: number) => number;
}

function MetricTile({ metricKey, label, unit, value, ranges, status, panelStale, sensorId, apiUrl, convertValue }: MetricTileProps) {
  const trendData = useTrendData(apiUrl, sensorId, metricKey, convertValue);
  const hasRanges = ranges.min != null && ranges.optMin != null && ranges.optMax != null && ranges.max != null;
  const zoneInfo = hasRanges
    ? getZoneLabel(value, ranges.min!, ranges.optMin!, ranges.optMax!, ranges.max!)
    : null;
  const accent = resolveColor(ACCENT_COLORS[metricKey] || 'var(--green-vivid)');

  return (
    <div className="metric-tile">
      <div className="metric-tile-icon" style={{ color: ACCENT_COLORS[metricKey] }}>
        <MetricIcon metric={metricKey} size={20} />
      </div>
      <div className="metric-tile-value">
        {value.toFixed(metricKey === 'temperature' ? 1 : 0)}
        <span className="metric-tile-unit">{unit}</span>
      </div>
      <div className="metric-tile-label">{label}</div>
      <ZonedGradientBar
        value={value}
        min={ranges.min}
        optMin={ranges.optMin}
        optMax={ranges.optMax}
        max={ranges.max}
        isStale={panelStale}
        accentColor={ACCENT_COLORS[metricKey]}
      />
      {zoneInfo && (
        <div className={`metric-tile-status ${status.status}`}>
          {zoneInfo.text}
        </div>
      )}
      {trendData && trendData.points.length > 1 && (
        <div className="metric-tile-trend">
          <div className="metric-tile-sparkline">
            <ResponsiveContainer width="100%" height={28}>
              <AreaChart data={trendData.points}>
                <Area type="natural" dataKey="avg" stroke={accent}
                      fill={accent} fillOpacity={0.06}
                      strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {trendData.change_pct != null && (
            <span className={`metric-tile-change ${trendData.trend}`}>
              {trendData.trend === 'up' ? '\u2191' : trendData.trend === 'down' ? '\u2193' : '\u2192'}
              {trendData.change_pct > 0 ? '+' : ''}{trendData.change_pct}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

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


  // Watering schedule state
  const [schedule, setSchedule] = useState<WateringSchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [newIntervalDays, setNewIntervalDays] = useState(7);

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

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/plants/${plantId}/watering-schedule`);
      if (!res.ok) return;
      const body = await res.json();
      setSchedule(body.data?.[0] ?? null);
    } catch {
      // ignore
    }
  }, [apiUrl, plantId]);

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
      await Promise.all([fetchPlant(), fetchSensors(), fetchLatestReadings(), fetchSoilTypes(), fetchPlantSpecies(), fetchRooms(), fetchAllPlants(), fetchSchedule()]);
      setLoading(false);
    }
    load();
  }, [fetchPlant, fetchSensors, fetchLatestReadings, fetchSoilTypes, fetchPlantSpecies, fetchRooms, fetchAllPlants, fetchSchedule]);

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
      <div className="plant-detail-topbar">
        <button className="btn-back" onClick={onBack}>&larr; Back</button>
        {!editing && (
          <button className="btn-edit" onClick={() => {
            setEditSensorIds(new Set(usingReference ? [] : sensors.map(s => s.id)));
            setEditing(true);
          }}>&#9998; Edit</button>
        )}
      </div>

      {error && <p className="status error">{error}</p>}

      {/* Identity Header */}
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
        <div className="section-card plant-detail-header">
          {plant.photo_url ? (
            <img className="plant-detail-photo" src={plant.photo_url} alt={plant.name} />
          ) : (
            <div className="plant-detail-photo-placeholder">&#127807;</div>
          )}
          <div className="plant-detail-info">
            <div className="plant-detail-name-row">
              <h2>{plant.name}</h2>
              {lastReadingTime && (() => {
                const { text, staleness } = timeAgo(lastReadingTime);
                return (
                  <span className="staleness-indicator plant-detail-staleness" title={new Date(lastReadingTime).toLocaleString()}>
                    <span className={`staleness-dot ${staleness}`} />
                    {text}
                  </span>
                );
              })()}
            </div>
            {tags.length > 0 && (
              <div className="detail-tags">
                {tags.map((t) => (
                  <span key={t.label} className="detail-tag" style={t.color ? { color: t.color } : undefined}>
                    <span className="detail-tag-label">{t.label}</span> {t.value}
                  </span>
                ))}
              </div>
            )}
            {plant.notes && (
              <p className="plant-detail-notes">
                <span className="quote-mark">&ldquo;</span>{plant.notes}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Metric Tiles Grid (with embedded trend sparklines) */}
      {!editing && availableMetrics.length > 0 && (() => {
        const panelStale = lastReadingTime ? timeAgo(lastReadingTime).staleness === 'dead' : false;
        const tileConvert = (key: string) =>
          key === 'soil_moisture' ? (raw: number) => rawToPercent(raw, rawDry, rawWet) : undefined;
        return (
          <div className="section-card">
            <h3 className="section-heading">Current Readings</h3>
            <div className="metric-tiles-grid" style={{
              gridTemplateColumns: `repeat(${Math.min(availableMetrics.length, 4)}, 1fr)`
            }}>
            {availableMetrics.map((m) => (
              <MetricTile
                key={m.key}
                metricKey={m.key}
                label={m.label}
                unit={m.unit}
                value={displayValues[m.key]}
                ranges={getMetricRanges(plant.plant_species, m.key)}
                status={getMetricStatus(displayValues[m.key], plant.plant_species, m.key)}
                panelStale={panelStale}
                sensorId={sensors.length > 0 ? sensors[0].id : undefined}
                apiUrl={apiUrl}
                convertValue={tileConvert(m.key)}
              />
            ))}
            </div>
          </div>
        );
      })()}

      {/* Charts */}
      {sensors.length > 0 && (
        <div className="section-card">
          <h3 className="section-heading">Charts</h3>
          {sensors.map((s) => (
            <div key={s.id} className="chart-section">
              {!singleSensor && <h4>{s.display_name || s.location || 'Sensor'}</h4>}
              <MetricChart sensorId={s.id} soilType={plant?.soil_type} plantSpecies={plant?.plant_species} adcBits={s.adc_bits ?? 10} plantId={plantId} />
            </div>
          ))}
        </div>
      )}

      {/* Alerts + History — only for directly assigned sensors */}
      {sensors.length > 0 && !usingReference && (
        <div className="section-card">
          <h3 className="section-heading">Alerts</h3>
          {sensors.map((s) => (
            <div key={s.id}>
              {!singleSensor && <h4>{s.display_name || s.location || 'Sensor'}</h4>}
              <div className="bottom-panels">
                <AlertsPanel sensorId={s.id} />
                <AlertHistory sensorId={s.id} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Care: Watering Schedule + Log */}
      <div className="section-card">
        <h3 className="section-heading">Care</h3>
        {schedule ? (
          <div className="watering-schedule-card">
            <div className="watering-schedule-info">
              <span className="watering-schedule-interval">Every {schedule.interval_days} day{schedule.interval_days !== 1 ? 's' : ''}</span>
              {schedule.next_due_at && (() => {
                const isOverdue = new Date(schedule.next_due_at) < new Date();
                return (
                  <span className={`watering-schedule-due ${isOverdue ? 'overdue' : ''}`}>
                    {isOverdue ? 'Overdue' : 'Next'}: {new Date(schedule.next_due_at).toLocaleDateString()}
                  </span>
                );
              })()}
              {schedule.last_watered_at && (
                <span className="watering-schedule-last">
                  Last watered: {new Date(schedule.last_watered_at).toLocaleDateString()}
                </span>
              )}
              {schedule.notes && <span className="watering-schedule-notes">{schedule.notes}</span>}
            </div>
            <div className="watering-schedule-actions">
              <button
                className="btn-primary btn-sm"
                disabled={scheduleLoading}
                onClick={async () => {
                  setScheduleLoading(true);
                  try {
                    await fetch(`${apiUrl}/api/plants/${plantId}/watering-events`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ plant_id: plantId }),
                    });
                    await fetchSchedule();
                    toast.success('Watered!');
                  } catch {
                    toast.error('Failed to record watering');
                  } finally {
                    setScheduleLoading(false);
                  }
                }}
              >
                Water Now
              </button>
              <button
                className="btn-text-danger btn-sm"
                onClick={async () => {
                  await fetch(`${apiUrl}/api/watering-schedules/${schedule.id}`, { method: 'DELETE' });
                  setSchedule(null);
                  toast.success('Schedule removed');
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="watering-schedule-create">
            <label className="watering-schedule-create-label">
              Water every
              <input
                type="number"
                min={1}
                max={365}
                value={newIntervalDays}
                onChange={(e) => setNewIntervalDays(Math.max(1, parseInt(e.target.value) || 1))}
                className="watering-schedule-input"
              />
              days
            </label>
            <button
              className="btn-primary btn-sm"
              disabled={scheduleLoading}
              onClick={async () => {
                setScheduleLoading(true);
                try {
                  await fetch(`${apiUrl}/api/plants/${plantId}/watering-schedule`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ interval_days: newIntervalDays }),
                  });
                  await fetchSchedule();
                  toast.success('Watering schedule created');
                } catch {
                  toast.error('Failed to create schedule');
                } finally {
                  setScheduleLoading(false);
                }
              }}
            >
              Set Schedule
            </button>
          </div>
        )}
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
          <WateringLog plantId={plantId} apiUrl={apiUrl} />
        </div>
      </div>

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
