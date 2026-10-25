import { describe, expect, it } from 'vitest';
import { generateLevel, levelConfig, START_SLOTS } from '../src/level';
import { starsFor } from '../src/stars';

describe('star rating', () => {
  it('rates by time left', () => {
    expect(starsFor(50, 100, 0)).toBe(3);
    expect(starsFor(40, 100, 0)).toBe(3);
    expect(starsFor(39, 100, 0)).toBe(2);
    expect(starsFor(20, 100, 0)).toBe(2);
    expect(starsFor(19, 100, 0)).toBe(1);
    expect(starsFor(0, 100, 0)).toBe(1);
  });

  it('costs a star per booster, never below one', () => {
    expect(starsFor(90, 100, 1)).toBe(2);
    expect(starsFor(90, 100, 2)).toBe(1);
    expect(starsFor(10, 100, 2)).toBe(1);
  });
});

describe('special levels', () => {
  it('only every 10th level has a twist, rotating through all three', () => {
    expect(levelConfig(9).twist).toBeNull();
    expect(levelConfig(11).twist).toBeNull();
    expect([10, 20, 30, 40].map((n) => levelConfig(n).twist)).toEqual([
      'mystery',
      'rush',
      'tight',
      'mystery',
    ]);
  });

  it('mystery levels hide many more buses', () => {
    const level = generateLevel(10);
    expect(level.twist).toBe('mystery');
    expect(level.buses.filter((b) => b.mystery).length).toBeGreaterThan(level.buses.length * 0.4);
  });

  it('rush levels have less time', () => {
    const rush = generateLevel(20);
    const busTime = 30 + levelConfig(20).busCount * 4;
    expect(rush.twist).toBe('rush');
    expect(rush.time).toBeLessThan(busTime);
  });

  it('tight levels start with one fewer spot', () => {
    const level = generateLevel(30);
    expect(level.twist).toBe('tight');
    expect(level.slots).toBe(START_SLOTS - 1);
    expect(generateLevel(31).slots).toBe(START_SLOTS);
  });
});
