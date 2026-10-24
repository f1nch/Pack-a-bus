import { COLS, ROWS } from './level';

/** Logical canvas size; everything is drawn in these units and scaled to fit. */
export const W = 720;
export const H = 1300;

export const CELL = 48;
export const LOT_X = 48;
export const LOT_Y = 668;
export const LOT_W = COLS * CELL;
export const LOT_H = ROWS * CELL;

export const ROAD_W = 44;
export const ROAD_TOP = 640;
export const ROAD_BOTTOM = LOT_Y + LOT_H + 22;
export const ROAD_LEFT = 26;
export const ROAD_RIGHT = 694;

export const SLOT_COUNT = 8; // index 0 is the VIP spot
export const SLOT_TOP = 452;
export const SLOT_H = 150;
export const SLOT_W = 70;
export const SLOT_GAP = 12;
export const SLOT_X0 = 38;
export const slotCenterX = (i: number): number => SLOT_X0 + SLOT_W / 2 + i * (SLOT_W + SLOT_GAP);

export const BUS_W = 38;
export const busLenPx = (length: number): number => length * CELL - 8;
export const dockY = (length: number): number => SLOT_TOP + 6 + busLenPx(length) / 2;

/** Winding line the crowd stands on; first point is the front of the line. */
export const QUEUE_PATH: [number, number][] = [
  [360, 432],
  [360, 400],
  [80, 400],
  [80, 320],
  [640, 320],
  [640, 240],
  [80, 240],
  [80, 160],
  [640, 160],
];
export const QUEUE_ROW_SPACING = 15;
export const QUEUE_LANES = [0, -13, 13];

export const BOTTOM_BAR_Y = 1200;
