import { BUILDING_MAP } from '../data/buildings';
import { makeCanvas, plate, rivet, shade, roundRect, gearShape, glow, poly, rgba, type Ctx } from './draw';

export interface Sprite { canvas: HTMLCanvasElement; top: number; w: number; h: number }
const cache = new Map<string, Sprite>();

/** Static building body. Dynamic parts (gears, fire, turret heads) are drawn per frame by the renderer. */
export function buildingSprite(defId: string, dir: number, P = 48): HTMLCanvasElement {
  return buildingSpriteFull(defId, dir, P).canvas;
}

export function buildingSpriteFull(defId: string, dir: number, P = 48): Sprite {
  const key = `${defId}:${dir % 2}:${P}`;
  let s = cache.get(key);
  if (s) return s;
  const d = BUILDING_MAP.get(defId)!;
  const w = dir % 2 === 1 ? d.h : d.w, h = dir % 2 === 1 ? d.w : d.h;
  const topTiles = TOP[d.kind] ?? 0.5;
  const top = Math.round(topTiles * P);
  const c = makeCanvas(w * P, h * P + top);
  const ctx = c.getContext('2d')!;
  ctx.translate(0, top);
  const W = w * P, H = h * P;
  // contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, 2, H * 0.15, W - 2, H * 0.9, P * 0.2);
  ctx.fill();
  DRAW[d.kind]?.(ctx, W, H, P, d.color, d.accent, top);
  s = { canvas: c, top, w, h };
  cache.set(key, s);
  return s;
}

const TOP: Record<string, number> = {
  belt: 0, splitter: 0.15, arm: 0.3, vault: 0.35, miner: 0.9, furnace: 0.8, assembler: 0.8, forge: 0.9, generator: 1.4,
  pylon: 1.6, capacitor: 0.7, lamp: 1.2, lab: 1.0, turret: 0.4, tesla: 2.0, wall: 0.6, beacon: 2.5,
};

type Painter = (ctx: Ctx, W: number, H: number, P: number, color: string, accent: string, top: number) => void;

const pad = (P: number) => P * 0.06;

