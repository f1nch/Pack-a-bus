import { buildOccupancy, cellsOf, DIRS, isHorizontal, pathCells, probePath } from './grid';
import { COLOR_ORDER } from './palette';
import { mulberry32, pick, randInt, shuffle, type Rng } from './rng';
import type { BusSpec, ColorId, LevelData } from './types';

export const COLS = 13;
export const ROWS = 10;
export const START_SLOTS = 5;

export const capacityFor = (length: number): number => (length === 2 ? 8 : 12);

export interface LevelConfig {
  busCount: number;
  colors: number;
  /** Parking spots the generated solution is allowed to use (player gets more). */
  genSlots: number;
  mysteryChance: number;
  time: number;
}

export function levelConfig(level: number): LevelConfig {
  const busCount = Math.min(38, 14 + level * 2);
  return {
    busCount,
    colors: Math.min(COLOR_ORDER.length, 3 + Math.floor((level - 1) / 2)),
    genSlots: level <= 2 ? 4 : level <= 6 ? 3 : 2,
    mysteryChance: level < 4 ? 0 : Math.min(0.3, 0.06 * (level - 3)),
    time: 30 + busCount * 4,
  };
}

/** Place buses one at a time; each new bus must have a clear exit given the
 *  buses already placed. That makes the "blocks" relation acyclic, so any
 *  subset of buses always has at least one bus that can drive out. */
function placeBuses(rng: Rng, count: number): BusSpec[] {
  const placed: BusSpec[] = [];
  const onPath = new Uint8Array(COLS * ROWS);
  for (let attempts = 0; placed.length < count && attempts < 6000; attempts++) {
    const length = rng() < 0.6 ? 2 : 3;
    const dir = pick(rng, DIRS);
    const h = isHorizontal(dir);
    const spec: BusSpec = {
      id: placed.length,
      color: 'red',
      length,
      dir,
      col: randInt(rng, 0, COLS - (h ? length : 1)),
      row: randInt(rng, 0, ROWS - (h ? 1 : length)),
      mystery: false,
    };
    const occ = buildOccupancy(COLS, ROWS, placed);
    const cells = cellsOf(spec);
    if (cells.some(([c, r]) => occ[r * COLS + c] >= 0)) continue;
    if (!probePath(spec, occ, COLS, ROWS).clear) continue;
    // Prefer buses that jam someone else's exit so the lot feels tangled.
    const wantBlock = placed.length > 0 && attempts < 4000 && rng() < 0.75;
    if (wantBlock && !cells.some(([c, r]) => onPath[r * COLS + c])) continue;
    placed.push(spec);
    for (const [c, r] of pathCells(spec, COLS, ROWS)) onPath[r * COLS + c] = 1;
  }
  return placed;
}

/** A random valid exit order: repeatedly take any bus with a clear path. */
function exitOrder(rng: Rng, buses: BusSpec[]): BusSpec[] {
  const remaining = [...buses];
  const order: BusSpec[] = [];
  while (remaining.length) {
    const occ = buildOccupancy(COLS, ROWS, remaining);
    const free = remaining.filter((b) => probePath(b, occ, COLS, ROWS).clear);
    if (!free.length) throw new Error('deadlocked lot');
    const next = pick(rng, free);
    order.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return order;
}

/** Build the passenger line so that driving buses out in `order` with only
 *  `slots` parking spots always works. Passengers come in color chunks. */
function buildQueue(rng: Rng, order: BusSpec[], slots: number): ColorId[] {
  const queue: ColorId[] = [];
  const active: { bus: BusSpec; left: number }[] = [];
  let next = 0;
  while (next < order.length || active.length) {
    while (active.length < slots && next < order.length) {
      const bus = order[next++];
      active.push({ bus, left: capacityFor(bus.length) });
    }
    const a = pick(rng, active);
    const n = Math.min(a.left, randInt(rng, 4, 12));
    for (let i = 0; i < n; i++) queue.push(a.bus.color);
    a.left -= n;
    if (a.left === 0) active.splice(active.indexOf(a), 1);
  }
  return queue;
}

/** Plays the level using the same boarding rule as the game (fullest-first)
 *  and the given exit order. Returns true if every passenger gets a seat. */
export function simulate(level: LevelData, order: number[], slots: number): boolean {
  const byId = new Map(level.buses.map((b) => [b.id, b]));
  const lot = new Map(byId);
  const parked: { color: ColorId; left: number }[] = [];
  let qi = 0;
  let oi = 0;
  while (qi < level.queue.length) {
    while (parked.length < slots && oi < order.length) {
      const bus = byId.get(order[oi++])!;
      const occ = buildOccupancy(level.cols, level.rows, lot.values());
      if (!probePath(bus, occ, level.cols, level.rows).clear) return false;
      lot.delete(bus.id);
      parked.push({ color: bus.color, left: capacityFor(bus.length) });
    }
    const target = boardTarget(parked, level.queue[qi]);
    if (!target) return false;
    target.left--;
    qi++;
    if (target.left === 0) parked.splice(parked.indexOf(target), 1);
  }
  return lot.size === 0;
}

/** Shared boarding rule: the matching bus closest to full gets the passenger. */
export function boardTarget<T extends { color: ColorId; left: number }>(
  parked: T[],
  color: ColorId,
): T | undefined {
  let best: T | undefined;
  for (const p of parked) if (p.color === color && p.left > 0 && (!best || p.left < best.left)) best = p;
  return best;
}

export function generateLevel(level: number): LevelData {
  const cfg = levelConfig(level);
  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = mulberry32(level * 7919 + attempt * 104729 + 17);
    const buses = placeBuses(rng, cfg.busCount);
    if (buses.length < Math.ceil(cfg.busCount * 0.85)) continue;

    const colors = shuffle(rng, [...COLOR_ORDER]).slice(0, cfg.colors);
    shuffle(rng, [...buses]).forEach((b, i) => {
      b.color = i < colors.length ? colors[i] : pick(rng, colors);
      b.mystery = rng() < cfg.mysteryChance;
    });

    const order = exitOrder(rng, buses);
    const data: LevelData = {
      level,
      cols: COLS,
      rows: ROWS,
      buses,
      queue: buildQueue(rng, order, cfg.genSlots),
      slots: START_SLOTS,
      time: cfg.time,
      solution: order.map((b) => b.id),
    };
    if (simulate(data, data.solution, cfg.genSlots)) return data;
  }
  throw new Error(`could not generate level ${level}`);
}
