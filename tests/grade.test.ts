import { describe, expect, it } from 'vitest';
import { buildGradedLevel, gradeLevel, targetGrade } from '../src/grade';
import { levelConfig, simulate } from '../src/level';
import { starPoints } from '../src/stars';

describe('difficulty curve targets', () => {
  it('keeps the first levels gentle', () => {
    for (let n = 1; n <= 8; n++) expect(targetGrade(n)).toBeLessThanOrEqual(1);
    expect(targetGrade(9)).toBe(2);
    for (let n = 10; n < 17; n++) expect(targetGrade(n)).toBeLessThanOrEqual(2);
    expect(targetGrade(17)).toBe(3);
  });

  it('follows the wave in every block of ten', () => {
    for (const base of [20, 30, 40]) {
      expect(targetGrade(base + 1)).toBe(0);
      expect(targetGrade(base + 4)).toBe(2);
      expect(targetGrade(base + 5)).toBe(0);
      expect(targetGrade(base + 7)).toBe(3);
      expect(targetGrade(base + 9)).toBe(2);
      expect(targetGrade(base + 10)).toBe(1); // special level: the twist is the challenge
    }
  });
});

describe('graded levels', () => {
  it('are deterministic', () => {
    expect(buildGradedLevel(24)).toEqual(buildGradedLevel(24));
  });

  for (const n of [1, 9, 17, 24, 27, 30, 41]) {
    it(`level ${n} is solvable and labeled with its measured grade`, () => {
      const level = buildGradedLevel(n);
      expect(simulate(level, level.solution, levelConfig(n).genSlots)).toBe(true);
      const grade = gradeLevel(level);
      const expected = level.twist ? null : grade === 3 ? 'super' : grade === 2 ? 'hard' : null;
      expect(level.difficulty).toBe(expected);
    });
  }

  it('lands most targeted hard levels on hard or harder', () => {
    const targeted = [];
    for (let n = 11; n <= 50; n++) if (targetGrade(n) >= 2) targeted.push(n);
    const flagged = targeted.filter((n) => buildGradedLevel(n).difficulty !== null);
    expect(flagged.length).toBeGreaterThanOrEqual(Math.ceil(targeted.length * 0.75));
  });

  it('keeps breathers unflagged', () => {
    for (const n of [21, 25, 31, 35, 41, 45]) expect(buildGradedLevel(n).difficulty).toBeNull();
  });
});

describe('timer', () => {
  it('is generous on normal levels and tight only on Rush Hour', () => {
    for (const n of [5, 13, 29, 52]) {
      const c = levelConfig(n);
      expect((c.time - 30) / c.busCount).toBeGreaterThanOrEqual(6);
    }
    const rush = levelConfig(20);
    expect((rush.time - 30) / rush.busCount).toBeLessThan(5);
  });
});

describe('star rewards', () => {
  it('multiplies stars on flagged levels', () => {
    expect(starPoints(3, null)).toBe(3);
    expect(starPoints(2, 'hard')).toBe(4);
    expect(starPoints(2, 'super')).toBe(6);
  });
});
