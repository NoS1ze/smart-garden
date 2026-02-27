import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plant, Reading } from '../types';
import { rawToPercent } from '../lib/calibration';

interface Props {
  plant: Plant;
  onClick: () => void;
}

export function PlantCard({ plant, onClick }: Props) {
  const [moisture, setMoisture] = useState<number | null>(null);
  const [lastReadingTime, setLastReadingTime] = useState<string | null>(null);
  const [needsAttention, setNeedsAttention] = useState(false);

  useEffect(() => {
    async function fetchData() {
      // Get associated sensor IDs
      const { data: assignments } = await supabase
        .from('sensor_plant')
        .select('sensor_id')
        .eq('plant_id', plant.id);

      if (!assignments || assignments.length === 0) return;

      const sensorIds = assignments.map((a: { sensor_id: string }) => a.sensor_id);

      // Get latest soil_moisture reading from any associated sensor
      const { data: readings } = await supabase
        .from('readings')
        .select('*')
        .in('sensor_id', sensorIds)
        .eq('metric', 'soil_moisture')
        .order('recorded_at', { ascending: false })
        .limit(1);

      if (readings && readings.length > 0) {
        const r: Reading = readings[0];
        // Convert raw value to percentage using plant's soil type calibration
        const st = plant.soil_type;
        const pct = rawToPercent(r.value, st?.raw_dry, st?.raw_wet);
        setMoisture(pct);
        setLastReadingTime(r.recorded_at);
      }

      // Check if any alert was triggered in last 24h for associated sensors
      const { data: alerts } = await supabase
        .from('alerts')
        .select('id')
        .in('sensor_id', sensorIds)
        .eq('active', true);

      if (alerts && alerts.length > 0) {
        const alertIds = alerts.map((a: { id: string }) => a.id);
        const since = new Date(Date.now() - 86400000).toISOString();
        const { data: recentTriggers } = await supabase
          .from('alert_history')
          .select('id')
          .in('alert_id', alertIds)
          .gte('triggered_at', since)
          .limit(1);

        if (recentTriggers && recentTriggers.length > 0) {
          setNeedsAttention(true);
        }
      }
    }

    fetchData();
  }, [plant.id, plant.soil_type]);

  const moistureColor =
    moisture === null
      ? '#666'
      : moisture > 60
        ? '#4ade80'
        : moisture > 30
          ? '#facc15'
          : '#f87171';

  return (
    <div className="plant-card" onClick={onClick}>
      {plant.photo_url ? (
        <img className="plant-photo" src={plant.photo_url} alt={plant.name} />
      ) : (
        <div className="plant-photo-placeholder" />
      )}
      <div className="plant-card-body">
        <div className="plant-card-header">
          <h3 className="plant-card-name">{plant.name}</h3>
          {needsAttention && <span className="attention-badge">!</span>}
        </div>
        {plant.species && <p className="plant-card-species">{plant.species}</p>}
        {plant.planted_date && (
          <p className="plant-card-date">
            Planted {new Date(plant.planted_date).toLocaleDateString()}
          </p>
        )}
        <div className="plant-card-moisture">
          <span className="moisture-dot" style={{ background: moistureColor }} />
          <span className="moisture-value">
            {moisture !== null ? `${moisture.toFixed(0)}%` : 'No data'}
          </span>
        </div>
        {lastReadingTime && (
          <p className="plant-card-time">
            {new Date(lastReadingTime).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