const DRAW: Record<string, Painter> = {
  belt(ctx, W, H, P, color, accent) {
    ctx.fillStyle = '#1e1c1a'; ctx.fillRect(W * 0.04, H * 0.04, W * 0.92, H * 0.92);
    ctx.fillStyle = color; ctx.fillRect(0, H * 0.06, W, H * 0.1); ctx.fillRect(0, H * 0.84, W, H * 0.1);
    ctx.strokeStyle = accent; ctx.lineWidth = P * 0.06;
    for (const o of [0.3, 0.62]) { ctx.beginPath(); ctx.moveTo(W * o, H * 0.25); ctx.lineTo(W * (o + 0.14), H * 0.5); ctx.lineTo(W * o, H * 0.75); ctx.stroke(); }
  },
  splitter(ctx, W, H, P, color, accent) {
    plate(ctx, pad(P), pad(P) - P * 0.15, W - pad(P) * 2, H - pad(P) * 2, color, P * 0.1);
    ctx.strokeStyle = accent; ctx.lineWidth = P * 0.06;
    ctx.beginPath(); ctx.arc(W / 2, H / 2 - P * 0.15, P * 0.25, 0, Math.PI * 2); ctx.stroke();
    for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) rivet(ctx, W * x, H * y - P * 0.15, P * 0.04);
  },
  arm(ctx, W, H, P, color) {
    ctx.fillStyle = shade(color, -0.2);
    ctx.beginPath(); ctx.ellipse(W / 2, H / 2, P * 0.32, P * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    plate(ctx, W / 2 - P * 0.22, H / 2 - P * 0.35, P * 0.44, P * 0.4, color, P * 0.08);
  },
  vault(ctx, W, H, P, color, accent) {
    plate(ctx, pad(P), -P * 0.25, W - pad(P) * 2, H - pad(P), color, P * 0.08);
    ctx.fillStyle = shade(color, -0.25); ctx.fillRect(pad(P), H * 0.2, W - pad(P) * 2, P * 0.06);
    for (const x of [0.25, 0.75]) { ctx.fillStyle = shade(accent, -0.2); ctx.fillRect(W * x - P * 0.05, -P * 0.25, P * 0.1, H); }
    plate(ctx, W / 2 - P * 0.1, H * 0.25, P * 0.2, P * 0.2, accent, 2);
  },
  miner(ctx, W, H, P, color, accent) {
    plate(ctx, pad(P), pad(P), W - pad(P) * 2, H - pad(P) * 2, shade(color, -0.1), P * 0.12);
    plate(ctx, W * 0.18, -P * 0.6, W * 0.64, H * 0.75, color, P * 0.1);
    // drill tower frame
    ctx.strokeStyle = shade(color, -0.5); ctx.lineWidth = P * 0.06;
    ctx.beginPath(); ctx.moveTo(W * 0.3, -P * 0.85); ctx.lineTo(W * 0.5, -P * 0.9); ctx.lineTo(W * 0.7, -P * 0.85); ctx.stroke();
    for (const [x, y] of [[0.24, -0.45], [0.76, -0.45], [0.24, 0.5], [0.76, 0.5]]) rivet(ctx, W * x, y * P + (y > 0 ? H * 0.2 : 0), P * 0.05);
    ctx.fillStyle = rgba(accent, 0.8); ctx.fillRect(W * 0.3, H * 0.6, W * 0.4, P * 0.08);
  },
  furnace(ctx, W, H, P, color, accent) {
    const metal = color.startsWith('#3');
    if (metal) {
      plate(ctx, pad(P), -P * 0.5, W - pad(P) * 2, H + P * 0.4, color, P * 0.15);
      for (let i = 0; i < 3; i++) { ctx.strokeStyle = accent; ctx.lineWidth = P * 0.05; ctx.beginPath(); ctx.ellipse(W / 2, -P * 0.2 + i * P * 0.2, W * 0.3, P * 0.08, 0, 0, Math.PI * 2); ctx.stroke(); }
    } else {
      // stacked basalt kiln
      ctx.fillStyle = shade(color, -0.1);
      ctx.beginPath(); ctx.moveTo(pad(P), H - pad(P)); ctx.lineTo(pad(P) + P * 0.15, -P * 0.2); ctx.quadraticCurveTo(W / 2, -P * 0.9, W - pad(P) - P * 0.15, -P * 0.2); ctx.lineTo(W - pad(P), H - pad(P)); ctx.closePath(); ctx.fill();
      for (let r = 0; r < 5; r++) for (let k = 0; k < 4; k++) {
        const bx = pad(P) + P * 0.1 + k * (W - P * 0.4) / 4 + (r % 2) * P * 0.12, by = H - pad(P) - (r + 1) * P * 0.32;
        plate(ctx, bx, by, (W - P * 0.4) / 4 - 2, P * 0.28, shade(color, (k + r) % 3 * 0.06 - 0.05), 2);
      }
    }
    // mouth
    ctx.fillStyle = '#120a06'; roundRect(ctx, W * 0.32, H * 0.45, W * 0.36, H * 0.35, P * 0.12); ctx.fill();
  },
  assembler(ctx, W, H, P, color, accent) {
    plate(ctx, pad(P), pad(P), W - pad(P) * 2, H - pad(P) * 2, shade(color, -0.15), P * 0.12);
    plate(ctx, P * 0.3, -P * 0.5, W - P * 0.6, H - P * 0.5, color, P * 0.15);
    ctx.fillStyle = '#16191a'; roundRect(ctx, W * 0.25, H * 0.05, W * 0.5, H * 0.45, P * 0.1); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = P * 0.05; roundRect(ctx, W * 0.25, H * 0.05, W * 0.5, H * 0.45, P * 0.1); ctx.stroke();
    for (const [x, y] of [[0.15, -0.3], [0.85, -0.3], [0.15, 0.75], [0.85, 0.75]]) rivet(ctx, W * x, y > 0 ? H * y : y * P, P * 0.06);
    ctx.fillStyle = shade(color, -0.4);
    for (let i = 0; i < 4; i++) ctx.fillRect(W * 0.2 + i * W * 0.17, H * 0.82, W * 0.1, P * 0.08);
  },
  forge(ctx, W, H, P, color, accent) {
    plate(ctx, pad(P), pad(P), W - pad(P) * 2, H - pad(P) * 2, shade(color, -0.2), P * 0.12);
    // furnace stack at back
    plate(ctx, W * 0.55, -P * 0.85, W * 0.38, H * 0.8, '#4a4038', P * 0.1);
    ctx.fillStyle = '#1a0a06'; roundRect(ctx, W * 0.62, H * 0.0, W * 0.24, H * 0.25, P * 0.08); ctx.fill();
    // anvil
    ctx.fillStyle = '#2a2a2e';
    poly(ctx, [W * 0.12, H * 0.42, W * 0.48, H * 0.42, W * 0.42, H * 0.52, W * 0.36, H * 0.52, W * 0.38, H * 0.7, W * 0.2, H * 0.7, W * 0.22, H * 0.52, W * 0.16, H * 0.52]);
    ctx.fill();
    ctx.fillStyle = shade(accent, -0.3); ctx.fillRect(W * 0.1, H * 0.78, W * 0.8, P * 0.06);
  },
  generator(ctx, W, H, P, color, accent) {
    plate(ctx, pad(P), pad(P), W - pad(P) * 2, H - pad(P) * 2, shade(color, -0.2), P * 0.1);
    // boiler drum
    const horiz = W > H;
    if (horiz) {
      plate(ctx, P * 0.2, -P * 0.4, W * 0.65, H * 0.75, color, P * 0.4);
    } else {
      plate(ctx, P * 0.18, -P * 0.3, W - P * 0.36, H * 0.6, color, P * 0.4);
    }
    // chimney
    plate(ctx, W - P * 0.62, -P * 1.35, P * 0.36, P * 1.2, '#3a3430', P * 0.06);
    ctx.fillStyle = '#100c0a'; ctx.beginPath(); ctx.ellipse(W - P * 0.44, -P * 1.33, P * 0.15, P * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = shade(accent, -0.2); ctx.lineWidth = P * 0.04; ctx.beginPath(); ctx.moveTo(P * 0.3, H * (0.2 + i * 0.15)); ctx.lineTo(W * 0.7, H * (0.2 + i * 0.15)); ctx.stroke(); }
    ctx.fillStyle = '#1a0a06'; roundRect(ctx, W * 0.15, H * 0.62, W * 0.3, H * 0.22, P * 0.08); ctx.fill();
  },
  pylon(ctx, W, H, P, color, accent) {
    ctx.fillStyle = shade(color, -0.25); ctx.fillRect(W / 2 - P * 0.07, -P * 1.45, P * 0.14, H * 0.6 + P * 1.45);
    ctx.fillStyle = color; ctx.fillRect(W / 2 - P * 0.35, -P * 1.35, P * 0.7, P * 0.1);
    for (const x of [-0.3, 0.3]) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(W / 2 + x * P, -P * 1.4, P * 0.06, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = shade(color, -0.4); ctx.beginPath(); ctx.ellipse(W / 2, H * 0.6, P * 0.2, P * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  },
  capacitor(ctx, W, H, P, color, accent) {
    plate(ctx, pad(P), pad(P), W - pad(P) * 2, H - pad(P) * 2, shade(color, -0.2), P * 0.1);
    for (let i = 0; i < 3; i++) {
      const x = P * 0.2 + i * (W - P * 0.4) / 3;
      plate(ctx, x, -P * 0.55, (W - P * 0.4) / 3 - P * 0.08, H * 0.85, color, P * 0.18);
      ctx.fillStyle = '#10161c'; ctx.fillRect(x + P * 0.12, -P * 0.35, P * 0.14, H * 0.6);
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x + P * 0.2, -P * 0.52, P * 0.05, 0, Math.PI * 2); ctx.fill();
    }
  },
  lamp(ctx, W, H, P, color) {
    ctx.fillStyle = shade(color, -0.3); ctx.fillRect(W / 2 - P * 0.05, -P * 0.95, P * 0.1, H * 0.6 + P * 0.95);
    plate(ctx, W / 2 - P * 0.16, -P * 1.15, P * 0.32, P * 0.32, color, P * 0.06);
    ctx.fillStyle = '#2a2a24'; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.62, P * 0.15, P * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  },
  lab(ctx, W, H, P, color, accent) {
    // octagonal stone dais
    const cx = W / 2, cy = H / 2;
    ctx.fillStyle = shade(color, -0.2);
    poly(ctx, Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? cx + Math.cos((Math.floor(i / 2) / 8) * Math.PI * 2 + Math.PI / 8) * W * 0.47 : cy + Math.sin((Math.floor(i / 2) / 8) * Math.PI * 2 + Math.PI / 8) * H * 0.42)));
    ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = P * 0.04;
    ctx.beginPath(); ctx.arc(cx, cy, W * 0.33, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.fillStyle = rgba(accent, 0.8); ctx.fillRect(cx + Math.cos(a) * W * 0.33 - 2, cy + Math.sin(a) * W * 0.33 - 2, 4, 4); }
    // lectern
    plate(ctx, cx - P * 0.3, cy - P * 0.9, P * 0.6, P * 0.9, color, P * 0.08);
    ctx.fillStyle = '#d9cfb8'; poly(ctx, [cx - P * 0.35, cy - P * 0.95, cx + P * 0.35, cy - P * 0.95, cx + P * 0.3, cy - P * 0.75, cx - P * 0.3, cy - P * 0.75]); ctx.fill();
  },
  turret(ctx, W, H, P, color) {
    plate(ctx, pad(P), pad(P), W - pad(P) * 2, H - pad(P) * 2, shade(color, -0.2), P * 0.15);
    ctx.fillStyle = shade(color, -0.45); ctx.beginPath(); ctx.arc(W / 2, H / 2 - P * 0.1, W * 0.3, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; rivet(ctx, W / 2 + Math.cos(a) * W * 0.36, H / 2 + Math.sin(a) * H * 0.36, P * 0.05); }
  },
  tesla(ctx, W, H, P, color, accent) {
    plate(ctx, pad(P), pad(P), W - pad(P) * 2, H - pad(P) * 2, shade(color, -0.25), P * 0.15);
    ctx.fillStyle = shade(color, 0.05);
    poly(ctx, [W * 0.3, H * 0.7, W * 0.7, H * 0.7, W * 0.56, -P * 1.6, W * 0.44, -P * 1.6]); ctx.fill();
    for (let i = 0; i < 6; i++) { ctx.strokeStyle = shade(accent, -0.3); ctx.lineWidth = P * 0.05; const y = H * 0.55 - i * P * 0.32; const ww = W * (0.2 - i * 0.015); ctx.beginPath(); ctx.ellipse(W / 2, y, ww, P * 0.06, 0, 0, Math.PI * 2); ctx.stroke(); }
    const g = ctx.createRadialGradient(W / 2 - P * 0.1, -P * 1.8, 0, W / 2, -P * 1.7, P * 0.35);
    g.addColorStop(0, '#e0f0ff'); g.addColorStop(1, '#3a5a7a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(W / 2, -P * 1.72, P * 0.3, 0, Math.PI * 2); ctx.fill();
  },
  wall(ctx, W, H, P, color) {
    ctx.fillStyle = shade(color, -0.35); ctx.fillRect(0, -P * 0.1, W, H + P * 0.1);
    plate(ctx, 0, -P * 0.55, W, H * 0.75, color, P * 0.05);
    ctx.strokeStyle = shade(color, -0.4); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -P * 0.2); ctx.lineTo(W, -P * 0.2); ctx.moveTo(W / 2, -P * 0.55); ctx.lineTo(W / 2, -P * 0.2); ctx.stroke();
  },
  beacon(ctx, W, H, P, color, accent) {
    // foundation ring (stage visuals added dynamically)
    ctx.fillStyle = shade(color, -0.1);
    ctx.beginPath(); ctx.ellipse(W / 2, H / 2, W * 0.48, H * 0.44, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = P * 0.08;
    ctx.beginPath(); ctx.ellipse(W / 2, H / 2, W * 0.4, H * 0.36, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; rivet(ctx, W / 2 + Math.cos(a) * W * 0.44, H / 2 + Math.sin(a) * H * 0.4, P * 0.08, accent); }
  },
};

