import { useState, useEffect, useCallback } from 'react';
import { Plant, Room } from '../types';
import { PlantCard } from './PlantCard';
import { AddPlantForm } from './AddPlantForm';

const apiUrl = import.meta.env.VITE_API_URL || '';

interface Props {
  onSelectPlant: (plantId: string) => void;
}

export function PlantDashboard({ onSelectPlant }: Props) {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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
