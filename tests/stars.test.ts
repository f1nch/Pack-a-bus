import { describe, expect, it } from 'vitest';
import { generateLevel, levelConfig, START_SLOTS } from '../src/level';
import { BANK_CAP, bankAfterWin, freeBoosters, rateLevel, spotGoal, STARS_PER_BONUS } from '../src/stars';

const clean = { boostersUsed: 0, free: 0, peakSpots: 3, spotGoal: 3 };

describe('bonus bank', () => {
  it('banks one +Spot per 10 stars crossed, up to the cap', () => {
    expect(STARS_PER_BONUS).toBe(10);
    expect(BANK_CAP).toBe(2);
    expect(bankAfterWin(0, 8, 9)).toEqual({ bank: 0, earned: false, full: false });
    expect(bankAfterWin(0, 9, 10)).toEqual({ bank: 1, earned: true, full: false });
    expect(bankAfterWin(1, 19, 21)).toEqual({ bank: 2, earned: true, full: false });
  });

  it('does not grow past the cap, so stars can’t stockpile endless spots', () => {
    expect(bankAfterWin(2, 29, 31)).toEqual({ bank: 2, earned: false, full: true });
    // A Super Hard win can cross two thresholds at once; still capped.
    expect(bankAfterWin(1, 18, 27)).toEqual({ bank: 2, earned: true, full: false });
  });
});

describe('star rating', () => {
  it('gives one star for clearing, one for playing clean, one for efficiency', () => {
    expect(rateLevel(clean)).toEqual({ stars: 3, clean: true, efficient: true });
    expect(rateLevel({ ...clean, peakSpots: 4 })).toEqual({ stars: 2, clean: true, efficient: false });
    expect(rateLevel({ ...clean, boostersUsed: 1 })).toEqual({ stars: 2, clean: false, efficient: true });
    expect(rateLevel({ ...clean, boostersUsed: 2, peakSpots: 5 }).stars).toBe(1);
  });

  it('costs at most one star for boosters, however many were used', () => {
    expect(rateLevel({ ...clean, boostersUsed: 1 }).stars).toBe(rateLevel({ ...clean, boostersUsed: 3 }).stars);
  });

  it('lets flagged levels use their free boosters and stay clean', () => {
    expect(freeBoosters(null)).toBe(0);
    expect(freeBoosters('hard')).toBe(1);
    expect(freeBoosters('super')).toBe(2);
    expect(rateLevel({ ...clean, boostersUsed: 1, free: freeBoosters('hard') }).clean).toBe(true);
    expect(rateLevel({ ...clean, boostersUsed: 2, free: freeBoosters('hard') }).clean).toBe(false);
    expect(rateLevel({ ...clean, boostersUsed: 2, free: freeBoosters('super') }).stars).toBe(3);
  });

  it('caps stars on the gentler layout', () => {
    expect(rateLevel({ ...clean, cap: 2 }).stars).toBe(2);
  });

  it('sets the spot goal to "keep one of the starting spots free"', () => {
    expect(spotGoal(5)).toBe(4);
    expect(spotGoal(4)).toBe(3); // Tight Squeeze
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
