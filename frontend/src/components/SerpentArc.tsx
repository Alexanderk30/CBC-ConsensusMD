import { useEffect, useRef, useState } from 'react';

interface SerpentArcProps {
  path: string;
  kind?: 'antagonist' | '';
  active?: boolean;
  fadeOut?: boolean;
}

/** Debate arc — a dashed slither stroke between two agents with a traveling
 *  head dot marking the direction of reasoning. Antagonist arcs loop (the
 *  skeptic keeps pressing) and sprout a forked-tongue accent near the head;
 *  specialist arcs fade once the head reaches its target. */
export function SerpentArc({ path, kind = '', active = false, fadeOut = false }: SerpentArcProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const [headPt, setHeadPt] = useState<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    if (!active || !pathRef.current) return;
    const el = pathRef.current;
    const total = el.getTotalLength();
    const dur = 900;
    let cancelled = false;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const runOne = (start: number) => {
      const step = (now: number) => {
        if (cancelled) return;
        const elapsed = now - start;
        const t = Math.min(1, elapsed / dur);
        const p = el.getPointAtLength(total * t);
        setHeadPt({ x: p.x, y: p.y, t });
        if (t < 1) {
          raf = requestAnimationFrame(step);
        } else if (kind === 'antagonist') {
          timer = setTimeout(() => {
            if (!cancelled) runOne(performance.now());
          }, 450);
        } else {
          timer = setTimeout(() => {
            if (!cancelled) setHeadPt(null);
          }, 400);
        }
      };
      raf = requestAnimationFrame(step);
    };

    runOne(performance.now());

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [active, path, kind]);

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
