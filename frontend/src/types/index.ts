export interface Sensor {
  id: string;
  name: string;
  location: string;
  created_at: string;
}

export interface Reading {
  id: string;
  sensor_id: string;
  metric: string;
  value: number;
  recorded_at: string;
}

export interface Alert {
  id: string;
  sensor_id: string;
  metric: string;
  condition: 'above' | 'below';
  threshold: number;
  email: string;
  active: boolean;
}

export interface AlertHistoryEntry {
  id: string;
  alert_id: string;
  triggered_at: string;
  value_at_trigger: number;
}

export type Metric = 'soil_moisture' | 'temperature' | 'humidity' | 'light_lux' | 'co2_ppm';

export const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: 'soil_moisture', label: 'Soil Moisture', unit: '%' },
  { key: 'temperature', label: 'Temperature', unit: '°C' },
  { key: 'humidity', label: 'Humidity', unit: '%' },
  { key: 'light_lux', label: 'Light', unit: 'lux' },
  { key: 'co2_ppm', label: 'CO₂', unit: 'ppm' },
];
