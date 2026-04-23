interface CaduceusCrestProps {
  size?: number;
  alive?: boolean;
}

/** Central heraldry — two serpents coiled around a staff. */
export function CaduceusCrest({ size = 280, alive = false }: CaduceusCrestProps) {
  const w = size;
  const h = size * 1.3;
  const cx = w / 2;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="cad-crest"
      style={{ width: w, height: h, opacity: alive ? 0.28 : 0.12 }}
    >
      <defs>
        <linearGradient id="staffG" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="oklch(0.58 0.014 85)" />
          <stop offset="1" stopColor="oklch(0.30 0.014 85)" />
        </linearGradient>
      </defs>
      <line x1={cx} y1={40} x2={cx} y2={h - 30} stroke="url(#staffG)" strokeWidth="2" />
      <path d={`M ${cx} 50 Q ${cx - 60} 20 ${cx - 90} 40 Q ${cx - 50} 45 ${cx} 60`} fill="none" stroke="oklch(0.50 0.014 85)" strokeWidth="1" />
      <path d={`M ${cx} 50 Q ${cx + 60} 20 ${cx + 90} 40 Q ${cx + 50} 45 ${cx} 60`} fill="none" stroke="oklch(0.50 0.014 85)" strokeWidth="1" />
      <path
        d={`M ${cx - 2} 70 C ${cx - 50} 110, ${cx + 50} 150, ${cx - 2} 190 S ${cx - 50} 270, ${cx - 2} 310 S ${cx + 30} 360, ${cx - 2} ${h - 40}`}
        fill="none"
        stroke="oklch(0.60 0.08 25)"
        strokeWidth="1.2"
      />
      <path
        d={`M ${cx + 2} 70 C ${cx + 50} 110, ${cx - 50} 150, ${cx + 2} 190 S ${cx + 50} 270, ${cx + 2} 310 S ${cx - 30} 360, ${cx + 2} ${h - 40}`}
        fill="none"
        stroke="oklch(0.55 0.10 25)"
        strokeWidth="1.2"
      />
      <circle cx={cx - 10} cy={66} r="3" fill="oklch(0.60 0.08 25)" />
      <circle cx={cx + 10} cy={66} r="3" fill="oklch(0.55 0.10 25)" />
      <line x1={cx - 13} y1={66} x2={cx - 18} y2={63} stroke="oklch(0.58 0.22 25)" strokeWidth="0.6" />
      <line x1={cx - 13} y1={66} x2={cx - 18} y2={69} stroke="oklch(0.58 0.22 25)" strokeWidth="0.6" />
      <line x1={cx + 13} y1={66} x2={cx + 18} y2={63} stroke="oklch(0.58 0.22 25)" strokeWidth="0.6" />
      <line x1={cx + 13} y1={66} x2={cx + 18} y2={69} stroke="oklch(0.58 0.22 25)" strokeWidth="0.6" />
    </svg>
  );
}
