import { describe, expect, it } from 'vitest';
import { PALETTE } from '../src/palette';
import { contrastRatio, newestUnlocked, unlockedWorlds, WORLDS } from '../src/worlds';

describe('worlds', () => {
  it('unlocks a new world every 20 levels, starting with the park', () => {
    expect(WORLDS.map((w) => w.id)).toEqual(['park', 'beach', 'snow', 'desert', 'night', 'moon']);
    expect(WORLDS.map((w) => w.unlockLevel)).toEqual([1, 20, 40, 60, 80, 100]);
  });

  it('knows which worlds a player has reached', () => {
    expect(unlockedWorlds(1).map((w) => w.id)).toEqual(['park']);
    expect(unlockedWorlds(19).length).toBe(1);
    expect(unlockedWorlds(20).map((w) => w.id)).toEqual(['park', 'beach']);
    expect(unlockedWorlds(39).length).toBe(2);
    expect(unlockedWorlds(500).length).toBe(WORLDS.length);
    expect(newestUnlocked(45).id).toBe('snow');
  });

  it('keeps every bus as readable on every road as on the original park road', () => {
    // Buses have a darker outline, so either the body or the outline can carry the edge.
    const worst = (road: string) =>
      Math.min(
        ...Object.values(PALETTE).map((s) => Math.max(contrastRatio(s.fill, road), contrastRatio(s.dark, road))),
      );
    const park = worst(WORLDS[0].road);
    for (const world of WORLDS) expect(worst(world.road), world.id).toBeGreaterThanOrEqual(park - 0.01);
  });

  it('keeps the road visible against the ground around it', () => {
    for (const world of WORLDS) {
      expect(contrastRatio(world.road, world.ground), world.id).toBeGreaterThanOrEqual(1.25);
    }
  });
});
