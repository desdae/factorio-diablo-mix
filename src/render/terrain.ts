import { hash2 } from '../core/rng';
import { fbm } from '../core/noise';
import { GameMap, RES_COLOR, T } from '../world/map';
import { makeCanvas, shade, rgba } from './draw';

export const CHUNK = 32;
export const TP = 24; // pixels per tile in chunk caches

const BASE: Record<number, string> = {
  [T.Ash]: '#3b3632', [T.Dune]: '#4a4038', [T.Scorch]: '#3a2c26', [T.Rock]: '#4e4a46', [T.Water]: '#1c2a33',
  [T.Lava]: '#5a1a0a', [T.Road]: '#5a5048', [T.Plaza]: '#625a50', [T.DFloor]: '#2e2a28', [T.DWall]: '#141110',
  [T.Hive]: '#3a2a34', [T.Vent]: '#2a2422', [T.Bridge]: '#5a4430', [T.Rubble]: '#4a4440',
};

/**
 * Terrain is baked into 32×32-tile chunk canvases (LRU cached) and re-baked only when tiles change.
 * Animated details (lava glow, water shimmer, vents) are overlaid per frame by the renderer.
 */
export class TerrainCache {
  private chunks = new Map<number, { c: HTMLCanvasElement; used: number }>();
  private frame = 0;
  constructor(public map: GameMap, private max = 40) {}

  invalidateAll() { this.chunks.clear(); }

  get(cx: number, cy: number): HTMLCanvasElement {
    const key = (cy << 8) | cx;
    if (this.map.dirtyChunks.has(key)) { this.map.dirtyChunks.delete(key); this.chunks.delete(key); }
    let e = this.chunks.get(key);
    if (!e) {
      e = { c: this.bake(cx, cy), used: 0 };
      this.chunks.set(key, e);
      if (this.chunks.size > this.max) {
        let oldK = -1, oldU = Infinity;
        for (const [k, v] of this.chunks) if (v.used < oldU) { oldU = v.used; oldK = k; }
        this.chunks.delete(oldK);
      }
    }
    e.used = ++this.frame;
    return e.c;
  }

