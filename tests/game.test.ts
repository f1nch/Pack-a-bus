import { describe, expect, it } from 'vitest';
import { Game } from '../src/game';
import { CELL, LOT_X, LOT_Y } from '../src/layout';
import { generateLevel } from '../src/level';
import { starsFor } from '../src/stars';

/** Plays a level's known solution through the real game rules. */
function playSolution(n: number, useBooster = false) {
  const level = generateLevel(n);
  let result: { won: boolean; reason: string } | null = null;
  let full = false;
  const game = new Game(level, {
    sound: () => {},
    toast: (msg) => (full = msg === 'No free parking spots!'),
    stuck: () => {},
    end: (won, reason) => (result = { won, reason }),
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
    game.update(1 / 60);
  }
  return { game, result: result as { won: boolean; reason: string } | null };
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

  for (const n of [10, 20, 30]) {
    it(`special level ${n} can be won in time`, () => {
      expect(playSolution(n).result?.won).toBe(true);
    });
  }
});
