/** Cubic bezier between two agent positions with a perpendicular bulge.
 *  Sign of `curve` flips which side the arc bulges toward — used to keep
 *  antagonist arcs on the opposite side of the debate arcs they answer. */
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
