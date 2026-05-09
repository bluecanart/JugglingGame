export type Hand = 'L' | 'R';

export interface Ball {
  id: number;
  color: string;
  /** 'held' = sitting in a hand; 'flying' = in the air */
  state: 'held' | 'flying';
  /** Hand currently holding this ball (only meaningful when state === 'held'). */
  hand?: Hand;
  /** Throw record (only meaningful when state === 'flying'). */
  throw?: ThrowRecord;
}

export interface ThrowRecord {
  /** Siteswap value: 1..9 (we don't currently support 0 / multiplex). */
  value: number;
  fromHand: Hand;
  toHand: Hand;
  /** ms timestamp when the ball left the hand */
  startTime: number;
  /** ms timestamp when the ball is scheduled to be caught */
  endTime: number;
  /** Cached world-space start point */
  startX: number;
  startY: number;
  /** Cached world-space end point */
  endX: number;
  endY: number;
  /** Peak height above start (in world units) — used only for the parabola */
  peakHeight: number;
}

export interface HandState {
  side: Hand;
  /** Stack of ball IDs in this hand. The top of the stack is the next thrown. */
  balls: number[];
}

export type PaletteKey =
  | 'multi'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'white'
  | 'black'
  | 'one-red';

export interface GameConfig {
  ballCount: number;
  palette?: PaletteKey;
}
