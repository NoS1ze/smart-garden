interface ZonedGradientBarProps {
  value: number;
  min?: number | null;
  optMin?: number | null;
  optMax?: number | null;
  max?: number | null;
  isStale?: boolean;
  accentColor?: string;
}

const cssVar = (name: string, fallback: string) => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch { return fallback; }
};

const resolveColor = (color: string): string => {
  const match = color.match(/^var\(([^)]+)\)$/);
  if (match) return cssVar(match[1], '#22c55e');
  return color;
};

export function getZoneColor(value: number, min: number, optMin: number, optMax: number, max: number): string {
  const red = cssVar('--red-alert', '#ef4444');
  const amber = cssVar('--amber', '#f59e0b');
  const green = cssVar('--green-soft', '#4ade80');
  if (value < min) return red;
  if (value < optMin) return amber;
  if (value <= optMax) return green;
  if (value <= max) return amber;
  return red;
}

export function getZoneLabel(value: number, min: number, optMin: number, optMax: number, max: number): { text: string; color: string } {
  const red = cssVar('--red-alert', '#ef4444');
  const amber = cssVar('--amber', '#f59e0b');
  const green = cssVar('--green-soft', '#4ade80');
  if (value < min) return { text: 'Too low', color: red };
  if (value < optMin) return { text: 'Getting low', color: amber };
  if (value <= optMax) return { text: 'Optimal', color: green };
  if (value <= max) return { text: 'Getting high', color: amber };
  return { text: 'Too high', color: red };
}

export function ZonedGradientBar({ value, min, optMin, optMax, max, isStale, accentColor }: ZonedGradientBarProps) {
  const hasRanges = min != null && optMin != null && optMax != null && max != null && max > 0;
  const accent = accentColor ? resolveColor(accentColor) : cssVar('--green-vivid', '#22c55e');

  if (!hasRanges) {
    const fillPct = Math.max(0, Math.min(100, value));
    return (
      <div style={{ width: '100%' }}>
        <div style={{
          position: 'relative',
          width: '100%',
          height: '4px',
          borderRadius: '2px',
          background: cssVar('--border-subtle', 'rgba(255,255,255,0.12)'),
          opacity: isStale ? 0.4 : 1,
        }}>
          <div style={{
            width: `${fillPct}%`,
            height: '100%',
            borderRadius: '2px',
            background: `${accent}66`,
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
    `transparent ${pct(0)}`,
    `transparent ${pct(_min)}`,
    `${accent}33 ${pct(_min)}`,
    `${accent}66 ${pct(_optMin)}`,
    `${accent}73 ${pct((_optMin + _optMax) / 2)}`,
    `${accent}66 ${pct(_optMax)}`,
    `${accent}33 ${pct(_max)}`,
    `transparent ${pct(_max)}`,
    `transparent 100%`,
  ];

  const trackBg = cssVar('--bg-glass-border', 'rgba(255,255,255,0.08)');
  const background = `linear-gradient(to right, ${gradientStops.join(', ')}), ${trackBg}`;
  const dotLeftPct = Math.max(2, Math.min((value / overflow) * 100, 98));

  return (
    <div style={{ width: '100%' }}>
      <div style={{
        position: 'relative',
        width: '100%',
        height: '4px',
        borderRadius: '2px',
        background,
        opacity: isStale ? 0.4 : 1,
      }}>
        <div style={{
          position: 'absolute',
          left: `${dotLeftPct}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: '#fff',
          border: `2px solid ${accent}`,
          boxShadow: `0 0 4px 1px ${accent}40`,
          zIndex: 2,
          transition: 'left 0.4s ease, box-shadow 0.4s ease, border-color 0.4s ease',
        }} />
      </div>
    </div>
  );
}
