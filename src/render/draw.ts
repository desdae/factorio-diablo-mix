/** Shared procedural drawing helpers. */
export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function shade(hex: string, amt: number): string {
  const c = parseColor(hex);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`;
}

export function rgba(hex: string, a: number): string {
  const c = parseColor(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

const colorCache = new Map<string, [number, number, number]>();
export function parseColor(hex: string): [number, number, number] {
  let c = colorCache.get(hex);
  if (c) return c;
  if (hex.startsWith('#')) {
    const h = hex.length === 4 ? hex.slice(1).split('').map((x) => x + x).join('') : hex.slice(1);
    c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  } else {
    const m = hex.match(/\d+/g) ?? ['0', '0', '0'];
    c = [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  colorCache.set(hex, c);
  return c;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Beveled metal plate with vertical gradient and edge highlight. */
export function plate(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, r = 3) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, shade(color, 0.22));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.55);
  ctx.lineWidth = Math.max(1, w / 40);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(x + r, y + 1.5);
  ctx.lineTo(x + w - r, y + 1.5);
  ctx.stroke();
}

export function rivet(ctx: Ctx, x: number, y: number, r: number, color = '#c9b48a') {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, shade(color, 0.5));
  g.addColorStop(1, shade(color, -0.4));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function gearShape(ctx: Ctx, x: number, y: number, r: number, teeth: number, rot: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.78;
    const a2 = a + Math.PI / teeth;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    ctx.lineTo(Math.cos(a2 - 0.05) * rr, Math.sin(a2 - 0.05) * rr);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
  g.addColorStop(0, shade(color, 0.35));
  g.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.6);
  ctx.lineWidth = Math.max(1, r / 10);
  ctx.stroke();
  ctx.fillStyle = shade(color, -0.6);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function glow(ctx: Ctx, x: number, y: number, r: number, color: string, a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.4, rgba(color, a * 0.35));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function poly(ctx: Ctx, pts: number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}
