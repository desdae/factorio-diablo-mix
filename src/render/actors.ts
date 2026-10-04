import { RARITIES } from '../data/equipment';
import { BASE_MAP } from '../data/equipment';
import { ELITE_MODS } from '../data/enemies';
import type { Player } from '../game/player';
import type { Enemy, Npc } from '../game/types';
import { shade, rgba, glow, poly, type Ctx } from './draw';

/** All actor drawing is in tile units (ctx already scaled so 1 unit = 1 tile). */

function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0.35) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

export function drawPlayer(ctx: Ctx, pl: Player, t: number) {
  const x = pl.x, y = pl.y;
  const moving = Math.hypot(pl.vx, pl.vy) > 0.3 || pl.dodgeT > 0 || pl.dashT > 0;
  const phase = moving ? Math.sin(pl.anim * 11) : 0;
  const face = pl.facing;
  const fx = Math.cos(face), fy = Math.sin(face);
  const body = pl.gear.body ? RARITIES[pl.gear.body.rarity].color : '#8a8a8a';
  const flash = pl.hitFlash > 0;
  const bob = moving ? Math.abs(phase) * 0.04 : Math.sin(t * 2) * 0.01;
  const dodgeLean = pl.dodgeT > 0 ? 0.25 : 0;
  shadow(ctx, x, y + 0.05, 0.36, 0.15);
  if (pl.buffs.bulwark > 0) { ctx.strokeStyle = rgba('#6ab0ff', 0.5 + Math.sin(t * 8) * 0.2); ctx.lineWidth = 0.06; ctx.beginPath(); ctx.ellipse(x, y - 0.55, 0.62, 0.8, 0, 0, Math.PI * 2); ctx.stroke(); }
  if (pl.buffs.horn > 0) glow(ctx, x, y - 0.5, 0.9, '#ffd27a', 0.18);
  ctx.save();
  ctx.translate(x, y);
  if (dodgeLean) ctx.rotate(fx * dodgeLean);
  const behindWeapon = fy < -0.3;
  // cape
  ctx.fillStyle = flash ? '#ffffff' : '#5a1e1e';
  ctx.beginPath();
  ctx.moveTo(-0.22, -0.95 - bob); ctx.lineTo(0.22, -0.95 - bob);
  ctx.lineTo(0.26 - fx * 0.15, -0.3 + Math.sin(t * 4) * 0.03); ctx.lineTo(-0.26 - fx * 0.15, -0.3 + Math.cos(t * 4) * 0.03);
  ctx.closePath(); ctx.fill();
  // legs
  ctx.strokeStyle = flash ? '#fff' : '#2e2a26'; ctx.lineWidth = 0.13; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-0.1, -0.45); ctx.lineTo(-0.1 + phase * 0.12, -0.03); ctx.moveTo(0.1, -0.45); ctx.lineTo(0.1 - phase * 0.12, -0.03); ctx.stroke();
  ctx.fillStyle = flash ? '#fff' : '#4a3a2a';
  ctx.fillRect(-0.17 + phase * 0.12, -0.08, 0.14, 0.07); ctx.fillRect(0.03 - phase * 0.12, -0.08, 0.14, 0.07);
  if (behindWeapon) drawWeapon(ctx, pl, t, bob);
  // torso
  const g = ctx.createLinearGradient(-0.25, -1, 0.25, -0.4);
  g.addColorStop(0, flash ? '#fff' : shade(body, 0.1)); g.addColorStop(1, flash ? '#ddd' : shade(body, -0.55));
  ctx.fillStyle = g;
  poly(ctx, [-0.25, -0.98 - bob, 0.25, -0.98 - bob, 0.2, -0.42, -0.2, -0.42]); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.025; ctx.stroke();
  ctx.fillStyle = '#c9a24a'; ctx.fillRect(-0.21, -0.52, 0.42, 0.06);
  // pauldrons
  ctx.fillStyle = flash ? '#fff' : shade(body, -0.2);
  ctx.beginPath(); ctx.arc(-0.26, -0.92 - bob, 0.1, 0, Math.PI * 2); ctx.arc(0.26, -0.92 - bob, 0.1, 0, Math.PI * 2); ctx.fill();
  // head + helm
  const helm = pl.gear.helmet ? '#9aa4ae' : '#c8a080';
  ctx.fillStyle = flash ? '#fff' : helm;
  ctx.beginPath(); ctx.arc(0, -1.13 - bob, 0.17, 0, Math.PI * 2); ctx.fill();
  if (pl.gear.helmet) {
    ctx.fillStyle = '#1a1614'; ctx.fillRect(-0.12 + fx * 0.04, -1.15 - bob + fy * 0.02, 0.24, 0.04);
    ctx.fillStyle = '#c9a24a'; ctx.fillRect(-0.02, -1.32 - bob, 0.04, 0.12);
  }
  // shield
  if (pl.gear.offhand && BASE_MAP.get(pl.gear.offhand.base)!.slot === 'offhand') {
    const sx = -fy * 0.28 + fx * 0.12, sy = -0.7 + fx * 0.05;
    ctx.save(); ctx.translate(sx, sy - bob);
    const sc = pl.buffs.bulwark > 0 ? 1.25 : 1;
    ctx.scale(sc, sc);
    ctx.fillStyle = flash ? '#fff' : '#5a4a3a';
    ctx.beginPath(); ctx.moveTo(-0.17, -0.2); ctx.lineTo(0.17, -0.2); ctx.lineTo(0.17, 0.05); ctx.quadraticCurveTo(0.17, 0.25, 0, 0.3); ctx.quadraticCurveTo(-0.17, 0.25, -0.17, 0.05); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = RARITIES[pl.gear.offhand.rarity].color; ctx.lineWidth = 0.035; ctx.stroke();
    ctx.restore();
  }
  if (!behindWeapon) drawWeapon(ctx, pl, t, bob);
  ctx.restore();
  // gather progress
  if (pl.gatherTarget) {
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.arc(x, y - 1.6, 0.18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, pl.gatherT)); ctx.stroke();
  }
}

