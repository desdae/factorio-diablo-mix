import { Rng, hash2 } from '../core/rng';
import { fbm, noise2 } from '../core/noise';
import { GameMap, Res, T, type Poi, type PoiKind } from './map';

export const WORLD_SIZE = 224;

export interface WorldGenOptions {
  seed: number;
  size?: number;
  resourceRichness?: number; // multiplier
}

/**
 * Deterministic overworld generation: terrain → resources → vegetation → points of interest → roads → validation.
 * The same seed always produces the same world.
 */
export function generateOverworld(opts: WorldGenOptions): GameMap {
  const size = opts.size ?? WORLD_SIZE;
  const seed = opts.seed >>> 0;
  const rich = opts.resourceRichness ?? 1;
  const map = new GameMap(size, size, 'overworld', seed);
  const rng = new Rng(seed);
  const cx = Math.floor(size * 0.32), cy = Math.floor(size * 0.5);

  // ── Terrain
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const e = fbm(x / 38, y / 38, seed, 5);
      const ridge = 1 - Math.abs(noise2(x / 22, y / 22, seed + 7));
      const moist = fbm(x / 50, y / 50, seed + 31, 3);
      const heat = fbm(x / 60, y / 60, seed + 99, 3) + (x / size - 0.5) * 0.6; // hotter to the east
      let t: number = T.Ash;
      if (moist > 0.28 && e < -0.05) t = T.Water;
      else if (ridge > 0.9 && e > 0.05) t = T.Rock;
      else if (heat > 0.42 && ridge > 0.84) t = T.Lava;
      else if (heat > 0.18) t = T.Scorch;
      else if (moist < -0.2) t = T.Dune;
      // map border wall
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
      if (edge < 2 || (edge < 6 && hash2(x, y, seed) % 3 === 0)) t = T.Rock;
      map.terrain[i] = t;
    }
  }

  // ── Spawn clearing & settlement
  const clear = (px: number, py: number, r: number, terrain: number = T.Ash) => {
    for (let y = py - r; y <= py + r; y++)
      for (let x = px - r; x <= px + r; x++) {
        if (!map.inBounds(x, y) || Math.min(x, y, size - 1 - x, size - 1 - y) < 3) continue;
        if ((x - px) ** 2 + (y - py) ** 2 > r * r) continue;
        const i = map.idx(x, y);
        map.terrain[i] = terrain; map.tree[i] = 0; map.res[i] = 0; map.amt[i] = 0; map.prop[i] = 0;
      }
  };
  clear(cx, cy, 16);
  const pois: Poi[] = [];
  let poiId = 1;
  const addPoi = (kind: PoiKind, x: number, y: number, r: number, name: string, level: number) => {
    const p: Poi = { id: poiId++, kind, x, y, r, name, level };
    pois.push(p);
    return p;
  };
  addPoi('spawn', cx, cy, 3, 'Kindling Point', 1);
  const sx = cx - 22, sy = cy + 4;
  clear(sx, sy, 9, T.Plaza);
  addPoi('settlement', sx, sy, 9, 'Hearthmoor', 1);

  // ── Resource patches: guaranteed starters near spawn, then scattered richer fields
  const patch = (px: number, py: number, r: number, res: Res, base: number) => {
    for (let y = py - r - 2; y <= py + r + 2; y++)
      for (let x = px - r - 2; x <= px + r + 2; x++) {
        if (!map.inBounds(x, y)) continue;
        const d = Math.sqrt((x - px) ** 2 + (y - py) ** 2) + noise2(x / 3, y / 3, seed + res) * 1.8;
        if (d > r) continue;
        const i = map.idx(x, y);
        if (map.terrain[i] === T.Water || map.terrain[i] === T.Lava || map.terrain[i] === T.Plaza) continue;
        if (map.terrain[i] === T.Rock) map.terrain[i] = T.Ash;
        map.res[i] = res;
        map.amt[i] = Math.floor(base * rich * (1.3 - d / r) * (0.8 + 0.4 * ((hash2(x, y, seed) & 255) / 255)));
        map.tree[i] = 0;
      }
  };
  const starters: [Res, number, number][] = [[Res.Iron, -1, -1], [Res.Copper, 1, -1], [Res.Coal, 1, 1], [Res.Stone, -1, 1]];
  for (const [res, dx, dy] of starters) {
    const ang = Math.atan2(dy, dx) + rng.range(-0.3, 0.3);
    const d = rng.range(11, 15);
    patch(Math.round(cx + Math.cos(ang) * d), Math.round(cy + Math.sin(ang) * d), 4, res, 900);
  }
  for (let k = 0; k < 34; k++) {
    const x = rng.int(12, size - 12), y = rng.int(12, size - 12);
    const dd = Math.hypot(x - cx, y - cy);
    if (dd < 26) continue;
    const res = rng.weighted([Res.Iron, Res.Copper, Res.Coal, Res.Stone, Res.Emberite], (r) => (r === Res.Emberite ? (x > size * 0.6 ? 1.2 : 0.15) : 1));
    patch(x, y, rng.int(4, 8), res, (res === Res.Emberite ? 400 : 1200) * (1 + dd / 80));
  }

  // ── Vegetation and fungus
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (map.terrain[i] !== T.Ash && map.terrain[i] !== T.Dune) continue;
      if (map.res[i]) continue;
      const f = fbm(x / 16, y / 16, seed + 555, 3);
      const h = hash2(x, y, seed + 1) & 1023;
      if (f > 0.22 && h < 420) map.tree[i] = 6;
      else if (h < 6) map.tree[i] = 6;
      else if (h > 1016 && map.terrain[i] === T.Ash) map.fungus[i] = 255;
    }
  // re-clear spawn of trees (keep resources)
  for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 8; x++) map.tree[map.idx(x, y)] = 0;

  // ── Points of interest
  const farPoint = (minD: number, maxD: number, angMin: number, angMax: number) => {
    for (let tries = 0; tries < 200; tries++) {
      const a = rng.range(angMin, angMax), d = rng.range(minD, maxD);
      const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
      if (x > 14 && y > 14 && x < size - 14 && y < size - 14) return [x, y] as const;
    }
    return [Math.min(size - 20, cx + minD), cy] as const;
  };
  const [hx, hy] = farPoint(62, 80, -0.5, 0.5);
  clear(hx, hy, 10, T.Hive);
  addPoi('hive', hx, hy, 10, 'Slagjaw Hive', 7);
  const [dx, dy] = farPoint(75, 95, -1.4, -0.7);
  clear(dx, dy, 6, T.Rubble);
  addPoi('dungeon', dx, dy, 3, 'The Sunken Foundry', 9);
  patch(dx + 8, dy + 4, 4, Res.Emberite, 600);
  // Blight nests: origin of factory assaults
  for (let k = 0; k < 4; k++) {
    const [nx, ny] = farPoint(55, 95, -Math.PI, Math.PI);
    clear(nx, ny, 4, T.Hive);
    addPoi('nest', nx, ny, 4, 'Blight Nest', 4 + k);
  }
  // Monster camps with escalating level by distance
  for (let k = 0; k < 26; k++) {
    const [px, py] = farPoint(20, 100, -Math.PI, Math.PI);
    if (pois.some((p) => (p.x - px) ** 2 + (p.y - py) ** 2 < (p.r + 10) ** 2)) continue;
    const d = Math.hypot(px - cx, py - cy);
    clear(px, py, 3, T.Scorch);
    addPoi('camp', px, py, 5, 'Ashborn Camp', Math.max(1, Math.round(1 + d / 11)));
  }
  // Ruins with caches & destructible props
  for (let k = 0; k < 10; k++) {
    const [px, py] = farPoint(25, 95, -Math.PI, Math.PI);
    if (pois.some((p) => (p.x - px) ** 2 + (p.y - py) ** 2 < (p.r + 8) ** 2)) continue;
    clear(px, py, 4, T.Rubble);
    for (let j = 0; j < 7; j++) {
      const ox = px + rng.int(-4, 4), oy = py + rng.int(-4, 4);
      if (map.inBounds(ox, oy) && (ox !== px || oy !== py)) map.prop[map.idx(ox, oy)] = 30;
    }
    addPoi('ruin', px, py, 4, 'Wright Ruin', Math.round(1 + Math.hypot(px - cx, py - cy) / 12));
  }
  map.pois = pois;

  // ── Roads: a spanning network (each POI joins its nearest connected neighbour) guarantees reachability
  const carve = (ax: number, ay: number, bx: number, by: number) => {
    let x = ax, y = ay;
    let guard = 0;
    while ((x !== bx || y !== by) && guard++ < 2000) {
      const ddx = bx - x, ddy = by - y;
      const wobble = noise2(x / 9, y / 9, seed + 77);
      if (Math.abs(ddx) > Math.abs(ddy) + wobble * 4) x += Math.sign(ddx);
      else if (ddy !== 0) y += Math.sign(ddy);
      else x += Math.sign(ddx);
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const tx = x + ox, ty = y + oy;
          if (!map.inBounds(tx, ty) || Math.min(tx, ty, size - 1 - tx, size - 1 - ty) < 2) continue;
          const i = map.idx(tx, ty);
          const t = map.terrain[i];
          map.tree[i] = 0;
          map.prop[i] = 0;
          if (t === T.Water || t === T.Lava) map.terrain[i] = T.Bridge;
          else if (t === T.Rock) map.terrain[i] = ox === 0 && oy === 0 ? T.Road : T.Rubble;
          else if (ox === 0 && oy === 0 && t !== T.Plaza && t !== T.Hive && map.res[i] === 0) map.terrain[i] = T.Road;
        }
    }
  };
  const connected: { x: number; y: number }[] = [{ x: sx, y: sy }];
  const pending = pois.filter((p) => p.kind !== 'settlement' && p.kind !== 'spawn');
  // the spawn gets a direct road to the settlement
  carve(sx, sy, cx, cy);
  connected.push({ x: cx, y: cy });
  while (pending.length) {
    let bi = 0, bj = 0, bd = Infinity;
    for (let i = 0; i < pending.length; i++)
      for (let j = 0; j < connected.length; j++) {
        const d = (pending[i].x - connected[j].x) ** 2 + (pending[i].y - connected[j].y) ** 2;
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    const p = pending.splice(bi, 1)[0];
    carve(connected[bj].x, connected[bj].y, p.x, p.y);
    connected.push({ x: p.x, y: p.y });
  }

  validateReachability(map, sx, sy);
  return map;
}

