# Juggle.io — A Juggling Sandbox

A small juggling toy built with TypeScript + Vite + Canvas, deployable to GitHub Pages.

Throws are notated using [siteswap](http://www.juggling.org/help/siteswap/ssintro/) values: the number tells you how many beats it'll be before the ball is thrown again, which in turn determines the height and which hand it lands in (odd = crosses, even = stays).

## Controls

- **Ball count selector** — top-right dropdown, 1–9 balls. Right hand gets the extra ball when count is odd.
- **Throw** — hold a number `1`–`9`, then press `←` (left hand throws) or `→` (right hand throws).
  - Press digit, then arrow. Order: number first, arrow second.
  - If the throwing hand is empty, nothing happens.
  - Odd values cross hands; even values return to the same hand. Higher value = higher arc.
- **Reset** — press `R`.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build       # outputs to dist/
npm run preview     # serves the production build
```

## Deploy to GitHub Pages

Two options:

### A) GitHub Actions (recommended)

A workflow lives at `.github/workflows/deploy.yml`. Steps:

1. Push the repo to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow builds and publishes automatically.

### B) Manual via `gh-pages` branch

```bash
npm install --save-dev gh-pages   # already in devDependencies
npm run deploy                     # builds and pushes dist/ to the gh-pages branch
```

Then in **Settings → Pages**, set **Source** to **Deploy from a branch** → `gh-pages` → `/ (root)`.

`vite.config.ts` uses `base: './'`, so the build works at any subpath (e.g. `https://yourname.github.io/juggle/`) without further configuration.

## Architecture

The code is split into independent modules so each concern can be extended on its own:

```
src/
  types.ts      Shared types (Ball, Hand, ThrowRecord, ...)
  physics.ts    Siteswap math: air time, peak height, parabolic arc
  game.ts       Mutable game state. The only module that mutates balls/hands.
  renderer.ts   Pure canvas drawing. Reads game state, never mutates it.
  input.ts      Keyboard controller.
  main.ts       Wires it all together + DOM/HUD.
```

The render and input layers depend on `game.ts` but `game.ts` doesn't depend on them — so you can swap the renderer (e.g. for WebGL or SVG) or input source (e.g. MIDI, touch, gamepad) without touching game logic.

## Extension ideas

The architecture is set up to make these reasonable additions:

- **Pattern playback**. `game.throwBall()` already takes a hand + value; feed it from a siteswap parser (e.g. `"441"` cycled) on a metronome and you have automatic juggling.
- **Synchronous patterns** (`(4,4)`). Add an "and these throw together" flag and trigger both hands in one tick.
- **Multiplex throws** (`[33]`). Make `throwBall()` accept an array of values and pop multiple balls from the hand.
- **`0` (empty), `1` (handoff), `2` (hold)**. The physics module mostly handles these via `airTimeSeconds()`'s clamp; you'd add explicit code paths in `game.ts` for the `1` (instant transfer) case.
- **Scoring / drops**. Track when a hand has multiple balls in flight headed to it and the player misses the catch.
- **Different props** (clubs, rings). Swap `drawBall()` in `renderer.ts`; the physics is the same.
- **Tweakable beat / dwell**. `BEAT_TIME` and `DWELL` in `physics.ts` are constants — expose them as sliders.

## Physics reference

From [Siteswap technical note 2](http://www.juggling.org/help/siteswap/ssintro/):

- Air time: `Z = (V - 2D) * T`, where V is the siteswap value, D is dwell time in beats (~0.7), and T is the beat time.
- Peak height: `H = G * Z² / 8` — gravity acting on a projectile that needs to be back at the same height in time `Z`.
- This makes heights non-linear: a `4` is ~2.6× as tall as a `3`, a `7` is ~12× as tall.
