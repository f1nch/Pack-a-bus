/** Scenery themes unlocked by progress. A world only restyles the surroundings (ground,
 *  water or sky, track rim, road, lot border, decorations). The lot surface, parking
 *  spots, crowd track, buses and passengers never change, so the puzzle reads the same. */
export type WorldId = 'park' | 'beach' | 'snow' | 'desert' | 'night' | 'moon';
export type Decor = 'bush' | 'palm' | 'pine' | 'cactus' | 'lamp' | 'crater';
/** What covers the big area at the top: waves, ice floes, sand dunes, city lights or stars. */
export type Marks = 'waves' | 'ice' | 'dunes' | 'lights' | 'stars';

export interface World {
  id: WorldId;
  name: string;
  unlockLevel: number;
  ground: string;
  water: string;
  marks: Marks;
  trackRim: string;
  road: string;
  roadLine: string;
  lotRim: string;
  decor: Decor;
  decorColor: string;
}

export const WORLDS: World[] = [
  {
    id: 'park',
    name: 'Classic Park',
    unlockLevel: 1,
    ground: '#79c55a',
    water: '#5bc4f0',
    marks: 'waves',
    trackRim: '#e8eef6',
    road: '#5f6474',
    roadLine: 'rgba(255,255,255,0.55)',
    lotRim: '#f2c230',
    decor: 'bush',
    decorColor: '#4fa83c',
  },
  {
    id: 'beach',
    name: 'Sunny Beach',
    unlockLevel: 20,
    ground: '#f0d9a0',
    water: '#2fc8de',
    marks: 'waves',
    trackRim: '#fff6dc',
    road: '#5c6070',
    roadLine: 'rgba(255,255,255,0.6)',
    lotRim: '#ff8a3d',
    decor: 'palm',
    decorColor: '#3fae4f',
  },
  {
    id: 'snow',
    name: 'Snowy Peaks',
    unlockLevel: 40,
    ground: '#eef4fb',
    water: '#9fd3ef',
    marks: 'ice',
    trackRim: '#ffffff',
    road: '#596175',
    roadLine: 'rgba(255,255,255,0.7)',
    lotRim: '#6aa9e0',
    decor: 'pine',
    decorColor: '#2f7d5a',
  },
  {
    id: 'desert',
    name: 'Desert Canyon',
    unlockLevel: 60,
    ground: '#d9965a',
    water: '#ecbd7f',
    marks: 'dunes',
    trackRim: '#f7e2c4',
    road: '#5e534e',
    roadLine: 'rgba(255,240,210,0.6)',
    lotRim: '#c2562f',
    decor: 'cactus',
    decorColor: '#4f9a4a',
  },
  {
    id: 'night',
    name: 'Night City',
    unlockLevel: 80,
    ground: '#1a1e33',
    water: '#132044',
    marks: 'lights',
    trackRim: '#6f7bb0',
    road: '#3a4058',
    roadLine: 'rgba(255,230,120,0.75)',
    lotRim: '#ff4fd8',
    decor: 'lamp',
    decorColor: '#ffe27a',
  },
  {
    id: 'moon',
    name: 'Moon Base',
    unlockLevel: 100,
    ground: '#8e909c',
    water: '#0b0f2a',
    marks: 'stars',
    trackRim: '#c9cbe0',
    road: '#4a4e5e',
    roadLine: 'rgba(140,220,255,0.8)',
    lotRim: '#5ce1ff',
    decor: 'crater',
    decorColor: '#767884',
  },
];

/** Worlds reached by a player whose highest level is `best`. */
export function unlockedWorlds(best: number): World[] {
  return WORLDS.filter((w) => w.unlockLevel <= best);
}

export function newestUnlocked(best: number): World {
  const list = unlockedWorlds(best);
  return list[list.length - 1] ?? WORLDS[0];
}

export function worldById(id: string | null): World | undefined {
  return WORLDS.find((w) => w.id === id);
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio between two #rrggbb colors (1 = none, 21 = black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
