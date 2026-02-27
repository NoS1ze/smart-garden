import { Sensor } from '../types';

interface Props {
  sensors: Sensor[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export function SensorSelector({ sensors, selected, onSelect }: Props) {
  return (
    <div className="sensor-selector">
      <label htmlFor="sensor-select">Sensor:</label>
      <select
        id="sensor-select"
        value={selected ?? ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="" disabled>Select a sensor</option>
        {sensors.map((s) => (
          <option key={s.id} value={s.id}>
            {s.display_name || s.mac_address} — {s.location}
          </option>
        ))}
      </select>
    </div>
  );
}
