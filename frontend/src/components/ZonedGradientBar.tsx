interface ZonedGradientBarProps {
  value: number;
  min?: number | null;
  optMin?: number | null;
  optMax?: number | null;
  max?: number | null;
  isStale?: boolean;
}

function getZoneColor(value: number, min: number, optMin: number, optMax: number, max: number): string {
  if (value < min) return '#ef4444';
  if (value < optMin) return '#f59e0b';
  if (value <= optMax) return '#4ade80';
  if (value <= max) return '#f59e0b';
  return '#ef4444';
}

function getZoneLabel(value: number, min: number, optMin: number, optMax: number, max: number): { text: string; color: string } {
  if (value < min) return { text: 'Too low', color: '#ef4444' };
  if (value < optMin) return { text: 'Getting low', color: '#f59e0b' };
  if (value <= optMax) return { text: 'Optimal', color: '#4ade80' };
  if (value <= max) return { text: 'Getting high', color: '#f59e0b' };
  return { text: 'Too high', color: '#ef4444' };
}

export function ZonedGradientBar({ value, min, optMin, optMax, max, isStale }: ZonedGradientBarProps) {
  const hasRanges = min != null && optMin != null && optMax != null && max != null && max > 0;

  if (!hasRanges) {
    const fillPct = Math.max(0, Math.min(100, value));
    return (
      <div style={{ width: '100%' }}>
        <div style={{
          position: 'relative',
          width: '100%',
          height: '6px',
          borderRadius: '3px',
          background: 'rgba(255,255,255,0.08)',
          opacity: isStale ? 0.4 : 1,
        }}>
          <div style={{
            width: `${fillPct}%`,
            height: '100%',
            borderRadius: '3px',
            background: '#16a34a',
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>
    );
  }

  const _min = min!;
  const _optMin = optMin!;
  const _optMax = optMax!;
  const _max = max!;
  const overflow = _max * 1.2;

  const pct = (v: number) => `${((v / overflow) * 100).toFixed(1)}%`;

  const gradientStops = [
    `#5c0a0a ${pct(0)}`,
    `#991b1b ${pct(_min * 0.5)}`,
    `#b45309 ${pct(_min)}`,
    `#ca8a04 ${pct(_optMin)}`,
    `#16a34a ${pct((_optMin + _optMax) / 2)}`,
    `#ca8a04 ${pct(_optMax)}`,
    `#b45309 ${pct(_max)}`,
    `#991b1b ${pct(_max * 1.1)}`,
    `#5c0a0a 100%`,
  ];

  const background = `linear-gradient(to right, ${gradientStops.join(', ')})`;
  const dotLeftPct = Math.max(2, Math.min((value / overflow) * 100, 98));
  const zoneColor = getZoneColor(value, _min, _optMin, _optMax, _max);
  const { text: zoneText, color: labelColor } = getZoneLabel(value, _min, _optMin, _optMax, _max);

  return (
    <div style={{ width: '100%' }}>
      <div style={{
        position: 'relative',
        width: '100%',
        height: '6px',
        borderRadius: '3px',
        background,
        opacity: isStale ? 0.4 : 1,
      }}>
        <div style={{
          position: 'absolute',
          left: `${dotLeftPct}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: '#ffffff',
          border: `2px solid ${zoneColor}`,
          boxShadow: `0 0 6px 2px ${zoneColor}80`,
          zIndex: 2,
          transition: 'left 0.4s ease, box-shadow 0.4s ease, border-color 0.4s ease',
        }} />
      </div>
      <div style={{
        fontSize: '10px',
        fontWeight: 500,
        color: labelColor,
        marginTop: '2px',
        lineHeight: 1,
      }}>
        {zoneText}
      </div>
    </div>
  );
}
