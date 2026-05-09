import type { Ball, GameConfig, Hand, HandState, PaletteKey, ThrowRecord } from './types.ts';
import { airTimeSeconds, destinationHand, peakHeightPx } from './physics.ts';

/**
 * A pleasant, varied palette. Cycled through as balls are spawned.
 * Picked for high contrast on the warm canvas background.
 */
const SOLID_COLORS: Record<Exclude<PaletteKey, 'multi' | 'one-red'>, string> = {
  orange: '#F4A261',
  red: '#E63946',
  yellow: '#E9C46A',
  green: '#2A9D8F',
  blue: '#2D7DD2',
  purple: '#8E7DBE',
  pink: '#F4A6B6',
  white: '#F5F5F0',
  black: '#1A1A1A',
};

const MULTI_PALETTE = [
  SOLID_COLORS.orange,
  SOLID_COLORS.red,
  SOLID_COLORS.yellow,
  SOLID_COLORS.green,
  SOLID_COLORS.blue,
  SOLID_COLORS.purple,
  SOLID_COLORS.pink,
  SOLID_COLORS.white,
  SOLID_COLORS.black,
];

function colorForBall(id: number, palette: PaletteKey): string {
  if (palette === 'multi') return MULTI_PALETTE[(id - 1) % MULTI_PALETTE.length];
  if (palette === 'one-red') return id === 1 ? SOLID_COLORS.red : SOLID_COLORS.white;
  return SOLID_COLORS[palette];
}

export interface HandAnchors {
  leftX: number;
  rightX: number;
  y: number;
}

/**
 * The Game class owns all mutable state. Render and input layers read from it
 * but never mutate directly — they call the public methods.
 */
export class Game {
  balls: Map<number, Ball> = new Map();
  hands: Record<Hand, HandState> = {
    L: { side: 'L', balls: [] },
    R: { side: 'R', balls: [] },
  };
  /** Most recent throw value, for the HUD. */
  lastThrow: { value: number; fromHand: Hand } | null = null;

  /** Last time each hand was activated (clicked), in ms. The renderer uses
   *  this to briefly darken the hand as click feedback. */
  handFlashAt: Record<Hand, number> = { L: -Infinity, R: -Infinity };

  /** Time-scale on throw air time. >1 = faster, <1 = slower. Peak height is
   *  unaffected so balls reach the same apex but traverse the arc at a
   *  different rate. */
  private speed = 1;

  private palette: PaletteKey = 'multi';

  private nextBallId = 1;

  constructor(
    public anchors: HandAnchors,
    config: GameConfig,
  ) {
    this.reset(config);
  }

  /** Re-create the world with a new ball count. */
  reset(config: GameConfig): void {
    this.balls.clear();
    this.hands.L.balls = [];
    this.hands.R.balls = [];
    this.lastThrow = null;
    this.nextBallId = 1;
    if (config.palette) this.palette = config.palette;

    // Right hand gets the extra ball when count is odd.
    const right = Math.ceil(config.ballCount / 2);
    const left = config.ballCount - right;

    for (let i = 0; i < right; i++) this.spawnBallInHand('R');
    for (let i = 0; i < left; i++) this.spawnBallInHand('L');
  }

  private spawnBallInHand(hand: Hand): Ball {
    const id = this.nextBallId++;
    const ball: Ball = {
      id,
      color: colorForBall(id, this.palette),
      state: 'held',
      hand,
    };
    this.balls.set(id, ball);
    this.hands[hand].balls.push(id);
    return ball;
  }

  /** Switch the ball palette. Re-colors existing balls so the change is
   *  immediate without resetting the juggle. */
  setPalette(palette: PaletteKey): void {
    this.palette = palette;
    for (const ball of this.balls.values()) {
      ball.color = colorForBall(ball.id, palette);
    }
  }

  /**
   * Attempt to throw from `fromHand` with siteswap value `value`.
   * Returns true if a throw happened, false if the hand was empty.
   */
  throwBall(fromHand: Hand, value: number, now: number): boolean {
    const hand = this.hands[fromHand];
    if (hand.balls.length === 0) return false;

    const ballId = hand.balls.pop()!;
    const ball = this.balls.get(ballId)!;

    const toHand = destinationHand(fromHand, value);
    const air = (airTimeSeconds(value) * 1000) / this.speed;
    const peak = peakHeightPx(value, this.anchors.y);

    const startX = fromHand === 'L' ? this.anchors.leftX : this.anchors.rightX;
    const endX = toHand === 'L' ? this.anchors.leftX : this.anchors.rightX;
    const y = this.anchors.y;

    const record: ThrowRecord = {
      value,
      fromHand,
      toHand,
      startTime: now,
      endTime: now + air,
      startX,
      startY: y,
      endX,
      endY: y,
      peakHeight: peak,
    };

    ball.state = 'flying';
    ball.hand = undefined;
    ball.throw = record;

    this.lastThrow = { value, fromHand };
    return true;
  }

  /**
   * Advance time and resolve any catches. Should be called every animation frame.
   */
  update(now: number): void {
    for (const ball of this.balls.values()) {
      if (ball.state !== 'flying' || !ball.throw) continue;
      if (now >= ball.throw.endTime) {
        const dest = ball.throw.toHand;
        ball.state = 'held';
        ball.hand = dest;
        ball.throw = undefined;
        this.hands[dest].balls.push(ball.id);
      }
    }
  }

  /** Update hand anchor positions (call on canvas resize). */
  setAnchors(anchors: HandAnchors): void {
    this.anchors = anchors;
  }

  /** Set the throw-time multiplier. Affects throws made after this call;
   *  in-flight balls keep their original timing. */
  setSpeed(speed: number): void {
    this.speed = speed;
  }

  /** Record a click on `side` so the renderer can flash that hand. */
  flashHand(side: Hand, now: number): void {
    this.handFlashAt[side] = now;
  }

  /** Read-only snapshot helpers for the HUD. */
  airborneCount(): number {
    let n = 0;
    for (const b of this.balls.values()) if (b.state === 'flying') n++;
    return n;
  }
}
