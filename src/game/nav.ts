import type { GameMap } from '../world/map';

export const UNREACHED = 0xffff;

/**
 * Breadth-first distance field (8-neighbour, corner-cutting prevented).
 * Units descend the gradient. Rebuilt incrementally only when seeds or map version change.
 */
export class FlowField {
  dist: Uint16Array;
  private queue: Int32Array;
  version = -1;
  seedKey = '';
  constructor(public map: GameMap) {
    this.dist = new Uint16Array(map.w * map.h).fill(UNREACHED);
    this.queue = new Int32Array(map.w * map.h);
  }

  /**
   * @param seeds tile indices with distance 0
   * @param passable predicate for traversal
   * @param maxDist stop expanding beyond this distance
   */
  build(seeds: number[], passable: (x: number, y: number) => boolean, maxDist = 0xfffe) {
    const { map, dist, queue } = this;
    dist.fill(UNREACHED);
    let qh = 0, qt = 0;
    for (const s of seeds) { if (dist[s] !== 0) { dist[s] = 0; queue[qt++] = s; } }
    const w = map.w, h = map.h;
    while (qh < qt) {
      const i = queue[qh++];
      const d = dist[i];
      if (d >= maxDist) continue;
      const x = i % w, y = (i / w) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (dist[j] !== UNREACHED || !passable(nx, ny)) continue;
        dist[j] = d + 1;
        queue[qt++] = j;
      }
    }
    this.version = map.version;
  }

  at(x: number, y: number): number {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) return UNREACHED;
    return this.dist[ty * this.map.w + tx];
  }

  /** Returns a unit direction toward lower distance, or null when unreachable. */
  direction(x: number, y: number, passable: (x: number, y: number) => boolean): { x: number; y: number } | null {
    const tx = Math.floor(x), ty = Math.floor(y);
    const here = this.at(x, y);
    let best = here, bx = 0, by = 0;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = tx + ox, ny = ty + oy;
        if (nx < 0 || ny < 0 || nx >= this.map.w || ny >= this.map.h) continue;
        if (ox && oy && (!passable(tx + ox, ty) || !passable(tx, ty + oy))) continue;
        const d = this.dist[ny * this.map.w + nx];
        if (d < best || (d === best && d !== UNREACHED && ox * ox + oy * oy === 2 && best < here)) { best = d; bx = ox; by = oy; }
      }
    if (best === UNREACHED || (bx === 0 && by === 0)) return null;
    const dx = tx + bx + 0.5 - x, dy = ty + by + 0.5 - y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }
}

/** Uniform-grid spatial hash for fast neighbour queries over hundreds of actors. */
export class SpatialHash<T extends { x: number; y: number }> {
  private cells = new Map<number, T[]>();
  constructor(public cell = 4) {}
  clear() { this.cells.clear(); }
  key(cx: number, cy: number) { return (cx + 1024) * 4096 + (cy + 1024); }
  insert(o: T) {
    const k = this.key(Math.floor(o.x / this.cell), Math.floor(o.y / this.cell));
    const arr = this.cells.get(k);
    if (arr) arr.push(o); else this.cells.set(k, [o]);
  }
  query(x: number, y: number, r: number, out: T[] = []): T[] {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (const o of arr) if ((o.x - x) ** 2 + (o.y - y) ** 2 <= r2) out.push(o);
      }
    return out;
  }
}
