import { describe, expect, it } from 'vitest';
import { buildOccupancy, cellsOf, probePath } from '../src/grid';
import { capacityFor, generateLevel, levelConfig, simulate } from '../src/level';

describe('level generator', () => {
  for (let n = 1; n <= 40; n++) {
    it(`level ${n} is valid and solvable`, () => {
      const level = generateLevel(n);

      // No overlapping buses, all inside the lot.
      const seen = new Set<string>();
      for (const b of level.buses) {
        for (const [c, r] of cellsOf(b)) {
          expect(c >= 0 && r >= 0 && c < level.cols && r < level.rows).toBe(true);
          const key = `${c},${r}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }

      // Every passenger has exactly one seat of their color.
      const seats = new Map<string, number>();
      for (const b of level.buses) seats.set(b.color, (seats.get(b.color) ?? 0) + capacityFor(b.length));
      const riders = new Map<string, number>();
      for (const c of level.queue) riders.set(c, (riders.get(c) ?? 0) + 1);
      expect(riders).toEqual(seats);

      // At least one bus can move at the start.
      const occ = buildOccupancy(level.cols, level.rows, level.buses);
      expect(level.buses.some((b) => probePath(b, occ, level.cols, level.rows).clear)).toBe(true);

      // The stored solution works even with fewer spots than the player gets.
      expect(simulate(level, level.solution, levelConfig(n).genSlots)).toBe(true);
      expect(simulate(level, level.solution, level.slots)).toBe(true);
    });
  }

  it('is deterministic', () => {
    expect(generateLevel(7)).toEqual(generateLevel(7));
  });
});
