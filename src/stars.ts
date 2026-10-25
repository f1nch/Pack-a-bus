import type { Difficulty } from './types';

export type Stars = 1 | 2 | 3;

/** Stars count double on Hard levels and triple on Super Hard ones toward the total. */
export function starPoints(stars: number, difficulty: Difficulty | null): number {
  return stars * (difficulty === 'super' ? 3 : difficulty === 'hard' ? 2 : 1);
}

/** Every this many stars collected banks one bonus +Spot. */
export const STARS_PER_BONUS = 10;
/** The bank holds at most this many, so stars can't stockpile a permanent crutch. */
export const BANK_CAP = 2;

/** Old saves tracked "spent" instead of a bank; this converts them (capped). */
export function bonusSpots(totalStars: number, spent: number): number {
  return Math.max(0, Math.min(BANK_CAP, Math.floor(totalStars / STARS_PER_BONUS) - spent));
}

/** The bank after a win moves the star total from `before` to `after`: one +Spot per
 *  threshold crossed, never past the cap. `full` means a threshold was crossed but the
 *  bank had no room. */
export function bankAfterWin(bank: number, before: number, after: number): { bank: number; earned: boolean; full: boolean } {
  const crossed = Math.floor(after / STARS_PER_BONUS) - Math.floor(before / STARS_PER_BONUS);
  const next = Math.min(BANK_CAP, bank + Math.max(0, crossed));
  return { bank: next, earned: next > bank, full: crossed > 0 && next === bank };
}

/** Par time in seconds: a moment to read the lot, then 2 seconds per bus. Players who keep
 *  the spots packed so the line never stops beat it; one-bus-at-a-time play doesn't.
 *  (Tuned with the human-like bot: ~1.5s per decision beats par, 2s+ mostly misses.) */
export function parTime(busCount: number): number {
  return 10 + 2 * busCount;
}

export interface Rating {
  stars: Stars;
  /** No boosters beyond the level's free allowance. */
  clean: boolean;
  /** Finished within par. */
  fast: boolean;
}

/** One star for clearing the level, one for playing clean, one for beating par.
 *  `cap` limits the result (the opt-in gentler layout tops out at 2). */
export function rateLevel(o: { boostersUsed: number; free: number; elapsed: number; par: number; cap?: number }): Rating {
  const clean = o.boostersUsed <= o.free;
  const fast = o.elapsed <= o.par;
  const stars = Math.min(o.cap ?? 3, 1 + Number(clean) + Number(fast)) as Stars;
  return { stars, clean, fast };
}

/** Flagged levels are graded as needing boosters, so using them there doesn't cost stars. */
export function freeBoosters(difficulty: Difficulty | null): number {
  return difficulty === 'super' ? 2 : difficulty === 'hard' ? 1 : 0;
}
