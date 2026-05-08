import { Game } from './game.ts';
import { Renderer } from './renderer.ts';
import { InputController } from './input.ts';

// --- DOM refs ----------------------------------------------------------------
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const ballCountSelect = document.getElementById('ball-count') as HTMLSelectElement;
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
  { ballCount: parseInt(ballCountSelect.value, 10) },
);

const renderer = new Renderer(ctx, () => ({ w: cssW, h: cssH, dpr }));

// --- Input ---
const input = new InputController({
  onThrow: (hand, value) => {
    game.throwBall(hand, value, performance.now());
  },
  onReset: () => {
    game.reset({ ballCount: parseInt(ballCountSelect.value, 10) });
  },
});
input.attach(window);
input.attachPointer(canvas, (x, y) => {
  // Generous hit box around the visible palm + forearm so a casual click
  // anywhere on the hand region registers. See renderer.drawHand for the
  // visible geometry: palm centred at (handX, anchors.y + 31), forearm
  // extending below to roughly y + 118.
  const a = game.anchors;
  const halfW = 60;
  const top = a.y - 4;
  const bottom = a.y + 120;
  if (y < top || y > bottom) return null;
  if (Math.abs(x - a.leftX) <= halfW) return 'L';
  if (Math.abs(x - a.rightX) <= halfW) return 'R';
  return null;
});

ballCountSelect.addEventListener('change', () => {
  game.reset({ ballCount: parseInt(ballCountSelect.value, 10) });
  // Blur so subsequent key presses go to the window listener, not the select.
  ballCountSelect.blur();
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
  renderer.draw(game, now);
  updateHud();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
