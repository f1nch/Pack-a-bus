import { Game, type Bus } from './game';
import { buildOccupancy, probePath } from './grid';
import { CELL, LOT_X, LOT_Y } from './layout';
import { generateLevel } from './level';
import type { LevelData } from './types';

/** How hard a level is for a greedy, human-like player with no time pressure:
 *  0 = wins without boosters, 1 = needs one, 2 = needs both, 3 = loses anyway. */
export type Grade = 0 | 1 | 2 | 3;

/** Passengers at the front of the line the bot plans around (a person can't track more). */
const LOOK = 24;
const THINK = 1;
const DT = 1 / 20;
/** Give up on a run after this much game time (counts as a loss). */
const MAX_TIME = 900;
/** Layout candidates tried per level when hunting for the target grade. */
const CANDIDATES = 6;

/** Grade per position in a block of ten (index = level % 10). x0 is the special
 *  level, where the twist is the challenge; x4/x9 are Hard, x7 Super Hard,
 *  x1/x5 breathers. */
const WAVE: Grade[] = [1, 0, 1, 1, 2, 0, 1, 3, 1, 2];

export function targetGrade(level: number): Grade {
  if (level === 9) return 2; // the first Hard level
  if (level <= 8) return level % 3 === 0 ? 1 : 0;
  const t = WAVE[level % 10];
  return level < 17 ? (Math.min(t, 2) as Grade) : t; // Super Hard from level 17
}

/** Plays the level like a person would: drive out the free bus the front of the line
 *  needs most, and spend boosters only when stuck. */
export function gradeLevel(data: LevelData): Grade {
  const level = { ...data, time: Infinity };
  let won: boolean | null = null;
  const game = new Game(level, {
    sound: () => {},
    toast: () => {},
    stuck: () => {},
    end: (w) => (won = w),
    closeCall: () => {},
    bonusSpotUsed: () => {},
  });
  const tap = (b: Bus) => game.tap(LOT_X + b.col * CELL + CELL / 2, LOT_Y + b.row * CELL + CELL / 2);

  let clock = 0;
  let nextMove = THINK;
  let idle = 0;
  while (won === null && clock < MAX_TIME) {
    game.update(DT);
    clock += DT;
    if (clock < nextMove) continue;
    nextMove = clock + THINK;

    const lot = game.lotBuses;
    const seats = new Map<string, number>();
    for (const s of game.slots) {
      if (s.bus) seats.set(s.bus.color, (seats.get(s.bus.color) ?? 0) + s.bus.capacity - s.bus.reserved);
    }
    const frontColor = game.queue[game.qHead];
    const frontSeated = (seats.get(frontColor) ?? 0) > 0;
    const hasFree = game.slots.some((s) => !s.vip && !s.locked && !s.bus);

    if (!hasFree) {
      if (game.canUseSlot()) game.useSlotBooster();
      else if (!frontSeated && game.canUseVip()) {
        const target = lot.find((b) => b.color === frontColor && !b.mystery) ?? lot.find((b) => b.color === frontColor);
        if (target) {
          game.toggleVip();
          tap(target);
        }
      }
      continue;
    }

    const occ = buildOccupancy(level.cols, level.rows, lot);
    const free = lot.filter((b) => probePath(b, occ, level.cols, level.rows).clear && !game.isLocked(b));
    const front = game.queue.slice(game.qHead, game.qHead + LOOK);
    const need = (c: string) => front.filter((x) => x === c).length - (seats.get(c) ?? 0);
    const firstAt = (c: string) => {
      const i = front.indexOf(c as never);
      return i < 0 ? LOOK : i;
    };
    let best: Bus | undefined;
    let bestScore = -Infinity;
    for (const b of free) {
      // Keys are worth freeing early; otherwise serve the colors the line needs soonest.
      const score = need(b.color) * 10 - firstAt(b.color) + (b.key >= 0 ? 5 : 0);
      if (score > bestScore) [best, bestScore] = [b, score];
    }
    // Wait for the line to move unless the front passenger has nowhere to go.
    if (best && (need(best.color) > 0 || (!frontSeated && idle > 1))) {
      tap(best);
      idle = 0;
    } else idle++;
  }
  if (!won) return 3;
  return Math.min(2, game.boostersUsed) as Grade;
}

/** Grades `count` layout variants of level `n` and keeps the one `better` prefers
 *  (stopping early once `done` says it's good enough), flagged by its measured grade. */
function pickLayout(
  n: number,
  count: number,
  better: (grade: Grade, best: Grade) => boolean,
  done: (grade: Grade) => boolean,
): LevelData {
  let best: { level: LevelData; grade: Grade } | null = null;
  for (let v = 0; v < count; v++) {
    let level: LevelData;
    try {
      level = generateLevel(n, v);
    } catch {
      continue;
    }
    const grade = gradeLevel(level);
    if (!best || better(grade, best.grade)) best = { level, grade };
    if (done(grade)) break;
  }
  if (!best) throw new Error(`could not generate level ${n}`);
  const { level, grade } = best;
  // Special levels already announce their twist; don't stack a second warning on them.
  level.difficulty = level.twist ? null : grade === 3 ? 'super' : grade === 2 ? 'hard' : null;
  return level;
}

/** Generates a few layouts for the level and keeps the one whose grade is closest to
 *  the curve's target, then flags it by the grade it actually measured. */
export function buildGradedLevel(n: number): LevelData {
  const target = targetGrade(n);
  return pickLayout(
    n,
    CANDIDATES,
    (g, b) => Math.abs(g - target) < Math.abs(b - target),
    (g) => g === target,
  );
}

/** Opt-in help after repeated losses: the easiest layout among a wider set of candidates. */
export function buildGentlerLevel(n: number): LevelData {
  return pickLayout(
    n,
    CANDIDATES * 2,
    (g, b) => g < b,
    (g) => g === 0,
  );
}
