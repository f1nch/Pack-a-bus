export type Stars = 1 | 2 | 3;

/** Every this many stars collected banks one bonus +Spot. */
export const STARS_PER_BONUS = 10;

/** Bonus +Spots still banked, from the star total and how many were already used. */
export function bonusSpots(totalStars: number, spent: number): number {
  return Math.max(0, Math.floor(totalStars / STARS_PER_BONUS) - spent);
}

/** 3 stars for a fast finish, 2 for a decent one; each booster used costs a star. */
export function starsFor(timeLeft: number, timeTotal: number, boostersUsed: number): Stars {
  const frac = timeTotal > 0 ? timeLeft / timeTotal : 0;
  const base = frac >= 0.4 ? 3 : frac >= 0.2 ? 2 : 1;
  return Math.max(1, base - boostersUsed) as Stars;
}
