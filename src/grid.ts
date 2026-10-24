import type { Dir } from './types';

export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

export const DIR_VEC: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export interface GridPiece {
  id: number;
  length: number;
  dir: Dir;
  col: number;
  row: number;
}

export const isHorizontal = (d: Dir): boolean => d === 'left' || d === 'right';

export function cellsOf(p: GridPiece): [number, number][] {
  const out: [number, number][] = [];
  const h = isHorizontal(p.dir);
  for (let i = 0; i < p.length; i++) out.push(h ? [p.col + i, p.row] : [p.col, p.row + i]);
  return out;
}

export function frontCell(p: GridPiece): [number, number] {
  switch (p.dir) {
    case 'right':
      return [p.col + p.length - 1, p.row];
    case 'down':
      return [p.col, p.row + p.length - 1];
    default:
      return [p.col, p.row];
  }
}

/** Cell -> piece id, or -1 when empty. */
export function buildOccupancy(cols: number, rows: number, pieces: Iterable<GridPiece>): Int32Array {
  const occ = new Int32Array(cols * rows).fill(-1);
  for (const p of pieces) for (const [c, r] of cellsOf(p)) occ[r * cols + c] = p.id;
  return occ;
}

export interface Probe {
  clear: boolean;
  /** Empty cells in front of the bus before the blocker (or the edge). */
  free: number;
  blocker: number;
}

/** Walk from the bus's nose to the lot edge and report the first thing in the way. */
export function probePath(p: GridPiece, occ: Int32Array, cols: number, rows: number): Probe {
  const [dx, dy] = DIR_VEC[p.dir];
  let [c, r] = frontCell(p);
  let free = 0;
  for (;;) {
    c += dx;
    r += dy;
    if (c < 0 || r < 0 || c >= cols || r >= rows) return { clear: true, free, blocker: -1 };
    const id = occ[r * cols + c];
    if (id >= 0 && id !== p.id) return { clear: false, free, blocker: id };
    free++;
  }
}

/** All cells a bus would drive through to leave the lot. */
export function pathCells(p: GridPiece, cols: number, rows: number): [number, number][] {
  const [dx, dy] = DIR_VEC[p.dir];
  let [c, r] = frontCell(p);
  const out: [number, number][] = [];
  for (;;) {
    c += dx;
    r += dy;
    if (c < 0 || r < 0 || c >= cols || r >= rows) return out;
    out.push([c, r]);
  }
}
