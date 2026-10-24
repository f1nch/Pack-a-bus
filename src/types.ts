export type Dir = 'up' | 'down' | 'left' | 'right';

export type ColorId =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'purple'
  | 'orange'
  | 'white'
  | 'pink'
  | 'cyan';

export interface BusSpec {
  id: number;
  color: ColorId;
  length: number;
  dir: Dir;
  /** Top-left cell the bus covers. */
  col: number;
  row: number;
  mystery: boolean;
}

export interface LevelData {
  level: number;
  cols: number;
  rows: number;
  buses: BusSpec[];
  /** Passenger colors, front of the line first. */
  queue: ColorId[];
  /** Unlocked regular parking spots at the start. */
  slots: number;
  /** Seconds on the clock. */
  time: number;
  /** One known-good order of bus ids (used by tests / hints). */
  solution: number[];
}