// ───────────── terrain props
const propCache = new Map<string, HTMLCanvasElement>();

export function treeSprite(variant: number, P: number): HTMLCanvasElement {
  const key = `tree${variant}@${P}`;
  let c = propCache.get(key);
  if (c) return c;
  c = makeCanvas(P * 1.6, P * 2.4);
  const ctx = c.getContext('2d')!;
  const W = c.width, H = c.height;
  const bx = W / 2, by = H - P * 0.3;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(bx, by, P * 0.5, P * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  // charred trunk with branches
  ctx.strokeStyle = '#2a1e18'; ctx.lineCap = 'round';
  ctx.lineWidth = P * 0.16;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + (variant % 2 ? 2 : -2), by - P * 1.2); ctx.stroke();
  ctx.lineWidth = P * 0.07;
  const rnd = (i: number) => ((variant * 7919 + i * 104729) % 1000) / 1000;
  for (let i = 0; i < 5; i++) {
    const y = by - P * (0.6 + rnd(i) * 0.8), a = (rnd(i + 9) - 0.5) * 2.4 - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx + Math.cos(a) * P * 0.5, y + Math.sin(a) * P * 0.5); ctx.stroke();
  }
  // ashen canopy clumps
  const leafy = variant % 3 !== 0;
  if (leafy) {
    for (let i = 0; i < 7; i++) {
      const x = bx + (rnd(i + 20) - 0.5) * P * 1.0, y = by - P * (1.2 + rnd(i + 30) * 0.7), r = P * (0.25 + rnd(i + 40) * 0.2);
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      const base = variant % 2 ? '#4a4a2e' : '#3e3a2a';
      g.addColorStop(0, shade(base, 0.25)); g.addColorStop(1, shade(base, -0.35));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // ember leaves
    for (let i = 0; i < 4; i++) { ctx.fillStyle = rgba('#ff7a3a', 0.6); ctx.fillRect(bx + (rnd(i + 60) - 0.5) * P, by - P * (1.2 + rnd(i + 70) * 0.7), 2, 2); }
  }
  propCache.set(key, c);
  return c;
}

