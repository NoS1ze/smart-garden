import { useState, useEffect } from 'react';
import { PlantDashboard } from './components/PlantDashboard';
import { PlantDetail } from './components/PlantDetail';
import { SoilTypeManager } from './components/SoilTypeManager';
import { PlantSpeciesManager } from './components/PlantSpeciesManager';
import { SensorManager } from './components/SensorManager';
import { SensorDetail } from './components/SensorDetail';
import { RoomManager } from './components/RoomManager';
import { NotificationManager } from './components/NotificationManager';
import { ToastProvider } from './components/Toast';
import { DashboardIcon, LeafIcon, SoilIcon, SensorIcon, RoomIcon, BellIcon, SunIcon, MoonIcon } from './components/Icons';
import { ThemeProvider, useTheme } from './lib/theme';
import { AuthProvider, useAuth } from './lib/auth';
import './App.css';

type View = 'dashboard' | 'plant-detail' | 'soil-types' | 'plant-species' | 'sensors' | 'sensor-detail' | 'rooms' | 'notifications';

function LoginPage({ authError, onSignIn, onClearError, theme, onToggleTheme }: {
  authError: string | null;
  onSignIn: (email: string, password: string) => void;
  onClearError: () => void;
  theme: string;
  onToggleTheme: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberSession, setRememberSession] = useState(() => {
    return localStorage.getItem('remember_session') !== 'false';
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onClearError();
    localStorage.setItem('remember_session', String(rememberSession));
    onSignIn(email, password);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <LeafIcon className="login-leaf-icon" />
          <h1>Smart Garden</h1>
        </div>
        <p className="login-subtitle">Monitor your plants from anywhere</p>
        {authError && (
          <div className="login-error">{authError}</div>
        )}
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="email"
            className="login-input"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="login-input"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <label className="remember-session-label">
            <input
              type="checkbox"
              checked={rememberSession}
              onChange={e => setRememberSession(e.target.checked)}
            />
            Stay logged in for 30 days
          </label>
          <button type="submit" className="btn-primary">Sign In</button>
        </form>
        <button className="theme-toggle login-theme-toggle" onClick={onToggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const [view, setView] = useState<View>('dashboard');
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const { theme, toggle } = useTheme();
  const { user, loading, authError, signInWithEmail, signOut, clearError } = useAuth();

  // If "remember_session" is false, sign out when the browser tab closes
  useEffect(() => {
    if (!user) return;
    const remember = localStorage.getItem('remember_session');
    if (remember === 'false') {
      sessionStorage.setItem('sg_session_active', '1');
    }
  }, [user]);

  useEffect(() => {
    const remember = localStorage.getItem('remember_session');
    if (remember === 'false' && !sessionStorage.getItem('sg_session_active') && user) {
      signOut();
    }
  }, []);

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!user) {
    return <LoginPage authError={authError} onSignIn={signInWithEmail} onClearError={clearError} theme={theme} onToggleTheme={toggle} />;
  }

  const navItems: { view: View; icon: React.ReactNode; title: string }[] = [
    { view: 'dashboard', icon: <DashboardIcon className="nav-icon" />, title: 'Dashboard' },
    { view: 'plant-species', icon: <LeafIcon className="nav-icon" />, title: 'Species' },
    { view: 'soil-types', icon: <SoilIcon className="nav-icon" />, title: 'Soil Types' },
    { view: 'sensors', icon: <SensorIcon className="nav-icon" />, title: 'Sensors' },
    { view: 'rooms', icon: <RoomIcon className="nav-icon" />, title: 'Rooms' },
    { view: 'notifications', icon: <BellIcon className="nav-icon" />, title: 'Notifications' },
  ];

  const isActiveNav = (itemView: View) => {
    if (itemView === 'dashboard' && (view === 'dashboard' || view === 'plant-detail')) return true;
    if (itemView === 'sensors' && (view === 'sensors' || view === 'sensor-detail')) return true;
    return view === itemView;
  };

  return (
    <div className="app-container">
      <nav className="topnav">
        <div className="topnav-left" onClick={() => { setView('dashboard'); setSelectedPlantId(null); }}>
          <LeafIcon className="topnav-logo-icon" />
        </div>
        <div className="topnav-centre">
          {navItems.map(item => (
            <button
              key={item.view}
              className={`topnav-icon-btn${isActiveNav(item.view) ? ' active' : ''}`}
              title={item.title}
              onClick={() => {
                if (item.view === 'dashboard') setSelectedPlantId(null);
                if (item.view === 'sensors') setSelectedSensorId(null);
                setView(item.view);
              }}
            >
              {item.icon}
            </button>
          ))}
        </div>
        <div className="topnav-right">
          <button className="topnav-icon-btn" onClick={toggle} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>
          {user && (
            <img
              className="user-avatar"
              src={user.user_metadata?.avatar_url || ''}
              alt=""
              referrerPolicy="no-referrer"
              title={`Sign out (${user.email})`}
              onClick={signOut}
            />
          )}
        </div>
      </nav>

      <main className="page-content">
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
          <SensorManager onSelectSensor={(id) => { setSelectedSensorId(id); setView('sensor-detail'); }} />
        )}

        {view === 'sensor-detail' && selectedSensorId && (
          <SensorDetail sensorId={selectedSensorId} onBack={() => { setView('sensors'); setSelectedSensorId(null); }} />
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