  private bake(cx: number, cy: number): HTMLCanvasElement {
    const m = this.map;
    const c = makeCanvas(CHUNK * TP, CHUNK * TP);
    const ctx = c.getContext('2d')!;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    for (let ty = 0; ty < CHUNK; ty++)
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = x0 + tx, y = y0 + ty;
        if (!m.inBounds(x, y)) continue;
        const i = m.idx(x, y);
        const t = m.terrain[i];
        const h = hash2(x, y, m.seed);
        // low-frequency tonal variation keeps neighbouring tiles coherent (no checkerboard)
        const v = fbm(x / 7, y / 7, m.seed + 404, 2) * 0.16 + ((h & 255) / 255 - 0.5) * 0.025;
        ctx.fillStyle = shade(BASE[t] ?? '#333', v);
        ctx.fillRect(tx * TP, ty * TP, TP + 0.5, TP + 0.5);
        this.detail(ctx, t, tx * TP, ty * TP, h, x, y);
      }
    // edge blending: soften borders between different terrain types
    for (let ty = 0; ty < CHUNK; ty++)
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = x0 + tx, y = y0 + ty;
        if (!m.inBounds(x, y)) continue;
        const t = m.terrain[m.idx(x, y)];
        if (t === T.DWall || t === T.Rock) continue;
        for (let d = 0; d < 4; d++) {
          const nx = x + (d === 0 ? 1 : d === 2 ? -1 : 0), ny = y + (d === 1 ? 1 : d === 3 ? -1 : 0);
          if (!m.inBounds(nx, ny)) continue;
          const nt = m.terrain[m.idx(nx, ny)];
          if (nt === t || nt === T.Rock || nt === T.DWall) continue;
          const col = BASE[nt];
          const px = tx * TP, py = ty * TP;
          const g = d === 0 ? ctx.createLinearGradient(px + TP, 0, px + TP * 0.5, 0) : d === 2 ? ctx.createLinearGradient(px, 0, px + TP * 0.5, 0) : d === 1 ? ctx.createLinearGradient(0, py + TP, 0, py + TP * 0.5) : ctx.createLinearGradient(0, py, 0, py + TP * 0.5);
          g.addColorStop(0, rgba(col, 0.45)); g.addColorStop(1, rgba(col, 0));
          ctx.fillStyle = g; ctx.fillRect(px, py, TP, TP);
        }
      }
    // raised walls and rocks drawn after so they overlap neighbours (pseudo height)
    for (let ty = 0; ty < CHUNK; ty++)
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = x0 + tx, y = y0 + ty;
        if (!m.inBounds(x, y)) continue;
        const i = m.idx(x, y);
        const t = m.terrain[i];
        const h = hash2(x, y, m.seed + 5);
        if (t === T.Rock) this.boulder(ctx, tx * TP, ty * TP, h);
        if (t === T.DWall) this.wall(ctx, tx * TP, ty * TP, m, x, y, h);
        if (m.res[i] && m.amt[i] > 0) this.ore(ctx, tx * TP, ty * TP, m.res[i], m.amt[i], h);
        if (m.fungus[i] === 255) this.fungus(ctx, tx * TP, ty * TP, h);
      }
    return c;
  }

  private detail(ctx: CanvasRenderingContext2D, t: number, px: number, py: number, h: number, x: number, y: number) {
    const r = (k: number) => ((h >>> (k * 3)) & 255) / 255;
    switch (t) {
      case T.Ash: case T.Dune: case T.Scorch: case T.Hive: {
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = rgba(t === T.Hive ? '#7a3a6a' : '#000000', 0.12 + r(k) * 0.1);
          ctx.fillRect(px + r(k + 1) * TP, py + r(k + 2) * TP, 1.5 + r(k) * 2, 1.5);
        }
        if (t === T.Scorch && r(4) > 0.75) { ctx.strokeStyle = rgba('#1a0e08', 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + r(5) * TP, py); ctx.lineTo(px + r(6) * TP, py + TP); ctx.stroke(); }
        if (t === T.Ash && r(7) > 0.93) { ctx.fillStyle = rgba('#6a6050', 0.5); ctx.beginPath(); ctx.arc(px + TP / 2, py + TP / 2, 2 + r(3) * 2, 0, Math.PI * 2); ctx.fill(); }
        if (t === T.Hive && r(5) > 0.8) { ctx.fillStyle = rgba('#a04a8a', 0.35); ctx.beginPath(); ctx.arc(px + r(1) * TP, py + r(2) * TP, 3, 0, Math.PI * 2); ctx.fill(); }
        break;
      }
      case T.Road: case T.Plaza: case T.Bridge: {
        ctx.strokeStyle = rgba('#000000', t === T.Plaza ? 0.22 : 0.16); ctx.lineWidth = 1;
        if (t === T.Bridge) { for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px, py + k * TP / 4); ctx.lineTo(px + TP, py + k * TP / 4); ctx.stroke(); } break; }
        const off = (y % 2) * TP / 2;
        ctx.strokeRect(px + ((off + (x % 2) * TP) % TP) - TP / 2, py, TP, TP / 2);
        ctx.strokeRect(px + (off % TP), py + TP / 2, TP, TP / 2);
        ctx.fillStyle = rgba('#ffffff', 0.02 + r(2) * 0.03); ctx.fillRect(px + 1, py + 1, TP - 2, TP / 2 - 2);
        break;
      }
      case T.Water: {
        ctx.fillStyle = rgba('#2a4a5a', 0.4 + r(1) * 0.2); ctx.fillRect(px, py + r(2) * TP, TP, 1);
        break;
      }
      case T.Lava: {
        ctx.fillStyle = rgba('#ff6a1a', 0.35 + r(1) * 0.3);
        ctx.beginPath(); ctx.arc(px + r(2) * TP, py + r(3) * TP, 3 + r(4) * 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba('#2a0a04', 0.7); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + r(5) * TP, py); ctx.lineTo(px + r(6) * TP, py + TP); ctx.stroke();
        break;
      }
      case T.DFloor: case T.Vent: {
        ctx.strokeStyle = rgba('#000000', 0.35); ctx.lineWidth = 1;
        if ((x + y) % 2 === 0) ctx.strokeRect(px + 0.5, py + 0.5, TP - 1, TP - 1);
        if (r(3) > 0.85) { ctx.fillStyle = rgba('#5a3a20', 0.25); ctx.fillRect(px + r(1) * TP, py + r(2) * TP, 4, 3); }
        if (t === T.Vent) { ctx.fillStyle = '#120c0a'; ctx.fillRect(px + 3, py + 3, TP - 6, TP - 6); ctx.strokeStyle = '#4a3a30'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px + 4, py + 5 + k * 4); ctx.lineTo(px + TP - 4, py + 5 + k * 4); ctx.stroke(); } }
        break;
      }
      case T.Rubble: {
        for (let k = 0; k < 4; k++) { ctx.fillStyle = shade('#6a6058', r(k) * 0.3 - 0.15); ctx.fillRect(px + r(k + 1) * TP, py + r(k + 2) * TP, 3 + r(k) * 4, 2 + r(k + 3) * 3); }
        break;
      }
    }
  }

  private boulder(ctx: CanvasRenderingContext2D, px: number, py: number, h: number) {
    const r = (k: number) => ((h >>> (k * 3)) & 255) / 255;
    const cx = px + TP / 2 + (r(1) - 0.5) * 4, cy = py + TP / 2 - 3;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx + 2, cy + 7, TP * 0.55, TP * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(cx, cy - TP * 0.6, cx, cy + TP * 0.4);
    g.addColorStop(0, '#7a746c'); g.addColorStop(1, '#3a3632');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const rr = TP * (0.5 + r(k + 2) * 0.22);
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.ellipse(cx - 3, cy - 5, TP * 0.22, TP * 0.12, -0.4, 0, Math.PI * 2); ctx.fill();
  }

  private wall(ctx: CanvasRenderingContext2D, px: number, py: number, m: GameMap, x: number, y: number, h: number) {
    const below = m.inBounds(x, y + 1) && m.terrain[m.idx(x, y + 1)] !== T.DWall;
    const nearFloor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.inBounds(x + dx, y + dy) && m.terrain[m.idx(x + dx, y + dy)] !== T.DWall);
    ctx.fillStyle = nearFloor ? '#3a322c' : '#0c0a09'; ctx.fillRect(px, py, TP, TP);
    if (nearFloor) {
      // carved stone top with mortar lines
      ctx.fillStyle = 'rgba(255,220,180,0.05)'; ctx.fillRect(px, py, TP, 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, TP - 1, TP - 1);
    }
    if (below) {
      // visible wall face toward the camera
      const g = ctx.createLinearGradient(0, py, 0, py + TP);
      g.addColorStop(0, '#4a4038'); g.addColorStop(1, '#2a2420');
      ctx.fillStyle = g; ctx.fillRect(px, py + TP * 0.3, TP, TP * 0.7);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
      ctx.strokeRect(px + ((h & 7) - 4), py + TP * 0.3, TP * 0.6, TP * 0.35);
      ctx.strokeRect(px + TP * 0.4, py + TP * 0.65, TP * 0.6, TP * 0.35);
      ctx.fillStyle = 'rgba(255,140,60,0.06)'; ctx.fillRect(px, py + TP * 0.9, TP, TP * 0.1);
    }
  }

  private ore(ctx: CanvasRenderingContext2D, px: number, py: number, res: number, amt: number, h: number) {
    const r = (k: number) => ((h >>> (k * 2)) & 255) / 255;
    const n = Math.min(5, 1 + Math.floor(Math.log2(1 + amt / 40)));
    const col = RES_COLOR[res];
    for (let k = 0; k < n; k++) {
      const x = px + 3 + r(k) * (TP - 6), y = py + 3 + r(k + 5) * (TP - 6), s = 2.5 + r(k + 3) * 3.5;
      ctx.fillStyle = shade(col, -0.45);
      ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.6); ctx.lineTo(x - s * 0.4, y - s); ctx.lineTo(x + s * 0.7, y - s * 0.7); ctx.lineTo(x + s, y + s * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(col, 0.15);
      ctx.beginPath(); ctx.moveTo(x - s * 0.4, y - s); ctx.lineTo(x + s * 0.7, y - s * 0.7); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
      if (res === 5) { ctx.fillStyle = 'rgba(255,170,60,0.6)'; ctx.fillRect(x - 1, y - 1, 2, 2); }
    }
  }

  private fungus(ctx: CanvasRenderingContext2D, px: number, py: number, h: number) {
    const r = (k: number) => ((h >>> (k * 3)) & 255) / 255;
    for (let k = 0; k < 3; k++) {
      const x = px + 5 + r(k) * (TP - 10), y = py + 8 + r(k + 3) * (TP - 12);
      ctx.fillStyle = '#d9cfb8'; ctx.fillRect(x - 1, y, 2, 4);
      ctx.fillStyle = '#c0303a'; ctx.beginPath(); ctx.ellipse(x, y, 4, 2.5, 0, Math.PI, 0); ctx.fill();
    }
  }
}
