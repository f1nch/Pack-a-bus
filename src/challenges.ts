import type { LevelData } from './types';

export type ChallengeKind = 'spare2' | 'noVip' | 'noBoosters' | 'streak3' | 'speed';

export interface Challenge {
  kind: ChallengeKind;
  title: string;
  text: string;
  /** Seconds allowed for 'speed'. */
  limit?: number;
}

/** What the game measured, for judging a challenge. */
export interface ChallengeStats {
  peakSpots: number;
  slots: number;
  vipUsed: number;
  boostersUsed: number;
  /** Game time (s) at which each bus filled up. */
  fullTimes: number[];
  elapsed: number;
  busCount: number;
}

/** Seconds within which three buses must fill for a Hat Trick. */
export const STREAK_WINDOW = 8;
/** Seconds per bus allowed on a Speed Run. */
const SPEED_PER_BUS = 3;

const KINDS: ChallengeKind[] = ['spare2', 'noVip', 'streak3', 'noBoosters', 'speed'];
/** Position of the challenge slots inside each block of ten levels. */
const SLOTS: Record<number, number> = { 2: 0, 5: 1, 8: 2 };

/** Bonus challenges sit on x2, x5 and x8 from level 5, between the Hard levels (x4, x7,
 *  x9) and the special x0, and never stack on a level that's already special or flagged. */
export function challengeFor(level: LevelData): Challenge | null {
  const n = level.level;
  const slot = SLOTS[n % 10];
  if (n < 5 || slot === undefined || level.twist || level.difficulty) return null;
  const kind = KINDS[(Math.floor(n / 10) * 3 + slot) % KINDS.length];
  switch (kind) {
    case 'spare2':
      return { kind, title: 'Spare Two', text: `Never fill more than ${level.slots - 2} of the ${level.slots} spots.` };
    case 'noVip':
      return { kind, title: 'No VIP', text: 'Win without the VIP airlift.' };
    case 'noBoosters':
      return { kind, title: 'Pure Run', text: 'Win without any boosters.' };
    case 'streak3':
      return { kind, title: 'Hat Trick', text: `Fill 3 buses within ${STREAK_WINDOW} seconds.` };
    case 'speed': {
      const limit = Math.round(level.buses.length * SPEED_PER_BUS);
      return { kind, title: 'Speed Run', text: `Clear the lot in under ${limit} seconds.`, limit };
    }
  }
}

function hasStreak(times: number[]): boolean {
  for (let i = 0; i + 2 < times.length; i++) if (times[i + 2] - times[i] <= STREAK_WINDOW) return true;
  return false;
}

/** Live and final judging. `met` means the gift is earned (most kinds need the win);
 *  `failed` means it can no longer be earned this attempt. `label` is the HUD text. */
export function challengeResult(
  c: Challenge,
  s: ChallengeStats,
  won: boolean,
): { met: boolean; failed: boolean; label: string } {
  switch (c.kind) {
    case 'spare2': {
      const max = s.slots - 2;
      const failed = s.peakSpots > max;
      return { met: won && !failed, failed, label: `Spare Two: ${Math.min(s.peakSpots, s.slots)}/${max} spots` };
    }
    case 'noVip': {
      const failed = s.vipUsed > 0;
      return { met: won && !failed, failed, label: 'No VIP' };
    }
    case 'noBoosters': {
      const failed = s.boostersUsed > 0;
      return { met: won && !failed, failed, label: 'Pure Run: no boosters' };
    }
    case 'streak3': {
      const met = hasStreak(s.fullTimes);
      return { met, failed: false, label: `Hat Trick: 3 full buses in ${STREAK_WINDOW}s` };
    }
    case 'speed': {
      const limit = c.limit ?? 0;
      const failed = s.elapsed > limit;
      const left = Math.max(0, Math.ceil(limit - s.elapsed));
      return { met: won && !failed, failed, label: `Speed Run: ${left}s` };
    }
  }
}
