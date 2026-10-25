import { describe, expect, it } from 'vitest';
import { challengeFor, challengeResult, STREAK_WINDOW, type ChallengeStats } from '../src/challenges';
import { Game } from '../src/game';
import { buildGradedLevel } from '../src/grade';
import { CELL, LOT_X, LOT_Y } from '../src/layout';
import { levelConfig } from '../src/level';
import { giftFor, LIVERIES } from '../src/liveries';

const stats = (o: Partial<ChallengeStats> = {}): ChallengeStats => ({
  peakSpots: 3,
  slots: 5,
  vipUsed: 0,
  boostersUsed: 0,
  fullTimes: [],
  elapsed: 60,
  busCount: 30,
  ...o,
});

describe('challenge schedule', () => {
  it('starts at level 5 and lands on x2, x5 and x8', () => {
    for (let n = 1; n < 5; n++) expect(challengeFor(buildGradedLevel(n))).toBeNull();
    const levels = [];
    for (let n = 5; n <= 40; n++) if (challengeFor(buildGradedLevel(n))) levels.push(n % 10);
    expect(levels.length).toBeGreaterThanOrEqual(8);
    expect(levels.every((k) => k === 2 || k === 5 || k === 8)).toBe(true);
  });

  it('never stacks on a special or flagged level', () => {
    for (let n = 5; n <= 60; n++) {
      const level = buildGradedLevel(n);
      if (level.twist || level.difficulty) expect(challengeFor(level)).toBeNull();
    }
  });

  it('rotates through every kind and is deterministic', () => {
    const kinds = new Set<string>();
    for (let n = 5; n <= 60; n++) {
      const c = challengeFor(buildGradedLevel(n));
      if (c) kinds.add(c.kind);
    }
    expect(kinds.size).toBe(5);
    expect(challengeFor(buildGradedLevel(12))).toEqual(challengeFor(buildGradedLevel(12)));
  });
});

describe('challenge results', () => {
  it('judges each kind', () => {
    const c = (kind: string, limit?: number) => ({ kind, title: '', text: '', limit }) as never;
    expect(challengeResult(c('spare2'), stats({ peakSpots: 3 }), true).met).toBe(true);
    expect(challengeResult(c('spare2'), stats({ peakSpots: 4 }), false).failed).toBe(true);
    expect(challengeResult(c('noVip'), stats({ boostersUsed: 1 }), true).met).toBe(true);
    expect(challengeResult(c('noVip'), stats({ vipUsed: 1 }), false).failed).toBe(true);
    expect(challengeResult(c('noBoosters'), stats({ boostersUsed: 1 }), false).failed).toBe(true);
    expect(challengeResult(c('streak3'), stats({ fullTimes: [10, 30, 34, 37] }), false).met).toBe(true);
    expect(challengeResult(c('streak3'), stats({ fullTimes: [10, 30, 30 + STREAK_WINDOW + 1] }), true).met).toBe(false);
    expect(challengeResult(c('speed', 90), stats({ elapsed: 80 }), true).met).toBe(true);
    expect(challengeResult(c('speed', 90), stats({ elapsed: 91 }), false).failed).toBe(true);
  });

  it('is only "met" for most kinds once the level is won', () => {
    const c = { kind: 'noBoosters', title: '', text: '' } as never;
    expect(challengeResult(c, stats(), false).met).toBe(false);
    expect(challengeResult(c, stats(), true).met).toBe(true);
  });
});

/** Plays the level's solution; `patient` waits until a spot frees up past genSlots. */
function play(n: number, patient: boolean) {
  const level = buildGradedLevel(n);
  let won = false;
  let full = false;
  const game = new Game(level, {
    sound: () => {},
    toast: (m) => (full = m === 'No free parking spots!'),
    stuck: () => {},
    end: (w) => (won = w),
    closeCall: () => {},
    bonusSpotUsed: () => {},
  });
  const byId = new Map(level.buses.map((b) => [b.id, b]));
  const limit = levelConfig(n).genSlots;
  let next = 0;
  for (let step = 0; step < 30000 && game.status === 'playing'; step++) {
    const parked = game.slots.filter((s) => !s.vip && s.bus).length;
    if (next < level.solution.length && step % 5 === 0 && !(patient && parked >= limit)) {
      const b = byId.get(level.solution[next])!;
      full = false;
      game.tap(LOT_X + b.col * CELL + CELL / 2, LOT_Y + b.row * CELL + CELL / 2);
      if (!full) next++;
    }
    game.update(1 / 60);
  }
  return { game, won };
}

describe('every challenge can actually be met', () => {
  for (let n = 5; n <= 60; n++) {
    const c = challengeFor(buildGradedLevel(n));
    if (!c) continue;
    it(`level ${n}: ${c.kind}`, () => {
      const met = [false, true].some((patient) => {
        const { game, won } = play(n, patient);
        return won && challengeResult(c, game.challengeStats(), true).met;
      });
      expect(met).toBe(true);
    });
  }
});

describe('liveries', () => {
  it('has a classic default and 8 unlockables with unique ids', () => {
    expect(LIVERIES[0].id).toBe('classic');
    expect(LIVERIES.length).toBe(9);
    expect(new Set(LIVERIES.map((l) => l.id)).size).toBe(LIVERIES.length);
  });

  it('gives gifts in a fixed order, then bonus stars once the set is complete', () => {
    expect(giftFor(0)).toEqual({ kind: 'livery', livery: LIVERIES[1] });
    expect(giftFor(1)).toEqual({ kind: 'livery', livery: LIVERIES[2] });
    expect(giftFor(LIVERIES.length - 1)).toEqual({ kind: 'stars', stars: 3 });
  });
});
