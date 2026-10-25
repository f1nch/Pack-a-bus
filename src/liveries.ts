/** Cosmetic bus paint jobs. They only add a white pattern or trim on top of the bus's own
 *  color, never change it, because color is the puzzle. All are earned by play, in a
 *  fixed order, so the next one is always known: no random drops and nothing to buy. */
export type LiveryId =
  | 'classic'
  | 'stripes'
  | 'polka'
  | 'checker'
  | 'flames'
  | 'zigzag'
  | 'starry'
  | 'lightning'
  | 'gold';

export interface Livery {
  id: LiveryId;
  name: string;
}

export const LIVERIES: Livery[] = [
  { id: 'classic', name: 'Classic' },
  { id: 'stripes', name: 'Racing Stripes' },
  { id: 'polka', name: 'Polka Dots' },
  { id: 'checker', name: 'Checker Flag' },
  { id: 'flames', name: 'Hot Flames' },
  { id: 'zigzag', name: 'Zigzag' },
  { id: 'starry', name: 'Starry Night' },
  { id: 'lightning', name: 'Lightning' },
  { id: 'gold', name: 'Gold Trim' },
];

/** Bonus stars a gift holds once every livery is unlocked. */
const STARS_WHEN_COMPLETE = 3;

export type Gift = { kind: 'livery'; livery: Livery } | { kind: 'stars'; stars: number };

/** What the next gift box holds, given how many liveries (beyond Classic) are unlocked. */
export function giftFor(unlocked: number): Gift {
  const next = LIVERIES[unlocked + 1];
  return next ? { kind: 'livery', livery: next } : { kind: 'stars', stars: STARS_WHEN_COMPLETE };
}
