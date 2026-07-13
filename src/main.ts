import { Game } from './game.ts';
import { Renderer, floorY, uiScale } from './renderer.ts';
import { InputController } from './input.ts';
import { closestHeight } from './physics.ts';
import { Sequencer } from './sequence.ts';
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
const modeToggle = document.getElementById('mode-toggle')!;
const activeTwosToggle = document.getElementById('active-twos')!;
const sequenceBar = document.getElementById('sequence-bar') as HTMLElement;
const patternInput = document.getElementById('pattern') as HTMLInputElement;
const playBtn = document.getElementById('seq-play') as HTMLButtonElement;
const resetBtn = document.getElementById('seq-reset') as HTMLButtonElement;
const seqStatus = document.getElementById('seq-status')!;
const legendManual = document.getElementById('legend-manual') as HTMLElement;
const legendSequence = document.getElementById('legend-sequence') as HTMLElement;

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

let currentMode: 'manual' | 'sequence' = 'manual';

// --- Input ---
const input = new InputController(
  {
    onThrow: (hand, value, source) => {
      // In Sequence mode a click on a hand isn't a throw — it instantly passes
      // a ball to the other hand, letting the user nudge balls around to set up
      // or unstick a pattern. Keyboard throws still throw.
      if (currentMode === 'sequence' && source) {
        game.handOff(hand);
        return;
      }
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
    onReset: () => resetJuggle(),
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
  // keep the current selected height instead of snapping to 1. In Sequence
  // mode clicks pass balls rather than throw, so never change the height.
  (y) =>
    currentMode === 'sequence' || y >= floorY(game.anchors.y, cssW)
      ? null
      : closestHeight(y, game.anchors.y),
);

ballCountSelect.addEventListener('change', () => {
  const count = parseInt(ballCountSelect.value, 10);
  game.reset({ ballCount: count });
  input.setSelectedHeight(count);
  sequencer.reset();
  setPlayButton(false);
  seqStatus.textContent = '';
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

// --- Sequence mode -----------------------------------------------------------
const sequencer = new Sequencer(game);

function setPlayButton(playing: boolean): void {
  playBtn.textContent = playing ? '❚❚ Pause' : '▶ Play';
  playBtn.classList.toggle('playing', playing);
  playBtn.setAttribute('aria-label', playing ? 'Pause sequence' : 'Play sequence');
}

// Restore the balls to their starting layout and rewind the pattern. Shared by
// the Reset button and the `R` key.
function resetJuggle(): void {
  game.reset({ ballCount: parseInt(ballCountSelect.value, 10) });
  sequencer.reset();
  setPlayButton(false);
  seqStatus.textContent = '';
}

resetBtn.addEventListener('click', () => {
  resetJuggle();
  resetBtn.blur();
});

function startSequence(): void {
  const error = sequencer.load(patternInput.value);
  if (error) {
    seqStatus.textContent = error;
    return;
  }
  seqStatus.textContent = '';
  sequencer.play(performance.now());
  setPlayButton(true);
}

playBtn.addEventListener('click', () => {
  if (sequencer.isPlaying()) {
    sequencer.pause();
    setPlayButton(false);
  } else {
    startSequence();
  }
});

// Re-parse as the user types so errors surface immediately; if a valid pattern
// is edited mid-play, restart it from the top of the new pattern.
patternInput.addEventListener('input', () => {
  const wasPlaying = sequencer.isPlaying();
  const error = sequencer.load(patternInput.value);
  seqStatus.textContent = error ?? '';
  if (wasPlaying && !error) sequencer.play(performance.now());
  setPlayButton(sequencer.isPlaying());
});

// Enter in the box toggles play/pause.
patternInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    playBtn.click();
  }
});

function setMode(mode: 'manual' | 'sequence'): void {
  currentMode = mode;
  const sequence = mode === 'sequence';
  sequenceBar.hidden = !sequence;
  legendManual.hidden = sequence;
  legendSequence.hidden = !sequence;
  modeToggle.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.mode === mode);
  });
  if (!sequence) {
    sequencer.pause();
    setPlayButton(false);
  }
}

modeToggle.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', () => {
    setMode((b as HTMLElement).dataset.mode as 'manual' | 'sequence');
    (b as HTMLElement).blur();
  });
});

const activeTwosButtons = activeTwosToggle.querySelectorAll('button');
activeTwosButtons.forEach((b) => {
  b.addEventListener('click', () => {
    const on = (b as HTMLElement).dataset.on === 'true';
    game.setActiveTwos(on);
    activeTwosButtons.forEach((x) => x.classList.toggle('active', x === b));
    (b as HTMLElement).blur();
  });
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
  const wasPlaying = sequencer.isPlaying();
  sequencer.tick(now);
  // The sequencer can auto-pause itself (out of balls) — keep the UI in sync.
  if (wasPlaying && !sequencer.isPlaying()) {
    setPlayButton(false);
    seqStatus.textContent = sequencer.status;
  }
  const queued = currentMode === 'sequence' ? sequencer.getQueuedHand() : null;
  renderer.draw(game, now, input.getSelectedHeight(), queued);
  updateHud();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
