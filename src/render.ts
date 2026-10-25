import { dirAngle, type Bus, type Game } from './game';
import {
  BUS_W,
  busLenPx,
  H,
  LOT_H,
  LOT_W,
  LOT_X,
  LOT_Y,
  QUEUE_PATH,
  ROAD_BOTTOM,
  ROAD_LEFT,
  ROAD_RIGHT,
  ROAD_TOP,
  ROAD_W,
  SLOT_H,
  SLOT_TOP,
  SLOT_W,
  slotCenterX,
  W,
} from './layout';
import { MYSTERY, PALETTE, type Shade } from './palette';
import { personPos, QUEUE_VISIBLE } from './queuePath';
import type { ColorId } from './types';

const LOCK_TINTS = ['#ffd84a', '#7ff0ff', '#ff8fd0'];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export class Renderer {
  private bg = document.createElement('canvas');
  private scale = 1;
  private clock = 0;

  constructor(private ctx: CanvasRenderingContext2D) {}

  resize(pixelScale: number): void {
    this.scale = pixelScale;
    this.bg.width = Math.round(W * pixelScale);
    this.bg.height = Math.round(H * pixelScale);
    const b = this.bg.getContext('2d')!;
    b.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    drawBackground(b);
  }

  draw(game: Game, dt: number): void {
    this.clock += dt;
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.drawImage(this.bg, 0, 0, W, H);

    this.drawSlots(game);

    for (const bus of game.buses) if (bus.state === 'lot') this.drawLotBus(game, bus);
    for (const bus of game.buses) {
      if (bus.state === 'docked' || bus.state === 'leaving') this.drawBus(bus, bus.x, bus.y, bus.angle);
    }
    // Moving buses on top; airlifted ones highest.
    for (const bus of game.buses) if (bus.state === 'moving' && !bus.lifted) this.drawBus(bus, bus.x, bus.y, bus.angle);
    this.drawQueue(game);
    for (const bus of game.buses) if (bus.state === 'moving' && bus.lifted) this.drawBus(bus, bus.x, bus.y, bus.angle);
    this.drawFlyers(game);
  }

  private drawSlots(game: Game): void {
    const ctx = this.ctx;
    game.slots.forEach((slot, i) => {
      const x = slotCenterX(i) - SLOT_W / 2;
      ctx.fillStyle = slot.vip ? '#3a2f12' : '#2b3357';
      roundRect(ctx, x, SLOT_TOP, SLOT_W, SLOT_H, 14);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = slot.vip ? '#f5b82e' : '#47507a';
      ctx.stroke();

      if (slot.vip && !slot.bus) {
        const pulse = game.vipMode ? 0.6 + 0.4 * Math.sin(this.clock * 8) : 1;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.translate(x + SLOT_W / 2, SLOT_TOP + SLOT_H / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = '#f5b82e';
        roundRect(ctx, -40, -18, 80, 36, 10);
        ctx.fill();
        ctx.fillStyle = '#7a4d00';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('VIP', 0, 1);
        ctx.restore();
      }
      if (slot.locked) {
        const cx = x + SLOT_W / 2;
        const cy = SLOT_TOP + SLOT_H / 2;
        ctx.strokeStyle = '#8d96c2';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy - 8, 9, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = '#8d96c2';
        roundRect(ctx, cx - 14, cy - 8, 28, 22, 5);
        ctx.fill();
        ctx.fillStyle = '#2b3357';
        circle(ctx, cx, cy + 2, 3.5);
        ctx.fillStyle = '#b8c0e6';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+1', cx, cy + 34);
      }
    });
  }

  private drawLotBus(game: Game, bus: Bus): void {
    const [ox, oy] = game.bumpOffset(bus);
    let angle = dirAngle(bus.dir);
    if (bus.shakeT >= 0) angle += Math.sin(bus.shakeT * Math.PI * 6) * 0.09 * (1 - bus.shakeT);
    if (game.vipMode) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.clock * 8);
      ctx.translate(bus.x, bus.y);
      ctx.rotate(angle);
      ctx.fillStyle = '#ffe066';
      const len = busLenPx(bus.length);
      roundRect(ctx, -len / 2 - 5, -BUS_W / 2 - 5, len + 10, BUS_W + 10, 14);
      ctx.fill();
      ctx.restore();
    }
    this.drawBus(bus, bus.x + ox, bus.y + oy, angle);
    if (bus.key >= 0) this.drawLockBadge(bus, bus.x + ox, bus.y + oy, angle, 'key');
    else if (game.isLocked(bus)) this.drawLockBadge(bus, bus.x + ox, bus.y + oy, angle, 'lock');
  }

  /** Padlock or key on the bus's tail, tinted per lock pair so pairs are easy to match. */
  private drawLockBadge(bus: Bus, x: number, y: number, angle: number, kind: 'lock' | 'key'): void {
    const ctx = this.ctx;
    const pair = kind === 'key' ? bus.key : bus.lock;
    const tint = LOCK_TINTS[pair % LOCK_TINTS.length];
    const len = busLenPx(bus.length);
    let s = 1.15;
    if (bus.popT >= 0) s *= 1 + 0.35 * Math.sin(bus.popT * Math.PI);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.translate(-len / 2 + 15, 0);
    ctx.rotate(-angle);
    ctx.scale(s, s);
    ctx.fillStyle = '#1e2438';
    circle(ctx, 0, 0, 12);
    ctx.fillStyle = tint;
    ctx.strokeStyle = tint;
    ctx.lineWidth = 2.5;
    if (kind === 'lock') {
      ctx.beginPath();
      ctx.arc(0, -2, 4.5, Math.PI, 0);
      ctx.stroke();
      roundRect(ctx, -6.5, -2, 13, 9.5, 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(-3.5, 0, 4, 0, Math.PI * 2);
      ctx.moveTo(0.5, 0);
      ctx.lineTo(8, 0);
      ctx.moveTo(6, 0);
      ctx.lineTo(6, 3.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawBus(bus: Bus, x: number, y: number, angle: number): void {
    const ctx = this.ctx;
    const len = busLenPx(bus.length);
    const w = BUS_W;
    const shade: Shade = bus.mystery ? MYSTERY : PALETTE[bus.color];
    let s = bus.scale;
    if (bus.popT >= 0) s *= 1 + 0.25 * Math.sin(bus.popT * Math.PI);

    ctx.save();
    ctx.translate(x, y);
    if (bus.lifted) {
      // Shadow stays on the ground while the bus is in the air.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.save();
      ctx.translate(14 * (s - 1) * 3, 18 * (s - 1) * 3);
      ctx.rotate(angle);
      roundRect(ctx, -len / 2, -w / 2, len, w, 10);
      ctx.fill();
      ctx.restore();
    }
    ctx.rotate(angle);
    ctx.scale(s, s);

    if (!bus.lifted) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      roundRect(ctx, -len / 2 + 2, -w / 2 + 4, len, w, 10);
      ctx.fill();
    }
    // Body
    ctx.fillStyle = shade.dark;
    roundRect(ctx, -len / 2, -w / 2, len, w, 10);
    ctx.fill();
    ctx.fillStyle = shade.fill;
    roundRect(ctx, -len / 2 + 2, -w / 2 + 2, len - 4, w - 6, 9);
    ctx.fill();
    // Side windows
    ctx.fillStyle = 'rgba(30,40,70,0.55)';
    const winLen = len - 34;
    roundRect(ctx, -len / 2 + 10, -w / 2 + 3, winLen, 4, 2);
    ctx.fill();
    roundRect(ctx, -len / 2 + 10, w / 2 - 9, winLen, 4, 2);
    ctx.fill();
    // Windshield at the nose
    ctx.fillStyle = '#26314f';
    roundRect(ctx, len / 2 - 12, -w / 2 + 5, 8, w - 12, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,210,255,0.5)';
    roundRect(ctx, len / 2 - 11, -w / 2 + 6, 3, w - 14, 2);
    ctx.fill();
    // Roof highlight
    ctx.fillStyle = shade.light;
    ctx.globalAlpha = 0.45;
    roundRect(ctx, -len / 2 + 6, -w / 2 + 8, len - 22, 5, 3);
    ctx.fill();
    ctx.globalAlpha = 1;

    const showCount = bus.state === 'docked' || bus.state === 'leaving';
    if (!showCount) {
      // Arrow plate
      ctx.fillStyle = bus.mystery ? '#3c3e4a' : 'rgba(255,255,255,0.92)';
      roundRect(ctx, -17, -10, 34, 18, 5);
      ctx.fill();
      if (bus.mystery) {
        ctx.save();
        ctx.rotate(-angle);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, 0);
        ctx.restore();
      } else {
        ctx.strokeStyle = '#3a3f4f';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-10, -1);
        ctx.lineTo(9, -1);
        ctx.moveTo(3, -6);
        ctx.lineTo(9, -1);
        ctx.lineTo(3, 4);
        ctx.stroke();
      }
    }
    ctx.restore();

    if (showCount) {
      const left = bus.capacity - bus.filled;
      ctx.save();
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(String(left), x, y);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(left), x, y);
      ctx.restore();
    }
  }

  private drawQueue(game: Game): void {
    const ctx = this.ctx;
    const n = Math.min(game.remaining, QUEUE_VISIBLE);
    for (let i = n - 1; i >= 0; i--) {
      const color = game.queue[game.qHead + i];
      const [x, y] = personPos(i + game.queueOffset);
      // Little idle bob so the crowd feels alive.
      const bob = Math.sin(this.clock * 6 + i * 0.7) * 0.8;
      drawPerson(ctx, x, y + bob, color);
    }
    if (game.remaining > QUEUE_VISIBLE) {
      const [ex, ey] = QUEUE_PATH[QUEUE_PATH.length - 1];
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, ex - 34, ey - 50, 68, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+${game.remaining - QUEUE_VISIBLE}`, ex, ey - 37);
    }
  }

  private drawFlyers(game: Game): void {
    for (const f of game.flyers) {
      const t = Math.min(1, f.t);
      const x1 = f.bus.x;
      const y1 = f.bus.y - busLenPx(f.bus.length) / 2 + 18;
      const x = f.x0 + (x1 - f.x0) * t;
      const y = f.y0 + (y1 - f.y0) * t - Math.sin(t * Math.PI) * 28;
      drawPerson(this.ctx, x, y, f.color, 1 - t * 0.3);
    }
  }
}

function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, color: ColorId, s = 1) {
  const p = PALETTE[color];
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  circle(ctx, x + 1, y + 4, 7.5 * s);
  ctx.fillStyle = p.dark;
  circle(ctx, x, y + 1, 7.5 * s);
  ctx.fillStyle = p.fill;
  circle(ctx, x, y, 6.5 * s);
  ctx.fillStyle = p.light;
  circle(ctx, x - 0.5, y - 4 * s, 4.6 * s);
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  // Grass
  ctx.fillStyle = '#79c55a';
  ctx.fillRect(0, 0, W, H);

  // Water around the crowd's island
  ctx.fillStyle = '#5bc4f0';
  roundRect(ctx, -20, -20, W + 40, 465, 40);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 26; i++) {
    const x = (i * 137) % W;
    const y = 100 + ((i * 89) % 320);
    roundRect(ctx, x, y, 22, 4, 2);
    ctx.fill();
  }

  // Crowd track
  const trace = () => {
    ctx.beginPath();
    QUEUE_PATH.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  trace();
  ctx.strokeStyle = '#e8eef6';
  ctx.lineWidth = 62;
  ctx.stroke();
  trace();
  ctx.strokeStyle = '#323a52';
  ctx.lineWidth = 52;
  ctx.stroke();

  // Parking pad behind the slots
  ctx.fillStyle = '#9097a6';
  ctx.fillRect(0, 440, W, ROAD_TOP - 440);

  // Bushes
  ctx.fillStyle = '#4fa83c';
  for (const [x, y] of [
    [10, 1250],
    [60, 1270],
    [690, 1255],
    [650, 1280],
    [360, 1290],
  ]) {
    circle(ctx, x, y, 30);
  }

  // Road loop
  ctx.strokeStyle = '#5f6474';
  ctx.lineWidth = ROAD_W;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.rect(ROAD_LEFT, ROAD_TOP, ROAD_RIGHT - ROAD_LEFT, ROAD_BOTTOM - ROAD_TOP);
  ctx.moveTo(ROAD_RIGHT, ROAD_TOP);
  ctx.lineTo(W + 30, ROAD_TOP);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  ctx.setLineDash([16, 14]);
  ctx.beginPath();
  ctx.rect(ROAD_LEFT, ROAD_TOP, ROAD_RIGHT - ROAD_LEFT, ROAD_BOTTOM - ROAD_TOP);
  ctx.stroke();
  ctx.setLineDash([]);

  // Lot
  ctx.fillStyle = '#8b91a0';
  ctx.fillRect(LOT_X - 4, LOT_Y - 4, LOT_W + 8, LOT_H + 8);
  ctx.strokeStyle = '#f2c230';
  ctx.lineWidth = 4;
  ctx.strokeRect(LOT_X - 2, LOT_Y - 2, LOT_W + 4, LOT_H + 4);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let c = 0; c <= LOT_W / 48; c++) ctx.fillRect(LOT_X + c * 48 - 1, LOT_Y, 2, LOT_H);
  for (let r = 0; r <= LOT_H / 48; r++) ctx.fillRect(LOT_X, LOT_Y + r * 48 - 1, LOT_W, 2);
}
