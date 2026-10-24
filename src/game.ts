import { buildOccupancy, cellsOf, DIR_VEC, isHorizontal, probePath } from './grid';
import {
  busLenPx,
  CELL,
  dockY,
  LOT_H,
  LOT_W,
  LOT_X,
  LOT_Y,
  ROAD_BOTTOM,
  ROAD_LEFT,
  ROAD_RIGHT,
  ROAD_TOP,
  SLOT_COUNT,
  SLOT_H,
  SLOT_TOP,
  SLOT_W,
  slotCenterX,
  W,
} from './layout';
import { boardTarget, capacityFor } from './level';
import { personPos } from './queuePath';
import type { BusSpec, ColorId, Dir, LevelData } from './types';

export type BusState = 'lot' | 'moving' | 'docked' | 'leaving' | 'gone';
export type SoundName =
  | 'board'
  | 'bump'
  | 'go'
  | 'park'
  | 'full'
  | 'reveal'
  | 'error'
  | 'booster'
  | 'win'
  | 'lose';

export interface Waypoint {
  x: number;
  y: number;
  /** Drive backwards along this leg (nose keeps pointing the other way). */
  reverse?: boolean;
}

export interface Bus extends BusSpec {
  capacity: number;
  /** Passengers walking to (or already in) this bus. */
  reserved: number;
  /** Passengers seated. */
  filled: number;
  state: BusState;
  slot: number;
  x: number;
  y: number;
  angle: number;
  scale: number;
  path: Waypoint[];
  pathTotal: number;
  pathDone: number;
  lifted: boolean;
  bumpT: number;
  bumpDist: number;
  shakeT: number;
  popT: number;
  leaveDelay: number;
}

export interface Flyer {
  color: ColorId;
  x0: number;
  y0: number;
  bus: Bus;
  t: number;
}

export interface Slot {
  vip: boolean;
  locked: boolean;
  bus: Bus | null;
}

export interface GameEvents {
  sound(name: SoundName): void;
  toast(msg: string): void;
  stuck(): void;
  end(won: boolean, reason: string): void;
}

const DRIVE_SPEED = 950;
const LIFT_SPEED = 650;
const BOARD_INTERVAL = 0.045;
const FLY_TIME = 0.2;

export const dirAngle = (d: Dir): number =>
  d === 'right' ? 0 : d === 'down' ? Math.PI / 2 : d === 'left' ? Math.PI : -Math.PI / 2;

function lotCenter(b: BusSpec): [number, number] {
  const h = isHorizontal(b.dir);
  const w = h ? b.length : 1;
  const hh = h ? 1 : b.length;
  return [LOT_X + (b.col + w / 2) * CELL, LOT_Y + (b.row + hh / 2) * CELL];
}

// The road is a rectangle loop around the lot; parameterise it clockwise from top-left.
const RA = ROAD_RIGHT - ROAD_LEFT;
const RB = ROAD_BOTTOM - ROAD_TOP;
const PERIM = 2 * RA + 2 * RB;
const CORNERS: [number, number, number][] = [
  [0, ROAD_LEFT, ROAD_TOP],
  [RA, ROAD_RIGHT, ROAD_TOP],
  [RA + RB, ROAD_RIGHT, ROAD_BOTTOM],
  [2 * RA + RB, ROAD_LEFT, ROAD_BOTTOM],
];

function ringT(x: number, y: number): number {
  if (Math.abs(y - ROAD_TOP) < 1) return x - ROAD_LEFT;
  if (Math.abs(x - ROAD_RIGHT) < 1) return RA + (y - ROAD_TOP);
  if (Math.abs(y - ROAD_BOTTOM) < 1) return RA + RB + (ROAD_RIGHT - x);
  return 2 * RA + RB + (ROAD_BOTTOM - y);
}

