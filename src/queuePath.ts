import { QUEUE_LANES, QUEUE_PATH, QUEUE_ROW_SPACING } from './layout';

interface Seg {
  x: number;
  y: number;
  dx: number;
  dy: number;
  len: number;
  start: number;
}

const segs: Seg[] = [];
let total = 0;
for (let i = 0; i < QUEUE_PATH.length - 1; i++) {
  const [x0, y0] = QUEUE_PATH[i];
  const [x1, y1] = QUEUE_PATH[i + 1];
  const len = Math.hypot(x1 - x0, y1 - y0);
  segs.push({ x: x0, y: y0, dx: (x1 - x0) / len, dy: (y1 - y0) / len, len, start: total });
  total += len;
}

export const QUEUE_LENGTH = total;
export const QUEUE_VISIBLE =
  Math.floor(QUEUE_LENGTH / QUEUE_ROW_SPACING) * QUEUE_LANES.length;

function at(d: number): { x: number; y: number; nx: number; ny: number } {
  let s = segs[segs.length - 1];
  for (const seg of segs) {
    if (d <= seg.start + seg.len) {
      s = seg;
      break;
    }
  }
  const t = Math.min(d - s.start, s.len);
  return { x: s.x + s.dx * t, y: s.y + s.dy * t, nx: -s.dy, ny: s.dx };
}

function slotPos(k: number): [number, number] {
  const lanes = QUEUE_LANES.length;
  const p = at(Math.floor(k / lanes) * QUEUE_ROW_SPACING);
  const off = QUEUE_LANES[k % lanes];
  return [p.x + p.nx * off, p.y + p.ny * off];
}

/** Position of the k-th person in line (k may be fractional while the line shuffles forward). */
export function personPos(k: number): [number, number] {
  const k0 = Math.floor(k);
  const f = k - k0;
  const [ax, ay] = slotPos(k0);
  if (f === 0) return [ax, ay];
  const [bx, by] = slotPos(k0 + 1);
  return [ax + (bx - ax) * f, ay + (by - ay) * f];
}
