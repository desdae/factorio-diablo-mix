import { ITEM_MAP } from '../data/items';
import { BASE_MAP, RARITIES } from '../data/equipment';
import { BUILDING_MAP } from '../data/buildings';
import { SKILL_MAP } from '../data/skills';
import { makeCanvas, shade, plate, rivet, gearShape, glow, poly, roundRect, rgba, type Ctx } from './draw';
import type { Equip } from '../game/items';
import { buildingSprite } from './sprites';

const cache = new Map<string, string>();
const canvasCache = new Map<string, HTMLCanvasElement>();

/** Item icon as a canvas (for in-world drawing) */
export function itemCanvas(id: string, size = 32): HTMLCanvasElement {
  const key = `${id}@${size}`;
  let c = canvasCache.get(key);
  if (c) return c;
  c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  drawItemIcon(ctx, id, size);
  canvasCache.set(key, c);
  return c;
}

/** Item icon as a data URL (for DOM UI) */
export function itemIcon(id: string, size = 40): string {
  const key = `${id}@${size}`;
  let u = cache.get(key);
  if (!u) { u = itemCanvas(id, size).toDataURL(); cache.set(key, u); }
  return u;
}

export function drawItemIcon(ctx: Ctx, id: string, s: number) {
  const d = ITEM_MAP.get(id);
  if (!d) return;
  const c = d.color;
  const m = s / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  switch (d.shape) {
    case 'ore': {
      const pts = [m * 0.35, m * 0.9, m * 0.7, m * 0.45, m * 1.2, m * 0.4, m * 1.65, m * 0.8, m * 1.55, m * 1.45, m * 0.9, m * 1.65, m * 0.4, m * 1.35];
      poly(ctx, pts);
      const g = ctx.createLinearGradient(0, s * 0.2, 0, s * 0.85);
      g.addColorStop(0, shade(c, 0.3)); g.addColorStop(1, shade(c, -0.45));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = shade(c, -0.7); ctx.lineWidth = s / 24; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      poly(ctx, [m * 0.75, m * 0.55, m * 1.15, m * 0.5, m * 0.95, m * 0.85]); ctx.fill();
      if (id === 'emberite_ore') glow(ctx, m, m, m * 0.9, '#ff6a2a', 0.5);
      break;
    }
    case 'plate': {
      ctx.translate(m, m); ctx.rotate(-0.15);
      for (let i = 2; i >= 0; i--) plate(ctx, -m * 0.7, -m * 0.35 + i * s * 0.1 - s * 0.08, m * 1.4, m * 0.55, shade(c, -i * 0.12), s / 14);
      break;
    }
    case 'gear': gearShape(ctx, m, m, m * 0.75, 9, 0.2, c); break;
    case 'coil': {
      ctx.strokeStyle = shade(c, -0.3); ctx.lineWidth = s / 10;
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(m, m * 0.55 + i * s * 0.11, m * 0.6, m * 0.18, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = shade(c, 0.3); ctx.lineWidth = s / 22;
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(m, m * 0.55 + i * s * 0.11, m * 0.6, m * 0.18, 0, Math.PI, Math.PI * 2); ctx.stroke(); }
      break;
    }
    case 'chip': {
      plate(ctx, s * 0.18, s * 0.18, s * 0.64, s * 0.64, '#2a4a3a', s / 16);
      ctx.strokeStyle = c; ctx.lineWidth = s / 20;
      ctx.beginPath(); ctx.moveTo(s * 0.3, s * 0.5); ctx.lineTo(s * 0.45, s * 0.35); ctx.lineTo(s * 0.7, s * 0.35); ctx.moveTo(s * 0.3, s * 0.65); ctx.lineTo(s * 0.7, s * 0.65); ctx.lineTo(s * 0.7, s * 0.5); ctx.stroke();
      glow(ctx, s * 0.5, s * 0.5, s * 0.3, c, 0.4);
      ctx.fillStyle = '#c9a24a';
      for (let i = 0; i < 4; i++) { ctx.fillRect(s * (0.26 + i * 0.14), s * 0.1, s * 0.05, s * 0.08); ctx.fillRect(s * (0.26 + i * 0.14), s * 0.82, s * 0.05, s * 0.08); }
      break;
    }
    case 'orb': {
      glow(ctx, m, m, m * 0.95, c, 0.6);
      const g = ctx.createRadialGradient(m * 0.8, m * 0.75, 0, m, m, m * 0.55);
      g.addColorStop(0, shade(c, 0.6)); g.addColorStop(1, shade(c, -0.4));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m, m, m * 0.55, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'vial': {
      ctx.fillStyle = 'rgba(220,230,240,0.25)'; ctx.strokeStyle = '#cfd8e0'; ctx.lineWidth = s / 22;
      ctx.beginPath(); ctx.moveTo(m * 0.8, s * 0.15); ctx.lineTo(m * 1.2, s * 0.15); ctx.lineTo(m * 1.2, s * 0.38); ctx.arc(m, s * 0.62, m * 0.5, -Math.PI * 0.3, Math.PI * 1.3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(m, s * 0.64, m * 0.42, 0.1, Math.PI - 0.1); ctx.fill();
      glow(ctx, m, s * 0.66, m * 0.5, c, 0.4);
      ctx.fillStyle = '#8a5a32'; ctx.fillRect(m * 0.78, s * 0.08, m * 0.44, s * 0.09);
      break;
    }
    case 'sigil': {
      ctx.beginPath(); ctx.arc(m, m, m * 0.72, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(m * 0.8, m * 0.8, 0, m, m, m * 0.72);
      g.addColorStop(0, shade(c, 0.4)); g.addColorStop(1, shade(c, -0.45));
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = shade(c, -0.6); ctx.lineWidth = s / 16; ctx.stroke();
      ctx.strokeStyle = shade(c, 0.7); ctx.lineWidth = s / 18;
      ctx.beginPath(); ctx.moveTo(m, m * 0.5); ctx.lineTo(m * 1.4, m * 1.25); ctx.lineTo(m * 0.6, m * 1.25); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(m, m * 1.02, m * 0.16, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'bolt': {
      for (let i = 0; i < 3; i++) {
        const x = s * (0.3 + i * 0.18);
        ctx.fillStyle = '#7a5a3a'; ctx.fillRect(x - s * 0.03, s * 0.25, s * 0.06, s * 0.55);
        ctx.fillStyle = '#c0c8d0'; poly(ctx, [x, s * 0.12, x + s * 0.06, s * 0.27, x - s * 0.06, s * 0.27]); ctx.fill();
        ctx.fillStyle = c; ctx.fillRect(x - s * 0.06, s * 0.72, s * 0.12, s * 0.1);
      }
      break;
    }
    case 'log': {
      ctx.translate(m, m); ctx.rotate(-0.4);
      ctx.fillStyle = shade(c, -0.2); roundRect(ctx, -m * 0.8, -m * 0.3, m * 1.6, m * 0.6, m * 0.3); ctx.fill();
      ctx.fillStyle = '#c9a070'; ctx.beginPath(); ctx.ellipse(m * 0.8, 0, m * 0.15, m * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a6040'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(m * 0.8, 0, m * 0.07, m * 0.15, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'brick': {
      for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) plate(ctx, s * (0.12 + k * 0.38 + (r ? 0.18 : 0)), s * (0.3 + r * 0.24), s * 0.36, s * 0.22, shade(c, -r * 0.1), 2);
      break;
    }
    case 'kit': {
      const b = BUILDING_MAP.get(id);
      if (b) {
        const spr = buildingSprite(id, 0, 64);
        const sc = Math.min((s * 0.86) / spr.width, (s * 0.86) / spr.height);
        ctx.drawImage(spr, m - (spr.width * sc) / 2, m - (spr.height * sc) / 2, spr.width * sc, spr.height * sc);
      }
      break;
    }
    case 'rune': {
      poly(ctx, [m, s * 0.1, s * 0.82, s * 0.38, s * 0.72, s * 0.86, s * 0.28, s * 0.86, s * 0.18, s * 0.38]);
      ctx.fillStyle = '#4a4440'; ctx.fill(); ctx.strokeStyle = '#22201e'; ctx.lineWidth = s / 20; ctx.stroke();
      ctx.strokeStyle = c; ctx.lineWidth = s / 14; ctx.shadowColor = c; ctx.shadowBlur = s / 5;
      ctx.beginPath(); ctx.moveTo(m, s * 0.3); ctx.lineTo(m, s * 0.7); ctx.moveTo(m * 0.7, s * 0.45); ctx.lineTo(m * 1.3, s * 0.58); ctx.stroke();
      break;
    }
    case 'shard': {
      ctx.shadowColor = c; ctx.shadowBlur = s / 4;
      poly(ctx, [m, s * 0.06, s * 0.68, s * 0.45, m * 1.1, s * 0.94, s * 0.32, s * 0.5]);
      const g = ctx.createLinearGradient(s * 0.3, 0, s * 0.7, s);
      g.addColorStop(0, shade(c, 0.6)); g.addColorStop(1, shade(c, -0.4));
      ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.4)'; poly(ctx, [m, s * 0.1, s * 0.6, s * 0.45, m, s * 0.5]); ctx.fill();
      break;
    }
    case 'bone': {
      ctx.strokeStyle = c; ctx.lineWidth = s / 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s * 0.28, s * 0.72); ctx.lineTo(s * 0.72, s * 0.28); ctx.stroke();
      ctx.fillStyle = c;
      for (const [x, y] of [[0.22, 0.7], [0.3, 0.8], [0.7, 0.2], [0.8, 0.3]]) { ctx.beginPath(); ctx.arc(s * x, s * y, s * 0.09, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'heart': {
      glow(ctx, m, m, m, c, 0.7);
      ctx.fillStyle = shade(c, -0.2);
      ctx.beginPath(); ctx.moveTo(m, s * 0.82);
      ctx.bezierCurveTo(s * 0.1, s * 0.5, s * 0.25, s * 0.12, m, s * 0.32);
      ctx.bezierCurveTo(s * 0.75, s * 0.12, s * 0.9, s * 0.5, m, s * 0.82); ctx.fill();
      ctx.strokeStyle = shade(c, 0.5); ctx.lineWidth = s / 24; ctx.stroke();
      break;
    }
    case 'bomb': {
      ctx.fillStyle = '#3a3634'; ctx.beginPath(); ctx.arc(m, m * 1.1, m * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a8070'; ctx.lineWidth = s / 20; ctx.stroke();
      ctx.strokeStyle = '#c9a070'; ctx.beginPath(); ctx.moveTo(m * 1.2, m * 0.6); ctx.quadraticCurveTo(m * 1.5, m * 0.2, m * 1.7, m * 0.35); ctx.stroke();
      glow(ctx, m * 1.7, m * 0.35, m * 0.35, c, 0.9);
      break;
    }
    case 'crate': {
      plate(ctx, s * 0.15, s * 0.2, s * 0.7, s * 0.62, '#6a5030', 3);
      ctx.strokeStyle = c; ctx.lineWidth = s / 14;
      ctx.strokeRect(s * 0.2, s * 0.25, s * 0.6, s * 0.52);
      ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.25); ctx.lineTo(s * 0.8, s * 0.77); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** Equipment icons, framed by rarity color. */
export function equipIcon(e: Equip, size = 48, colorblind = false): string {
  const key = `eq:${e.base}:${e.rarity}:${size}:${colorblind}`;
  let u = cache.get(key);
  if (u) return u;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const rc = colorblind ? RARITIES[e.rarity].cbColor : RARITIES[e.rarity].color;
  if (e.rarity >= 2) glow(ctx, size / 2, size / 2, size * 0.55, rc, e.rarity >= 4 ? 0.45 : 0.25);
  drawEquipShape(ctx, BASE_MAP.get(e.base)!.shape, size, e.rarity >= 4 ? rc : '#b6c3cf');
  u = c.toDataURL();
  cache.set(key, u);
  return u;
}

export function drawEquipShape(ctx: Ctx, shape: string, s: number, metal: string) {
  const m = s / 2;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const blade = (len: number, w: number, color = metal) => {
    const g = ctx.createLinearGradient(-w, 0, w, 0);
    g.addColorStop(0, shade(color, 0.4)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.4));
    ctx.fillStyle = g;
    poly(ctx, [-w, 0, -w, -len, 0, -len - w * 2, w, -len, w, 0]); ctx.fill();
    ctx.strokeStyle = shade(color, -0.6); ctx.lineWidth = 1; ctx.stroke();
  };
  const handle = (len: number) => { ctx.fillStyle = '#5a3a22'; ctx.fillRect(-s * 0.03, 0, s * 0.06, len); ctx.fillStyle = '#c9a24a'; ctx.fillRect(-s * 0.12, -s * 0.02, s * 0.24, s * 0.05); };
  switch (shape) {
    case 'sword': case 'dagger': {
      ctx.translate(m, m); ctx.rotate(Math.PI / 4); ctx.translate(0, s * 0.18);
      blade(shape === 'dagger' ? s * 0.35 : s * 0.55, s * 0.06); handle(s * 0.18);
      break;
    }
    case 'spear': {
      ctx.translate(m, m); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(-s * 0.025, -s * 0.3, s * 0.05, s * 0.75);
      ctx.translate(0, -s * 0.28); blade(s * 0.15, s * 0.07);
      break;
    }
    case 'axe': case 'greataxe': {
      ctx.translate(m, m); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(-s * 0.03, -s * 0.38, s * 0.06, s * 0.78);
      const big = shape === 'greataxe' ? 1.4 : 1;
      ctx.fillStyle = metal;
      ctx.beginPath(); ctx.moveTo(0, -s * 0.36); ctx.quadraticCurveTo(s * 0.32 * big, -s * 0.38, s * 0.28 * big, -s * 0.1); ctx.quadraticCurveTo(s * 0.15, -s * 0.18, 0, -s * 0.14); ctx.closePath();
      const g = ctx.createLinearGradient(0, -s * 0.4, s * 0.3, -s * 0.1); g.addColorStop(0, shade(metal, 0.4)); g.addColorStop(1, shade(metal, -0.4)); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = shade(metal, -0.6); ctx.lineWidth = 1; ctx.stroke();
      if (shape === 'greataxe') { ctx.scale(-1, 1); ctx.fill(); ctx.stroke(); }
      break;
    }
    case 'mace': case 'hammer': {
      ctx.translate(m, m); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(-s * 0.03, -s * 0.2, s * 0.06, s * 0.6);
      if (shape === 'hammer') { plate(ctx, -s * 0.24, -s * 0.38, s * 0.48, s * 0.2, metal, 2); rivet(ctx, 0, -s * 0.28, s * 0.04); }
      else { ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(0, -s * 0.26, s * 0.13, 0, Math.PI * 2); ctx.fill(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.fillStyle = shade(metal, -0.3); poly(ctx, [Math.cos(a) * s * 0.12, -s * 0.26 + Math.sin(a) * s * 0.12, Math.cos(a + 0.3) * s * 0.2, -s * 0.26 + Math.sin(a + 0.3) * s * 0.2, Math.cos(a + 0.5) * s * 0.12, -s * 0.26 + Math.sin(a + 0.5) * s * 0.12]); ctx.fill(); } }
      break;
    }
    case 'shield': case 'tower': {
      const w = shape === 'tower' ? 0.62 : 0.56, h = shape === 'tower' ? 0.78 : 0.7;
      ctx.beginPath(); ctx.moveTo(m - s * w / 2, s * 0.14); ctx.lineTo(m + s * w / 2, s * 0.14); ctx.lineTo(m + s * w / 2, s * (0.14 + h * 0.55)); ctx.quadraticCurveTo(m + s * w / 2, s * (0.14 + h), m, s * (0.14 + h)); ctx.quadraticCurveTo(m - s * w / 2, s * (0.14 + h), m - s * w / 2, s * (0.14 + h * 0.55)); ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#6a5a4a'); g.addColorStop(1, '#3a2e24'); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = metal; ctx.lineWidth = s / 14; ctx.stroke();
      ctx.strokeStyle = shade(metal, -0.2); ctx.lineWidth = s / 20; ctx.beginPath(); ctx.moveTo(m, s * 0.18); ctx.lineTo(m, s * 0.8); ctx.moveTo(m - s * 0.2, s * 0.38); ctx.lineTo(m + s * 0.2, s * 0.38); ctx.stroke();
      rivet(ctx, m, s * 0.38, s * 0.05);
      break;
    }
    case 'focus': gearShape(ctx, m, m, s * 0.32, 10, 0.3, metal); glow(ctx, m, m, s * 0.2, '#7ae0c0', 0.8); break;
    case 'helm': case 'hood': {
      ctx.beginPath(); ctx.arc(m, m * 1.05, s * 0.3, Math.PI, 0); ctx.lineTo(m + s * 0.3, s * 0.78); ctx.lineTo(m - s * 0.3, s * 0.78); ctx.closePath();
      ctx.fillStyle = shape === 'hood' ? '#4a3a30' : metal; ctx.fill(); ctx.strokeStyle = shade(metal, -0.6); ctx.lineWidth = 1.5; ctx.stroke();
      if (shape === 'helm') { ctx.fillStyle = '#1a1614'; ctx.fillRect(m - s * 0.2, m * 1.0, s * 0.4, s * 0.06); ctx.fillRect(m - s * 0.03, m * 1.0, s * 0.06, s * 0.2); }
      else { ctx.fillStyle = '#1a1614'; ctx.beginPath(); ctx.ellipse(m, m * 1.25, s * 0.17, s * 0.15, 0, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'plate': case 'coat': {
      const col = shape === 'coat' ? '#6a5040' : metal;
      poly(ctx, [m - s * 0.32, s * 0.2, m - s * 0.12, s * 0.15, m, s * 0.24, m + s * 0.12, s * 0.15, m + s * 0.32, s * 0.2, m + s * 0.36, s * 0.45, m + s * 0.26, s * 0.48, m + s * 0.26, s * 0.85, m - s * 0.26, s * 0.85, m - s * 0.26, s * 0.48, m - s * 0.36, s * 0.45]);
      const g = ctx.createLinearGradient(0, s * 0.15, 0, s * 0.85); g.addColorStop(0, shade(col, 0.3)); g.addColorStop(1, shade(col, -0.4)); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = shade(col, -0.6); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = shade(col, -0.3); ctx.beginPath(); ctx.moveTo(m, s * 0.25); ctx.lineTo(m, s * 0.85); ctx.stroke();
      break;
    }
    case 'gloves': {
      plate(ctx, m - s * 0.2, s * 0.25, s * 0.4, s * 0.45, metal, 6);
      for (let i = 0; i < 4; i++) plate(ctx, m - s * 0.2 + i * s * 0.1, s * 0.12, s * 0.09, s * 0.18, shade(metal, -0.1), 2);
      break;
    }
    case 'boots': {
      plate(ctx, m - s * 0.15, s * 0.15, s * 0.22, s * 0.5, metal, 3);
      plate(ctx, m - s * 0.15, s * 0.58, s * 0.42, s * 0.22, shade(metal, -0.1), 4);
      break;
    }
    case 'belt': {
      ctx.fillStyle = '#6a4a30'; roundRect(ctx, s * 0.1, s * 0.4, s * 0.8, s * 0.2, 4); ctx.fill();
      plate(ctx, m - s * 0.12, s * 0.36, s * 0.24, s * 0.28, '#c9a24a', 3);
      break;
    }
    case 'amulet': case 'ring': case 'relic': {
      if (shape === 'ring') { ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = s / 10; ctx.beginPath(); ctx.arc(m, m * 1.1, s * 0.22, 0, Math.PI * 2); ctx.stroke(); glow(ctx, m, m * 0.62, s * 0.14, metal === '#b6c3cf' ? '#7ad7ff' : metal, 1); }
      else if (shape === 'amulet') { ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = s / 24; ctx.beginPath(); ctx.arc(m, m * 0.6, s * 0.28, 0.2, Math.PI - 0.2); ctx.stroke(); glow(ctx, m, m * 1.2, s * 0.22, metal === '#b6c3cf' ? '#ff6a3a' : metal, 1); ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(m, m * 1.2, s * 0.1, 0, Math.PI * 2); ctx.fill(); }
      else { plate(ctx, m - s * 0.22, s * 0.25, s * 0.44, s * 0.5, '#5a4a3a', 4); gearShape(ctx, m, m, s * 0.15, 8, 0, '#c9a24a'); glow(ctx, m, m, s * 0.18, '#ffd27a', 0.6); }
      break;
    }
  }
  ctx.restore();
}

/** Skill icons: glyph on a dark disc. */
export function skillIcon(id: string, size = 48): string {
  const key = `sk:${id}:${size}`;
  let u = cache.get(key);
  if (u) return u;
  const def = SKILL_MAP.get(id)!;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const s = size, m = s / 2;
  const col = { attack: '#f2e6d0', movement: '#7ad7ff', aoe: '#ffb04a', defense: '#6ab0ff', buff: '#ffd27a', ultimate: '#ff6a2a' }[def.kind];
  const g = ctx.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, '#2a2420'); g.addColorStop(1, '#0e0c0b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  glow(ctx, m, m, m * 0.8, col, 0.35);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = s / 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = col; ctx.shadowBlur = s / 6;
  switch (def.icon) {
    case 'arc': ctx.beginPath(); ctx.arc(m * 0.8, m * 1.2, m * 0.7, -Math.PI * 0.6, Math.PI * 0.1); ctx.stroke(); ctx.lineWidth = s / 24; ctx.beginPath(); ctx.arc(m * 0.8, m * 1.2, m * 0.5, -Math.PI * 0.5, 0); ctx.stroke(); break;
    case 'dash': for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.4 + i * 0.3; poly(ctx, [m * (0.4 + i * 0.35), m * 0.5, m * (0.75 + i * 0.35), m, m * (0.4 + i * 0.35), m * 1.5]); ctx.stroke(); } break;
    case 'quake': ctx.beginPath(); ctx.moveTo(m * 0.3, m * 1.4); ctx.lineTo(m * 0.7, m * 0.9); ctx.lineTo(m, m * 1.3); ctx.lineTo(m * 1.3, m * 0.7); ctx.lineTo(m * 1.7, m * 1.4); ctx.stroke(); ctx.beginPath(); ctx.ellipse(m, m * 1.45, m * 0.7, m * 0.15, 0, 0, Math.PI * 2); ctx.stroke(); break;
    case 'shield': ctx.beginPath(); ctx.moveTo(m * 0.5, m * 0.4); ctx.lineTo(m * 1.5, m * 0.4); ctx.lineTo(m * 1.5, m); ctx.quadraticCurveTo(m * 1.5, m * 1.6, m, m * 1.7); ctx.quadraticCurveTo(m * 0.5, m * 1.6, m * 0.5, m); ctx.closePath(); ctx.stroke(); break;
    case 'horn': ctx.beginPath(); ctx.moveTo(m * 0.4, m * 0.8); ctx.quadraticCurveTo(m * 1.2, m * 0.6, m * 1.6, m * 0.4); ctx.lineTo(m * 1.6, m * 1.5); ctx.quadraticCurveTo(m * 1.2, m * 1.2, m * 0.4, m * 1.15); ctx.closePath(); ctx.stroke(); break;
    case 'hammer': ctx.fillRect(m * 0.5, m * 0.4, m, m * 0.45); ctx.fillRect(m * 0.92, m * 0.8, m * 0.16, m * 0.9); break;
  }
  u = c.toDataURL();
  cache.set(key, u);
  return u;
}

export function rarityColor(r: number, colorblind: boolean) {
  return colorblind ? RARITIES[r].cbColor : RARITIES[r].color;
}
export { rgba };
