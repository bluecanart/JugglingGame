import type { Hand } from './types.ts';

/**
 * Input controller — keyboard and pointer.
 *
 * The controller owns a single "selected throw height" 1-9 that persists
 * across throws. Pressing a digit updates it. Arrow keys (Left/Right) and
 * clicks on a hand both throw using the currently selected height.
 *
 * `R` resets.
 */
export interface InputCallbacks {
  /** `source.clickX` is the canvas-local x for click-driven throws (used by
   *  the wiring layer to pick a launch point within the hand). Keyboard
   *  throws omit it. */
  onThrow: (hand: Hand, value: number, source?: { clickX: number }) => void;
  onReset: () => void;
  /** Fired whenever a hand is picked (click or arrow key) before the throw,
   *  so the UI can flash the picked hand even if it's empty and no throw
   *  actually happens. */
  onHandActivate?: (hand: Hand) => void;
}

/** Hit-test function: maps canvas-local coords to a hand, or null if neither. */
export type HandHitTest = (x: number, y: number) => Hand | null;

export class InputController {
  private selectedHeight: number;

  constructor(
    private cb: InputCallbacks,
    initialHeight: number,
  ) {
    this.selectedHeight = initialHeight;
  }

  getSelectedHeight(): number {
    return this.selectedHeight;
  }

  setSelectedHeight(value: number): void {
    this.selectedHeight = value;
  }

  attach(target: Window | HTMLElement = window): () => void {
    const onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    target.addEventListener('keydown', onKeyDown as EventListener);
    return () => {
      target.removeEventListener('keydown', onKeyDown as EventListener);
    };
  }

  /**
   * Wire up click-to-throw on a canvas. `hitTest` is called with canvas-local
   * (CSS pixel) coordinates and should return which hand was hit, if any.
   * `resolveHeight` (optional) maps a click's y to a siteswap value 1..9 by
   * matching against the side height indicators — return `null` to leave the
   * selected height unchanged (e.g. for clicks below the hands). Also sets
   * `cursor: pointer` while the pointer is over a hand.
   */
  attachPointer(
    canvas: HTMLCanvasElement,
    hitTest: HandHitTest,
    resolveHeight?: (y: number) => number | null,
  ): () => void {
    const localCoords = (e: MouseEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onClick = (e: MouseEvent) => {
      const { x, y } = localCoords(e);
      const hand = hitTest(x, y);
      if (!hand) return;
      if (resolveHeight) {
        const h = resolveHeight(y);
        if (h !== null) this.selectedHeight = h;
      }
      this.cb.onHandActivate?.(hand);
      this.cb.onThrow(hand, this.selectedHeight, { clickX: x });
      e.preventDefault();
    };

    const onMove = (e: MouseEvent) => {
      const { x, y } = localCoords(e);
      canvas.style.cursor = hitTest(x, y) ? 'pointer' : 'default';
    };

    const onLeave = () => {
      canvas.style.cursor = 'default';
    };

    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    return () => {
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Don't capture keys when the user is interacting with the <select>.
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'SELECT' || target.tagName === 'INPUT')) return;

    if (e.key >= '1' && e.key <= '9') {
      this.selectedHeight = parseInt(e.key, 10);
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const hand: Hand = e.key === 'ArrowLeft' ? 'L' : 'R';
      this.cb.onHandActivate?.(hand);
      this.cb.onThrow(hand, this.selectedHeight);
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const delta = e.key === 'ArrowUp' ? 1 : -1;
      this.selectedHeight = Math.max(1, Math.min(9, this.selectedHeight + delta));
      e.preventDefault();
      return;
    }

    if (e.key === 'r' || e.key === 'R') {
      this.cb.onReset();
    }
  }

}
