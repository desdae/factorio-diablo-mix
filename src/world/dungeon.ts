import { Rng } from '../core/rng';
import { GameMap, T, type Poi } from './map';
import { floodReach } from './worldgen';

export interface Room { x: number; y: number; w: number; h: number; kind: 'start' | 'normal' | 'treasure' | 'boss' | 'secret' | 'trap' }

export type DungeonModId = 'swift' | 'volatile' | 'grim' | 'elite' | 'hazard' | 'bounty' | 'armored';
export const DUNGEON_MODS: { id: DungeonModId; name: string; desc: string }[] = [
  { id: 'swift', name: 'Hastened', desc: 'Enemies move 25% faster.' },
  { id: 'volatile', name: 'Volatile', desc: 'Enemies explode on death.' },
  { id: 'grim', name: 'Grim', desc: 'Player healing reduced by 40%.' },
  { id: 'elite', name: 'Champion\'s Hall', desc: 'Twice as many elite packs.' },
  { id: 'hazard', name: 'Unstable', desc: 'Many more fire vents.' },
  { id: 'bounty', name: 'Bountiful', desc: '+60% item rarity and +1 rift shard per elite.' },
  { id: 'armored', name: 'Ironclad', desc: 'Enemies have +50% armor.' },
];

export interface DungeonInfo {
  map: GameMap;
  rooms: Room[];
  start: { x: number; y: number };
  boss: Room;
  depth: number;
  mods: DungeonModId[];
}

/**
 * Generates a dungeon of rooms connected by a spanning tree of corridors plus extra loops.
 * Depth increases size, enemy level and the number of modifiers (endless scaling).
 */
