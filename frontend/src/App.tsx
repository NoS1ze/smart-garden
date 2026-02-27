import { useState } from 'react';
import { PlantDashboard } from './components/PlantDashboard';
import { PlantDetail } from './components/PlantDetail';
import { SoilTypeManager } from './components/SoilTypeManager';
import './App.css';

type View = 'dashboard' | 'plant-detail' | 'soil-types';

export function App() {
  const [view, setView] = useState<View>('dashboard');
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);

  return (
    <div className="app">
      <header>
        <h1 onClick={() => { setView('dashboard'); setSelectedPlantId(null); }}>
          Smart Garden
        </h1>
        <button
          className="btn-secondary btn-small"
          onClick={() => setView('soil-types')}
          title="Soil Type Settings"
        >
          Soil Types
        </button>
      </header>

      {view === 'dashboard' && (
        <PlantDashboard
          onSelectPlant={(id) => {
            setSelectedPlantId(id);
            setView('plant-detail');
          }}
        />
      )}

      {view === 'plant-detail' && selectedPlantId && (
        <PlantDetail
          plantId={selectedPlantId}
          onBack={() => {
            setView('dashboard');
            setSelectedPlantId(null);
          }}
        />
      )}

      {view === 'soil-types' && (
        <SoilTypeManager />
      )}
    </div>
  );
}
