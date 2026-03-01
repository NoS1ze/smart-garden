import { useState } from 'react';
import { PlantDashboard } from './components/PlantDashboard';
import { PlantDetail } from './components/PlantDetail';
import { SoilTypeManager } from './components/SoilTypeManager';
import { PlantSpeciesManager } from './components/PlantSpeciesManager';
import { SensorManager } from './components/SensorManager';
import { RoomManager } from './components/RoomManager';
import { NotificationManager } from './components/NotificationManager';
import { ToastProvider } from './components/Toast';
import { DashboardIcon, LeafIcon, SoilIcon, SensorIcon, RoomIcon, BellIcon } from './components/Icons';
import { ThemeProvider, useTheme } from './lib/theme';
import { AuthProvider, useAuth } from './lib/auth';
import './App.css';

type View = 'dashboard' | 'plant-detail' | 'soil-types' | 'plant-species' | 'sensors' | 'rooms' | 'notifications';

function AppContent() {
  const [view, setView] = useState<View>('dashboard');
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const { theme, toggle } = useTheme();
  const { user, loading, signInWithGoogle, signOut } = useAuth();

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  return (
    <div className="app-container">
      <nav className="sidebar">
        <div className="sidebar-logo" onClick={() => { setView('dashboard'); setSelectedPlantId(null); }}>
          <span className="logo-text">Smart Garden</span>
          <button className="theme-toggle" onClick={(e) => { e.stopPropagation(); toggle(); }} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
          </button>
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
          <div className={view === 'notifications' ? 'nav-item active' : 'nav-item'} onClick={() => setView('notifications')}>
            <BellIcon className="nav-icon" /> Notifications
          </div>
        </nav>
        <div className="sidebar-footer">
          {user ? (
            <div className="user-info">
              <img
                className="user-avatar"
                src={user.user_metadata?.avatar_url || ''}
                alt=""
                referrerPolicy="no-referrer"
              />
              <span className="user-email">{user.email}</span>
              <button className="btn btn-sm" onClick={signOut}>Sign Out</button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={signInWithGoogle}>
              Sign in with Google
            </button>
          )}
        </div>
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

        {view === 'notifications' && (
          <NotificationManager />
        )}
      </main>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
