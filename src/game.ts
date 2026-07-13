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
  /** Half the visible palm width in canvas px. Used by the renderer to draw
   *  the palm and by `throwBall` to offset throws within the hand based on
   *  the click position. */
  palmHalfWidth: number;
  /** Visible ball radius in canvas px. Mirrors the renderer's ball size so
   *  `throwBall` can express height nudges in "ball-height" units. */
  ballRadius: number;
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

  /** When false, a `2` is treated as a 2-beat hold: the ball stays in the hand
   *  with no throw animation, rather than a small toss. */
  private activeTwos = true;

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
   *
   * `widthFactor` ∈ [-1, 1] picks the launch point within the source hand's
   * width: `-1` = inner edge (toward the canvas center), `0` = center,
   * `+1` = outer edge (toward the canvas edge). The destination is always
   * the center of the catching hand, so balls converge cleanly regardless of
   * where in the source hand they were launched from.
   *
   * `crossOverride` forces the destination hand instead of deriving it from
   * the value's parity. Sequence mode uses this for synchronous `x` throws
   * (e.g. `2x`), where an even value still crosses to the other hand. When
   * omitted, the standard parity rule applies (odd crosses, even stays).
   *
   * Returns true if a throw happened, false if the hand was empty.
   */
  throwBall(
    fromHand: Hand,
    value: number,
    now: number,
    widthFactor = 0,
    crossOverride?: boolean,
  ): boolean {
    const hand = this.hands[fromHand];
    if (hand.balls.length === 0 || value <= 0) return false;

    const toHand =
      crossOverride === undefined
        ? destinationHand(fromHand, value)
        : crossOverride
          ? fromHand === 'L'
            ? 'R'
            : 'L'
          : fromHand;

    // A same-hand `2` with active-2s off is a hold: the ball stays put, no
    // flight. Cross-hand 2s (`2x`) are genuine passes, so they always animate.
    if (value === 2 && !this.activeTwos && toHand === fromHand) {
      this.lastThrow = { value, fromHand };
      return true;
    }

    const ballId = hand.balls.pop()!;
    const ball = this.balls.get(ballId)!;
    const air = (airTimeSeconds(value) * 1000) / this.speed;
    // Outer throws peak ~half a ball-height higher than a center throw,
    // inner throws ~half a ball-height lower (one radius is half a ball
    // diameter). Linear in widthFactor.
    const peak =
      peakHeightPx(value, this.anchors.y) + widthFactor * this.anchors.ballRadius;

    // For the source hand, "outer" runs away from the canvas center: -x for
    // the left hand, +x for the right. Apply the factor only to startX so
    // the ball always lands at the destination hand's center.
    const halfW = this.anchors.palmHalfWidth;
    const sourceOutwardSign = fromHand === 'L' ? -1 : 1;
    const startX =
      (fromHand === 'L' ? this.anchors.leftX : this.anchors.rightX) +
      sourceOutwardSign * widthFactor * halfW;
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
   * Instantly move the top ball of `fromHand` into the other hand (no arc).
   * Used by Sequence mode's click-to-transfer so the user can nudge balls
   * between hands to set up or unstick a pattern. Returns true if a ball moved.
   */
  handOff(fromHand: Hand): boolean {
    const from = this.hands[fromHand];
    if (from.balls.length === 0) return false;

    const toHand: Hand = fromHand === 'L' ? 'R' : 'L';
    const ballId = from.balls.pop()!;
    const ball = this.balls.get(ballId)!;
    ball.state = 'held';
    ball.hand = toHand;
    ball.throw = undefined;
    this.hands[toHand].balls.push(ballId);
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

  /** Current throw-time multiplier. Sequence mode reads this so its beat
   *  spacing tracks the visual speed. */
  getSpeed(): number {
    return this.speed;
  }

  /** Toggle whether a `2` animates a small toss (true) or is a 2-beat hold
   *  (false). */
  setActiveTwos(active: boolean): void {
    this.activeTwos = active;
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
