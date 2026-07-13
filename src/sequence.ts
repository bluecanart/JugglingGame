import type { Game } from './game.ts';
import type { Hand } from './types.ts';
import { BEAT_TIME } from './physics.ts';

/**
 * Sequence mode — plays a siteswap pattern automatically.
 *
 * There is always a "queued hand": the hand that throws next. It alternates
 * on every beat and the on-canvas indicator points at it.
 *
 * Supported notation (see https://en.wikipedia.org/wiki/Siteswap):
 *   - Standard async: `531`, `3`, `441` — one throw per beat, hands alternate.
 *     Odd values cross to the other hand, even values stay. `0` is an empty
 *     beat (a gap where the hand throws nothing).
 *   - Multiplex `[...]`: two (or more) balls thrown from the same hand on one
 *     beat, e.g. `[43]`. Each ball crosses by its own value's parity.
 *   - Synchronous `(a,b)`: both hands throw on the same beat. The FIRST value
 *     is the queued hand, the SECOND is the other hand. An `x` suffix makes a
 *     throw cross to the other hand (e.g. `4x`, `2x`). Either side may itself
 *     be a multiplex, e.g. `([44],4)` or `(4,[53])`. A `0` means that hand
 *     rests. Because
 *     the queued hand alternates each beat, a lone `(4,2x)` mirrors itself as
 *     it loops (the classic box) with no extra notation.
 *
 * The player throws the next event roughly one beat after the previous one
 * (sync groups take two beats, matching convention). If a required hand is
 * momentarily empty it waits for a ball to land, then fires. If it can never
 * succeed — nothing is airborne and the hand is still empty — it auto-pauses.
 * Reaching the end loops back to the start.
 */

/** A single ball leaving a hand. `crosses` is only set for synchronous
 *  throws, where an `x` suffix (not the value's parity) decides crossing. */
interface ThrowSpec {
  value: number;
  crosses?: boolean;
}

/**
 * One beat of the pattern.
 *   - `async`: the queued hand throws `throws` (length > 1 = multiplex).
 *   - `sync`: both hands throw at once. `a` is the queued hand's throw(s),
 *     `b` the other hand's.
 * Which physical hand is "queued" is decided at play time by a running toggle
 * that persists across the loop seam, so odd-period patterns (`3`, `531`) and
 * self-mirroring sync patterns (`(4,2x)`) alternate correctly.
 */
type SequenceEvent =
  | { kind: 'async'; throws: ThrowSpec[] }
  | { kind: 'sync'; a: ThrowSpec[]; b: ThrowSpec[] };

export type ParseResult =
  | { ok: true; events: SequenceEvent[] }
  | { ok: false; error: string };

const other = (h: Hand): Hand => (h === 'L' ? 'R' : 'L');

function valueOf(c: string): number | null {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  return null;
}

/**
 * Parse a siteswap string into a flat list of beat events. Returns either
 * `{ ok: true, events }` or `{ ok: false, error }` with a readable message.
 */
export function parseSiteswap(input: string): ParseResult {
  const s = input.replace(/\s+/g, '');
  if (s.length === 0) return { ok: false, error: 'Enter a pattern, e.g. 531 or (4,4)' };

  const events: SequenceEvent[] = [];
  let i = 0;

  // Reads a sequence of `value[x]` throws terminated by one of `stops`.
  // Used for both multiplex bodies and the two halves of a sync group.
  // `allowX` enables the crossing suffix (synchronous context only).
  const readThrows = (stops: string, allowX: boolean): ThrowSpec[] | string => {
    const throws: ThrowSpec[] = [];
    while (i < s.length && !stops.includes(s[i])) {
      const v = valueOf(s[i]);
      if (v === null) return `Unexpected character '${s[i]}'`;
      i++;
      let crosses = false;
      if (allowX && i < s.length && s[i] === 'x') {
        crosses = true;
        i++;
      }
      // 0 = no ball for this slot; skip it but keep scanning.
      if (v > 0) throws.push(allowX ? { value: v, crosses } : { value: v });
    }
    return throws;
  };

  // One hand's action inside a sync group: either a bracketed multiplex
  // `[..]` (each ball may carry its own `x`) or a single `value[x]`. Ends at
  // the group's ',' or ')'.
  const readSyncSide = (): ThrowSpec[] | string => {
    if (i < s.length && s[i] === '[') {
      i++;
      const throws = readThrows(']', true);
      if (typeof throws === 'string') return throws;
      if (s[i] !== ']') return 'Unclosed [ in multiplex throw';
      i++;
      return throws;
    }
    return readThrows(',)', true);
  };

  while (i < s.length) {
    const c = s[i];

    if (c === '(') {
      // Synchronous group: (queuedHandAction , otherHandAction), where each
      // action may itself be a multiplex, e.g. ([44]2x,4) or (4,[53]).
      i++;
      const a = readSyncSide();
      if (typeof a === 'string') return { ok: false, error: a };
      if (s[i] !== ',') return { ok: false, error: 'Synchronous throw needs a comma, e.g. (4,4)' };
      i++;
      const b = readSyncSide();
      if (typeof b === 'string') return { ok: false, error: b };
      if (s[i] !== ')') return { ok: false, error: 'Unclosed ( in synchronous throw' };
      i++;
      events.push({ kind: 'sync', a, b });
    } else if (c === '[') {
      // Async multiplex: several balls from the queued hand this beat.
      i++;
      const throws = readThrows(']', false);
      if (typeof throws === 'string') return { ok: false, error: throws };
      if (s[i] !== ']') return { ok: false, error: 'Unclosed [ in multiplex throw' };
      i++;
      events.push({ kind: 'async', throws });
    } else {
      const v = valueOf(c);
      if (v === null) return { ok: false, error: `Unexpected character '${c}'` };
      i++;
      events.push({ kind: 'async', throws: v > 0 ? [{ value: v }] : [] });
    }
  }

  if (events.length === 0) return { ok: false, error: 'Enter a pattern, e.g. 531 or (4,4)' };

  return { ok: true, events };
}

