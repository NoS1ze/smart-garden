export interface BoardSensorInfo {
  chip: string;
  interface: string;
  address?: string;
  pins: string;
  power_pin?: string;
  metrics: string[];
}

export interface BoardType {
  id: string;
  name: string;
  slug: string;
  mcu: string;
  fqbn: string | null;
  adc_bits: number;
  sleep_seconds: number;
  sensors: BoardSensorInfo[];
  notes: string | null;
  created_at: string;
}

export interface Sensor {
  id: string;
  mac_address: string;
  display_name: string | null;
  location: string;
  sensor_type: string | null;
  adc_bits: number;
  board_type_id: string | null;
  board_type: BoardType | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface SoilType {
  id: string;
  name: string;
  raw_dry: number;
  raw_wet: number;
  raw_dry_12bit: number;
  raw_wet_12bit: number;
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
  min_pressure: number | null;
  max_pressure: number | null;
  optimal_min_pressure: number | null;
  optimal_max_pressure: number | null;
  min_tvoc: number | null;
  max_tvoc: number | null;
  optimal_min_tvoc: number | null;
  optimal_max_tvoc: number | null;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
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
  room_id: string | null;
  reference_plant_id: string | null;
  created_at: string;
  soil_type: SoilType | null;
  plant_species: PlantSpecies | null;
  room: Room | null;
  sensors?: Sensor[];
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

export interface WateringEvent {
  id: string;
  plant_id: string;
  sensor_id: string | null;
  detected_at: string;
  moisture_before: number | null;
  moisture_after: number | null;
  source: string;
  created_at: string;
}

export type Metric = 'soil_moisture' | 'temperature' | 'humidity' | 'light_lux' | 'co2_ppm' | 'pressure_hpa' | 'tvoc_ppb';

export const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: 'soil_moisture', label: 'Soil Moisture', unit: '%' },
  { key: 'temperature', label: 'Temperature', unit: '°C' },
  { key: 'humidity', label: 'Humidity', unit: '%' },
  { key: 'pressure_hpa', label: 'Pressure', unit: 'hPa' },
  { key: 'co2_ppm', label: 'CO₂', unit: 'ppm' },
  { key: 'tvoc_ppb', label: 'TVOC', unit: 'ppb' },
  { key: 'light_lux', label: 'Light', unit: 'lux' },
];
