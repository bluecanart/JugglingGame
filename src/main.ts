import { Game } from './game.ts';
import { Renderer } from './renderer.ts';
import { InputController } from './input.ts';
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
  return {
    leftX: cx - handGap / 2,
    rightX: cx + handGap / 2,
    y: cssH * 0.72,
  };
}

// --- Game ---
const game = new Game(
  { leftX: 0, rightX: 0, y: 0 }, // will be overwritten by resize() below
  {
    ballCount: parseInt(ballCountSelect.value, 10),
    palette: paletteSelect.value as PaletteKey,
  },
);

const renderer = new Renderer(ctx, () => ({ w: cssW, h: cssH, dpr }));

// --- Input ---
const input = new InputController(
  {
    onThrow: (hand, value) => {
      game.throwBall(hand, value, performance.now());
    },
    onReset: () => {
      game.reset({ ballCount: parseInt(ballCountSelect.value, 10) });
    },
  },
  parseInt(ballCountSelect.value, 10),
);
input.attach(window);
input.attachPointer(canvas, (x) => {
  return x < cssW / 2 ? 'L' : 'R';
});

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