function drawWeapon(ctx: Ctx, pl: Player, t: number, bob: number) {
  const w = pl.gear.mainhand;
  const base = w ? BASE_MAP.get(w.base)! : null;
  let ang = pl.facing + 0.9;
  let ext = 0.55;
  const a = pl.action;
  if (a && a.skill === 'cleave') {
    const k = Math.min(1, a.t / Math.max(0.01, a.hitAt * 1.4));
    ang = a.angle - 1.3 + k * 2.6;
    ext = 0.7;
  } else if (a && (a.skill === 'slam' || a.skill === 'judgement')) {
    const k = Math.min(1, a.t / Math.max(0.01, a.hitAt));
    ang = a.angle - Math.PI * 0.7 * (1 - k);
    ext = 0.65;
  }
  const len = base?.twoHanded ? 1.0 : base?.reach && base.reach > 1.1 ? 1.1 : 0.8;
  const hx = Math.cos(ang) * 0.25, hy = -0.72 - bob + Math.sin(ang) * 0.18;
  const tx = hx + Math.cos(ang) * len * ext * 1.3, ty = hy + Math.sin(ang) * len * ext;
  const col = w ? (w.rarity >= 4 ? RARITIES[w.rarity].color : '#c8d0d8') : '#c8a080';
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 0.06; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + (tx - hx) * 0.25, hy + (ty - hy) * 0.25); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = base?.shape === 'greataxe' || base?.shape === 'hammer' || base?.shape === 'mace' ? 0.07 : 0.09;
  ctx.beginPath(); ctx.moveTo(hx + (tx - hx) * 0.25, hy + (ty - hy) * 0.25); ctx.lineTo(tx, ty); ctx.stroke();
  if (base && (base.shape === 'axe' || base.shape === 'greataxe' || base.shape === 'hammer' || base.shape === 'mace')) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(tx, ty, base.shape === 'mace' ? 0.11 : 0.14, 0, Math.PI * 2); ctx.fill();
  }
  if (w && w.rarity >= 4) glow(ctx, tx, ty, 0.35, RARITIES[w.rarity].color, 0.5 + Math.sin(t * 5) * 0.2);
}

