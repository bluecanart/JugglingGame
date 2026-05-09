/**
 * Siteswap physics.
 *
 * Reference: http://www.juggling.org/help/siteswap/ssintro/ (Technical Note 2)
 *
 * Given:
 *   - dwell time D in beats (typical ~0.7)
 *   - beat time T in seconds
 *   - siteswap value V
 *
 * Air time (sec):    Z = (V - 2D) * T
 * Peak height (m):   H = G * Z^2 / 8     (from kinematics: half the air time going up under gravity G)
 *
 * The "in beats" formulation also tells us where the ball lands:
 *   - odd value -> swaps hand (cascade-style)
 *   - even value -> same hand (fountain-style)
 *
 * In this game we use a single tunable BEAT_TIME so heights still have the
 * proper non-linear ratios from the article. We also use *world units* (pixels)
 * rather than metres; the gravity constant is just a scaling factor we tune
 * to look good on the canvas.
 */

/** Beat duration in seconds. Tuning knob: smaller = snappier juggling. */
export const BEAT_TIME = 0.42;

/** Dwell time in beats. ~0.7 is the article's "typical" value. */
export const DWELL = 0.7;

/**
 * Pixel "gravity". Sets the *relative* heights between siteswap values; the
 * absolute size is mapped to the available canvas headroom in `peakHeightPx()`.
 * We keep the air-time formula faithful (so timing feels right) and apply a
 * sqrt compression to the visual peak so 1..9 fit on screen while preserving
 * the non-linear "diminishing returns" feel of real juggling.
 */
export const GRAVITY_PX = 1800;

/**
 * Pixels of breathing room above the highest peak. Big enough to clear the
 * ball radius and its outline so a `9` reaches near — but doesn't clip — the
 * top of the canvas.
 */
export const TOP_MARGIN_PX = 30;

/**
 * Returns whether a siteswap value crosses to the other hand.
 * Odd -> crosses, even -> stays.
 */
export function crossesHands(value: number): boolean {
  return value % 2 === 1;
}

/**
 * Air time in seconds for a given siteswap value.
 * Clamped to a sensible minimum so a `1` (handoff) still has visible motion.
 */
export function airTimeSeconds(value: number): number {
  const z = (value - 2 * DWELL) * BEAT_TIME;
  return Math.max(z, 0.12);
}

/**
 * Peak height in pixels for a given siteswap value, calibrated so a `9` peaks
 * `TOP_MARGIN_PX` below the top of the available headroom. Smaller values
 * scale by the same sqrt-compressed kinematic formula
 * (compressed = sqrt(G * Z² / 8)) so ordering and the non-linear feel are
 * preserved across canvas sizes.
 *
 * `headroom` is the pixel distance from the top of the canvas to the hand —
 * i.e. all the vertical space the throw can use.
 */
export function peakHeightPx(value: number, headroom: number): number {
  const targetMax = Math.max(headroom - TOP_MARGIN_PX, 100);
  const compressed9 = Math.sqrt((GRAVITY_PX * airTimeSeconds(9) ** 2) / 8);
  const scale = targetMax / compressed9;

  const compressed = Math.sqrt((GRAVITY_PX * airTimeSeconds(value) ** 2) / 8);
  return Math.min(compressed * scale, targetMax);
}

/**
 * Convenience: returns the destination hand for a throw of `value` from `fromHand`.
 */
export function destinationHand(fromHand: 'L' | 'R', value: number): 'L' | 'R' {
  if (!crossesHands(value)) return fromHand;
  return fromHand === 'L' ? 'R' : 'L';
}

/**
 * Canvas y-coordinate where the peak of a `value` throw sits, given the hand
 * anchor y. Used both for drawing the side height indicators and for matching
 * a click's y to the closest indicator.
 */
export function heightIndicatorY(value: number, anchorY: number): number {
  return anchorY - peakHeightPx(value, anchorY);
}

/**
 * Picks the siteswap value 1..9 whose indicator y is closest to `clickY`.
 * Clicks above the topmost indicator snap to 9; clicks below the lowest snap
 * to 1, so any click anywhere on the canvas resolves to a height.
 */
export function closestHeight(clickY: number, anchorY: number): number {
  let best = 1;
  let bestDist = Infinity;
  for (let v = 1; v <= 9; v++) {
    const dist = Math.abs(clickY - heightIndicatorY(v, anchorY));
    if (dist < bestDist) {
      bestDist = dist;
      best = v;
    }
  }
  return best;
}

/**
 * Position along a parabolic arc from (x0, y0) to (x1, y1) with a given peak height
 * above the *higher* of the two endpoints. `t` is normalised 0..1.
 *
 * Canvas coordinates: y grows downward, so "up" means subtracting from y.
 */
export function arcPosition(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  peakHeight: number,
  t: number,
): { x: number; y: number } {
  const x = x0 + (x1 - x0) * t;
  // Linear interpolation between endpoints + a downward-pointing parabola
  // 4t(1-t) is 0 at the ends and 1 at t=0.5.
  const baseY = y0 + (y1 - y0) * t;
  const arc = 4 * t * (1 - t) * peakHeight;
  return { x, y: baseY - arc };
}
