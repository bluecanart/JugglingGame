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
 * Pixel "gravity". With BEAT_TIME=0.42 and DWELL=0.7 the *true* physics formula
 * H = G*Z²/8 produces a ratio of ~30:1 between value 9 and value 3, which pushes
 * a `9` clean off the top of any reasonably-sized canvas while making a `3` a
 * tiny pebble. We keep the air-time formula faithful (so timing feels right)
 * but apply a gentle non-linear compression to the *visual* peak height in
 * `peakHeightPx()` so 1..9 all fit on a typical screen while preserving the
 * ordering and the "low-vs-high" feel.
 */
export const GRAVITY_PX = 1800;

/**
 * Cap on the visual peak height (pixels above the hand). The compression below
 * is calibrated so a `9` lands near this value.
 */
export const MAX_PEAK_PX = 420;

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
 * Peak height in pixels for a given siteswap value.
 *
 * Derivation: H_true = G * Z^2 / 8. We then apply a sqrt compression so the
 * dynamic range fits the screen. The result preserves ordering (higher value
 * = higher peak) and the non-linear "diminishing returns" feel, but caps out
 * around MAX_PEAK_PX for a `9`.
 */
export function peakHeightPx(value: number): number {
  const z = airTimeSeconds(value);
  const trueH = (GRAVITY_PX * z * z) / 8;
  // Compress: sqrt keeps small values visible while taming large ones.
  // Tuned constant scales the result so a `9` lands near MAX_PEAK_PX.
  const compressed = Math.sqrt(trueH) * 9.5;
  return Math.min(compressed, MAX_PEAK_PX);
}

/**
 * Convenience: returns the destination hand for a throw of `value` from `fromHand`.
 */
export function destinationHand(fromHand: 'L' | 'R', value: number): 'L' | 'R' {
  if (!crossesHands(value)) return fromHand;
  return fromHand === 'L' ? 'R' : 'L';
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
