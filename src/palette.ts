import type { ColorId } from './types';

export interface Shade {
  fill: string;
  dark: string;
  light: string;
}

export const PALETTE: Record<ColorId, Shade> = {
  red: { fill: '#e8343f', dark: '#a8202a', light: '#ff6b73' },
  blue: { fill: '#2f7cf0', dark: '#1d52a8', light: '#69a6ff' },
  green: { fill: '#5cc93a', dark: '#3a8a22', light: '#93e86f' },
  yellow: { fill: '#f7c928', dark: '#b58d10', light: '#ffe46b' },
  purple: { fill: '#8b45e0', dark: '#5c2a9e', light: '#b783ff' },
  orange: { fill: '#f7892a', dark: '#b85d12', light: '#ffb26b' },
  white: { fill: '#f2f4f8', dark: '#a9b0bf', light: '#ffffff' },
  pink: { fill: '#f25cb5', dark: '#a8337a', light: '#ff96d4' },
  cyan: { fill: '#2fd0d6', dark: '#1a8d92', light: '#7ef0f3' },
};

export const COLOR_ORDER: ColorId[] = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'white',
  'pink',
  'cyan',
];

export const MYSTERY: Shade = { fill: '#2a2b33', dark: '#121318', light: '#4a4c57' };
