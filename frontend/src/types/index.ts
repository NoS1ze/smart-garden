export interface Sensor {
  id: string;
  mac_address: string;
  display_name: string | null;
  location: string;
  sensor_type: string | null;
  created_at: string;
}

export interface SoilType {
  id: string;
  name: string;
  raw_dry: number;
  raw_wet: number;
  created_at: string;
}

export interface PlantSpecies {
  id: string;
  name: string;
  min_temp: number | null;
  max_temp: number | null;
  optimal_min_temp: number | null;
  optimal_max_temp: number | null;
  min_humidity: number | null;
  max_humidity: number | null;
  optimal_min_humidity: number | null;
  optimal_max_humidity: number | null;
  min_moisture: number | null;
  max_moisture: number | null;
  optimal_min_moisture: number | null;
  optimal_max_moisture: number | null;
  min_light: number | null;
  max_light: number | null;
  optimal_min_light: number | null;
  optimal_max_light: number | null;
  min_co2: number | null;
  max_co2: number | null;
  optimal_min_co2: number | null;
  optimal_max_co2: number | null;
  created_at: string;
}

export interface Plant {
  id: string;
  name: string;
  plant_species_id: string | null;
  planted_date: string | null;
  photo_url: string | null;
  notes: string | null;
  soil_type_id: string | null;
  created_at: string;
  soil_type: SoilType | null;
  plant_species: PlantSpecies | null;
}

export interface SensorPlant {
  sensor_id: string;
  plant_id: string;
  assigned_at: string;
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
