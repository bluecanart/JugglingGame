import type { Hand } from './types.ts';

/**
 * Keyboard controller.
 *
 * Pattern: hold a number 1-9, then press an arrow key (Left or Right) to throw
 * from that hand at the given height. Order doesn't strictly matter — pressing
 * the arrow first and then a digit also works as long as both are held within
 * a small window. We also allow the simpler "press digit first, then arrow"
 * which feels most natural.
 *
 * The `R` key resets via callback.
 */
export interface InputCallbacks {
  onThrow: (hand: Hand, value: number) => void;
  onReset: () => void;
}

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
