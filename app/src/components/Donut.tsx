import type { ReactNode } from 'react';

export interface DonutPart {
  key: string;
  value: number;
  color: string;
}

/** Кольцевая диаграмма с подписью в центре. */
export function Donut({ parts, size = 128, children }: { parts: DonutPart[]; size?: number; children?: ReactNode }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = 15.915; // длина окружности = 100
  const gap = parts.length > 1 ? 1.2 : 0;
  let offset = 25;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg viewBox="0 0 42 42" width={size} height={size} aria-hidden="true">
        <circle cx="21" cy="21" r={r} fill="none" stroke="var(--card-2)" strokeWidth="5" />
        {total > 0 &&
          parts.map((p) => {
            const pct = (p.value / total) * 100;
            const len = Math.max(pct - gap, 0.4);
            const el = (
              <circle
                key={p.key}
                cx="21"
                cy="21"
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth="5"
                strokeDasharray={`${len} ${100 - len}`}
                strokeDashoffset={offset}
              />
            );
            offset -= pct;
            return el;
          })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}
