import { describe, expect, it } from 'vitest';
import { boardPitch } from '../src/audio';
import { Game, type SoundName } from '../src/game';
import { buildOccupancy, probePath } from '../src/grid';
import { CELL, LOT_X, LOT_Y } from '../src/layout';
import { generateLevel } from '../src/level';

function setup() {
  const sounds: { name: SoundName; detail?: number }[] = [];
  const game = new Game(generateLevel(1), {
    sound: (name, detail) => sounds.push({ name, detail }),
    toast: () => {},
    stuck: () => {},
    end: () => {},
    closeCall: () => {},
    bonusSpotUsed: () => {},
  });
  const occ = buildOccupancy(game.level.cols, game.level.rows, game.lotBuses);
  const free = game.lotBuses.find((b) => probePath(b, occ, game.level.cols, game.level.rows).clear)!;
  const tapBus = () => game.tap(LOT_X + free.col * CELL + CELL / 2, LOT_Y + free.row * CELL + CELL / 2);
  return { game, sounds, bus: free, tapBus };
}

describe('juice', () => {
  it('rises in pitch with every seat filled on a bus', () => {
    for (let seat = 2; seat <= 12; seat++) expect(boardPitch(seat)).toBeGreaterThan(boardPitch(seat - 1));
  });

  it('reports the seat number of each boarding passenger', () => {
    const { game, sounds, bus, tapBus } = setup();
    tapBus();
    for (let i = 0; i < 600 && bus.filled < bus.capacity; i++) game.update(1 / 60);
    const seats = sounds.filter((s) => s.name === 'board').map((s) => s.detail!);
    // Seats count up 1, 2, 3... as the bus fills (other parked buses may interleave).
    expect(seats[0]).toBe(1);
    expect(Math.max(...seats)).toBeGreaterThanOrEqual(bus.capacity);
  });

  it('presses a tapped bus, eases it off the line, and squashes it into its spot', () => {
    const { game, bus, tapBus } = setup();
    const [x0, y0] = [bus.x, bus.y];
    tapBus();
    expect(bus.pressT).toBe(0);
    game.update(1 / 60);
    const firstStep = Math.hypot(bus.x - x0, bus.y - y0);
    expect(firstStep).toBeGreaterThan(0);
    expect(firstStep).toBeLessThan(950 / 60); // not instantly at full speed
    for (let i = 0; i < 600 && bus.state !== 'docked'; i++) game.update(1 / 60);
    expect(bus.state).toBe('docked');
    expect(bus.parkT).toBeGreaterThanOrEqual(0);
  });

  it('pops the seat count and bursts when a bus fills up', () => {
    const { game, bus, tapBus, sounds } = setup();
    tapBus();
    let popped = false;
    for (let i = 0; i < 900 && bus.filled < bus.capacity; i++) {
      game.update(1 / 60);
      if (bus.countPopT >= 0) popped = true;
    }
    expect(popped).toBe(true);
    expect(game.bursts.some((b) => b.color === bus.color)).toBe(true);
    expect(sounds.some((s) => s.name === 'full')).toBe(true);
    for (let i = 0; i < 120; i++) game.update(1 / 60);
    expect(sounds.some((s) => s.name === 'depart')).toBe(true);
  });
});