/** How many balls an event needs from each hand to fire, given which physical
 *  hand is currently queued. */
function demand(ev: SequenceEvent, queued: Hand): { L: number; R: number } {
  const counts = { L: 0, R: 0 };
  if (ev.kind === 'async') {
    counts[queued] = ev.throws.length;
  } else {
    counts[queued] = ev.a.length;
    counts[other(queued)] = ev.b.length;
  }
  return counts;
}

export class Sequencer {
  private events: SequenceEvent[] = [];
  private index = 0;
  private playing = false;
  /** Physical hand that throws next. Toggles every beat and persists across
   *  the loop seam so alternation never breaks. Right throws first (it holds
   *  the surplus ball for odd counts, matching Game.reset()). */
  private queuedHand: Hand = 'R';
  /** Timestamp (ms) at which the current event is allowed to fire. */
  private nextTime = 0;
  /** Human-readable status for the UI (errors, "out of balls", etc.). */
  status = '';

  constructor(private game: Game) {}

  /** Parse and load a pattern. Returns an error string, or null on success.
   *  Resets playback position but does not change the balls in play. */
  load(pattern: string): string | null {
    const result = parseSiteswap(pattern);
    if (!result.ok) {
      this.status = result.error;
      return result.error;
    }
    this.events = result.events;
    this.reset();
    this.status = '';
    return null;
  }

  /** Rewind to the start of the pattern without discarding it. */
  reset(): void {
    this.index = 0;
    this.queuedHand = 'R';
    this.playing = false;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  /** The hand that will throw next — used to draw the on-canvas indicator. */
  getQueuedHand(): Hand {
    return this.queuedHand;
  }

  play(now: number): void {
    if (this.events.length === 0) return;
    this.playing = true;
    this.status = '';
    this.nextTime = now;
  }

  pause(): void {
    this.playing = false;
  }

  /** One beat, in ms, scaled to match the current visual speed. */
  private beatMs(): number {
    return (BEAT_TIME * 1000) / this.game.getSpeed();
  }

  /** Advance the player. Call every frame, after game.update(). */
  tick(now: number): void {
    if (!this.playing || this.events.length === 0) return;
    if (now < this.nextTime) return;

    const ev = this.events[this.index];
    const need = demand(ev, this.queuedHand);
    const canFire =
      this.game.hands.L.balls.length >= need.L &&
      this.game.hands.R.balls.length >= need.R;

    if (!canFire) {
      // A hand is short. If any ball is still airborne it may land here soon,
      // so keep waiting. If nothing is airborne, the pattern can never proceed
      // — pause once everything has settled, per spec.
      if (this.game.airborneCount() === 0) {
        this.playing = false;
        this.status = 'paused — not enough balls for the next throw';
      }
      return;
    }

    const beats = this.execute(ev, now);
    this.index = (this.index + 1) % this.events.length;
    // Alternate the queued hand only on a real throw so stalls never desync it.
    this.queuedHand = other(this.queuedHand);
    this.nextTime = now + beats * this.beatMs();
  }

  /** Fire every throw in an event. Returns the beat cost until the next one. */
  private execute(ev: SequenceEvent, now: number): number {
    if (ev.kind === 'async') {
      this.throwGroup(this.queuedHand, ev.throws, now);
      return 1;
    }
    this.throwGroup(this.queuedHand, ev.a, now);
    this.throwGroup(other(this.queuedHand), ev.b, now);
    // Synchronous groups occupy two beats before the next event.
    return 2;
  }

  /** Throw one hand's balls, spreading multiplex launch points so they fan
   *  out visibly instead of stacking. */
  private throwGroup(hand: Hand, throws: ThrowSpec[], now: number): void {
    const n = throws.length;
    throws.forEach((t, k) => {
      const wf = n <= 1 ? 0 : -0.6 + (1.2 * k) / (n - 1);
      this.game.throwBall(hand, t.value, now, wf, t.crosses);
    });
  }
}
