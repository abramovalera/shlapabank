interface Slice {
  key: string;
  value: number;
  color: string;
}

interface Props {
  slices: Slice[];
  size?: number;
  centerLabel?: string;
  centerSubLabel?: string;
}

/**
 * Донат-диаграмма на чистом SVG (без библиотек).
 * Слайсы рисуются как арки на невидимой окружности; работает даже при одном слайсе (полное кольцо).
 */
export function DonutChart({
  slices,
  size = 140,
  centerLabel,
  centerSubLabel,
}: Props) {
  const radius = size / 2 - 12; // отступ от края
  const strokeWidth = 18;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((s, x) => s + x.value, 0);

  let offset = 0;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(242, 244, 248, 0.08)"
          strokeWidth={strokeWidth}
        />
        {total > 0 &&
          slices.map((s) => {
            const fraction = s.value / total;
            const length = circumference * fraction;
            const dashArray = `${length} ${circumference - length}`;
            const dashOffset = -offset;
            offset += length;
            return (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeWidth}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
              />
            );
          })}
      </svg>
      {(centerLabel || centerSubLabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {centerLabel && (
            <div className="text-xl font-medium tracking-tight leading-none">{centerLabel}</div>
          )}
          {centerSubLabel && (
            <div className="text-[11px] text-ink-muted mt-0.5">{centerSubLabel}</div>
          )}
        </div>
      )}
    </div>
  );
}
