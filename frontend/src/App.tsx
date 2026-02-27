import { useState } from 'react';
import { PlantDashboard } from './components/PlantDashboard';
import { PlantDetail } from './components/PlantDetail';
import { SoilTypeManager } from './components/SoilTypeManager';
import { PlantSpeciesManager } from './components/PlantSpeciesManager';
import { SensorManager } from './components/SensorManager';
import './App.css';

type View = 'dashboard' | 'plant-detail' | 'soil-types' | 'plant-species' | 'sensors';

export function App() {
  const [view, setView] = useState<View>('dashboard');
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);

  return (
    <div className="app-container">
      <nav className="sidebar">
        <div className="sidebar-header" onClick={() => { setView('dashboard'); setSelectedPlantId(null); }}>
          <h1>🌱 Smart Garden</h1>
        </div>
        <ul className="nav-links">
          <li className={view === 'dashboard' || view === 'plant-detail' ? 'active' : ''} onClick={() => { setView('dashboard'); setSelectedPlantId(null); }}>
            <span className="icon">📊</span> Dashboard
          </li>
          <li className={view === 'plant-species' ? 'active' : ''} onClick={() => setView('plant-species')}>
            <span className="icon">🌿</span> Species
          </li>
          <li className={view === 'soil-types' ? 'active' : ''} onClick={() => setView('soil-types')}>
            <span className="icon">⏳</span> Soil Types
          </li>
          <li className={view === 'sensors' ? 'active' : ''} onClick={() => setView('sensors')}>
            <span className="icon">📟</span> Sensors
          </li>
        </ul>
      </nav>

      <main className="content">
        <header className="mobile-header">
           <h1 onClick={() => { setView('dashboard'); setSelectedPlantId(null); }}>
            Smart Garden
          </h1>
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

        {view === 'plant-species' && (
          <PlantSpeciesManager />
        )}

        {view === 'sensors' && (
          <SensorManager />
        )}
      </main>
    </div>
  );
}
