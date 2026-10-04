import { DX, DY, clamp } from '../core/math';
import { hash2 } from '../core/rng';
import { ITEM_IDS } from '../sim/itemIndex';
import type { Building } from '../sim/factory';
import { BEACON_STAGES } from '../sim/factory';
import { PYLON_SUPPLY } from '../sim/power';
import type { Game } from '../game/game';
import type { Level } from '../game/level';
import type { Enemy } from '../game/types';
import { DMG_COLOR } from '../game/types';
import { RARITIES } from '../data/equipment';
import { BUILDING_MAP } from '../data/buildings';
import { T } from '../world/map';
import { UNREACHED } from '../game/nav';
import { TerrainCache, CHUNK } from './terrain';
import { Particles } from './particles';
import { buildingSpriteFull, treeSprite, propSprite } from './sprites';
import { itemCanvas } from './icons';
import { drawEnemy, drawNpc, drawPlayer } from './actors';
import { gearShape, glow, rgba, shade, makeCanvas, roundRect } from './draw';
import type { Blueprint } from '../game/blueprint';

export interface ViewState {
  build: { def: string; dir: number; tx: number; ty: number; valid: boolean; reason?: string } | null;
  drag: { x0: number; y0: number; x1: number; y1: number; mode: 'decon' | 'blueprint' } | null;
  paste: { bp: Blueprint; tx: number; ty: number } | null;
  hover: Building | null;
  hoverEnemy: Enemy | null;
  mouse: { x: number; y: number };
  showPower: boolean;
  debugNav: boolean;
  debugPower: boolean;
  buildMode: boolean;
}

interface DmgNum { x: number; y: number; text: string; color: string; size: number; life: number; max: number; vx: number; vy: number }

