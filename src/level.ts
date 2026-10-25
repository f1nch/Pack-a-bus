import { buildOccupancy, cellsOf, DIRS, isHorizontal, pathCells, probePath } from './grid';
import { COLOR_ORDER } from './palette';
import { mulberry32, pick, randInt, shuffle, type Rng } from './rng';
import type { BusSpec, ColorId, LevelData, Twist } from './types';

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
  slots: number;
  twist: Twist | null;
  /** Passenger color chunk sizes; smaller chunks interleave colors more. */
  chunkMin: number;
  chunkMax: number;
  /** Lock/key bus pairs. */
  locks: number;
}

/** First level with locked buses. */
export const LOCK_START = 13;

const TWISTS: Twist[] = ['mystery', 'rush', 'tight'];

/** After level 10 each block of ten is a wave: breathers on x1 and x5, a peak on x9
 *  right before the special level. Returns -1, 0 or +1. */
function wave(level: number): number {
  if (level <= 10) return 0;
  const k = level % 10;
  return k === 1 || k === 5 ? -1 : k === 9 ? 1 : 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Every 10th level is special; the twist rotates so they don't repeat back to back. */
export function twistFor(level: number): Twist | null {
  return level % 10 === 0 ? TWISTS[(level / 10 - 1) % TWISTS.length] : null;
}

export function levelConfig(level: number): LevelConfig {
  const twist = twistFor(level);
  const w = wave(level);
  // Bus count and colors max out around level 13, so past level 12 a slow
  // "pressure" ramp (full by level 52) keeps tightening time, color mixing and mysteries.
  const pressure = level > 12 ? clamp((level - 12) / 40 + 0.25 * w, 0, 1) : 0;
  const busCount = Math.min(38, 14 + level * 2) - (w < 0 ? 8 : 0);
  const locks =
    level < LOCK_START ? 0 : clamp(1 + Math.floor((level - LOCK_START) / 12) + w, 0, 3);
  // Twists never touch the generated solution (it uses genSlots, at most 4), so
  // special levels stay as solvable as normal ones.
  return {
    busCount,
    colors: Math.min(COLOR_ORDER.length, 3 + Math.floor((level - 1) / 2)),
    genSlots: level <= 2 ? 4 : level <= 6 ? 3 : 2,
    mysteryChance:
      twist === 'mystery' ? 0.6 : level < 4 ? 0 : Math.min(0.3, 0.06 * (level - 3)) + 0.1 * pressure,
    time: Math.round((30 + busCount * (4 - 0.75 * pressure)) * (twist === 'rush' ? 0.7 : 1)),
    slots: twist === 'tight' ? START_SLOTS - 1 : START_SLOTS,
    twist,
    chunkMin: 4 - Math.round(pressure),
    chunkMax: 12 - Math.round(5 * pressure),
    locks,
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
      lock: -1,
      key: -1,
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

/** Lock pair p: the bus with `lock === p` can't leave while the bus with `key === p`
 *  is in the lot. Keys always come earlier in the exit order, so every "must leave
 *  first" rule (blocking and locks) agrees with one order and the lot never deadlocks. */
function addLocks(rng: Rng, order: BusSpec[], pairs: number): void {
  const used = new Set<number>();
  for (let p = 0; p < pairs; p++) {
    for (let tries = 0; tries < 50; tries++) {
      // Lock a bus in the back half so the player has to plan for it.
      const i = randInt(rng, Math.floor(order.length / 2), order.length - 1);
      const j = randInt(rng, 0, i - 1);
      if (used.has(i) || used.has(j)) continue;
      used.add(i).add(j);
      order[i].lock = p;
      order[j].key = p;
      break;
    }
  }
}

/** Build the passenger line so that driving buses out in `order` with only
 *  `slots` parking spots always works. Passengers come in color chunks. */
function buildQueue(rng: Rng, order: BusSpec[], slots: number, cfg: LevelConfig): ColorId[] {
  const queue: ColorId[] = [];
  const active: { bus: BusSpec; left: number }[] = [];
  let next = 0;
  while (next < order.length || active.length) {
    while (active.length < slots && next < order.length) {
      const bus = order[next++];
      active.push({ bus, left: capacityFor(bus.length) });
    }
    const a = pick(rng, active);
    const n = Math.min(a.left, randInt(rng, cfg.chunkMin, cfg.chunkMax));
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
      if (bus.lock >= 0 && [...lot.values()].some((b) => b.key === bus.lock)) return false;
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
    addLocks(rng, order, cfg.locks);
    const data: LevelData = {
      level,
      twist: cfg.twist,
      cols: COLS,
      rows: ROWS,
      buses,
      queue: buildQueue(rng, order, cfg.genSlots, cfg),
      slots: cfg.slots,
      time: cfg.time,
      solution: order.map((b) => b.id),
    };
    if (simulate(data, data.solution, cfg.genSlots)) return data;
  }
  throw new Error(`could not generate level ${level}`);
}
