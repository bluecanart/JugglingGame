import type { Hand } from './types.ts';

/**
 * Input controller — keyboard and pointer.
 *
 * Keyboard: hold a number 1-9, then press an arrow key (Left or Right) to
 * throw from that hand at the given height. Pressing the arrow first and
 * then a digit also works as long as both are held within a small window.
 * `R` resets.
 *
 * Pointer: clicking a hand is equivalent to pressing the corresponding
 * arrow key — a digit must be held for the click to register.
 */
export interface InputCallbacks {
  onThrow: (hand: Hand, value: number) => void;
  onReset: () => void;
}

/** Hit-test function: maps canvas-local coords to a hand, or null if neither. */
export type HandHitTest = (x: number, y: number) => Hand | null;

export class InputController {
  private heldDigit: number | null = null;

  constructor(private cb: InputCallbacks) {}

  attach(target: Window | HTMLElement = window): () => void {
    const onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    const onKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);
    target.addEventListener('keydown', onKeyDown as EventListener);
    target.addEventListener('keyup', onKeyUp as EventListener);
    return () => {
      target.removeEventListener('keydown', onKeyDown as EventListener);
      target.removeEventListener('keyup', onKeyUp as EventListener);
    };
  }

  /**
   * Wire up click-to-throw on a canvas. `hitTest` is called with canvas-local
   * (CSS pixel) coordinates and should return which hand was hit, if any.
   * Also sets `cursor: pointer` while the pointer is over a hand.
   */
  attachPointer(canvas: HTMLCanvasElement, hitTest: HandHitTest): () => void {
    const localCoords = (e: MouseEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onClick = (e: MouseEvent) => {
      if (this.heldDigit === null) return;
      const { x, y } = localCoords(e);
      const hand = hitTest(x, y);
      if (!hand) return;
      this.cb.onThrow(hand, this.heldDigit);
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
      this.heldDigit = parseInt(e.key, 10);
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const hand: Hand = e.key === 'ArrowLeft' ? 'L' : 'R';
      if (this.heldDigit !== null) {
        this.cb.onThrow(hand, this.heldDigit);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'r' || e.key === 'R') {
      this.cb.onReset();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (e.key >= '1' && e.key <= '9') {
      const released = parseInt(e.key, 10);
      if (this.heldDigit === released) this.heldDigit = null;
    }
  }
}
