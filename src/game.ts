import type { Ball, GameConfig, Hand, HandState, ThrowRecord } from './types.ts';
import { airTimeSeconds, destinationHand, peakHeightPx } from './physics.ts';

/**
 * A pleasant, varied palette. Cycled through as balls are spawned.
 * Picked for high contrast on the warm canvas background.
 */
const BALL_PALETTE = [
  '#E63946', // tomato
  '#F4A261', // marigold
  '#E9C46A', // mustard
  '#2A9D8F', // teal
  '#264653', // deep slate
  '#8E7DBE', // lavender
  '#D7263D', // crimson
  '#1B998B', // jade
  '#FF7F50', // coral
];

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
      color: BALL_PALETTE[(id - 1) % BALL_PALETTE.length],
      state: 'held',
      hand,
    };
    this.balls.set(id, ball);
    this.hands[hand].balls.push(id);
    return ball;
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
    const air = airTimeSeconds(value) * 1000;
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

  /** Read-only snapshot helpers for the HUD. */
  airborneCount(): number {
    let n = 0;
    for (const b of this.balls.values()) if (b.state === 'flying') n++;
    return n;
  }
}
