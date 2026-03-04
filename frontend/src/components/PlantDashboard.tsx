import { useState, useEffect, useCallback } from 'react';
import { Plant, Room } from '../types';
import { PlantCard } from './PlantCard';
import { AddPlantForm } from './AddPlantForm';
import { MetricIcon } from './Icons';
import { supabase } from '../lib/supabase';

const apiUrl = import.meta.env.VITE_API_URL || '';

const METRIC_UNITS: Record<string, { decimals: number; unit: string }> = {
  temperature: { decimals: 1, unit: '°C' },
  humidity: { decimals: 0, unit: '%' },
  co2_ppm: { decimals: 0, unit: 'ppm' },
  tvoc_ppb: { decimals: 0, unit: 'ppb' },
};

type RoomAggregates = Record<string, Record<string, number>>;

interface Props {
  onSelectPlant: (plantId: string) => void;
}

export function PlantDashboard({ onSelectPlant }: Props) {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [roomAggregates, setRoomAggregates] = useState<RoomAggregates>({});

  const fetchPlants = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/plants`);
      if (!res.ok) throw new Error('Failed to fetch plants');
      const body = await res.json();
      setPlants(body.data ?? []);
    } catch {
      // silently fail, plants stays empty
    }
  }, []);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/rooms`);
      if (!res.ok) return;
      const body = await res.json();
      setRooms(body.data ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchPlants(), fetchRooms()]).then(() => setLoading(false));
    const interval = setInterval(fetchPlants, 60000);
    return () => clearInterval(interval);
  }, [fetchPlants, fetchRooms]);

  // Fetch room-level metric aggregates
  useEffect(() => {
    if (!plants.length || !rooms.length) return;

    // Collect sensor IDs per room
    const roomSensorMap: Record<string, string[]> = {};
    const allSensorIds: string[] = [];
    for (const room of rooms) {
      const roomPlants = plants.filter((p) => p.room_id === room.id);
      const sids = roomPlants.flatMap((p) => ((p as any).sensors || []).map((s: any) => s.id));
      if (sids.length > 0) {
        roomSensorMap[room.id] = sids;
        allSensorIds.push(...sids);
      }
    }
    if (allSensorIds.length === 0) return;

    const unique = [...new Set(allSensorIds)];
    supabase
      .from('readings')
      .select('sensor_id, metric, value, recorded_at')
      .in('sensor_id', unique)
      .order('recorded_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (!data) return;
        const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const aggs: RoomAggregates = {};

        for (const [roomId, sids] of Object.entries(roomSensorMap)) {
          // For each sensor, find latest reading per metric (fresh only)
          const sensorLatest: Record<string, Record<string, number>> = {};
          for (const row of data) {
            if (!sids.includes(row.sensor_id)) continue;
            if (row.recorded_at < cutoff) continue;
            if (row.metric === 'soil_moisture') continue;
            if (!(row.metric in METRIC_UNITS)) continue;
            if (!sensorLatest[row.sensor_id]) sensorLatest[row.sensor_id] = {};
            if (!(row.metric in sensorLatest[row.sensor_id])) {
              sensorLatest[row.sensor_id][row.metric] = row.value;
            }
          }

          // Average across sensors per metric
          const metricSums: Record<string, { sum: number; count: number }> = {};
          for (const metrics of Object.values(sensorLatest)) {
            for (const [m, v] of Object.entries(metrics)) {
              if (!metricSums[m]) metricSums[m] = { sum: 0, count: 0 };
              metricSums[m].sum += v;
              metricSums[m].count += 1;
            }
          }

          const roomAvgs: Record<string, number> = {};
          for (const [m, { sum, count }] of Object.entries(metricSums)) {
            roomAvgs[m] = sum / count;
          }
          if (Object.keys(roomAvgs).length > 0) {
            aggs[roomId] = roomAvgs;
          }
        }

        setRoomAggregates(aggs);
      });
  }, [plants, rooms]);

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return <p className="status">Loading plants...</p>;
  }

  // Group plants by room
  const roomsWithPlants = rooms
    .map((room) => ({
      room,
      plants: plants.filter((p) => p.room_id === room.id),
    }))
    .filter((g) => g.plants.length > 0);

  const ungrouped = plants.filter((p) => !p.room_id);
  const hasRooms = roomsWithPlants.length > 0;

  // Summary stats
  const totalPlants = plants.length;
  const activeSensors = new Set(plants.flatMap((p) => (p as any).sensors?.map((s: any) => s.id) ?? [])).size;
  const roomCount = rooms.length;

  return (
    <div>
      <div className="dashboard-header">
        <h2>My Plants</h2>
        <button className="btn-outline-green" onClick={() => setShowAddForm(true)}>
          + Add Plant
        </button>
      </div>

      {totalPlants > 0 && (
        <p className="stats-subtitle">
          {totalPlants} {totalPlants === 1 ? 'plant' : 'plants'}
          {roomCount > 0 && ` · ${roomCount} ${roomCount === 1 ? 'room' : 'rooms'}`}
          {activeSensors > 0 && ` · ${activeSensors} ${activeSensors === 1 ? 'sensor' : 'sensors'} active`}
        </p>
      )}

      {showAddForm && (
        <AddPlantForm
          onCreated={() => {
            setShowAddForm(false);
            fetchPlants();
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {plants.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">&#127793;</div>
          <h3>No plants yet</h3>
          <p>Add your first plant to start monitoring your garden.</p>
          <button className="btn-primary btn-large" onClick={() => setShowAddForm(true)}>
            + Add Plant
          </button>
        </div>
      ) : hasRooms ? (
        <>
          {roomsWithPlants.map(({ room, plants: roomPlants }) => (
            <div key={room.id} className="room-section">
              <div
                className="room-section-header"
                onClick={() => toggleCollapse(room.id)}
              >
                <span className={`toggle-icon${collapsed[room.id] ? ' collapsed' : ''}`}>&#9662;</span>
                <h3>{room.name}</h3>
                <span className="room-section-count">{roomPlants.length}</span>
                {roomAggregates[room.id] && (
                  <div className="room-metric-chips" onClick={(e) => e.stopPropagation()}>
                    {Object.entries(roomAggregates[room.id]).map(([metric, value]) => {
                      const cfg = METRIC_UNITS[metric];
                      if (!cfg) return null;
                      return (
                        <span key={metric} className="room-metric-chip">
                          <MetricIcon metric={metric} size={14} />
                          {value.toFixed(cfg.decimals)}{cfg.unit}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              {!collapsed[room.id] && (
                <div className="plant-grid">
                  {roomPlants.map((p, i) => (
                    <div key={p.id} className="animate-in" style={{ animationDelay: `${i * 60}ms` }}>
                      <PlantCard plant={p} onClick={() => onSelectPlant(p.id)} />
                    </div>
                  ))}
                  {totalPlants < 4 && (
                    <div className="add-plant-card" onClick={() => setShowAddForm(true)}>
                      <span className="add-plant-icon">+</span>
                      <span className="add-plant-text">Add a plant</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {ungrouped.length > 0 && (
            <div className="room-section">
              <div
                className="room-section-header"
                onClick={() => toggleCollapse('_ungrouped')}
              >
                <span className={`toggle-icon${collapsed['_ungrouped'] ? ' collapsed' : ''}`}>&#9662;</span>
                <h3>Ungrouped</h3>
                <span className="room-section-count">{ungrouped.length}</span>
              </div>
              {!collapsed['_ungrouped'] && (
                <div className="plant-grid">
                  {ungrouped.map((p, i) => (
                    <div key={p.id} className="animate-in" style={{ animationDelay: `${i * 60}ms` }}>
                      <PlantCard plant={p} onClick={() => onSelectPlant(p.id)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="plant-grid">
          {plants.map((p, i) => (
            <div key={p.id} className="animate-in" style={{ animationDelay: `${i * 60}ms` }}>
              <PlantCard plant={p} onClick={() => onSelectPlant(p.id)} />
            </div>
          ))}
          {plants.length < 4 && (
            <div className="add-plant-card" onClick={() => setShowAddForm(true)}>
              <span className="add-plant-icon">+</span>
              <span className="add-plant-text">Add a plant</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
