import { describe, expect, it } from 'vitest';
import { buildGentlerLevel, buildGradedLevel, gradeLevel } from '../src/grade';
import { levelConfig, simulate } from '../src/level';
import { COLOR_ORDER, SYMBOLS } from '../src/palette';

describe('color symbols', () => {
  it('gives every color its own shape', () => {
    const shapes = COLOR_ORDER.map((c) => SYMBOLS[c]);
    expect(shapes.every(Boolean)).toBe(true);
    expect(new Set(shapes).size).toBe(COLOR_ORDER.length);
  });
});

describe('gentler layout', () => {
  for (const n of [9, 17, 24, 27]) {
    it(`level ${n}: is no harder than the normal layout, still solvable, and deterministic`, () => {
      const normal = buildGradedLevel(n);
      const gentle = buildGentlerLevel(n);
      expect(gradeLevel(gentle)).toBeLessThanOrEqual(gradeLevel(normal));
      expect(simulate(gentle, gentle.solution, levelConfig(n).genSlots)).toBe(true);
      expect(gentle).toEqual(buildGentlerLevel(n));
    });
  }

  it('is actually easier on flagged levels', () => {
    let easier = 0;
    const flagged = [9, 14, 17, 19, 24, 27, 29];
    for (const n of flagged) if (gradeLevel(buildGentlerLevel(n)) < gradeLevel(buildGradedLevel(n))) easier++;
    expect(easier).toBeGreaterThanOrEqual(flagged.length - 1);
  });

  it('drops the Hard/Super Hard flag when the layout is no longer hard', () => {
    const gentle = buildGentlerLevel(17);
    const grade = gradeLevel(gentle);
    expect(gentle.difficulty).toBe(grade === 3 ? 'super' : grade === 2 ? 'hard' : null);
  });
});