/** Shortest way around the loop between two points on it. */
function ringRoute(x0: number, y0: number, x1: number, y1: number): Waypoint[] {
  const t0 = ringT(x0, y0);
  const t1 = ringT(x1, y1);
  const cw = (t1 - t0 + PERIM) % PERIM;
  const forward = cw <= PERIM - cw;
  const span = forward ? cw : PERIM - cw;
  const corners = CORNERS.map(([t, x, y]) => ({
    d: forward ? (t - t0 + PERIM) % PERIM : (t0 - t + PERIM) % PERIM,
    x,
    y,
  }))
    .filter((c) => c.d > 0.5 && c.d < span - 0.5)
    .sort((a, b) => a.d - b.d);
  return [...corners.map(({ x, y }) => ({ x, y })), { x: x1, y: y1 }];
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Game {
  readonly level: LevelData;
  readonly buses: Bus[];
  readonly slots: Slot[];
  readonly queue: ColorId[];
  qHead = 0;
  /** Visual lag of the line while it shuffles forward. */
  queueOffset = 0;
  flyers: Flyer[] = [];
  time: number;
  status: 'playing' | 'won' | 'lost' = 'playing';
  boosters = { vip: 1, slot: 1 };
  vipMode = false;
  private boardTimer = 0;
  private stuckNotified = false;
  private pendingEnd: { won: boolean; reason: string; t: number } | null = null;

  constructor(
    level: LevelData,
    private events: GameEvents,
  ) {
    this.level = level;
    this.queue = [...level.queue];
    this.time = level.time;
    this.slots = Array.from({ length: SLOT_COUNT }, (_, i) => ({
      vip: i === 0,
      locked: i > level.slots,
      bus: null,
    }));
    this.buses = level.buses.map((spec) => {
      const [x, y] = lotCenter(spec);
      return {
        ...spec,
        capacity: capacityFor(spec.length),
        reserved: 0,
        filled: 0,
        state: 'lot',
        slot: -1,
        x,
        y,
        angle: dirAngle(spec.dir),
        scale: 1,
        path: [],
        pathTotal: 0,
        pathDone: 0,
        lifted: false,
        bumpT: -1,
        bumpDist: 0,
        shakeT: -1,
        popT: -1,
        leaveDelay: 0,
      };
    });
    this.updateReveals(false);
  }

  get remaining(): number {
    return this.queue.length - this.qHead;
  }

  get lotBuses(): Bus[] {
    return this.buses.filter((b) => b.state === 'lot');
  }

  canUseVip(): boolean {
    return this.boosters.vip > 0 && !this.slots[0].bus && this.lotBuses.length > 0;
  }

  canUseSlot(): boolean {
    return this.boosters.slot > 0 && this.slots.some((s) => s.locked);
  }

  // ---- input -------------------------------------------------------------

  tap(x: number, y: number): void {
    if (this.status !== 'playing') return;

    const slotIdx = this.slotAt(x, y);
    if (slotIdx >= 0) {
      const slot = this.slots[slotIdx];
      if (slot.locked) this.useSlotBooster();
      else if (slot.vip && !slot.bus) this.toggleVip();
      return;
    }

    const bus = this.busAt(x, y);
    if (!bus) return;

    if (this.vipMode) {
      this.liftToVip(bus);
      return;
    }

    const occ = buildOccupancy(this.level.cols, this.level.rows, this.lotBuses);
    const probe = probePath(bus, occ, this.level.cols, this.level.rows);
    if (!probe.clear) {
      bus.bumpT = 0;
      bus.bumpDist = probe.free * CELL + 6;
      const blocker = this.buses.find((b) => b.id === probe.blocker);
      if (blocker) blocker.shakeT = 0;
      this.events.sound('bump');
      return;
    }

    const slot = this.freeSlot();
    if (slot < 0) {
      bus.shakeT = 0;
      this.events.sound('error');
      this.events.toast('No free parking spots!');
      return;
    }
    this.driveToSlot(bus, slot);
  }

  toggleVip(): void {
    if (this.status !== 'playing') return;
    if (this.vipMode) {
      this.vipMode = false;
      return;
    }
    if (!this.canUseVip()) {
      this.events.sound('error');
      this.events.toast(this.boosters.vip > 0 ? 'VIP spot is busy' : 'No VIP passes left');
      return;
    }
    this.vipMode = true;
    this.events.sound('booster');
    this.events.toast('Tap any bus to airlift it to the VIP spot');
  }

  useSlotBooster(): void {
    if (this.status !== 'playing') return;
    if (!this.canUseSlot()) {
      this.events.sound('error');
      this.events.toast(this.boosters.slot > 0 ? 'All spots unlocked' : 'No extra spots left');
      return;
    }
    const slot = this.slots.find((s) => s.locked)!;
    slot.locked = false;
    this.boosters.slot--;
    this.stuckNotified = false;
    this.events.sound('booster');
  }

  private slotAt(x: number, y: number): number {
    if (y < SLOT_TOP || y > SLOT_TOP + SLOT_H) return -1;
    for (let i = 0; i < this.slots.length; i++) {
      if (Math.abs(x - slotCenterX(i)) <= SLOT_W / 2) return i;
    }
    return -1;
  }

  private busAt(x: number, y: number): Bus | undefined {
    if (x < LOT_X || y < LOT_Y || x >= LOT_X + LOT_W || y >= LOT_Y + LOT_H) return undefined;
    const c = Math.floor((x - LOT_X) / CELL);
    const r = Math.floor((y - LOT_Y) / CELL);
    return this.lotBuses.find((b) => cellsOf(b).some(([bc, br]) => bc === c && br === r));
  }

  private freeSlot(): number {
    return this.slots.findIndex((s) => !s.vip && !s.locked && !s.bus);
  }

  // ---- bus movement ------------------------------------------------------

  private setPath(bus: Bus, path: Waypoint[]): void {
    bus.path = path;
    bus.pathDone = 0;
    let total = 0;
    let [px, py] = [bus.x, bus.y];
    for (const p of path) {
      total += Math.hypot(p.x - px, p.y - py);
      [px, py] = [p.x, p.y];
    }
    bus.pathTotal = total;
  }

  private driveToSlot(bus: Bus, slotIdx: number): void {
    this.slots[slotIdx].bus = bus;
    bus.slot = slotIdx;
    bus.state = 'moving';
    bus.bumpT = -1;
    bus.mystery = false;

    let exit: Waypoint;
    switch (bus.dir) {
      case 'up':
        exit = { x: bus.x, y: ROAD_TOP };
        break;
      case 'down':
        exit = { x: bus.x, y: ROAD_BOTTOM };
        break;
      case 'left':
        exit = { x: ROAD_LEFT, y: bus.y };
        break;
      default:
        exit = { x: ROAD_RIGHT, y: bus.y };
    }
    const sx = slotCenterX(slotIdx);
    this.setPath(bus, [
      exit,
      ...ringRoute(exit.x, exit.y, sx, ROAD_TOP),
      { x: sx, y: dockY(bus.length) },
    ]);
    this.events.sound('go');
    this.updateReveals(true);
  }

  private liftToVip(bus: Bus): void {
    this.vipMode = false;
    this.boosters.vip--;
    this.slots[0].bus = bus;
    bus.slot = 0;
    bus.state = 'moving';
    bus.lifted = true;
    bus.bumpT = -1;
    if (bus.mystery) {
      bus.mystery = false;
      bus.popT = 0;
    }
    this.setPath(bus, [{ x: slotCenterX(0), y: dockY(bus.length) }]);
    this.events.sound('booster');
    this.updateReveals(true);
  }

  private depart(bus: Bus): void {
    this.slots[bus.slot].bus = null;
    bus.state = 'leaving';
    const sx = slotCenterX(bus.slot);
    this.setPath(bus, [
      { x: sx, y: ROAD_TOP, reverse: true },
      { x: W + 160, y: ROAD_TOP },
    ]);
    this.events.sound('full');
  }

  /** Mystery buses show their color once nothing blocks their way out. */
  private updateReveals(withSound: boolean): void {
    const lot = this.lotBuses;
    const occ = buildOccupancy(this.level.cols, this.level.rows, lot);
    let revealed = false;
    for (const b of lot) {
      if (b.mystery && probePath(b, occ, this.level.cols, this.level.rows).clear) {
        b.mystery = false;
        b.popT = 0;
        revealed = true;
      }
    }
    if (revealed && withSound) this.events.sound('reveal');
  }

  private followPath(bus: Bus, dt: number): void {
    let dist = (bus.lifted ? LIFT_SPEED : DRIVE_SPEED) * dt;
    let target = bus.angle;
    while (dist > 0 && bus.path.length) {
      const wp = bus.path[0];
      const dx = wp.x - bus.x;
      const dy = wp.y - bus.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) target = Math.atan2(dy, dx) + (wp.reverse ? Math.PI : 0);
      if (d <= dist) {
        bus.x = wp.x;
        bus.y = wp.y;
        dist -= d;
        bus.pathDone += d;
        bus.path.shift();
      } else {
        bus.x += (dx / d) * dist;
        bus.y += (dy / d) * dist;
        bus.pathDone += dist;
        dist = 0;
      }
    }
    if (bus.lifted) {
      const p = bus.pathTotal > 0 ? Math.min(1, bus.pathDone / bus.pathTotal) : 1;
      bus.scale = 1 + 0.45 * Math.sin(Math.PI * p);
      target = -Math.PI / 2;
    }
    bus.angle = lerpAngle(bus.angle, target, Math.min(1, dt * 16));

    if (bus.path.length) return;
    if (bus.state === 'moving') {
      bus.state = 'docked';
      bus.angle = -Math.PI / 2;
      bus.scale = 1;
      bus.lifted = false;
      this.events.sound('park');
    } else if (bus.state === 'leaving') {
      bus.state = 'gone';
    }
  }

  // ---- simulation --------------------------------------------------------

  update(dt: number): void {
    for (const bus of this.buses) {
      if (bus.bumpT >= 0) {
        bus.bumpT += dt / 0.35;
        if (bus.bumpT >= 1) bus.bumpT = -1;
      }
      if (bus.shakeT >= 0) {
        bus.shakeT += dt / 0.35;
        if (bus.shakeT >= 1) bus.shakeT = -1;
      }
      if (bus.popT >= 0) {
        bus.popT += dt / 0.35;
        if (bus.popT >= 1) bus.popT = -1;
      }
      if (bus.state === 'moving' || bus.state === 'leaving') this.followPath(bus, dt);
      else if (bus.state === 'docked' && bus.filled === bus.capacity) {
        bus.leaveDelay -= dt;
        if (bus.leaveDelay <= 0) this.depart(bus);
      }
    }

    this.boardPassengers(dt);

    for (const f of this.flyers) {
      f.t += dt / FLY_TIME;
      if (f.t >= 1) {
        f.bus.filled++;
        if (f.bus.filled === f.bus.capacity) f.bus.leaveDelay = 0.25;
      }
    }
    this.flyers = this.flyers.filter((f) => f.t < 1);

    this.queueOffset = Math.max(0, this.queueOffset - dt * (6 + this.queueOffset * 9));

    if (this.status === 'playing') this.checkEnd(dt);
  }

  private boardPassengers(dt: number): void {
    if (this.qHead >= this.queue.length) return;
    this.boardTimer -= dt;
    while (this.boardTimer <= 0 && this.qHead < this.queue.length) {
      const color = this.queue[this.qHead];
      const target = this.seatFor(color);
      if (!target) {
        this.boardTimer = 0;
        return;
      }
      const [x0, y0] = personPos(this.queueOffset);
      this.qHead++;
      this.queueOffset += 1;
      target.reserved++;
      this.flyers.push({ color, x0, y0, bus: target, t: 0 });
      this.boardTimer += BOARD_INTERVAL;
      this.events.sound('board');
    }
  }

  private seatFor(color: ColorId): Bus | undefined {
    const parked = this.slots
      .map((s) => s.bus)
      .filter((b): b is Bus => !!b && b.state === 'docked')
      .map((b) => ({ bus: b, color: b.color, left: b.capacity - b.reserved }));
    return boardTarget(parked, color)?.bus;
  }

  private checkEnd(dt: number): void {
    if (this.pendingEnd) {
      this.pendingEnd.t -= dt;
      if (this.pendingEnd.t <= 0) {
        const { won, reason } = this.pendingEnd;
        this.pendingEnd = null;
        this.status = won ? 'won' : 'lost';
        this.vipMode = false;
        this.events.sound(won ? 'win' : 'lose');
        this.events.end(won, reason);
      }
      return;
    }

    if (this.remaining === 0 && this.flyers.length === 0) {
      if (this.buses.every((b) => b.state === 'leaving' || b.state === 'gone')) {
        this.pendingEnd = { won: true, reason: 'Everyone got a seat!', t: 0.8 };
      }
      return;
    }

    this.time -= dt;
    if (this.time <= 0) {
      this.time = 0;
      this.pendingEnd = { won: false, reason: "Time's up!", t: 0.1 };
      return;
    }

    const busy =
      this.flyers.length > 0 ||
      this.buses.some(
        (b) => b.state === 'moving' || (b.state === 'docked' && b.filled === b.capacity),
      );
    const stuck = !busy && this.freeSlot() < 0 && !this.seatFor(this.queue[this.qHead]);
    if (!stuck) {
      this.stuckNotified = false;
      return;
    }
    if (this.canUseVip() || this.canUseSlot()) {
      if (!this.stuckNotified) {
        this.stuckNotified = true;
        this.events.toast('Out of space! Use a booster');
        this.events.stuck();
      }
    } else {
      this.pendingEnd = { won: false, reason: 'Out of parking space!', t: 0.6 };
    }
  }

  /** Visual offset of a lot bus that is bumping into something. */
  bumpOffset(bus: Bus): [number, number] {
    if (bus.bumpT < 0) return [0, 0];
    const t = bus.bumpT;
    const k = t < 0.4 ? Math.sin((t / 0.4) * (Math.PI / 2)) : 1 - (t - 0.4) / 0.6;
    const [dx, dy] = DIR_VEC[bus.dir];
    return [dx * bus.bumpDist * k, dy * bus.bumpDist * k];
  }

  busLength(bus: Bus): number {
    return busLenPx(bus.length);
  }
}
