export type Stars = 1 | 2 | 3;

/** 3 stars for a fast finish, 2 for a decent one; each booster used costs a star. */
export function starsFor(timeLeft: number, timeTotal: number, boostersUsed: number): Stars {
  const frac = timeTotal > 0 ? timeLeft / timeTotal : 0;
  const base = frac >= 0.4 ? 3 : frac >= 0.2 ? 2 : 1;
  return Math.max(1, base - boostersUsed) as Stars;
}
