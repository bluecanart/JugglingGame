import { Game } from './game.ts';
import { Renderer, floorY, uiScale } from './renderer.ts';
import { InputController } from './input.ts';
import { closestHeight } from './physics.ts';
import type { PaletteKey } from './types.ts';

// --- DOM refs ----------------------------------------------------------------
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const ballCountSelect = document.getElementById('ball-count') as HTMLSelectElement;
const speedSelect = document.getElementById('speed') as HTMLSelectElement;
const paletteSelect = document.getElementById('palette') as HTMLSelectElement;
const lastThrowEl = document.getElementById('last-throw')!;
const airborneEl = document.getElementById('airborne')!;
const leftCountEl = document.getElementById('left-count')!;
const rightCountEl = document.getElementById('right-count')!;

// --- Canvas sizing (HiDPI-aware) --------------------------------------------
let cssW = 0;
let cssH = 0;
let dpr = window.devicePixelRatio || 1;

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  cssW = rect.width;
  cssH = rect.height;
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Update hand anchor positions to follow the new canvas size.
  game.setAnchors(computeAnchors());
}

function computeAnchors() {
  // Hands are at ~70% down the canvas, separated by a comfortable distance.
  // The wider the canvas, the further apart the hands — but capped so high
  // throws still look right.
  const handGap = Math.min(360, Math.max(220, cssW * 0.32));
  const cx = cssW / 2;
  const scale = uiScale(cssW);
  // Match the renderer's hardcoded sizes so the game agrees on layout.
  const palmHalfWidth = 45 * scale; // renderer: palm w = 90 * scale
  const ballRadius = 14 * scale; //   renderer: ball r = 14 * scale
  return {
    leftX: cx - handGap / 2,
    rightX: cx + handGap / 2,
    y: cssH * 0.72,
    palmHalfWidth,
    ballRadius,
  };
}

// --- Game ---
const game = new Game(
  // Will be overwritten by the first resize() call below.
  { leftX: 0, rightX: 0, y: 0, palmHalfWidth: 0, ballRadius: 0 },
  {
    ballCount: parseInt(ballCountSelect.value, 10),
    palette: paletteSelect.value as PaletteKey,
  },
);

const renderer = new Renderer(ctx, () => ({ w: cssW, h: cssH, dpr }));

// --- Input ---
const input = new InputController(
  {
    onThrow: (hand, value, source) => {
      // Map click x to a launch position within the hand:
      //   click at canvas center → -1 (inner edge)
      //   click at canvas edge   → +1 (outer edge)
      // Keyboard throws (no click) stay at 0 (hand center).
      let widthFactor = 0;
      if (source) {
        const cx = cssW / 2;
        const tDist = cx > 0 ? Math.min(1, Math.abs(source.clickX - cx) / cx) : 0;
        widthFactor = 2 * tDist - 1;
      }
      game.throwBall(hand, value, performance.now(), widthFactor);
    },
    onReset: () => {
      game.reset({ ballCount: parseInt(ballCountSelect.value, 10) });
    },
    onHandActivate: (hand) => {
      game.flashHand(hand, performance.now());
    },
  },
  parseInt(ballCountSelect.value, 10),
);
input.attach(window);
input.attachPointer(
  canvas,
  (x) => (x < cssW / 2 ? 'L' : 'R'),
  // Clicks at or below the floor line (the shaded ground zone under the hands)
  // keep the current selected height instead of snapping to 1.
  (y) => (y >= floorY(game.anchors.y, cssW) ? null : closestHeight(y, game.anchors.y)),
);

ballCountSelect.addEventListener('change', () => {
  const count = parseInt(ballCountSelect.value, 10);
  game.reset({ ballCount: count });
  input.setSelectedHeight(count);
  // Blur so subsequent key presses go to the window listener, not the select.
  ballCountSelect.blur();
});

game.setSpeed(parseFloat(speedSelect.value));
speedSelect.addEventListener('change', () => {
  game.setSpeed(parseFloat(speedSelect.value));
  speedSelect.blur();
});

paletteSelect.addEventListener('change', () => {
  game.setPalette(paletteSelect.value as PaletteKey);
  paletteSelect.blur();
});

// --- HUD updates -------------------------------------------------------------
function updateHud(): void {
  if (game.lastThrow) {
    lastThrowEl.textContent = `${game.lastThrow.value} ${game.lastThrow.fromHand === 'L' ? '←' : '→'}`;
  }
  airborneEl.textContent = String(game.airborneCount());
  leftCountEl.textContent = String(game.hands.L.balls.length);
  rightCountEl.textContent = String(game.hands.R.balls.length);
}

// --- Main loop ---------------------------------------------------------------
function frame(now: number): void {
  game.update(now);
  renderer.draw(game, now, input.getSelectedHeight());
  updateHud();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
