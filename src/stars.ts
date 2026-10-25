import type { Difficulty } from './types';

export type Stars = 1 | 2 | 3;

/** Stars count double on Hard levels and triple on Super Hard ones toward the total. */
export function starPoints(stars: number, difficulty: Difficulty | null): number {
  return stars * (difficulty === 'super' ? 3 : difficulty === 'hard' ? 2 : 1);
}

/** Every this many stars collected banks one bonus +Spot. */
export const STARS_PER_BONUS = 10;

/** Bonus +Spots still banked, from the star total and how many were already used. */
export function bonusSpots(totalStars: number, spent: number): number {
  return Math.max(0, Math.floor(totalStars / STARS_PER_BONUS) - spent);
}

/** 3 stars for a fast finish, 2 for a decent one; each booster beyond the free ones costs a star. */
export function starsFor(timeLeft: number, timeTotal: number, boostersUsed: number, free = 0): Stars {
  const frac = timeTotal > 0 ? timeLeft / timeTotal : 0;
  const base = frac >= 0.4 ? 3 : frac >= 0.2 ? 2 : 1;
  return Math.max(1, base - Math.max(0, boostersUsed - free)) as Stars;
}

/** Flagged levels are graded as needing boosters, so using them there doesn't cost stars. */
export function freeBoosters(difficulty: Difficulty | null): number {
  return difficulty === 'super' ? 2 : difficulty === 'hard' ? 1 : 0;
}
