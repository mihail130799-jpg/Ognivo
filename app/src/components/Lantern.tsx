import { useId } from 'react';

/** Копилка-фонарик: заполняется «огнём» пропорционально накоплениям. */
export function Lantern({ fill, size = 46 }: { fill: number; size?: number }) {
  const id = useId().replace(/:/g, '');
  const f = Math.max(0, Math.min(1, fill));
  const top = 14 + 38 * (1 - f);
  return (
    <svg width={size} height={size * 1.26} viewBox="0 0 46 58" aria-hidden="true" style={{ flex: 'none' }}>
      <defs>
        <clipPath id={`c${id}`}>
          <rect x="9" y="14" width="28" height="38" rx="9" />
        </clipPath>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFD39A" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <path d="M17 8h12M23 3v5" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" />
      <rect x="9" y="14" width="28" height="38" rx="9" fill="var(--card-2)" />
      <g clipPath={`url(#c${id})`}>
        <rect className="lantern-fill" x="0" y={top} width="46" height="60" fill={`url(#g${id})`} opacity="0.9" />
      </g>
      <rect x="9" y="14" width="28" height="38" rx="9" fill="none" stroke="var(--faint)" strokeWidth="1.5" />
      <path
        d="M23 30c1.2 2 2.6 3 2.6 5.2a2.6 2.6 0 0 1-5.2 0c0-1 .6-1.8 1.1-2.3.1.8.6 1.3 1 1.3.3-1.6.3-2.8.5-4.2z"
        fill="#fff"
        opacity={f > 0.35 ? 0.85 : 0.35}
      />
      <rect x="13" y="52" width="20" height="4" rx="2" fill="var(--faint)" />
    </svg>
  );
}