export function propSprite(kind: 'crate' | 'pillar' | 'fungus' | 'urn', P: number): HTMLCanvasElement {
  const key = `${kind}@${P}`;
  let c = propCache.get(key);
  if (c) return c;
  c = makeCanvas(P * 1.2, P * 1.8);
  const ctx = c.getContext('2d')!;
  const W = c.width, H = c.height;
  const bx = W / 2, by = H - P * 0.25;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(bx, by, P * 0.45, P * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  if (kind === 'crate') {
    plate(ctx, bx - P * 0.38, by - P * 0.7, P * 0.76, P * 0.7, '#6a5030', 3);
    ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = P * 0.05; ctx.strokeRect(bx - P * 0.32, by - P * 0.64, P * 0.64, P * 0.58);
    ctx.beginPath(); ctx.moveTo(bx - P * 0.32, by - P * 0.64); ctx.lineTo(bx + P * 0.32, by - P * 0.06); ctx.stroke();
  } else if (kind === 'urn') {
    const g = ctx.createLinearGradient(bx - P * 0.3, 0, bx + P * 0.3, 0); g.addColorStop(0, '#6a4a3a'); g.addColorStop(0.5, '#9a7050'); g.addColorStop(1, '#4a3020');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bx, by - P * 0.35, P * 0.3, P * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(bx - P * 0.14, by - P * 0.85, P * 0.28, P * 0.2);
  } else if (kind === 'pillar') {
    plate(ctx, bx - P * 0.45, by - P * 1.5, P * 0.9, P * 1.5, '#5a524a', 4);
    ctx.strokeStyle = '#3a342e'; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(bx - P * 0.45, by - P * 1.5 + i * P * 0.37); ctx.lineTo(bx + P * 0.45, by - P * 1.5 + i * P * 0.37); ctx.stroke(); }
    glow(ctx, bx, by - P * 1.1, P * 0.3, '#ff6a2a', 0.5);
  } else {
    for (let i = 0; i < 3; i++) {
      const x = bx + (i - 1) * P * 0.22, y = by - P * (0.15 + (i % 2) * 0.1);
      ctx.fillStyle = '#d9cfb8'; ctx.fillRect(x - P * 0.04, y - P * 0.2, P * 0.08, P * 0.2);
      ctx.fillStyle = '#b8323f'; ctx.beginPath(); ctx.ellipse(x, y - P * 0.22, P * 0.16, P * 0.1, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#f0d0c0'; ctx.fillRect(x - P * 0.06, y - P * 0.28, 2, 2);
    }
  }
  propCache.set(key, c);
  return c;
}

export { gearShape, glow };
