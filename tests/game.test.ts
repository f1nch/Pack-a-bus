import { describe, expect, it } from 'vitest';
import { Game } from '../src/game';
import { CELL, LOT_X, LOT_Y } from '../src/layout';
import { generateLevel } from '../src/level';
import { starsFor } from '../src/stars';

const quiet = {
  sound: () => {},
  toast: () => {},
  stuck: () => {},
  end: () => {},
  closeCall: () => {},
  bonusSpotUsed: () => {},
};

/** Plays a level's known solution through the real game rules. */
function playSolution(n: number, useBooster = false, onStep?: (game: Game) => void) {
  const level = generateLevel(n);
  let result: { won: boolean; reason: string } | null = null;
  let full = false;
  let closeCalls = 0;
  const game = new Game(level, {
    ...quiet,
    toast: (msg) => (full = msg === 'No free parking spots!'),
    end: (won, reason) => (result = { won, reason }),
    closeCall: () => closeCalls++,
  });
  if (useBooster) game.useSlotBooster();
  const byId = new Map(level.buses.map((b) => [b.id, b]));
  let next = 0;
  for (let step = 0; step < 20000 && !result; step++) {
    if (next < level.solution.length && step % 5 === 0) {
      const b = byId.get(level.solution[next])!;
      full = false;
      game.tap(LOT_X + b.col * CELL + CELL / 2, LOT_Y + b.row * CELL + CELL / 2);
      if (!full) next++;
    }
    onStep?.(game);
    game.update(1 / 60);
  }
  return { game, closeCalls, result: result as { won: boolean; reason: string } | null };
}

describe('game flow', () => {
  it('playing the solution wins with 3 stars and no boosters', () => {
    const { game, result } = playSolution(1);
    expect(result?.won).toBe(true);
    expect(game.boostersUsed).toBe(0);
    expect(starsFor(game.time, game.level.time, game.boostersUsed)).toBe(3);
  });

  it('counts boosters used', () => {
    const { game, result } = playSolution(1, true);
    expect(result?.won).toBe(true);
    expect(game.boostersUsed).toBe(1);
    expect(starsFor(game.time, game.level.time, game.boostersUsed)).toBe(2);
  });

  for (const n of [10, 13, 19, 20, 29, 30, 44]) {
    it(`level ${n} can be won in time`, () => {
      const { result, closeCalls } = playSolution(n);
      expect(result?.won).toBe(true);
      expect(closeCalls).toBe(0);
    });
  }
});

describe('locked buses', () => {
  it("won't leave until their key bus has", () => {
    const level = generateLevel(13);
    const toasts: string[] = [];
    const game = new Game(level, { ...quiet, toast: (m) => toasts.push(m) });
    const locked = game.buses.find((b) => b.lock >= 0)!;
    const key = game.buses.find((b) => b.key === locked.lock)!;
    expect(game.isLocked(locked)).toBe(true);
    expect(game.isLocked(key)).toBe(false);
    // Clear everything else out of the way so only the lock can stop it.
    for (const b of game.buses) if (b !== locked && b !== key) b.state = 'gone';
    game.tap(LOT_X + locked.col * CELL + CELL / 2, LOT_Y + locked.row * CELL + CELL / 2);
    expect(locked.state).toBe('lot');
    expect(toasts[toasts.length - 1]).toMatch(/locked/i);
    game.tap(LOT_X + key.col * CELL + CELL / 2, LOT_Y + key.row * CELL + CELL / 2);
    expect(key.state).toBe('moving');
    expect(game.isLocked(locked)).toBe(false);
    game.tap(LOT_X + locked.col * CELL + CELL / 2, LOT_Y + locked.row * CELL + CELL / 2);
    expect(locked.state).toBe('moving');
  });
});

describe('bonus spots', () => {
  it('open the second locked spot after the free +Spot, and report each use', () => {
    let bonusUsed = 0;
    const game = new Game(generateLevel(1), { ...quiet, bonusSpotUsed: () => bonusUsed++ }, 2);
    expect(game.boosters.slot).toBe(3);
    const lockedBefore = game.slots.filter((s) => s.locked).length;
    game.useSlotBooster();
    expect(bonusUsed).toBe(0);
    game.useSlotBooster();
    expect(bonusUsed).toBe(1);
    expect(game.slots.filter((s) => s.locked).length).toBe(lockedBefore - 2);
    // Both normal locked spots are open now, so the last bonus stays banked.
    expect(game.canUseSlot()).toBe(false);
    expect(game.boostersUsed).toBe(2);
  });
});

describe('close call', () => {
  it('does not fire for a booster rescue with plenty of time left', () => {
    let closeCalls = 0;
    const game = new Game(generateLevel(1), { ...quiet, closeCall: () => closeCalls++ });
    // Fill every open spot with a bus nobody at the front wants, then let the game notice.
    const front = game.queue[0];
    for (const slot of game.slots) {
      if (slot.vip || slot.locked) continue;
      const bus = game.buses.find((b) => b.state === 'lot' && b.color !== front)!;
      bus.state = 'docked';
      slot.bus = bus;
    }
    game.update(1 / 60);
    expect(game.closeCall).toBe(false);
    expect(closeCalls).toBe(0);
  });

  it('fires once and slows time when a level is won with little time left', () => {
    const { game, result, closeCalls } = playSolution(1, false, (g) => {
      if (g.remaining > 0 && g.remaining < 10) g.time = Math.min(g.time, 8);
    });
    expect(result?.won).toBe(true);
    expect(game.closeCall).toBe(true);
    expect(closeCalls).toBe(1);
  });
});
