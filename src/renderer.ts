import type { Game } from './game.ts';
import type { Ball, Hand } from './types.ts';
import { arcPosition, heightIndicatorY } from './physics.ts';

// 800px is the width at which the desktop sizes look right; below that we
// shrink proportionally, floored at 0.55 so things don't get unreadable.
export function uiScale(canvasWidthPx: number): number {
  return Math.min(1, Math.max(0.55, canvasWidthPx / 800));
}

// Y of the floor line that begins the shaded "ground" zone below the hands.
export function floorY(anchorY: number, canvasWidthPx: number): number {
  return anchorY + 60 * uiScale(canvasWidthPx);
}

/**
 * Pure rendering: takes the game state and a 2D context, and paints.
 * No mutation of game state happens here.
 */
export class Renderer {
  constructor(
    private ctx: CanvasRenderingContext2D,
    private getSize: () => { w: number; h: number; dpr: number },
  ) {}

  draw(game: Game, now: number, selectedHeight: number): void {
    const { w, h } = this.getSize();
    const ctx = this.ctx;
    // Single scale factor for every on-canvas element so hands, balls, labels,
    // and the floor all shrink together on narrow mobile viewports.
    const scale = uiScale(w);

    // Background: warm paper with a subtle vignette.
    ctx.save();
    const grad = ctx.createRadialGradient(w / 2, h * 0.45, 50, w / 2, h * 0.45, Math.max(w, h));
    grad.addColorStop(0, '#FBF6EC');
    grad.addColorStop(1, '#E8DDC8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Soft floor line so hands feel anchored
    this.drawFloor(w, h, game.anchors.y, scale);

    // Height grid sits behind the actors so balls and hands pass over it.
    this.drawHeightMarks(w, game.anchors.y, selectedHeight, scale);

    // Hands
    this.drawHand(game, 'L', scale, now);
    this.drawHand(game, 'R', scale, now);

    // Balls — in-flight first (behind hands look) then held (in front).
    // Doing it the other way around looks fine too; this just prevents flicker
    // at catch time when a ball pops to the top of the hand stack.
    for (const ball of game.balls.values()) {
      if (ball.state === 'flying') this.drawFlyingBall(ball, now, scale);
    }
    this.drawHeldBalls(game, 'L', scale);
    this.drawHeldBalls(game, 'R', scale);

    ctx.restore();
  }

  private drawHeightMarks(w: number, anchorY: number, selected: number, scale: number): void {
    const ctx = this.ctx;
    const margin = 10 * scale;
    const labelGap = 6 * scale;
    const labelSize = 12 * scale;
    // Dash that scales with the canvas so the rhythm reads the same on mobile.
    const dash: [number, number] = [8 * scale, 6 * scale];
    // Gap straddling the canvas centerline so the left/right halves read as
    // separate throw zones.
    const centerGap = 28 * scale;

    ctx.save();
    ctx.font = `600 ${labelSize}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'middle';

    for (let v = 1; v <= 9; v++) {
      const y = heightIndicatorY(v, anchorY);
      const isSelected = v === selected;
      const stroke = isSelected ? 'rgba(59, 44, 36, 0.4)' : 'rgba(40, 30, 20, 0.18)';
      const fill = isSelected ? '#3B2C24' : 'rgba(40, 30, 20, 0.55)';
      ctx.strokeStyle = stroke;
      ctx.fillStyle = fill;
      ctx.lineWidth = isSelected ? 1.5 : 1;
      ctx.setLineDash(dash);

      // Reserve space at both ends for the number labels so the dashes don't
      // run into them.
      const numW = ctx.measureText(String(v)).width;
      const lineStart = margin + numW + labelGap;
      const lineEnd = w - margin - numW - labelGap;
      const cx = w / 2;
      const leftEnd = cx - centerGap / 2;
      const rightStart = cx + centerGap / 2;
      if (leftEnd > lineStart) {
        ctx.beginPath();
        ctx.moveTo(lineStart, y);
        ctx.lineTo(leftEnd, y);
        ctx.stroke();
      }
      if (lineEnd > rightStart) {
        ctx.beginPath();
        ctx.moveTo(rightStart, y);
        ctx.lineTo(lineEnd, y);
        ctx.stroke();
      }

      ctx.setLineDash([]);
      ctx.textAlign = 'left';
      ctx.fillText(String(v), margin, y);
      ctx.textAlign = 'right';
      ctx.fillText(String(v), w - margin, y);
    }
    ctx.restore();
  }

  private drawFloor(w: number, h: number, anchorY: number, _scale: number): void {
    const ctx = this.ctx;
    const fy = floorY(anchorY, w);
    ctx.save();
    ctx.strokeStyle = 'rgba(40, 30, 20, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, fy);
    ctx.lineTo(w, fy);
    ctx.stroke();
    // Subtle horizon shadow
    const shadow = ctx.createLinearGradient(0, fy, 0, h);
    shadow.addColorStop(0, 'rgba(40, 30, 20, 0.06)');
    shadow.addColorStop(1, 'rgba(40, 30, 20, 0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(0, fy, w, h - fy);
    ctx.restore();
  }

  private drawHand(game: Game, side: Hand, scale: number, now: number): void {
    const ctx = this.ctx;
    const x = side === 'L' ? game.anchors.leftX : game.anchors.rightX;
    const y = game.anchors.y;
    const isEmpty = game.hands[side].balls.length === 0;

    // Click-feedback flash: linear fade-out over FLASH_MS, used to darken the
    // palm and forearm so the user sees which side responded.
    const FLASH_MS = 200;
    const flash = Math.max(0, Math.min(1, 1 - (now - game.handFlashAt[side]) / FLASH_MS));

    ctx.save();
    // Fade an empty hand to signal it has nothing to throw.
    if (isEmpty) ctx.globalAlpha = 0.5;
    // A simple pill-shaped "palm" — abstract on purpose, easy to swap later.
    ctx.fillStyle = flash > 0 ? this.darken('#3B2C24', flash * 0.6) : '#3B2C24';
    ctx.beginPath();
    const palmW = 90 * scale;
    const palmH = 26 * scale;
    this.roundRect(ctx, x - palmW / 2, y + 18 * scale, palmW, palmH, palmH / 2);
    ctx.fill();

    // Forearm hint — darkens with the same flash factor for cohesion.
    const armAlpha = 0.55 + flash * 0.35;
    ctx.fillStyle = `rgba(59, 44, 36, ${armAlpha})`;
    ctx.beginPath();
    const armW = 26 * scale;
    const armOffset = (side === 'L' ? -28 : 28) * scale;
    this.roundRect(ctx, x + armOffset - armW / 2, y + 38 * scale, armW, 80 * scale, 10 * scale);
    ctx.fill();

    // Label
    ctx.fillStyle = 'rgba(40, 30, 20, 0.45)';
    ctx.font = `600 ${11 * scale}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(side === 'L' ? 'LEFT' : 'RIGHT', x, y + 86 * scale);
    ctx.restore();
  }

  private drawHeldBalls(game: Game, side: Hand, scale: number): void {
    const hand = game.hands[side];
    const x = side === 'L' ? game.anchors.leftX : game.anchors.rightX;
    const y = game.anchors.y;
    // Stack the balls upward from the palm, slightly offset for visibility.
    hand.balls.forEach((id, i) => {
      const ball = game.balls.get(id)!;
      // Tiny horizontal jitter (deterministic by id) so multiple balls don't perfectly overlap
      const jitter = (((id * 37) % 11) - 5) * scale;
      const bx = x + jitter;
      const by = y + (8 - i * 4) * scale;
      this.drawBall(ball, bx, by, scale);
    });
  }

  private drawFlyingBall(ball: Ball, now: number, scale: number): void {
    const t = ball.throw!;
    const progress = Math.min(1, Math.max(0, (now - t.startTime) / (t.endTime - t.startTime)));
    const { x, y } = arcPosition(t.startX, t.startY, t.endX, t.endY, t.peakHeight, progress);
    this.drawBall(ball, x, y, scale);
  }

  private drawBall(ball: Ball, x: number, y: number, scale: number): void {
    const ctx = this.ctx;
    const r = 14 * scale;

    // Ground shadow that follows the ball — fades with height above palm
    // (we don't have direct "height" here, but flying balls render relative to palm Y;
    //  for simplicity, do a constant soft shadow under the palm line for held balls
    //  and a smaller faint shadow under flying balls)

    // Main ball with radial highlight
    const hl = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.2, x, y, r);
    hl.addColorStop(0, this.lighten(ball.color, 0.35));
    hl.addColorStop(0.6, ball.color);
    hl.addColorStop(1, this.darken(ball.color, 0.25));
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Crisp dark outline for definition on light bg
    ctx.strokeStyle = 'rgba(40, 25, 18, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Tiny specular dot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(x - r * 0.4, y - r * 0.45, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private lighten(hex: string, amt: number): string {
    return this.shift(hex, amt);
  }
  private darken(hex: string, amt: number): string {
    return this.shift(hex, -amt);
  }
  private shift(hex: string, amt: number): string {
    const { r, g, b } = this.hexToRgb(hex);
    const f = (c: number) =>
      Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  }
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace('#', '');
    const n = parseInt(
      h.length === 3
        ? h
            .split('')
            .map((c) => c + c)
            .join('')
        : h,
      16,
    );
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
}
