import { useState, useEffect, useCallback } from 'react';
import { Plant } from '../types';
import { PlantCard } from './PlantCard';
import { AddPlantForm } from './AddPlantForm';

const apiUrl = import.meta.env.VITE_API_URL || '';

interface Props {
  onSelectPlant: (plantId: string) => void;
}

export function PlantDashboard({ onSelectPlant }: Props) {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchPlants = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/plants`);
      if (!res.ok) throw new Error('Failed to fetch plants');
      const body = await res.json();
      setPlants(body.data ?? []);
    } catch {
      // silently fail, plants stays empty
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlants();
    const interval = setInterval(fetchPlants, 60000);
    return () => clearInterval(interval);
  }, [fetchPlants]);

  if (loading) {
    return <p className="status">Loading plants...</p>;
  }

  return (
    <div>
      <div className="dashboard-header">
        <h2>My Plants</h2>
        <button className="btn-primary" onClick={() => setShowAddForm(true)}>
          + Add Plant
        </button>
      </div>

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
          <p>No plants yet.</p>
          <button className="btn-primary btn-large" onClick={() => setShowAddForm(true)}>
            Add your first plant
          </button>
        </div>
      ) : (
        <div className="plant-grid">
          {plants.map((p) => (
            <PlantCard key={p.id} plant={p} onClick={() => onSelectPlant(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
