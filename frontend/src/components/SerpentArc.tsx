import { useEffect, useRef, useState } from 'react';

export function buildSerpentPath(ax: number, ay: number, bx: number, by: number, curve = 0.35) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const mx = (ax + bx) / 2 + px * len * curve;
  const my = (ay + by) / 2 + py * len * curve;
  const mx1 = ax + (mx - ax) * 0.9 + px * 8;
  const my1 = ay + (my - ay) * 0.9 + py * 8;
  const mx2 = bx + (mx - bx) * 0.9 - px * 8;
  const my2 = by + (my - by) * 0.9 - py * 8;
  return `M ${ax} ${ay} C ${mx1} ${my1}, ${mx2} ${my2}, ${bx} ${by}`;
}

interface SerpentArcProps {
  path: string;
  kind?: 'antagonist' | 'consensus' | '';
  active?: boolean;
  fadeOut?: boolean;
}

export function SerpentArc({ path, kind = '', active = false, fadeOut = false }: SerpentArcProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const [headPt, setHeadPt] = useState<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    if (!active || !pathRef.current) return;
    const el = pathRef.current;
    const total = el.getTotalLength();
    const start = performance.now();
    const dur = 900;
    let raf: number;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const p = el.getPointAtLength(total * t);
      setHeadPt({ x: p.x, y: p.y, t });
      if (t < 1) raf = requestAnimationFrame(step);
      else setTimeout(() => setHeadPt(null), 400);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, path]);

  const opacity = fadeOut ? 0 : active ? 1 : 0.32;

  return (
    <g style={{ opacity, transition: 'opacity .6s' }}>
      <path ref={pathRef} d={path} className="cad-serpent cad-serpent-shadow" />
      <path d={path} className={`cad-serpent cad-serpent-body ${kind}`} />
      {headPt && (
        <g>
          <circle
            cx={headPt.x}
            cy={headPt.y}
            r={active ? 4 : 2}
            className={`cad-serpent-head ${kind}`}
          />
          {kind === 'antagonist' && headPt.t > 0.85 && (
            <g>
              <line
                x1={headPt.x}
                y1={headPt.y}
                x2={headPt.x + 6}
                y2={headPt.y - 3}
                stroke="var(--artery-glow)"
                strokeWidth="0.8"
              />
              <line
                x1={headPt.x}
                y1={headPt.y}
                x2={headPt.x + 6}
                y2={headPt.y + 3}
                stroke="var(--artery-glow)"
                strokeWidth="0.8"
              />
            </g>
          )}
        </g>
      )}
    </g>
  );
}