/** Flood fill from (sx,sy). Any POI not reachable gets a road carved to the nearest reachable tile. */
export function validateReachability(map: GameMap, sx: number, sy: number): number {
  const reach = floodReach(map, sx, sy);
  let fixes = 0;
  for (const p of map.pois) {
    if (reach[map.idx(p.x, p.y)]) continue;
    fixes++;
    // walk toward settlement clearing a corridor
    let x = p.x, y = p.y, guard = 0;
    while (!reach[map.idx(x, y)] && guard++ < 1000) {
      x += Math.sign(sx - x); y += Math.sign(sy - y);
      const i = map.idx(x, y);
      map.tree[i] = 0; map.prop[i] = 0;
      if (!map.terrainPassable(x, y)) map.terrain[i] = T.Road;
    }
  }
  return fixes;
}

export function floodReach(map: GameMap, sx: number, sy: number): Uint8Array {
  const reach = new Uint8Array(map.w * map.h);
  const q = new Int32Array(map.w * map.h);
  let qh = 0, qt = 0;
  q[qt++] = map.idx(sx, sy); reach[q[0]] = 1;
  while (qh < qt) {
    const i = q[qh++];
    const x = i % map.w, y = (i / map.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + (d === 0 ? 1 : d === 2 ? -1 : 0), ny = y + (d === 1 ? 1 : d === 3 ? -1 : 0);
      if (!map.inBounds(nx, ny)) continue;
      const j = map.idx(nx, ny);
      if (reach[j] || !map.terrainPassable(nx, ny)) continue;
      reach[j] = 1; q[qt++] = j;
    }
  }
  return reach;
}
