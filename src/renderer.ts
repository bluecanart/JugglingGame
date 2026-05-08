import type { Game } from './game.ts';
import type { Ball, Hand } from './types.ts';
import { arcPosition } from './physics.ts';

/**
 * Pure rendering: takes the game state and a 2D context, and paints.
 * No mutation of game state happens here.
 */
export class Renderer {
  constructor(
    private ctx: CanvasRenderingContext2D,
    private getSize: () => { w: number; h: number; dpr: number },
  ) {}

  draw(game: Game, now: number): void {
    const { w, h } = this.getSize();
    const ctx = this.ctx;

    // Background: warm paper with a subtle vignette.
    ctx.save();
    const grad = ctx.createRadialGradient(w / 2, h * 0.45, 50, w / 2, h * 0.45, Math.max(w, h));
    grad.addColorStop(0, '#FBF6EC');
    grad.addColorStop(1, '#E8DDC8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Soft floor line so hands feel anchored
    this.drawFloor(w, h, game.anchors.y);

    // Hands
    this.drawHand(game, 'L');
    this.drawHand(game, 'R');

    // Balls — in-flight first (behind hands look) then held (in front).
    // Doing it the other way around looks fine too; this just prevents flicker
    // at catch time when a ball pops to the top of the hand stack.
    for (const ball of game.balls.values()) {
      if (ball.state === 'flying') this.drawFlyingBall(ball, now);
    }
    this.drawHeldBalls(game, 'L');
    this.drawHeldBalls(game, 'R');

    ctx.restore();
  }

  private drawFloor(w: number, h: number, y: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(40, 30, 20, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + 60);
    ctx.lineTo(w, y + 60);
    ctx.stroke();
    // Subtle horizon shadow
    const shadow = ctx.createLinearGradient(0, y + 60, 0, h);
    shadow.addColorStop(0, 'rgba(40, 30, 20, 0.06)');
    shadow.addColorStop(1, 'rgba(40, 30, 20, 0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(0, y + 60, w, h - (y + 60));
    ctx.restore();
  }

  private drawHand(game: Game, side: Hand): void {
    const ctx = this.ctx;
    const x = side === 'L' ? game.anchors.leftX : game.anchors.rightX;
    const y = game.anchors.y;

    ctx.save();
    // A simple pill-shaped "palm" — abstract on purpose, easy to swap later.
    ctx.fillStyle = '#3B2C24';
    ctx.beginPath();
    const palmW = 90;
    const palmH = 26;
    this.roundRect(ctx, x - palmW / 2, y + 18, palmW, palmH, palmH / 2);
    ctx.fill();

    // Forearm hint
    ctx.fillStyle = 'rgba(59, 44, 36, 0.55)';
    ctx.beginPath();
    const armW = 26;
    const armOffset = side === 'L' ? -28 : 28;
    this.roundRect(ctx, x + armOffset - armW / 2, y + 38, armW, 80, 10);
    ctx.fill();

    // Label
    ctx.fillStyle = 'rgba(40, 30, 20, 0.45)';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(side === 'L' ? 'LEFT' : 'RIGHT', x, y + 86);
    ctx.restore();
  }

  private drawHeldBalls(game: Game, side: Hand): void {
    const hand = game.hands[side];
    const x = side === 'L' ? game.anchors.leftX : game.anchors.rightX;
    const y = game.anchors.y;
    // Stack the balls upward from the palm, slightly offset for visibility.
    hand.balls.forEach((id, i) => {
      const ball = game.balls.get(id)!;
      // Tiny horizontal jitter (deterministic by id) so multiple balls don't perfectly overlap
      const jitter = ((id * 37) % 11) - 5;
      const bx = x + jitter;
      const by = y + 8 - i * 4; // slight vertical stacking
      this.drawBall(ball, bx, by);
    });
  }

  private drawFlyingBall(ball: Ball, now: number): void {
    const t = ball.throw!;
    const progress = Math.min(1, Math.max(0, (now - t.startTime) / (t.endTime - t.startTime)));
    const { x, y } = arcPosition(t.startX, t.startY, t.endX, t.endY, t.peakHeight, progress);
    this.drawBall(ball, x, y);
  }

  private drawBall(ball: Ball, x: number, y: number): void {
    const ctx = this.ctx;
    const r = 14;

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
