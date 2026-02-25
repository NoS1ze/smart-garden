import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { Sensor } from './types';
import { SensorSelector } from './components/SensorSelector';
import { MetricChart } from './components/MetricChart';
import { AlertsPanel } from './components/AlertsPanel';
import { AlertHistory } from './components/AlertHistory';
import './App.css';

export function App() {
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSensors() {
      const { data, error: err } = await supabase
        .from('sensors')
        .select('*')
        .order('name');

      if (err) {
        setError(err.message);
      } else if (data) {
        setSensors(data);
        if (data.length > 0 && !selectedSensor) {
          setSelectedSensor(data[0].id);
        }
      }
      setLoading(false);
    }

    fetchSensors();
  }, []);

  if (loading) {
    return <div className="app"><p className="status">Loading sensors...</p></div>;
  }

  if (error) {
    return <div className="app"><p className="status error">Error: {error}</p></div>;
  }

  return (
    <div className="app">
      <header>
        <h1>Smart Garden Dashboard</h1>
        <SensorSelector
          sensors={sensors}
          selected={selectedSensor}
          onSelect={setSelectedSensor}
        />
      </header>

      {selectedSensor ? (
        <main>
          <MetricChart sensorId={selectedSensor} />
          <div className="bottom-panels">
            <AlertsPanel sensorId={selectedSensor} />
            <AlertHistory sensorId={selectedSensor} />
          </div>
        </main>
      ) : (
        <p className="status">Select a sensor to get started.</p>
      )}
    </div>
  );
}
