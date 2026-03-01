import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plant, Reading } from '../types';
import { rawToPercent, timeAgo, getMetricRanges, getOverallHealth, getCalibration } from '../lib/calibration';
import { ZonedGradientBar } from './ZonedGradientBar';

interface Props {
  plant: Plant;
  onClick: () => void;
}

interface MetricConfig {
  key: string;
  label: string;
  unit: string;
}

const CARD_METRICS: MetricConfig[] = [
  { key: 'soil_moisture', label: 'Moisture', unit: '%' },
  { key: 'temperature', label: 'Temp', unit: '\u00b0C' },
  { key: 'humidity', label: 'Humidity', unit: '%' },
  { key: 'co2_ppm', label: 'CO\u2082', unit: ' ppm' },
  { key: 'tvoc_ppb', label: 'TVOC', unit: ' ppb' },
  { key: 'pressure_hpa', label: 'Pressure', unit: ' hPa' },
];

export function PlantCard({ plant, onClick }: Props) {
  const [latestValues, setLatestValues] = useState<Record<string, number>>({});
  const [lastReadingTime, setLastReadingTime] = useState<string | null>(null);
  const [needsAttention, setNeedsAttention] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const { data: assignments } = await supabase
        .from('sensor_plant')
        .select('sensor_id')
        .eq('plant_id', plant.id);

      let sensorIds = (assignments ?? []).map((a: { sensor_id: string }) => a.sensor_id);

      const useReference = sensorIds.length === 0 && plant.reference_plant_id;
      if (useReference) {
        const { data: refAssignments } = await supabase
          .from('sensor_plant')
          .select('sensor_id')
          .eq('plant_id', plant.reference_plant_id!);
        sensorIds = (refAssignments ?? []).map((a: { sensor_id: string }) => a.sensor_id);
      }

      if (sensorIds.length === 0) return;

      // Determine ADC bit depth from sensor
      let adcBits = plant.sensors?.[0]?.adc_bits ?? 10;
      if (!plant.sensors?.length && sensorIds.length > 0) {
        const { data: sensorData } = await supabase
          .from('sensors')
          .select('adc_bits')
          .in('id', sensorIds)
          .limit(1);
        if (sensorData?.[0]) adcBits = sensorData[0].adc_bits ?? 10;
      }

      const { rawDry, rawWet } = getCalibration(plant.soil_type, adcBits);

      const { data: readings } = await supabase
        .from('readings')
        .select('*')
        .in('sensor_id', sensorIds)
        .order('recorded_at', { ascending: false })
        .limit(20);

      if (readings && readings.length > 0) {
        const values: Record<string, number> = {};
        let latestTime: string | null = null;

        for (const r of readings as Reading[]) {
          if (useReference && r.metric === 'soil_moisture') continue;
          if (values[r.metric] !== undefined) continue;
          if (r.metric === 'soil_moisture') {
            values[r.metric] = rawToPercent(r.value, rawDry, rawWet);
          } else {
            values[r.metric] = r.value;
          }
          if (!latestTime || r.recorded_at > latestTime) {
            latestTime = r.recorded_at;
          }
        }

        setLatestValues(values);
        setLastReadingTime(latestTime);
      }

      if (!useReference) {
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
    }

    fetchData();
  }, [plant.id, plant.soil_type, plant.reference_plant_id]);

  const availableMetrics = CARD_METRICS.filter((m) => latestValues[m.key] !== undefined);
  const isStale = lastReadingTime ? timeAgo(lastReadingTime).staleness === 'dead' : false;
  const healthColor = getOverallHealth(
    latestValues,
    plant.plant_species,
    availableMetrics.map(m => m.key),
  );

  const cardClasses = [
    'plant-card',
    needsAttention && 'attention',
    healthColor !== 'none' && `health-${healthColor}`,
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses} onClick={onClick}>
      <div className="card-body">
        <div className="card-header-row">
          <h3>{plant.name}</h3>
          {needsAttention && <span className="attention-dot" />}
        </div>
        {plant.plant_species && <p className="species">{plant.plant_species.name}</p>}
        {availableMetrics.length > 0 && (
          <div className="health-bars">
            {availableMetrics.map((m) => {
              const ranges = getMetricRanges(plant.plant_species, m.key);
              return (
                <div key={m.key} className="health-bar">
                  <span className="health-bar-label">{m.label}</span>
                  <ZonedGradientBar
                    value={latestValues[m.key]}
                    min={ranges.min}
                    optMin={ranges.optMin}
                    optMax={ranges.optMax}
                    max={ranges.max}
                    isStale={isStale}
                  />
                  <span className="health-bar-value">
                    {latestValues[m.key].toFixed(m.key === 'temperature' ? 1 : 0)}{m.unit}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="card-meta">
          {lastReadingTime && (() => {
            const { text, staleness } = timeAgo(lastReadingTime);
            return (
              <span className="staleness-indicator" title={new Date(lastReadingTime).toLocaleString()}>
                <span className={`staleness-dot ${staleness}`} />
                {text}
              </span>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
