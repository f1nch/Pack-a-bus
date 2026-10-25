import { describe, expect, it } from 'vitest';
import { generateLevel, LOCK_START, levelConfig, simulate } from '../src/level';

describe('difficulty curve', () => {
  it('keeps getting harder after the early ramp flattens', () => {
    expect(levelConfig(52).chunkMax).toBeLessThan(levelConfig(13).chunkMax);
    expect(levelConfig(52).mysteryChance).toBeGreaterThan(levelConfig(13).mysteryChance);
  });

  it('gives a breather on levels ending in 1 and 5', () => {
    for (const n of [21, 25, 31, 35]) {
      expect(levelConfig(n).busCount).toBeLessThan(levelConfig(n + 1).busCount);
    }
  });

  it('peaks on the level before each special level', () => {
    expect(levelConfig(29).locks).toBeGreaterThan(levelConfig(28).locks);
    expect(levelConfig(29).chunkMax).toBeLessThanOrEqual(levelConfig(28).chunkMax);
  });

  it('leaves the first ten levels alone', () => {
    expect(levelConfig(5).busCount).toBe(24);
    expect(levelConfig(1).locks).toBe(0);
  });
});

describe('locked buses', () => {
  it('start at LOCK_START', () => {
    expect(levelConfig(LOCK_START - 1).locks).toBe(0);
    expect(levelConfig(LOCK_START).locks).toBeGreaterThan(0);
    const level = generateLevel(LOCK_START);
    expect(level.buses.some((b) => b.lock >= 0)).toBe(true);
  });

  for (const n of [13, 19, 29, 44, 59]) {
    it(`level ${n}: every lock has one key that leaves earlier in the solution`, () => {
      const level = generateLevel(n);
      const pos = new Map(level.solution.map((id, i) => [id, i]));
      const locked = level.buses.filter((b) => b.lock >= 0);
      expect(locked.length).toBe(levelConfig(n).locks);
      for (const bus of locked) {
        const keys = level.buses.filter((b) => b.key === bus.lock);
        expect(keys.length).toBe(1);
        expect(keys[0].lock).toBe(-1);
        expect(pos.get(keys[0].id)!).toBeLessThan(pos.get(bus.id)!);
      }
      expect(simulate(level, level.solution, levelConfig(n).genSlots)).toBe(true);
    });
  }

  it('the solver rejects driving a locked bus before its key', () => {
    const level = generateLevel(LOCK_START);
    const lockedBus = level.buses.find((b) => b.lock >= 0)!;
    const order = [lockedBus.id, ...level.solution.filter((id) => id !== lockedBus.id)];
    expect(simulate(level, order, 99)).toBe(false);
  });
});
