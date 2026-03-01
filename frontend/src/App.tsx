import { useState } from 'react';
import { PlantDashboard } from './components/PlantDashboard';
import { PlantDetail } from './components/PlantDetail';
import { SoilTypeManager } from './components/SoilTypeManager';
import { PlantSpeciesManager } from './components/PlantSpeciesManager';
import { SensorManager } from './components/SensorManager';
import { RoomManager } from './components/RoomManager';
import { ToastProvider } from './components/Toast';
import { DashboardIcon, LeafIcon, SoilIcon, SensorIcon, RoomIcon } from './components/Icons';
import './App.css';

type View = 'dashboard' | 'plant-detail' | 'soil-types' | 'plant-species' | 'sensors' | 'rooms';

export function App() {
  const [view, setView] = useState<View>('dashboard');
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);

  return (
    <ToastProvider>
    <div className="app-container">
      <nav className="sidebar">
        <div className="sidebar-logo" onClick={() => { setView('dashboard'); setSelectedPlantId(null); }}>
          <span className="logo-text">Smart Garden</span>
        </div>
        <nav>
          <div className={view === 'dashboard' || view === 'plant-detail' ? 'nav-item active' : 'nav-item'} onClick={() => { setView('dashboard'); setSelectedPlantId(null); }}>
            <DashboardIcon className="nav-icon" /> Dashboard
          </div>
          <div className={view === 'plant-species' ? 'nav-item active' : 'nav-item'} onClick={() => setView('plant-species')}>
            <LeafIcon className="nav-icon" /> Species
          </div>
          <div className={view === 'soil-types' ? 'nav-item active' : 'nav-item'} onClick={() => setView('soil-types')}>
            <SoilIcon className="nav-icon" /> Soil Types
          </div>
          <div className={view === 'sensors' ? 'nav-item active' : 'nav-item'} onClick={() => setView('sensors')}>
            <SensorIcon className="nav-icon" /> Sensors
          </div>
          <div className={view === 'rooms' ? 'nav-item active' : 'nav-item'} onClick={() => setView('rooms')}>
            <RoomIcon className="nav-icon" /> Rooms
          </div>
        </nav>
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

        {view === 'rooms' && (
          <RoomManager />
        )}
      </main>
    </div>
    </ToastProvider>
  );
}