const P = 48; // sprite pixels per tile

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camX = 0; camY = 0;
  zoom = 42;
  targetZoom = 42;
  shake = 0;
  shakeX = 0; shakeY = 0;
  particles = new Particles();
  nums: DmgNum[] = [];
  terrain: Map<string, TerrainCache> = new Map();
  light: HTMLCanvasElement;
  lctx: CanvasRenderingContext2D;
  dpr = 1;
  W = 0; H = 0;
  time = 0;
  weatherDrops: { x: number; y: number; z: number; s: number }[] = [];
  lightningFlash = 0;
  frameMs = 0;
  drawCalls = 0;

  constructor(canvas: HTMLCanvasElement, private g: () => Game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.light = makeCanvas(64, 64);
    this.lctx = this.light.getContext('2d')!;
    for (let i = 0; i < 400; i++) this.weatherDrops.push({ x: Math.random(), y: Math.random(), z: Math.random(), s: Math.random() });
  }

  attach(game: Game) {
    this.terrain.clear();
    this.particles = new Particles();
    this.nums = [];
    const ev = game.events;
    ev.on('fx', (e) => { if (e.map === this.curMapKind()) this.particles.onFx(e, game.settings.reduceFlashing); });
    ev.on('hit', (h) => {
      if (h.map !== this.curMapKind()) return;
      const s = game.settings.damageNumbers;
      if (h.target === 'building') return;
      if (s === 'off' && !h.text) return;
      if (s === 'crits' && !h.crit && !h.text && h.target === 'enemy') return;
      const color = h.target === 'player' ? (h.text?.startsWith('+') ? '#5aff8a' : '#ff4a4a') : h.crit ? '#ffe05a' : DMG_COLOR[h.type];
      const text = h.text ?? (h.amount < 1 ? h.amount.toFixed(1) : Math.round(h.amount).toString());
      this.nums.push({ x: h.x + (Math.random() - 0.5) * 0.4, y: h.y, text: h.crit ? text + '!' : text, color, size: h.crit ? 1.45 : h.target === 'player' ? 1.1 : 1, life: 0, max: h.crit ? 1.1 : 0.8, vx: (Math.random() - 0.5) * 1.2, vy: -2.6 });
      if (h.target === 'enemy' && h.amount > 0) this.particles.burst(h.x, h.y + 0.4, h.crit ? 6 : 3, { color: h.type === 'physical' ? ['#7a1a1a', '#aa3a2a'] : [DMG_COLOR[h.type]], speed: 3, size: 0.06, max: 0.4, kind: 3, add: h.type !== 'physical', grav: 10, vz: 3 });
      if (this.nums.length > 120) this.nums.shift();
    });
    ev.on('shake', (s) => { this.shake = Math.min(1, this.shake + s.amount * game.settings.screenShake); });
    ev.on('mapChange', () => { this.camX = game.player.x; this.camY = game.player.y; this.particles = new Particles(); });
    this.camX = game.player.x; this.camY = game.player.y;
  }

  curMapKind() { return this.g().where; }

  private terrainFor(lvl: Level): TerrainCache {
    const key = lvl.map.kind + lvl.map.seed;
    let t = this.terrain.get(key);
    if (!t || t.map !== lvl.map) { t = new TerrainCache(lvl.map); this.terrain.set(key, t); }
    return t;
  }

  resize() {
    const g = this.g();
    this.dpr = (window.devicePixelRatio || 1) * g.settings.renderScale;
    const w = Math.floor(window.innerWidth * this.dpr), h = Math.floor(window.innerHeight * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.W = w; this.H = h;
    const lw = Math.ceil(w / 4), lh = Math.ceil(h / 4);
    if (this.light.width !== lw || this.light.height !== lh) { this.light.width = lw; this.light.height = lh; }
  }

  screenToWorld(sx: number, sy: number) {
    const z = this.zoom * this.dpr;
    return { x: (sx * this.dpr - this.W / 2) / z + this.camX, y: (sy * this.dpr - this.H / 2) / z + this.camY };
  }
  worldToScreen(wx: number, wy: number) {
    const z = this.zoom * this.dpr;
    return { x: ((wx - this.camX) * z + this.W / 2) / this.dpr, y: ((wy - this.camY) * z + this.H / 2) / this.dpr };
  }

  render(dt: number, view: ViewState) {
    const t0 = performance.now();
    const g = this.g();
    this.time += dt;
    this.resize();
    this.particles.density = g.settings.particles;
    this.particles.update(dt);
    const pl = g.player;
    const lvl = g.playerLevel();
    // camera: smooth follow with look-ahead toward the cursor
    // look-ahead toward the cursor in combat; a stable camera while constructing so placement never drifts
    const look = view.buildMode ? 0 : 0.12;
    const lookX = clamp((view.mouse.x - pl.x) * look, -3, 3), lookY = clamp((view.mouse.y - pl.y) * look, -2, 2);
    const k = 1 - Math.pow(0.0008, dt);
    this.camX += (pl.x + lookX - this.camX) * k;
    this.camY += (pl.y - 0.6 + lookY - this.camY) * k;
    this.zoom += (this.targetZoom - this.zoom) * (1 - Math.pow(0.001, dt));
    // trauma-based shake
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake * 0.5;
    this.shakeX = (Math.random() - 0.5) * sh; this.shakeY = (Math.random() - 0.5) * sh;

    const ctx = this.ctx;
    const z = this.zoom * this.dpr;
    const cx = this.camX + this.shakeX, cy = this.camY + this.shakeY;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = lvl.map.kind === 'dungeon' ? '#0a0807' : '#0c0b0a';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.setTransform(z, 0, 0, z, -cx * z + this.W / 2, -cy * z + this.H / 2);
    ctx.imageSmoothingEnabled = true;
    const vx0 = Math.floor(cx - this.W / 2 / z) - 1, vx1 = Math.ceil(cx + this.W / 2 / z) + 1;
    const vy0 = Math.floor(cy - this.H / 2 / z) - 1, vy1 = Math.ceil(cy + this.H / 2 / z) + 3;
    const m = lvl.map;
    // terrain
    const tc = this.terrainFor(lvl);
    for (let ccy = Math.max(0, Math.floor(vy0 / CHUNK)); ccy <= Math.min(Math.floor((m.h - 1) / CHUNK), Math.floor(vy1 / CHUNK)); ccy++)
      for (let ccx = Math.max(0, Math.floor(vx0 / CHUNK)); ccx <= Math.min(Math.floor((m.w - 1) / CHUNK), Math.floor(vx1 / CHUNK)); ccx++)
        ctx.drawImage(tc.get(ccx, ccy), ccx * CHUNK, ccy * CHUNK, CHUNK + 0.02, CHUNK + 0.02);
    this.animatedTerrain(ctx, g, lvl, vx0, vy0, vx1, vy1);
    // decals
    for (const d of this.particles.decals) {
      const a = Math.min(1, (d.max - d.life) / 4) * (d.kind === 2 ? 0.7 : 0.55);
      ctx.fillStyle = rgba(d.color, a);
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.6, d.rot, 0, Math.PI * 2); ctx.fill();
    }
    // ground effects
    for (const ge of lvl.ground) this.drawGround(ctx, ge.x, ge.y, ge.r, ge.type, ge.t, ge.total);
    // belts & flat logistics
    const inOver = m.kind === 'overworld';
    const visibleB: Building[] = [];
    if (inOver) {
      const seen = new Set<number>();
      for (let y = Math.max(0, vy0 - 5); y <= Math.min(m.h - 1, vy1); y++)
        for (let x = Math.max(0, vx0 - 5); x <= Math.min(m.w - 1, vx1); x++) {
          const id = m.occ[y * m.w + x];
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const b = g.factory.buildings.get(id);
          if (!b) continue;
          if (b.kind === 'belt') this.drawBelt(ctx, b);
          else visibleB.push(b);
        }
      for (const b of visibleB) if (b.kind === 'splitter') this.drawBuilding(ctx, g, b);
      // belt items above belts
      for (let y = Math.max(0, vy0); y <= Math.min(m.h - 1, vy1); y++)
        for (let x = Math.max(0, vx0); x <= Math.min(m.w - 1, vx1); x++) {
          const id = m.occ[y * m.w + x];
          if (!id) continue;
          const b = g.factory.buildings.get(id);
          if (b && b.kind === 'belt' && b.bItems.length) this.drawBeltItems(ctx, b);
        }
      if (view.showPower || view.build && (BUILDING_MAP.get(view.build.def)?.power || view.build.def === 'pylon' || BUILDING_MAP.get(view.build.def)?.kind === 'generator')) this.drawPowerCoverage(ctx, g, vx0, vy0, vx1, vy1);
      // ghosts
      for (const gh of g.factory.ghosts.values()) {
        if (gh.x < vx0 - 5 || gh.x > vx1 || gh.y < vy0 - 5 || gh.y > vy1) continue;
        this.drawGhost(ctx, gh.def, gh.dir, gh.x, gh.y, 'rgba(120,220,255,0.9)', 0.38);
      }
    }
    // telegraphs
    for (const tg of lvl.telegraphs) this.drawTelegraph(ctx, tg);
    // y-sorted world objects
    const objs: { y: number; d: () => void }[] = [];
    for (const b of visibleB) if (b.kind !== 'splitter') objs.push({ y: b.y + b.h - 0.01, d: () => this.drawBuilding(ctx, g, b) });
    for (let y = Math.max(0, vy0); y <= Math.min(m.h - 1, vy1); y++)
      for (let x = Math.max(0, vx0); x <= Math.min(m.w - 1, vx1); x++) {
        const i = y * m.w + x;
        if (m.tree[i]) { const v = hash2(x, y, 3) % 6; objs.push({ y: y + 0.85, d: () => { const s = treeSprite(v, P); ctx.drawImage(s, x + 0.5 - s.width / P / 2 + ((v % 3) - 1) * 0.08, y + 0.85 - s.height / P, s.width / P, s.height / P); } }); }
        if (m.prop[i]) { const kind = m.prop[i] > 40 ? 'pillar' : (hash2(x, y, 9) & 1) ? 'crate' : 'urn'; objs.push({ y: y + 0.9, d: () => { const s = propSprite(kind, P); ctx.drawImage(s, x + 0.5 - s.width / P / 2, y + 0.95 - s.height / P, s.width / P, s.height / P); } }); }
      }
    for (const e of lvl.enemies) if (e.x > vx0 - 3 && e.x < vx1 + 3 && e.y > vy0 - 3 && e.y < vy1 + 3) objs.push({ y: e.y, d: () => drawEnemy(ctx, e, this.time, g.settings.colorblind !== 'off') });
    if (!pl.dead) objs.push({ y: pl.y, d: () => drawPlayer(ctx, pl, this.time) });
    if (inOver) for (const n of g.npcs) objs.push({ y: n.y, d: () => drawNpc(ctx, n, this.time) });
    for (const d of lvl.loot) objs.push({ y: d.y, d: () => this.drawLoot(ctx, g, d) });
    for (const p of m.pois) {
      if (p.kind === 'dungeon' || p.kind === 'exit' || p.kind === 'ruin' || p.kind === 'treasure' || p.kind === 'shrine' || p.kind === 'nest' || p.kind === 'hive') objs.push({ y: p.y + 0.5, d: () => this.drawPoi(ctx, p) });
    }
    objs.sort((a, b) => a.y - b.y);
    for (const o of objs) o.d();
    if (inOver) this.drawWires(ctx, g, vx0, vy0, vx1, vy1);
    // wisps
    if (inOver) for (const w of g.wisps) { glow(ctx, w.x, w.y - 0.6, 0.45, '#7ae0c0', 0.8); ctx.fillStyle = '#e0fff4'; ctx.beginPath(); ctx.arc(w.x, w.y - 0.6, 0.07, 0, Math.PI * 2); ctx.fill(); if (w.task) { ctx.strokeStyle = rgba('#7ae0c0', 0.4); ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(w.x, w.y - 0.6); ctx.lineTo(w.task.x, w.task.y); ctx.stroke(); } }
    // projectiles
    for (const p of lvl.projectiles) this.drawProjectile(ctx, p);
    // particles
    this.drawParticles(ctx);
    // build previews
    if (inOver && view.build) this.drawBuildPreview(ctx, g, view);
    if (inOver && view.paste) for (const e of view.paste.bp.entries) {
      const ok = g.factory.canPlace(e.d, view.paste.tx + e.x, view.paste.ty + e.y, e.r).ok;
      this.drawGhost(ctx, e.d, e.r, view.paste.tx + e.x, view.paste.ty + e.y, ok ? 'rgba(120,220,255,0.9)' : 'rgba(255,80,60,0.9)', 0.5);
    }
    if (view.drag) {
      const x0 = Math.min(view.drag.x0, view.drag.x1), y0 = Math.min(view.drag.y0, view.drag.y1);
      const w = Math.abs(view.drag.x1 - view.drag.x0) + 1, h = Math.abs(view.drag.y1 - view.drag.y0) + 1;
      ctx.fillStyle = view.drag.mode === 'decon' ? 'rgba(255,60,40,0.15)' : 'rgba(120,220,255,0.15)';
      ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = view.drag.mode === 'decon' ? '#ff5a3a' : '#7ad7ff'; ctx.lineWidth = 0.06; ctx.setLineDash([0.3, 0.2]);
      ctx.strokeRect(x0, y0, w, h); ctx.setLineDash([]);
    }
    if (view.hover && inOver && view.buildMode) { ctx.strokeStyle = 'rgba(255,210,122,0.9)'; ctx.lineWidth = 0.05; ctx.strokeRect(view.hover.x + 0.03, view.hover.y + 0.03, view.hover.w - 0.06, view.hover.h - 0.06); }
    if (view.debugNav) this.drawNavDebug(ctx, lvl, vx0, vy0, vx1, vy1);
    if (view.debugPower && inOver) this.drawPowerDebug(ctx, g);
    // fog of war
    this.drawFog(ctx, m, vx0, vy0, vx1, vy1);
    // lighting
    if (g.settings.lighting) this.drawLighting(g, lvl, z, cx, cy, vx0, vy0, vx1, vy1);
    ctx.setTransform(z, 0, 0, z, -cx * z + this.W / 2, -cy * z + this.H / 2);
    // floating combat text & bars in world space
    this.drawBars(ctx, g, lvl, vx0, vy0, vx1, vy1);
    this.drawNumbers(ctx, dt);
    // weather (screen space)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (g.settings.weatherFx && m.kind === 'overworld') this.drawWeather(ctx, g, dt);
    if (this.particles.flash > 0) { ctx.fillStyle = `rgba(255,240,210,${this.particles.flash * 0.35})`; ctx.fillRect(0, 0, this.W, this.H); }
    // low-life vignette
    const lifeFrac = pl.hp / pl.stats.maxLife;
    const vig = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.35, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, lifeFrac < 0.3 && !pl.dead ? `rgba(120,0,0,${0.5 + Math.sin(this.time * 6) * 0.1})` : 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, this.W, this.H);
    this.frameMs = performance.now() - t0;
  }

  // ───────────────────────────── terrain animation
  private animatedTerrain(ctx: CanvasRenderingContext2D, g: Game, lvl: Level, x0: number, y0: number, x1: number, y1: number) {
    const m = lvl.map;
    const t = this.time;
    for (let y = Math.max(0, y0); y <= Math.min(m.h - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(m.w - 1, x1); x++) {
        const ter = m.terrain[y * m.w + x];
        if (ter === T.Lava) {
          const a = 0.25 + Math.sin(t * 1.5 + x * 0.7 + y * 1.3) * 0.15;
          ctx.fillStyle = `rgba(255,${100 + Math.sin(t + x) * 40 | 0},20,${a})`;
          ctx.fillRect(x, y, 1, 1);
        } else if (ter === T.Water) {
          const a = 0.06 + Math.max(0, Math.sin(t * 1.2 + x * 0.9 - y * 0.6)) * 0.08;
          ctx.fillStyle = `rgba(150,190,210,${a})`;
          ctx.fillRect(x, y + ((t * 0.2 + x * 0.13) % 1) * 0.8, 1, 0.05);
        } else if (ter === T.Vent) {
          const hot = Math.sin(g.time * 2 + ((y * m.w + x) % 7)) > 0.6;
          if (hot) { glow(ctx, x + 0.5, y + 0.5, 0.9, '#ff5a1a', 0.7); if (Math.random() < 0.15) this.particles.spawn({ x: x + Math.random(), y: y + Math.random(), z: 0, vz: 2, vx: 0, vy: -0.5, size: 0.1, max: 0.6, color: '#ff8a3a', kind: 1 }); }
          else glow(ctx, x + 0.5, y + 0.5, 0.6, '#ff5a1a', 0.12 + Math.max(0, Math.sin(g.time * 2 + ((y * m.w + x) % 7))) * 0.3);
        } else if (ter === T.Hive && (x + y) % 5 === 0) {
          glow(ctx, x + 0.5, y + 0.5, 0.7, '#a04a8a', 0.12 + Math.sin(t * 2 + x) * 0.05);
        }
      }
  }

  private drawGround(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, type: string, t: number, total: number) {
    const fade = Math.min(1, (total - t) / 0.6, t / 0.2);
    const col = type === 'fire' ? '#ff6a2a' : type === 'slag' ? '#ff8a20' : type === 'acid' ? '#8fcf3a' : type === 'frost' ? '#8ad8ff' : '#b0c0ff';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, 0.55 * fade)); g.addColorStop(0.7, rgba(shade(col, -0.3), 0.35 * fade)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
    if (Math.random() < 0.3 * fade * r) this.particles.spawn({ x: x + (Math.random() - 0.5) * r * 1.4, y: y + (Math.random() - 0.5) * r, z: 0, vz: 1.5, size: 0.08, max: 0.6, color: col, kind: 1, drag: 1 });
  }

  // ───────────────────────────── logistics
  private drawBelt(ctx: CanvasRenderingContext2D, b: Building) {
    const swift = b.def.id === 'swift_conveyor';
    const x = b.x, y = b.y;
    ctx.fillStyle = '#1e1c1a';
    ctx.fillRect(x + 0.04, y + 0.04, 0.92, 0.92);
    const horiz = b.dir % 2 === 0;
    ctx.fillStyle = swift ? '#5a2a26' : '#3a3530';
    if (horiz) { ctx.fillRect(x, y + 0.06, 1, 0.1); ctx.fillRect(x, y + 0.84, 1, 0.1); }
    else { ctx.fillRect(x + 0.06, y, 0.1, 1); ctx.fillRect(x + 0.84, y, 0.1, 1); }
    // animated chevrons
    const sp = b.def.speed!;
    const off = (this.time * sp) % 0.5;
    ctx.strokeStyle = swift ? 'rgba(255,90,70,0.55)' : 'rgba(201,162,74,0.45)';
    ctx.lineWidth = 0.05;
    const dx = DX[b.dir], dy = DY[b.dir];
    for (let k = 0; k < 2; k++) {
      const p = -0.25 + k * 0.5 + off;
      if (p < -0.4 || p > 0.4) continue;
      const cx = x + 0.5 + dx * p, cy = y + 0.5 + dy * p;
      ctx.beginPath();
      ctx.moveTo(cx - dx * 0.12 - dy * 0.25, cy - dy * 0.12 - dx * 0.25);
      ctx.lineTo(cx + dx * 0.08, cy + dy * 0.08);
      ctx.lineTo(cx - dx * 0.12 + dy * 0.25, cy - dy * 0.12 + dx * 0.25);
      ctx.stroke();
    }
  }

  private drawBeltItems(ctx: CanvasRenderingContext2D, b: Building) {
    const dx = DX[b.dir], dy = DY[b.dir];
    for (let i = 0; i < b.bItems.length; i++) {
      const p = b.bPos[i] - 0.5;
      const cx = b.x + 0.5 + dx * p, cy = b.y + 0.5 + dy * p;
      const ic = itemCanvas(ITEM_IDS[b.bItems[i]], 24);
      ctx.drawImage(ic, cx - 0.22, cy - 0.26, 0.44, 0.44);
    }
  }

  private drawGhost(ctx: CanvasRenderingContext2D, def: string, dir: number, x: number, y: number, outline: string, alpha: number) {
    const d = BUILDING_MAP.get(def)!;
    const s = buildingSpriteFull(def, dir, P);
    ctx.globalAlpha = alpha;
    if (d.kind === 'belt') { ctx.fillStyle = '#2a3a44'; ctx.fillRect(x + 0.05, y + 0.05, 0.9, 0.9); }
    else ctx.drawImage(s.canvas, x, y - s.top / P, s.w, s.h + s.top / P);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = outline; ctx.lineWidth = 0.05; ctx.setLineDash([0.2, 0.12]);
    ctx.strokeRect(x + 0.03, y + 0.03, s.w - 0.06, s.h - 0.06);
    ctx.setLineDash([]);
    if (d.kind === 'belt' || d.kind === 'arm' || d.kind === 'splitter' || d.kind === 'miner') this.arrow(ctx, x + s.w / 2, y + s.h / 2, dir, outline);
  }

  private arrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, dir: number, color: string) {
    const dx = DX[dir], dy = DY[dir];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx + dx * 0.32, cy + dy * 0.32);
    ctx.lineTo(cx - dx * 0.12 - dy * 0.2, cy - dy * 0.12 - dx * 0.2);
    ctx.lineTo(cx - dx * 0.12 + dy * 0.2, cy - dy * 0.12 + dx * 0.2);
    ctx.closePath(); ctx.fill();
  }

  private drawBuildPreview(ctx: CanvasRenderingContext2D, g: Game, view: ViewState) {
    const b = view.build!;
    const d = BUILDING_MAP.get(b.def)!;
    const fp = g.factory.footprint(b.def, b.dir);
    this.drawGhost(ctx, b.def, b.dir, b.tx, b.ty, b.valid ? 'rgba(122,224,140,1)' : 'rgba(255,80,60,1)', 0.65);
    ctx.fillStyle = b.valid ? 'rgba(122,224,140,0.12)' : 'rgba(255,80,60,0.18)';
    ctx.fillRect(b.tx, b.ty, fp.w, fp.h);
    const cx = b.tx + fp.w / 2, cy = b.ty + fp.h / 2;
    if (d.kind === 'pylon') {
      ctx.strokeStyle = 'rgba(255,210,122,0.7)'; ctx.lineWidth = 0.05;
      ctx.strokeRect(b.tx - PYLON_SUPPLY, b.ty - PYLON_SUPPLY, 1 + PYLON_SUPPLY * 2, 1 + PYLON_SUPPLY * 2);
      ctx.setLineDash([0.2, 0.2]); ctx.beginPath(); ctx.arc(cx, cy, d.range!, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      // preview wire connections
      for (const n of g.power.nets) for (const p of n.pylons) if ((p.x - b.tx) ** 2 + (p.y - b.ty) ** 2 <= d.range! ** 2) { ctx.strokeStyle = 'rgba(255,210,122,0.8)'; ctx.beginPath(); ctx.moveTo(cx, cy - 1.4); ctx.lineTo(p.x + 0.5, p.y - 0.9); ctx.stroke(); }
    }
    if (d.range && (d.kind === 'turret' || d.kind === 'tesla')) {
      ctx.strokeStyle = 'rgba(255,120,80,0.6)'; ctx.lineWidth = 0.06; ctx.setLineDash([0.3, 0.2]);
      ctx.beginPath(); ctx.arc(cx, cy, d.range, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    if (d.light) { ctx.strokeStyle = 'rgba(255,240,180,0.3)'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(cx, cy, d.light, 0, Math.PI * 2); ctx.stroke(); }
    if (d.kind === 'miner') {
      let ore = 0;
      for (let y = b.ty; y < b.ty + fp.h; y++) for (let x = b.tx; x < b.tx + fp.w; x++) if (g.overworld.inBounds(x, y)) ore += g.overworld.amt[g.overworld.idx(x, y)];
      this.label(ctx, cx, b.ty - 0.6, ore ? `${ore} ore` : 'No ore', ore ? '#ffd27a' : '#ff6a5a');
    }
    // input/output hints for production machines
    if (['miner', 'furnace', 'assembler', 'forge', 'lab', 'turret', 'generator'].includes(d.kind)) {
      for (let x = b.tx; x < b.tx + fp.w; x++) for (const y of [b.ty - 1, b.ty + fp.h]) this.hintEdge(ctx, g, x, y, b.tx, b.ty, fp.w, fp.h);
      for (let y = b.ty; y < b.ty + fp.h; y++) for (const x of [b.tx - 1, b.tx + fp.w]) this.hintEdge(ctx, g, x, y, b.tx, b.ty, fp.w, fp.h);
    }
    if (!b.valid && b.reason) this.label(ctx, cx, b.ty + fp.h + 0.6, b.reason, '#ff6a5a');
  }

  private hintEdge(ctx: CanvasRenderingContext2D, g: Game, x: number, y: number, bx: number, by: number, w: number, h: number) {
    const n = g.factory.at(x, y);
    if (!n || n.kind !== 'belt') return;
    const nx = n.x + DX[n.dir], ny = n.y + DY[n.dir];
    const into = nx >= bx && nx < bx + w && ny >= by && ny < by + h;
    ctx.fillStyle = into ? 'rgba(122,224,140,0.5)' : 'rgba(122,215,255,0.5)';
    ctx.fillRect(x + 0.2, y + 0.2, 0.6, 0.6);
  }

  private label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
    ctx.font = '600 0.36px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 0.3;
    ctx.fillStyle = 'rgba(10,8,6,0.75)';
    roundRect(ctx, x - w / 2, y - 0.3, w, 0.42, 0.1); ctx.fill();
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  private drawPowerCoverage(ctx: CanvasRenderingContext2D, g: Game, x0: number, y0: number, x1: number, y1: number) {
    ctx.fillStyle = 'rgba(255,210,122,0.07)';
    ctx.strokeStyle = 'rgba(255,210,122,0.25)'; ctx.lineWidth = 0.03;
    for (const n of g.power.nets) for (const p of n.pylons) {
      if (p.x < x0 - 4 || p.x > x1 + 4 || p.y < y0 - 4 || p.y > y1 + 4) continue;
      ctx.fillRect(p.x - PYLON_SUPPLY, p.y - PYLON_SUPPLY, 1 + PYLON_SUPPLY * 2, 1 + PYLON_SUPPLY * 2);
      ctx.strokeRect(p.x - PYLON_SUPPLY, p.y - PYLON_SUPPLY, 1 + PYLON_SUPPLY * 2, 1 + PYLON_SUPPLY * 2);
    }
  }

  private drawWires(ctx: CanvasRenderingContext2D, g: Game, x0: number, y0: number, x1: number, y1: number) {
    ctx.lineWidth = 0.025;
    for (const n of g.power.nets) {
      const ps = n.pylons;
      const live = n.satisfaction > 0;
      ctx.strokeStyle = live ? 'rgba(60,50,40,0.9)' : 'rgba(40,40,40,0.8)';
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i];
        if (a.x < x0 - 8 || a.x > x1 + 8 || a.y < y0 - 8 || a.y > y1 + 8) continue;
        for (let j = i + 1; j < ps.length; j++) {
          const b = ps[j];
          const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
          if (d2 > a.def.range! ** 2) continue;
          const ax = a.x + 0.5, ay = a.y - 0.95, bx = b.x + 0.5, by = b.y - 0.95;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + 0.35, bx, by); ctx.stroke();
          if (live && Math.random() < 0.004 * n.satisfaction) this.particles.spawn({ x: (ax + bx) / 2, y: (ay + by) / 2 + 0.3, z: 0, size: 0.05, max: 0.15, color: '#ffe0a0', kind: 1 });
        }
      }
    }
  }

  // ───────────────────────────── buildings
  private drawBuilding(ctx: CanvasRenderingContext2D, g: Game, b: Building) {
    const s = buildingSpriteFull(b.def.id, b.dir, P);
    const t = this.time;
    const x = b.x, y = b.y;
    const work = b.status === 'working';
    const oc = g.time < b.overclockUntil;
    const hitRecent = g.time - b.lastHit < 0.12;
    if (b.kind === 'beacon') this.drawBeaconBase(ctx, b);
    ctx.drawImage(s.canvas, x, y - s.top / P, b.w, b.h + s.top / P);
    if (hitRecent) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y - s.top / P, b.w, b.h + s.top / P); }
    const cx = x + b.w / 2, cy = y + b.h / 2;
    switch (b.kind) {
      case 'miner': {
        const spin = work ? t * 6 : 0;
        // derrick: drill shaft with spiral flutes, a turning crown gear and a pulsing core
        const top = y - 0.85, bot = y + 0.55;
        ctx.fillStyle = '#2a2420'; ctx.fillRect(cx - 0.11, top, 0.22, bot - top);
        ctx.strokeStyle = b.def.burner ? '#c98a4a' : '#7ab0d0'; ctx.lineWidth = 0.035;
        for (let k = 0; k < 5; k++) {
          const yy = top + 0.1 + (((k * 0.27 + spin * 0.08) % 1.35 + 1.35) % 1.35);
          if (yy > bot - 0.05) continue;
          ctx.beginPath(); ctx.moveTo(cx - 0.11, yy); ctx.lineTo(cx + 0.11, yy - 0.08); ctx.stroke();
        }
        gearShape(ctx, cx, top, 0.2, 8, spin, b.def.burner ? '#9a7a52' : '#7a8a9a');
        if (work) {
          glow(ctx, cx, y + 1.25, 0.5, b.def.accent, 0.5 + Math.sin(t * 9) * 0.15);
          if (Math.random() < 0.06) this.particles.burst(cx + (Math.random() - 0.5), y + b.h - 0.2, 2, { color: '#7a6a5a', speed: 1, size: 0.2, max: 0.7, kind: 2, add: false, grow: 0.3 });
        }
        this.arrow(ctx, cx + DX[b.dir] * (b.w / 2 + 0.25), cy + DY[b.dir] * (b.h / 2 + 0.25), b.dir, 'rgba(255,210,122,0.5)');
        break;
      }
      case 'furnace': {
        const a = work ? 0.75 + Math.sin(t * 12 + b.id) * 0.15 : b.fuelEnergy > 0 ? 0.2 : 0;
        if (a > 0) { glow(ctx, cx, y + b.h * 0.62, 0.7, b.def.accent, a); ctx.fillStyle = rgba('#ffcf70', a * 0.8); roundRect(ctx, x + b.w * 0.36, y + b.h * 0.5, b.w * 0.28, b.h * 0.25, 0.08); ctx.fill(); }
        if (work && Math.random() < 0.08) this.particles.spawn({ x: cx + (Math.random() - 0.5) * 0.3, y: y - 0.5, z: 0.2, vz: 1.2, vx: 0.2, size: 0.18, grow: 0.5, max: 2, color: '#4a4440', kind: 2, add: false, drag: 0.5 });
        break;
      }
      case 'assembler': case 'forge': {
        const rot = work ? t * 3 * (oc ? 1.75 : 1) : 0;
        if (b.kind === 'assembler') {
          gearShape(ctx, x + b.w * 0.38, y + b.h * 0.25, 0.3, 9, rot, '#8a8a7a');
          gearShape(ctx, x + b.w * 0.62, y + b.h * 0.3, 0.22, 7, -rot * 1.3, '#a08a5a');
          if (b.recipe) { const ic = itemCanvas(b.recipe.outputs[0]?.item ?? 'gear', 32); ctx.globalAlpha = 0.9; ctx.drawImage(ic, cx - 0.3, y + b.h * 0.55, 0.6, 0.6); ctx.globalAlpha = 1; }
        } else {
          if (work) { glow(ctx, x + b.w * 0.74, y + b.h * 0.12, 0.6, '#ff6a2a', 0.8); if (Math.random() < 0.25) this.particles.burst(x + b.w * 0.3, y + b.h * 0.42, 3, { color: ['#ffd27a', '#ff8a3a'], speed: 3, size: 0.05, max: 0.4, kind: 0, grav: 8, vz: 3 }); }
          if (b.forged.length) { glow(ctx, cx, y - 0.3, 0.6, '#ffd27a', 0.6 + Math.sin(t * 4) * 0.2); }
        }
        if (b.working) { ctx.fillStyle = '#111'; ctx.fillRect(x + 0.3, y + b.h - 0.22, b.w - 0.6, 0.1); ctx.fillStyle = b.def.accent; ctx.fillRect(x + 0.3, y + b.h - 0.22, (b.w - 0.6) * b.progress, 0.1); }
        break;
      }
      case 'generator': {
        const sp = b.working ? t * (2 + b.progress * 8) : 0;
        gearShape(ctx, x + b.w * 0.3, y + b.h * 0.72, 0.28, 10, sp, '#7a6a5a');
        if (b.working) {
          glow(ctx, x + b.w * 0.3, y + b.h * 0.73, 0.5, '#ff8a3a', 0.4 + Math.sin(t * 10) * 0.1);
          if (Math.random() < 0.12 + b.progress * 0.2) this.particles.spawn({ x: x + b.w - 0.44, y: y - 1.35, z: 0, vz: 0, vx: 0.3, vy: -1.2, size: 0.2, grow: 0.9, max: 2.4, color: '#5a5450', kind: 2, add: false, drag: 0.4 });
        }
        break;
      }
      case 'lamp': if (b.working) { glow(ctx, cx, y - 0.6, 1.2, '#fff0b0', 0.55); ctx.fillStyle = '#fff6d0'; ctx.fillRect(cx - 0.1, y - 0.75, 0.2, 0.2); } break;
      case 'capacitor': {
        const frac = b.energy / 5000;
        for (let i = 0; i < 3; i++) {
          const bx = x + 0.2 + i * (b.w - 0.4) / 3 + 0.12, h = (b.h * 0.6) * frac;
          ctx.fillStyle = rgba('#6ad0ff', 0.85); ctx.fillRect(bx, y - 0.35 + b.h * 0.6 - h, 0.14, h);
        }
        if (frac > 0.9) glow(ctx, cx, y - 0.3, 0.8, '#6ad0ff', 0.3 + Math.sin(t * 5) * 0.1);
        break;
      }
      case 'lab': {
        const oy = y + b.h / 2 - 1.3 + Math.sin(t * 2) * 0.08;
        glow(ctx, cx, oy, work ? 1 : 0.5, '#c890ff', work ? 0.8 : 0.25);
        ctx.save(); ctx.translate(cx, oy); ctx.rotate(t * (work ? 2 : 0.3));
        ctx.strokeStyle = '#e0c0ff'; ctx.lineWidth = 0.04;
        ctx.beginPath(); ctx.moveTo(0, -0.22); ctx.lineTo(0.19, 0.11); ctx.lineTo(-0.19, 0.11); ctx.closePath(); ctx.stroke();
        ctx.restore();
        if (work && Math.random() < 0.2) this.particles.spawn({ x: cx + (Math.random() - 0.5) * 2, y: cy + (Math.random() - 0.5) * 1.5, z: 0, vz: 1.5, size: 0.06, max: 1, color: '#c890ff', kind: 1, drag: 0.5 });
        break;
      }
      case 'turret': {
        ctx.save(); ctx.translate(cx, cy - 0.35); ctx.rotate(b.aim);
        const recoil = b.cooldown > 0.15 ? -0.08 : 0;
        ctx.fillStyle = '#4a4036'; roundRect(ctx, -0.45, -0.32, 0.8, 0.64, 0.12); ctx.fill();
        ctx.strokeStyle = '#1a1612'; ctx.lineWidth = 0.03; ctx.stroke();
        ctx.fillStyle = '#7a6a50'; ctx.fillRect(0.1 + recoil, -0.08, 0.8, 0.16);
        ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(0.3 + recoil, -0.45); ctx.quadraticCurveTo(0.55 + recoil, 0, 0.3 + recoil, 0.45); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'tesla': {
        const top = y - 1.72 + b.h * 0;
        glow(ctx, cx, top, 0.6 + b.charge * 0.6, '#8ad8ff', 0.2 + b.charge * 0.6);
        if (b.charge >= 1 && Math.random() < 0.3) this.particles.lightning([{ x: cx, y: top }, { x: cx + (Math.random() - 0.5) * 1.6, y: top + Math.random() * 1.2 }], '#cfe8ff', 0.03, 0.08);
        break;
      }
      case 'arm': {
        const from = { x: cx - DX[b.dir] * 0.7, y: cy - DY[b.dir] * 0.7 }, to = { x: cx + DX[b.dir] * 0.7, y: cy + DY[b.dir] * 0.7 };
        const k = b.held >= 0 ? Math.min(1, b.armT) : 0;
        const hx = from.x + (to.x - from.x) * k, hy = from.y + (to.y - from.y) * k;
        ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 0.09; ctx.lineCap = 'round';
        const ex = cx + (hx - cx) * 0.5 - DY[b.dir] * 0.2, ey = cy - 0.35 + (hy - cy) * 0.5;
        ctx.beginPath(); ctx.moveTo(cx, cy - 0.25); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy - 0.15); ctx.stroke();
        if (b.held >= 0) ctx.drawImage(itemCanvas(ITEM_IDS[b.held], 24), hx - 0.18, hy - 0.4, 0.36, 0.36);
        if (b.cond) { ctx.fillStyle = '#7ae0c0'; ctx.beginPath(); ctx.arc(x + 0.85, y + 0.15, 0.08, 0, Math.PI * 2); ctx.fill(); }
        break;
      }
      case 'splitter': {
        if (b.filter) ctx.drawImage(itemCanvas(b.filter, 24), cx - 0.2, cy - 0.38, 0.4, 0.4);
        this.arrow(ctx, cx + DX[b.dir] * 0.3, cy + DY[b.dir] * 0.3 - 0.15, b.dir, 'rgba(122,224,192,0.8)');
        break;
      }
      case 'vault': {
        const fill = g.factory.vaultTotal(b) / 2000;
        if (fill > 0) { ctx.fillStyle = '#111'; ctx.fillRect(x + 0.15, y + 0.82, 0.7, 0.08); ctx.fillStyle = fill > 0.95 ? '#ff6a5a' : '#c9a24a'; ctx.fillRect(x + 0.15, y + 0.82, 0.7 * fill, 0.08); }
        break;
      }
      case 'beacon': this.drawBeaconStages(ctx, b); break;
    }
    if (oc) { glow(ctx, cx, cy - 0.3, Math.max(b.w, b.h) * 0.7, '#ffd27a', 0.2 + Math.sin(t * 10) * 0.08); if (Math.random() < 0.1) this.particles.burst(cx, cy, 1, { color: '#ffd27a', speed: 2, size: 0.05, max: 0.4, kind: 0, vz: 2 }); }
    // status icon
    const st = b.status;
    const warn = st === 'no_fuel' || st === 'no_power' || st === 'output_full' || st === 'no_ammo' || st === 'no_recipe' || (st === 'no_input' && b.kind !== 'lab');
    if (warn && Math.sin(t * 4) > -0.3) {
      const iy = y - s.top / P - 0.25;
      ctx.fillStyle = 'rgba(10,8,6,0.85)'; ctx.beginPath(); ctx.arc(cx, iy, 0.24, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = st === 'no_power' ? '#ff5a3a' : st === 'no_fuel' || st === 'no_ammo' ? '#ffb04a' : '#c8c8c8'; ctx.lineWidth = 0.04; ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = 'bold 0.3px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(st === 'no_power' ? '⚡' : st === 'no_fuel' ? '🔥' : st === 'no_ammo' ? '➶' : st === 'output_full' ? '▣' : st === 'no_recipe' ? '?' : '…', cx, iy + 0.02);
      ctx.textBaseline = 'alphabetic';
    }
    if (b.hp < b.maxHp) { ctx.fillStyle = '#111'; ctx.fillRect(x + 0.1, y + b.h - 0.08, b.w - 0.2, 0.08); ctx.fillStyle = b.hp / b.maxHp > 0.5 ? '#7ae07a' : b.hp / b.maxHp > 0.25 ? '#e0c050' : '#e05a3a'; ctx.fillRect(x + 0.1, y + b.h - 0.08, (b.w - 0.2) * (b.hp / b.maxHp), 0.08); }
  }

  private drawBeaconBase(ctx: CanvasRenderingContext2D, b: Building) {
    if (b.stage >= 3) glow(ctx, b.x + 2.5, b.y + 2.5, 6, '#ffd27a', 0.25 + Math.sin(this.time * 2) * 0.08);
  }

  private drawBeaconStages(ctx: CanvasRenderingContext2D, b: Building) {
    const cx = b.x + 2.5, cy = b.y + 2.5, t = this.time;
    const st = b.stage;
    // partial construction progress for the current stage
    const need = BEACON_STAGES[st]?.needs;
    let frac = 1;
    if (need) { let have = 0, tot = 0; for (const [k, v] of Object.entries(need)) { have += Math.min(v, b.input.get(k) ?? 0); tot += v; } frac = have / tot; }
    const pillars = st >= 1 ? 8 : Math.floor(8 * frac);
    for (let i = 0; i < pillars; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = cx + Math.cos(a) * 2, py = cy + Math.sin(a) * 1.7;
      ctx.fillStyle = '#4a4458'; ctx.fillRect(px - 0.15, py - 1.4, 0.3, 1.4);
      glow(ctx, px, py - 1.4, 0.3, '#ffd27a', 0.6);
    }
    if (st >= 1) {
      const h = st >= 2 ? 4 : 4 * frac;
      ctx.fillStyle = '#3a3448'; ctx.beginPath(); ctx.moveTo(cx - 0.5, cy); ctx.lineTo(cx + 0.5, cy); ctx.lineTo(cx + 0.15, cy - h); ctx.lineTo(cx - 0.15, cy - h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 0.04; ctx.stroke();
    }
    if (st >= 2) {
      const r = st >= 3 ? 0.7 : 0.7 * frac;
      glow(ctx, cx, cy - 4.4, r * 3, '#ffd27a', 0.8);
      ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(cx, cy - 4.4, r * 0.5 + Math.sin(t * 3) * 0.05, 0, Math.PI * 2); ctx.fill();
    }
    if (st >= 3) {
      const g = ctx.createLinearGradient(cx, cy - 30, cx, cy - 4);
      g.addColorStop(0, 'rgba(255,210,122,0)'); g.addColorStop(1, 'rgba(255,230,160,0.6)');
      ctx.fillStyle = g; ctx.fillRect(cx - 0.25 - Math.sin(t * 4) * 0.05, cy - 30, 0.5, 26);
    }
  }

  private drawPoi(ctx: CanvasRenderingContext2D, p: { kind: string; x: number; y: number; cleared?: boolean; name: string }) {
    const x = p.x + 0.5, y = p.y + 0.5, t = this.time;
    switch (p.kind) {
      case 'dungeon': {
        ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.ellipse(x, y, 1.6, 1.0, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a4038'; ctx.fillRect(x - 1.5, y - 2.6, 0.5, 2.6); ctx.fillRect(x + 1.0, y - 2.6, 0.5, 2.6); ctx.fillRect(x - 1.7, y - 2.9, 3.4, 0.45);
        ctx.fillStyle = '#050403'; ctx.beginPath(); ctx.ellipse(x, y - 0.1, 1.0, 0.6, 0, 0, Math.PI * 2); ctx.fill();
        glow(ctx, x, y, 1.4, '#ff6a2a', 0.35 + Math.sin(t * 2) * 0.1);
        this.label(ctx, x, y - 3.2, p.name, '#ff8a3a');
        break;
      }
      case 'exit': glow(ctx, x, y, 1.5, '#7ad7ff', 0.5); ctx.strokeStyle = '#7ad7ff'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.ellipse(x, y, 0.9, 0.5, 0, 0, Math.PI * 2); ctx.stroke(); this.label(ctx, x, y - 1, 'Way Up', '#7ad7ff'); break;
      case 'ruin': case 'treasure': {
        if (p.cleared) { ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x - 0.4, y - 0.4, 0.8, 0.5); break; }
        const g = ctx.createLinearGradient(0, y - 0.7, 0, y); g.addColorStop(0, '#a07a3a'); g.addColorStop(1, '#5a3a1a');
        ctx.fillStyle = g; roundRect(ctx, x - 0.45, y - 0.65, 0.9, 0.65, 0.1); ctx.fill();
        ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 0.05; ctx.stroke();
        glow(ctx, x, y - 0.4, 0.9, '#ffd27a', 0.3 + Math.sin(t * 3) * 0.1);
        break;
      }
      case 'shrine': if (!p.cleared) { glow(ctx, x, y - 0.8, 1.2, '#ffd27a', 0.6); ctx.fillStyle = '#6a6058'; ctx.fillRect(x - 0.3, y - 1.4, 0.6, 1.4); } break;
      case 'nest': case 'hive': {
        for (let i = 0; i < 5; i++) { const a = i * 1.3 + t * 0.2; glow(ctx, x + Math.cos(a) * 1.2, y + Math.sin(a) * 0.8, 0.6, '#a04a8a', 0.25); }
        ctx.fillStyle = '#3a1a30'; ctx.beginPath(); ctx.ellipse(x, y, 1.1, 0.7, 0, 0, Math.PI * 2); ctx.fill();
        glow(ctx, x, y - 0.2, 1.2, '#ff4a8a', 0.25 + Math.sin(t * 1.5) * 0.1);
        break;
      }
    }
  }

  private drawLoot(ctx: CanvasRenderingContext2D, g: Game, d: { x: number; y: number; z: number; item?: string; equip?: import('../game/items').Equip; embers?: number; t: number }) {
    const bob = Math.sin(this.time * 3 + d.x) * 0.05 + d.z;
    if (d.equip) {
      const r = d.equip.rarity;
      const col = g.settings.colorblind !== 'off' ? RARITIES[r].cbColor : RARITIES[r].color;
      if (r >= 3) {
        // light beam for exalted+
        const gr = ctx.createLinearGradient(d.x, d.y - 6, d.x, d.y);
        gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(1, rgba(col, r >= 4 ? 0.55 : 0.3));
        ctx.fillStyle = gr; ctx.fillRect(d.x - 0.18, d.y - 6, 0.36, 6);
      }
      glow(ctx, d.x, d.y - 0.15 - bob, 0.55, col, 0.5);
      ctx.fillStyle = col; ctx.save(); ctx.translate(d.x, d.y - 0.2 - bob); ctx.rotate(0.6);
      ctx.fillRect(-0.18, -0.06, 0.36, 0.12); ctx.restore();
      if (r >= 1) this.label(ctx, d.x, d.y - 0.6 - bob, d.equip.name, col);
    } else if (d.embers) {
      glow(ctx, d.x, d.y - 0.1 - bob, 0.3, '#ffb04a', 0.6);
      ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.arc(d.x, d.y - 0.1 - bob, 0.08, 0, Math.PI * 2); ctx.fill();
    } else if (d.item) {
      ctx.drawImage(itemCanvas(d.item, 24), d.x - 0.22, d.y - 0.42 - bob, 0.44, 0.44);
    }
  }

  private drawTelegraph(ctx: CanvasRenderingContext2D, tg: import('../game/types').Telegraph) {
    if (tg.t < 0) return;
    const k = clamp(tg.t / tg.total, 0, 1);
    const col = tg.color;
    ctx.save();
    ctx.fillStyle = rgba(col, 0.12 + k * 0.12);
    ctx.strokeStyle = rgba(col, 0.75);
    ctx.lineWidth = 0.05;
    const fillProgress = (path: () => void, inner: () => void) => { path(); ctx.fill(); ctx.stroke(); ctx.fillStyle = rgba(col, 0.28); inner(); ctx.fill(); };
    switch (tg.shape) {
      case 'circle':
        fillProgress(() => { ctx.beginPath(); ctx.ellipse(tg.x, tg.y, tg.r, tg.r * 0.8, 0, 0, Math.PI * 2); }, () => { ctx.beginPath(); ctx.ellipse(tg.x, tg.y, tg.r * k, tg.r * 0.8 * k, 0, 0, Math.PI * 2); });
        break;
      case 'ring':
        ctx.beginPath(); ctx.ellipse(tg.x, tg.y, tg.r, tg.r * 0.8, 0, 0, Math.PI * 2); ctx.ellipse(tg.x, tg.y, tg.inner ?? 0, (tg.inner ?? 0) * 0.8, 0, 0, Math.PI * 2, true);
        ctx.fillStyle = rgba(col, 0.15 + k * 0.25); ctx.fill('evenodd'); ctx.stroke();
        break;
      case 'cone':
        fillProgress(() => { ctx.beginPath(); ctx.moveTo(tg.x, tg.y); ctx.arc(tg.x, tg.y, tg.r, tg.angle - tg.width / 2, tg.angle + tg.width / 2); ctx.closePath(); },
          () => { ctx.beginPath(); ctx.moveTo(tg.x, tg.y); ctx.arc(tg.x, tg.y, tg.r * k, tg.angle - tg.width / 2, tg.angle + tg.width / 2); ctx.closePath(); });
        break;
      case 'line': {
        ctx.translate(tg.x, tg.y); ctx.rotate(tg.angle);
        fillProgress(() => { ctx.beginPath(); ctx.rect(0, -tg.width / 2, tg.len, tg.width); }, () => { ctx.beginPath(); ctx.rect(0, -tg.width / 2, tg.len * k, tg.width); });
        break;
      }
    }
    ctx.restore();
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, p: import('../game/types').Projectile) {
    switch (p.kind) {
      case 'bolt': ctx.strokeStyle = '#ffe0a0'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(p.x, p.y - 0.5); ctx.lineTo(p.x - p.vx * 0.025, p.y - 0.5 - p.vy * 0.025); ctx.stroke(); break;
      case 'charge': {
        const k = 1 - p.life / (p.t0 ?? 1);
        const h = Math.sin(k * Math.PI) * 2.2;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 0.15, 0.07, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a3634'; ctx.beginPath(); ctx.arc(p.x, p.y - h - 0.3, 0.14, 0, Math.PI * 2); ctx.fill();
        glow(ctx, p.x + 0.1, p.y - h - 0.42, 0.2, '#ffa03a', 1);
        break;
      }
      default: {
        const col = p.kind === 'bile' || p.kind === 'acid' ? '#a8ff3a' : p.kind === 'hex' ? '#c060ff' : '#ff8a3a';
        glow(ctx, p.x, p.y - 0.5, 0.45, col, 0.9);
        ctx.fillStyle = shade(col, 0.4); ctx.beginPath(); ctx.arc(p.x, p.y - 0.5, p.r * 0.7, 0, Math.PI * 2); ctx.fill();
        if (Math.random() < 0.5) this.particles.spawn({ x: p.x, y: p.y, z: 0.5, size: 0.08, max: 0.3, color: col, kind: 1, vz: 0 });
      }
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    const L = this.particles.list;
    // non-additive first
    for (const p of L) {
      if (p.add) continue;
      const a = 1 - p.life / p.max;
      if (p.kind === 2) { ctx.fillStyle = rgba(p.color, a * 0.28); ctx.beginPath(); ctx.arc(p.x, p.y - p.z, p.size, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.fillStyle = rgba(p.color, Math.min(1, a * 2)); ctx.fillRect(p.x - p.size / 2, p.y - p.z - p.size / 2, p.size, p.size); }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const p of L) {
      if (!p.add) continue;
      const a = 1 - p.life / p.max;
      switch (p.kind) {
        case 0: ctx.strokeStyle = rgba(p.color, a); ctx.lineWidth = p.size * 0.7; ctx.beginPath(); ctx.moveTo(p.x, p.y - p.z); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.z - p.vy * 0.04 + p.vz * 0.04); ctx.stroke(); break;
        case 4: ctx.strokeStyle = rgba(p.color, a * 0.8); ctx.lineWidth = 0.12 * a + 0.02; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * 0.8, 0, 0, Math.PI * 2); ctx.stroke(); break;
        case 5: {
          const arc = p.arc ?? 2, ang = p.angle ?? 0;
          const k = p.life / p.max;
          const sweepStart = ang - arc / 2, sweep = arc * Math.min(1, k * 2.5);
          ctx.strokeStyle = rgba(p.color, (1 - k) * 0.9); ctx.lineWidth = 0.22 * (1 - k) + 0.04;
          ctx.beginPath(); ctx.arc(p.x, p.y - 0.5, p.size * 0.85, sweepStart, sweepStart + sweep); ctx.stroke();
          ctx.strokeStyle = rgba('#ffffff', (1 - k) * 0.6); ctx.lineWidth = 0.05;
          ctx.beginPath(); ctx.arc(p.x, p.y - 0.5, p.size * 0.95, sweepStart, sweepStart + sweep); ctx.stroke();
          break;
        }
        default: {
          const r = p.size * (1.5 + (1 - a));
          const gr = ctx.createRadialGradient(p.x, p.y - p.z, 0, p.x, p.y - p.z, r);
          gr.addColorStop(0, rgba(p.color, a)); gr.addColorStop(1, rgba(p.color, 0));
          ctx.fillStyle = gr; ctx.fillRect(p.x - r, p.y - p.z - r, r * 2, r * 2);
        }
      }
    }
    for (const b of this.particles.bolts) {
      const a = 1 - b.life / b.max;
      ctx.strokeStyle = rgba(b.color, a); ctx.lineWidth = b.width * (0.6 + a * 0.4);
      ctx.beginPath(); ctx.moveTo(b.pts[0].x, b.pts[0].y - 0.5);
      for (const p of b.pts) ctx.lineTo(p.x + (Math.random() - 0.5) * 0.05, p.y - 0.5 + (Math.random() - 0.5) * 0.05);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawFog(ctx: CanvasRenderingContext2D, m: import('../world/map').GameMap, x0: number, y0: number, x1: number, y1: number) {
    ctx.fillStyle = m.kind === 'dungeon' ? '#050403' : '#0a0908';
    for (let y = Math.max(0, y0); y <= Math.min(m.h - 1, y1); y++) {
      let run = -1;
      for (let x = Math.max(0, x0); x <= Math.min(m.w - 1, x1) + 1; x++) {
        const unexplored = x <= Math.min(m.w - 1, x1) && !m.explored[y * m.w + x];
        if (unexplored && run < 0) run = x;
        else if (!unexplored && run >= 0) { ctx.fillRect(run, y, x - run, 1.02); run = -1; }
      }
    }
  }

  private drawLighting(g: Game, lvl: Level, z: number, cx: number, cy: number, x0: number, y0: number, x1: number, y1: number) {
    const lc = this.lctx;
    const lw = this.light.width, lh = this.light.height;
    let dark: number;
    const dungeon = lvl.map.kind === 'dungeon';
    if (dungeon) dark = 0.78;
    else {
      dark = clamp((0.62 - g.daylight()) * 1.5, 0, 0.9);
      const w = g.worldEvents.weather;
      if (w === 'storm' || w === 'riftstorm') dark = Math.max(dark, 0.35);
      if (w === 'fog' || w === 'ashfall' || w === 'rain') dark = Math.max(dark, 0.18);
    }
    if (dark < 0.02) return;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, lw, lh);
    lc.fillStyle = dungeon ? `rgba(4,3,6,${dark})` : `rgba(6,8,22,${dark})`;
    lc.fillRect(0, 0, lw, lh);
    const s = z / 4;
    lc.setTransform(s, 0, 0, s, -cx * s + lw / 2, -cy * s + lh / 2);
    lc.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, a = 1) => {
      const gr = lc.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.6})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = gr; lc.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const pl = g.player;
    hole(pl.x, pl.y - 0.6, dungeon ? 9 : 7.5, 0.95);
    if (lvl.map.kind === 'overworld') {
      for (const b of g.factory.buildings.values()) {
        if (b.x < x0 - 10 || b.x > x1 + 10 || b.y < y0 - 10 || b.y > y1 + 10) continue;
        const L = b.def.light;
        if (!L) continue;
        const lit = b.kind === 'lamp' ? b.working : b.status === 'working' || (b.kind === 'generator' && b.working) || (b.kind === 'beacon');
        if (lit) hole(b.x + b.w / 2, b.y + b.h / 2, L * (b.kind === 'lamp' ? 1 : 1.2), b.kind === 'lamp' ? 1 : 0.8);
      }
      for (const n of g.npcs) hole(n.x, n.y, 3, 0.5);
    }
    for (let y = Math.max(0, y0); y <= Math.min(lvl.map.h - 1, y1); y += 1)
      for (let x = Math.max(0, x0); x <= Math.min(lvl.map.w - 1, x1); x += 1) {
        const t = lvl.map.terrain[y * lvl.map.w + x];
        if (t === T.Lava && (x + y) % 2 === 0) hole(x + 0.5, y + 0.5, 2.2, 0.6);
        else if (t === T.Vent && Math.sin(g.time * 2 + ((y * lvl.map.w + x) % 7)) > 0.6) hole(x + 0.5, y + 0.5, 2.5, 0.7);
      }
    for (const p of lvl.projectiles) if (p.kind !== 'bolt') hole(p.x, p.y, 2, 0.7);
    for (const ge of lvl.ground) if (ge.type !== 'acid') hole(ge.x, ge.y, ge.r * 2, 0.7);
    for (const e of lvl.enemies) if (!e.dead && (e.def.id === 'colossus' || e.def.id === 'bloat' || e.def.id === 'moth' || e.def.id === 'mender' || e.def.id === 'hexcaller')) hole(e.x, e.y - 1, e.def.id === 'colossus' ? 7 : 2, 0.7);
    for (const p of this.particles.list) if (p.add && p.kind === 1 && p.size > 0.3) hole(p.x, p.y, p.size * 3, 0.5);
    for (const p of lvl.map.pois) if (p.kind === 'dungeon' || p.kind === 'exit' || p.kind === 'nest' || p.kind === 'hive') hole(p.x + 0.5, p.y, 4, 0.6);
    for (const d of lvl.loot) if (d.equip && d.equip.rarity >= 3) hole(d.x, d.y, 2.5, 0.8);
    lc.globalCompositeOperation = 'source-over';
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.light, 0, 0, lw, lh, 0, 0, this.W, this.H);
  }

  private drawBars(ctx: CanvasRenderingContext2D, g: Game, lvl: Level, x0: number, y0: number, x1: number, y1: number) {
    for (const e of lvl.enemies) {
      if (e.dead || e.def.boss || e.state === 'burrowed') continue;
      if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
      const show = e.hp < e.maxHp || e.champion || e.elite.length;
      if (!show) continue;
      const w = Math.max(0.8, e.r * 2.2), top = e.y - e.r * 2.6 - (e.def.flying ? 0.8 : 0) - 0.35;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(e.x - w / 2 - 0.03, top - 0.03, w + 0.06, 0.14);
      ctx.fillStyle = e.champion ? '#ffb04a' : '#c8302a'; ctx.fillRect(e.x - w / 2, top, w * (e.hp / e.maxHp), 0.08);
      if (e.shieldHp > 0) { ctx.fillStyle = '#ffe05a'; ctx.fillRect(e.x - w / 2, top - 0.06, w * Math.min(1, e.shieldHp / (e.maxHp * 0.3)), 0.04); }
      if (e.champion) {
        ctx.font = '600 0.3px "Cinzel", serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#000'; ctx.fillText(e.name, e.x + 0.02, top - 0.13);
        ctx.fillStyle = '#ffe05a'; ctx.fillText(e.name, e.x, top - 0.15);
      }
    }
    void g;
  }

  private drawNumbers(ctx: CanvasRenderingContext2D, dt: number) {
    const keep: DmgNum[] = [];
    ctx.textAlign = 'center';
    for (const n of this.nums) {
      n.life += dt;
      if (n.life > n.max) continue;
      n.x += n.vx * dt; n.y += n.vy * dt; n.vy += 4.5 * dt;
      const a = Math.min(1, (n.max - n.life) * 4);
      const pop = n.life < 0.08 ? 1 + (0.08 - n.life) * 6 : 1;
      ctx.font = `800 ${0.42 * n.size * pop}px "Inter", system-ui, sans-serif`;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillText(n.text, n.x + 0.03, n.y + 0.03);
      ctx.fillStyle = n.color; ctx.fillText(n.text, n.x, n.y);
      keep.push(n);
    }
    ctx.globalAlpha = 1;
    this.nums = keep;
  }

  private drawWeather(ctx: CanvasRenderingContext2D, g: Game, dt: number) {
    const w = g.worldEvents.weather;
    const W = this.W, H = this.H;
    if (w === 'rain' || w === 'storm') {
      ctx.strokeStyle = 'rgba(160,180,210,0.35)'; ctx.lineWidth = 1.2 * this.dpr;
      ctx.beginPath();
      for (const d of this.weatherDrops) {
        d.y += dt * (1.6 + d.s); d.x += dt * 0.15;
        if (d.y > 1) { d.y -= 1; d.x = Math.random(); }
        const x = ((d.x - this.camX * 0.01) % 1 + 1) % 1 * W, y = d.y * H;
        ctx.moveTo(x, y); ctx.lineTo(x + 4 * this.dpr, y + 18 * this.dpr);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(30,40,60,0.12)'; ctx.fillRect(0, 0, W, H);
    }
    if (w === 'ashfall' || w === 'riftstorm') {
      ctx.fillStyle = w === 'riftstorm' ? 'rgba(190,140,255,0.6)' : 'rgba(200,190,180,0.55)';
      for (const d of this.weatherDrops) {
        d.y += dt * (0.05 + d.s * 0.05); d.x += Math.sin(this.time + d.z * 10) * dt * 0.02;
        if (d.y > 1) d.y -= 1;
        const x = ((d.x - this.camX * 0.008) % 1 + 1) % 1 * W, y = ((d.y - this.camY * 0.008) % 1 + 1) % 1 * H;
        ctx.fillRect(x, y, (1 + d.z * 2) * this.dpr, (1 + d.z * 2) * this.dpr);
      }
      if (w === 'riftstorm') { ctx.fillStyle = 'rgba(80,30,120,0.12)'; ctx.fillRect(0, 0, W, H); }
    }
    if (w === 'fog') {
      for (let i = 0; i < 4; i++) {
        const x = ((this.time * 0.01 * (i + 1) - this.camX * 0.02 + i * 0.3) % 1.4) * W - W * 0.2, y = H * (0.2 + i * 0.2);
        const gr = ctx.createRadialGradient(x, y, 0, x, y, W * 0.5);
        gr.addColorStop(0, 'rgba(150,145,140,0.22)'); gr.addColorStop(1, 'rgba(150,145,140,0)');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      }
    }
    if ((w === 'storm' || w === 'riftstorm') && Math.random() < dt * 0.15 && !g.settings.reduceFlashing) this.lightningFlash = 0.5;
    if (this.lightningFlash > 0) { ctx.fillStyle = `rgba(220,230,255,${this.lightningFlash * 0.4})`; ctx.fillRect(0, 0, W, H); this.lightningFlash -= dt * 3; }
  }

  private drawNavDebug(ctx: CanvasRenderingContext2D, lvl: Level, x0: number, y0: number, x1: number, y1: number) {
    const f = lvl.navPlayer;
    ctx.font = '0.25px monospace'; ctx.textAlign = 'center';
    for (let y = Math.max(0, y0); y <= Math.min(lvl.map.h - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(lvl.map.w - 1, x1); x++) {
        const d = f.dist[y * lvl.map.w + x];
        if (d === UNREACHED) continue;
        ctx.fillStyle = `hsla(${(d * 5) % 360},80%,50%,0.25)`; ctx.fillRect(x, y, 1, 1);
        ctx.fillStyle = '#fff'; ctx.fillText(String(d), x + 0.5, y + 0.6);
      }
  }

  private drawPowerDebug(ctx: CanvasRenderingContext2D, g: Game) {
    const hues = [0, 60, 120, 180, 240, 300];
    for (const n of g.power.nets) {
      ctx.strokeStyle = `hsla(${hues[n.id % 6]},90%,60%,0.9)`; ctx.lineWidth = 0.08;
      for (const m of [...n.members, ...n.generators, ...n.capacitors]) ctx.strokeRect(m.x, m.y, m.w, m.h);
      for (const p of n.pylons) { ctx.beginPath(); ctx.arc(p.x + 0.5, p.y + 0.5, 0.4, 0, Math.PI * 2); ctx.stroke(); }
    }
  }
}