export function drawEnemy(ctx: Ctx, e: Enemy, t: number, colorblind: boolean) {
  const x = e.x, y = e.y;
  const dead = e.dead;
  const alpha = dead ? Math.max(0, 1 - e.deathT / 1.2) : 1;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const flash = e.hitFlash > 0;
  const frozen = e.st.frozen > 0;
  const R = e.r;
  const fly = e.def.flying ? 0.7 + Math.sin(e.anim * 3) * 0.1 : 0;
  if (e.state !== 'burrowed') shadow(ctx, x, y + 0.05, R * 1.05, R * 0.45, fly ? 0.2 : 0.35);
  if (e.champion || e.elite.length) {
    const mod = ELITE_MODS.find((m) => m.id === e.elite[0]);
    const c = mod?.color ?? '#ffe05a';
    ctx.strokeStyle = rgba(c, 0.7); ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.ellipse(x, y + 0.02, R * 1.35, R * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    glow(ctx, x, y - R, R * 2, c, 0.18);
  }
  if (e.st.mark > 0) { ctx.strokeStyle = '#ff3a3a'; ctx.lineWidth = 0.04; ctx.setLineDash([0.1, 0.08]); ctx.beginPath(); ctx.arc(x, y - R, R * 1.4, t * 2, t * 2 + Math.PI * 1.6); ctx.stroke(); ctx.setLineDash([]); }
  ctx.translate(x, y - fly);
  if (dead) { ctx.translate(0, e.deathT * 0.15); ctx.scale(1 + e.deathT * 0.1, 1 - Math.min(0.6, e.deathT * 0.5)); }
  const body = flash ? '#ffffff' : frozen ? '#9ad0f0' : e.def.color;
  const acc = flash ? '#ffffff' : frozen ? '#e0f6ff' : e.def.accent;
  const windup = e.state === 'windup' ? 1 - Math.max(0, e.stateT) / Math.max(0.01, e.def.windup) : 0;
  const walk = Math.sin(e.anim * 10) * (Math.hypot(e.vx, e.vy) > 0.2 ? 1 : 0.15);
  const f = e.facing, fx = Math.cos(f), fy = Math.sin(f);
  switch (e.def.id) {
    case 'husk': {
      ctx.strokeStyle = shade(body, -0.4); ctx.lineWidth = 0.08; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-0.1, -0.3); ctx.lineTo(-0.12 + walk * 0.1, 0); ctx.moveTo(0.1, -0.3); ctx.lineTo(0.12 - walk * 0.1, 0); ctx.stroke();
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(fx * 0.06, -0.48, 0.2, 0.25, fx * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = acc; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(-0.08, -0.6); ctx.lineTo(0.02, -0.45); ctx.lineTo(-0.05, -0.32); ctx.stroke();
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(fx * 0.14, -0.72, 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = acc; ctx.fillRect(fx * 0.18 - 0.05, -0.75, 0.04, 0.03); ctx.fillRect(fx * 0.18 + 0.01, -0.75, 0.04, 0.03);
      ctx.strokeStyle = shade(body, -0.3); ctx.lineWidth = 0.06;
      const reach = windup * 0.25;
      ctx.beginPath(); ctx.moveTo(0, -0.55); ctx.lineTo(fx * (0.3 + reach), -0.45 + fy * (0.2 + reach)); ctx.stroke();
      break;
    }
    case 'spitter': {
      ctx.fillStyle = shade(body, -0.2);
      for (let i = 0; i < 4; i++) { const lx = (i - 1.5) * 0.15; ctx.fillRect(lx - 0.03, -0.2 + Math.sin(e.anim * 10 + i) * 0.03, 0.06, 0.2); }
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -0.32, 0.32, 0.18, 0, 0, Math.PI * 2); ctx.fill();
      const sac = 0.2 + windup * 0.08 + Math.sin(t * 4) * 0.01;
      const g = ctx.createRadialGradient(-0.05, -0.55, 0, -0.05, -0.5, sac);
      g.addColorStop(0, shade(acc, 0.4)); g.addColorStop(1, shade(acc, -0.3));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-fx * 0.08, -0.52, sac, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = body; ctx.lineWidth = 0.09; ctx.beginPath(); ctx.moveTo(fx * 0.15, -0.35); ctx.quadraticCurveTo(fx * 0.3, -0.6, fx * 0.38, -0.55 + windup * 0.1); ctx.stroke();
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(fx * 0.4, -0.55, 0.05, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'brute': {
      ctx.fillStyle = shade(body, -0.3); ctx.fillRect(-0.3, -0.35, 0.18, 0.35 + walk * 0.04); ctx.fillRect(0.12, -0.35, 0.18, 0.35 - walk * 0.04);
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -0.75, 0.48, 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(-fx * 0.05, -0.75, 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(body, 0.1); ctx.beginPath(); ctx.arc(0, -1.15, 0.15, 0, Math.PI * 2); ctx.fill();
      // slag shield in facing direction
      ctx.save(); ctx.translate(fx * 0.48, -0.65 + fy * 0.25); ctx.rotate(f + Math.PI / 2);
      const sg = ctx.createLinearGradient(-0.4, 0, 0.4, 0); sg.addColorStop(0, '#3a3430'); sg.addColorStop(0.5, '#6a5a4a'); sg.addColorStop(1, '#2a2420');
      ctx.fillStyle = flash ? '#fff' : sg; ctx.fillRect(-0.42, -0.12, 0.84, 0.2);
      ctx.fillStyle = rgba('#ff8a3a', 0.6); ctx.fillRect(-0.35, -0.03, 0.7, 0.03);
      ctx.restore();
      if (windup > 0) glow(ctx, fx * 0.6, -0.8, 0.5, '#ffb04a', windup * 0.6);
      break;
    }
    case 'tunneler': {
      if (e.state === 'burrowed') {
        ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.ellipse(0, 0, 0.5, 0.25, 0, Math.PI, 0); ctx.fill();
        for (let i = 0; i < 3; i++) { ctx.fillStyle = '#7a6a5a'; ctx.beginPath(); ctx.arc(Math.sin(t * 9 + i * 2) * 0.3, -0.05 - (i % 2) * 0.08, 0.06, 0, Math.PI * 2); ctx.fill(); }
        break;
      }
      for (let i = 3; i >= 0; i--) {
        const sx = -fx * i * 0.18, sy = -0.3 - i * 0.05 + Math.sin(e.anim * 8 + i) * 0.03 - fy * i * 0.08;
        ctx.fillStyle = shade(body, -i * 0.08); ctx.beginPath(); ctx.ellipse(sx, sy, 0.24 - i * 0.03, 0.2 - i * 0.02, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = shade(body, -0.4); ctx.lineWidth = 0.02; ctx.stroke();
      }
      ctx.strokeStyle = acc; ctx.lineWidth = 0.05;
      const o = 0.12 + windup * 0.1;
      ctx.beginPath(); ctx.moveTo(fx * 0.18, -0.36); ctx.lineTo(fx * 0.38 - fy * o, -0.34 + fy * 0.2 + fx * o * 0.5); ctx.moveTo(fx * 0.18, -0.24); ctx.lineTo(fx * 0.38 + fy * o, -0.22 + fy * 0.2 - fx * o * 0.5); ctx.stroke();
      break;
    }
    case 'bloat': {
      const swell = 1 + windup * 0.35 + Math.sin(t * 3 + e.id) * 0.03;
      ctx.fillStyle = shade(body, -0.3); ctx.fillRect(-0.2, -0.15, 0.1, 0.15); ctx.fillRect(0.1, -0.15, 0.1, 0.15);
      const g = ctx.createRadialGradient(-0.1, -0.7, 0, 0, -0.55, 0.5 * swell);
      g.addColorStop(0, shade(acc, 0.2)); g.addColorStop(0.5, body); g.addColorStop(1, shade(body, -0.4));
      ctx.fillStyle = flash ? '#fff' : g; ctx.beginPath(); ctx.arc(0, -0.55, 0.48 * swell, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = acc; ctx.lineWidth = 0.03;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, -0.55, 0.48 * swell, i * 1.6 + t * 0.3, i * 1.6 + 0.5 + t * 0.3); ctx.stroke(); }
      glow(ctx, 0, -0.55, 0.8 * swell, acc, 0.25 + windup * 0.5);
      break;
    }
    case 'hexcaller': {
      ctx.fillStyle = body;
      poly(ctx, [-0.26, 0, 0.26, 0, 0.14, -0.9, -0.14, -0.9]); ctx.fill();
      ctx.fillStyle = shade(body, -0.4); ctx.beginPath(); ctx.arc(0, -1.0, 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = acc; ctx.fillRect(-0.06, -1.02, 0.04, 0.03); ctx.fillRect(0.02, -1.02, 0.04, 0.03);
      ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(0.3, 0); ctx.lineTo(0.3, -1.25); ctx.stroke();
      glow(ctx, 0.3, -1.3, 0.3, acc, 0.6 + windup * 0.4);
      for (let i = 0; i < 3; i++) { const a = t * 2 + i * 2.1; ctx.fillStyle = rgba(acc, 0.8); ctx.fillRect(Math.cos(a) * 0.45 - 0.03, -0.7 + Math.sin(a) * 0.15, 0.06, 0.1); }
      break;
    }
    case 'mender': {
      ctx.fillStyle = body; poly(ctx, [-0.18, 0, 0.18, 0, 0.1, -0.8, -0.1, -0.8]); ctx.fill();
      ctx.fillStyle = shade(body, 0.2); ctx.beginPath(); ctx.arc(0, -0.9, 0.13, 0, Math.PI * 2); ctx.fill();
      const oy = -1.25 + Math.sin(t * 3) * 0.06;
      glow(ctx, 0, oy, 0.35, acc, 0.7);
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(0, oy, 0.08, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'stalker': {
      ctx.strokeStyle = body; ctx.lineWidth = 0.07; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-0.08, -0.45); ctx.lineTo(-0.15 + walk * 0.15, 0); ctx.moveTo(0.08, -0.45); ctx.lineTo(0.15 - walk * 0.15, 0); ctx.stroke();
      ctx.fillStyle = body; poly(ctx, [-0.15, -0.45, 0.15, -0.45, 0.1, -0.95, -0.1, -0.95]); ctx.fill();
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(fx * 0.05, -1.05, 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = acc; ctx.lineWidth = 0.04;
      const s = windup * 0.4;
      ctx.beginPath(); ctx.moveTo(0.12, -0.85); ctx.lineTo(0.12 + fx * (0.45 + s), -0.6 + fy * 0.3); ctx.moveTo(-0.12, -0.85); ctx.lineTo(-0.12 + fx * (0.45 + s), -0.6 + fy * 0.3 + 0.1); ctx.stroke();
      glow(ctx, 0, -0.7, 0.6, acc, 0.15 + Math.sin(t * 7) * 0.05);
      break;
    }
    case 'moth': {
      const flap = Math.sin(e.anim * 20) * 0.5 + 0.5;
      ctx.fillStyle = rgba(shade(body, 0.2), 0.85);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.25 * (0.6 + flap * 0.4), -0.4, 0.28 * (0.5 + flap * 0.5), 0.18, s * 0.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -0.4, 0.08, 0.2, 0, 0, Math.PI * 2); ctx.fill();
      glow(ctx, 0, -0.3, 0.35, acc, 0.7);
      break;
    }
    case 'matriarch': {
      const R2 = 1.2;
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1, k = i % 3;
        const lx = side * (0.5 + k * 0.25), ly = -0.2 + Math.sin(e.anim * 6 + i) * 0.08;
        ctx.strokeStyle = shade(body, -0.3); ctx.lineWidth = 0.09;
        ctx.beginPath(); ctx.moveTo(side * 0.3, -0.6); ctx.lineTo(lx, -0.85); ctx.lineTo(lx + side * 0.2, ly); ctx.stroke();
      }
      const g = ctx.createRadialGradient(-fx * 0.6, -0.9, 0, -fx * 0.6, -0.8, 0.9);
      g.addColorStop(0, shade(acc, -0.1)); g.addColorStop(1, shade(acc, -0.6));
      ctx.fillStyle = flash ? '#fff' : g; ctx.beginPath(); ctx.ellipse(-fx * 0.6, -0.85, 0.8, 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(fx * 0.3, -0.75, R2 * 0.55, 0.5, f * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(body, 0.1); ctx.beginPath(); ctx.arc(fx * 0.85, -0.8 + fy * 0.2, 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = acc; ctx.lineWidth = 0.07;
      const open = 0.25 + windup * 0.25;
      ctx.beginPath(); ctx.moveTo(fx * 1.05, -0.85); ctx.lineTo(fx * 1.4 - fy * open, -0.85 + fy * 0.3 + fx * open); ctx.moveTo(fx * 1.05, -0.75); ctx.lineTo(fx * 1.4 + fy * open, -0.75 + fy * 0.3 - fx * open); ctx.stroke();
      ctx.fillStyle = acc; ctx.fillRect(fx * 0.95 - 0.1, -0.9, 0.06, 0.05); ctx.fillRect(fx * 0.95 + 0.04, -0.9, 0.06, 0.05);
      break;
    }
    case 'colossus': {
      const ph = e.phase;
      ctx.fillStyle = shade(body, -0.25);
      ctx.fillRect(-0.85, -0.9, 0.5, 0.9 + walk * 0.05); ctx.fillRect(0.35, -0.9, 0.5, 0.9 - walk * 0.05);
      const g = ctx.createLinearGradient(-1, -2.6, 1, -0.6);
      g.addColorStop(0, shade(body, 0.2)); g.addColorStop(1, shade(body, -0.4));
      ctx.fillStyle = flash ? '#fff' : g;
      poly(ctx, [-1.15, -2.5, 1.15, -2.5, 0.95, -0.8, -0.95, -0.8]); ctx.fill();
      ctx.strokeStyle = '#1a1412'; ctx.lineWidth = 0.05; ctx.stroke();
      // molten core visible through cracks; brighter in later phases
      const coreA = 0.5 + ph * 0.18 + Math.sin(t * 6) * 0.1;
      glow(ctx, 0, -1.7, 1.0 + ph * 0.2, acc, coreA);
      ctx.fillStyle = shade(acc, 0.3); ctx.beginPath(); ctx.arc(0, -1.7, 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = acc; ctx.lineWidth = 0.04;
      for (let i = 0; i < 5; i++) { const a = i * 1.25 + 0.3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 0.3, -1.7 + Math.sin(a) * 0.3); ctx.lineTo(Math.cos(a) * 0.8, -1.7 + Math.sin(a) * 0.6); ctx.stroke(); }
      // head
      plate2(ctx, -0.35, -3.05, 0.7, 0.55, body);
      ctx.fillStyle = acc; ctx.fillRect(-0.22, -2.85, 0.44, 0.08);
      // hammer arm
      const raise = e.state === 'windup' ? -windup * 1.2 : 0;
      ctx.save(); ctx.translate(fx * 1.15, -2.1); ctx.rotate(f * 0.3 + raise);
      ctx.fillStyle = shade(body, -0.1); ctx.fillRect(-0.15, 0, 0.3, 1.2);
      plate2(ctx, -0.5, 1.1, 1.0, 0.6, '#4a4440');
      glow(ctx, 0, 1.4, 0.5, acc, 0.4 + windup * 0.4);
      ctx.restore();
      ctx.fillStyle = shade(body, -0.1); ctx.fillRect(-fx * 1.2 - 0.15, -2.2, 0.3, 1.1);
      break;
    }
    default: {
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, -R, R, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (e.st.stun > 0 && !dead) {
    for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.1; ctx.fillStyle = '#ffe05a'; ctx.beginPath(); ctx.arc(Math.cos(a) * 0.25, -R * 2.4 - 0.2 + Math.sin(a) * 0.08, 0.05, 0, Math.PI * 2); ctx.fill(); }
  }
  if (e.st.burn > 0) glow(ctx, 0, -R, R * 1.4, '#ff6a2a', 0.35);
  if (e.st.shock > 0 && Math.sin(t * 30 + e.id) > 0.6) { ctx.strokeStyle = '#cfe0ff'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(-R * 0.6, -R * 1.6); ctx.lineTo(0, -R); ctx.lineTo(-R * 0.2, -R * 0.8); ctx.lineTo(R * 0.6, -R * 0.3); ctx.stroke(); }
  if (e.shieldHp > 0) { ctx.strokeStyle = rgba('#ffe05a', 0.7); ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(0, -R, R * 1.5, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  void colorblind;
}

function plate2(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, shade(c, 0.25)); g.addColorStop(1, shade(c, -0.4));
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.03; ctx.strokeRect(x, y, w, h);
}

export function drawNpc(ctx: Ctx, n: Npc, t: number) {
  const x = n.x, y = n.y;
  shadow(ctx, x, y + 0.05, 0.32, 0.13);
  ctx.save(); ctx.translate(x, y);
  const bob = Math.sin(t * 1.5 + x) * 0.015;
  ctx.fillStyle = shade(n.color, -0.45);
  poly(ctx, [-0.24, -0.02, 0.24, -0.02, 0.18, -0.9 - bob, -0.18, -0.9 - bob]); ctx.fill();
  ctx.fillStyle = shade(n.color, -0.1); ctx.fillRect(-0.2, -0.55, 0.4, 0.06);
  ctx.fillStyle = '#c8a080'; ctx.beginPath(); ctx.arc(0, -1.05 - bob, 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(n.color, -0.3); ctx.beginPath(); ctx.arc(0, -1.1 - bob, 0.16, Math.PI, 0); ctx.fill();
  if (n.role === 'smith') { ctx.fillStyle = '#5a5a60'; ctx.fillRect(0.25, -0.7, 0.08, 0.35); ctx.fillRect(0.18, -0.75, 0.22, 0.1); }
  if (n.role === 'engineer') { ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.arc(0, -1.13, 0.1, 0, Math.PI * 2); ctx.stroke(); }
  if (n.role === 'archivist') glow(ctx, 0.28, -0.8, 0.22, '#b56cff', 0.7);
  ctx.restore();
  // indicator
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 0.4px Cinzel, serif';
  ctx.textAlign = 'center';
}
