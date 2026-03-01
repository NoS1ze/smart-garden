import { useState, useEffect, useCallback } from 'react';
import { Room, Plant } from '../types';

const apiUrl = import.meta.env.VITE_API_URL || '';

export function RoomManager() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const [error, setError] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/rooms`);
      if (!res.ok) throw new Error('Failed to fetch rooms');
      const body = await res.json();
      setRooms(body.data ?? []);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const fetchPlants = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/plants`);
      if (!res.ok) return;
      const body = await res.json();
      setPlants(body.data ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchRooms(), fetchPlants()]).then(() => setLoading(false));
  }, [fetchRooms, fetchPlants]);

  const handleAdd = async () => {
    if (!addName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to create room');
      }
      setShowAdd(false);
      setAddName('');
      fetchRooms();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/rooms/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to update room');
      }
      setEditingId(null);
      fetchRooms();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this room? Plants in it will become ungrouped.')) return;
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/rooms/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to delete room');
      }
      fetchRooms();
      fetchPlants();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startEdit = (room: Room) => {
    setEditingId(room.id);
    setEditName(room.name);
  };

  const plantCountFor = (roomId: string) =>
    plants.filter((p) => p.room_id === roomId).length;

  if (loading) return <p className="status">Loading rooms...</p>;

  return (
    <div className="soil-type-manager">
      <div className="dashboard-header">
        <h2>Rooms</h2>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Room'}
        </button>
      </div>

      {error && <p className="status error">{error}</p>}

      {showAdd && (
        <div className="soil-type-form">
          <input
            type="text"
            placeholder="Room name (e.g. Living Room)"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <button className="btn-primary" onClick={handleAdd} disabled={submitting || !addName.trim()}>
            {submitting ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}

      {rooms.length === 0 ? (
        <div className="empty-state">
          <p>No rooms defined yet.</p>
          <p className="status">Create rooms to group your plants by location.</p>
        </div>
      ) : (
        <div className="soil-types-list">
          {rooms.map((room) => (
            <div key={room.id} className="soil-card">
              {editingId === room.id ? (
                <div>
                  <div className="form-group">
                    <label className="form-label">Name</label>
                    <input
                      className="form-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEdit(room.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  </div>
                  <div className="form-actions">
                    <button className="btn-small btn-primary" onClick={() => handleEdit(room.id)}>Save</button>
                    <button className="btn-small btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="soil-header">
                  <div>
                    <h3>{room.name}</h3>
                    <span className="room-plant-count">
                      {plantCountFor(room.id)} {plantCountFor(room.id) === 1 ? 'plant' : 'plants'}
                    </span>
                  </div>
                  <div className="soil-actions">
                    <button className="btn-small btn-secondary" onClick={() => startEdit(room)}>Edit</button>
                    <button className="btn-small btn-danger" onClick={() => handleDelete(room.id)}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