export function generateDungeon(seed: number, depth: number): DungeonInfo {
  const rng = new Rng(seed ^ (depth * 0x9e3779b1));
  const size = 96 + Math.min(32, depth * 4);
  const map = new GameMap(size, size, 'dungeon', seed + depth);
  map.terrain.fill(T.DWall);
  const rooms: Room[] = [];
  const overlaps = (r: Room) => rooms.some((o) => r.x < o.x + o.w + 3 && r.x + r.w + 3 > o.x && r.y < o.y + o.h + 3 && r.y + r.h + 3 > o.y);
  // boss arena first (big), placed far from start
  const boss: Room = { x: size - 30, y: rng.int(6, size - 30), w: 24, h: 22, kind: 'boss' };
  rooms.push(boss);
  const start: Room = { x: 4, y: rng.int(8, size - 20), w: 10, h: 9, kind: 'start' };
  rooms.push(start);
  const target = 12 + Math.min(10, depth * 2);
  for (let tries = 0; tries < 600 && rooms.length < target; tries++) {
    const w = rng.int(7, 15), h = rng.int(7, 13);
    const r: Room = { x: rng.int(3, size - w - 4), y: rng.int(3, size - h - 4), w, h, kind: 'normal' };
    if (!overlaps(r)) rooms.push(r);
  }
  // assign special rooms
  const normals = rooms.filter((r) => r.kind === 'normal');
  if (normals.length > 2) { normals[0].kind = 'treasure'; normals[1].kind = 'trap'; }
  if (normals.length > 4) normals[2].kind = 'secret';
  for (const r of rooms) carveRect(map, r.x, r.y, r.w, r.h);

  // minimum spanning tree over room centers (Prim), plus a few loops
  const centers = rooms.map((r) => ({ x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) }));
  const inTree = new Set<number>([1]);
  const edges: [number, number][] = [];
  while (inTree.size < rooms.length) {
    let best: [number, number] | null = null, bd = Infinity;
    for (const a of inTree)
      for (let b = 0; b < rooms.length; b++) {
        if (inTree.has(b)) continue;
        // the boss room and secret room connect via a single corridor only
        const d = (centers[a].x - centers[b].x) ** 2 + (centers[a].y - centers[b].y) ** 2;
        if (d < bd) { bd = d; best = [a, b]; }
      }
    if (!best) break;
    edges.push(best);
    inTree.add(best[1]);
  }
  for (let k = 0; k < 3; k++) {
    const a = rng.int(1, rooms.length - 1), b = rng.int(1, rooms.length - 1);
    if (a !== b && rooms[a].kind !== 'secret' && rooms[b].kind !== 'secret') edges.push([a, b]);
  }
  for (const [a, b] of edges) carveCorridor(map, rng, centers[a].x, centers[a].y, centers[b].x, centers[b].y, rooms[a].kind === 'secret' || rooms[b].kind === 'secret' ? 1 : 3);

  // features: pillars in boss arena (destructible), vents in corridors/trap room, crates
  for (let k = 0; k < 4; k++) {
    const px = boss.x + 5 + (k % 2) * (boss.w - 10), py = boss.y + 5 + Math.floor(k / 2) * (boss.h - 10);
    for (let oy = 0; oy < 2; oy++) for (let ox = 0; ox < 2; ox++) map.prop[map.idx(px + ox, py + oy)] = 200;
  }
  const modCount = depth <= 1 ? 0 : Math.min(4, Math.floor((depth + 1) / 2));
  const mods = rng.shuffle(DUNGEON_MODS.map((m) => m.id)).slice(0, modCount);
  const ventRate = mods.includes('hazard') ? 0.03 : 0.008;
  for (let y = 1; y < size - 1; y++)
    for (let x = 1; x < size - 1; x++) {
      const i = map.idx(x, y);
      if (map.terrain[i] !== T.DFloor) continue;
      if (inRoom(boss, x, y) || inRoom(start, x, y)) continue;
      const trapRoom = rooms.find((r) => r.kind === 'trap' && inRoom(r, x, y));
      if (rng.chance(trapRoom ? 0.08 : ventRate)) map.terrain[i] = T.Vent;
      else if (rng.chance(0.012)) map.prop[i] = 20; // crates & urns
    }
  // ensure everything reachable from start
  const sx = start.x + 2, sy = start.y + (start.h >> 1);
  const reach = floodReach(map, sx, sy);
  for (const r of rooms) {
    const c = map.idx(r.x + (r.w >> 1), r.y + (r.h >> 1));
    if (!reach[c]) carveCorridor(map, rng, sx, sy, r.x + (r.w >> 1), r.y + (r.h >> 1), 2);
  }
  const pois: Poi[] = [
    { id: 1, kind: 'exit', x: sx, y: sy, r: 1.5, name: 'Way Up', level: 1 },
    { id: 2, kind: 'boss_arena', x: boss.x + (boss.w >> 1), y: boss.y + (boss.h >> 1), r: 10, name: 'Heart Furnace', level: 8 + depth },
  ];
  const tr = rooms.find((r) => r.kind === 'treasure');
  if (tr) pois.push({ id: 3, kind: 'treasure', x: tr.x + (tr.w >> 1), y: tr.y + (tr.h >> 1), r: 2, name: 'Wright Cache', level: 8 + depth });
  const sr = rooms.find((r) => r.kind === 'secret');
  if (sr) pois.push({ id: 4, kind: 'shrine', x: sr.x + (sr.w >> 1), y: sr.y + (sr.h >> 1), r: 2, name: 'Forgotten Shrine', level: 8 + depth });
  map.pois = pois;
  return { map, rooms, start: { x: sx + 0.5, y: sy + 0.5 }, boss, depth, mods };
}

function inRoom(r: Room, x: number, y: number) {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

function carveRect(map: GameMap, x: number, y: number, w: number, h: number) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (map.inBounds(xx, yy)) map.terrain[map.idx(xx, yy)] = T.DFloor;
}

function carveCorridor(map: GameMap, rng: Rng, ax: number, ay: number, bx: number, by: number, width: number) {
  const horizFirst = rng.chance(0.5);
  const half = Math.floor(width / 2);
  const dig = (x: number, y: number) => {
    for (let oy = -half; oy <= half; oy++)
      for (let ox = -half; ox <= half; ox++) {
        const tx = x + ox, ty = y + oy;
        if (tx > 0 && ty > 0 && tx < map.w - 1 && ty < map.h - 1) map.terrain[map.idx(tx, ty)] = T.DFloor;
      }
  };
  let x = ax, y = ay;
  if (horizFirst) {
    while (x !== bx) { dig(x, y); x += Math.sign(bx - x); }
    while (y !== by) { dig(x, y); y += Math.sign(by - y); }
  } else {
    while (y !== by) { dig(x, y); y += Math.sign(by - y); }
    while (x !== bx) { dig(x, y); x += Math.sign(bx - x); }
  }
  dig(x, y);
}
