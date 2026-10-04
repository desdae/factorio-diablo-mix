/** Tile-based map storage shared by overworld and dungeons. Typed arrays keep large worlds cheap to simulate and save. */

export const enum T {
  Ash = 0, Dune = 1, Scorch = 2, Rock = 3, Water = 4, Lava = 5, Road = 6, Plaza = 7,
  DFloor = 8, DWall = 9, Hive = 10, Vent = 11, Bridge = 12, Rubble = 13,
}

export const SOLID_TERRAIN = new Set<number>([T.Rock, T.Water, T.Lava, T.DWall]);
/** Terrain flying units may cross */
export const FLY_BLOCK = new Set<number>([T.DWall]);

export const enum Res { None = 0, Iron = 1, Copper = 2, Coal = 3, Stone = 4, Emberite = 5 }
export const RES_ITEM = ['', 'iron_ore', 'copper_ore', 'coal', 'stone', 'emberite_ore'];
export const RES_COLOR = ['', '#8fa2b8', '#d4774a', '#2a2626', '#9a948e', '#ff6a2a'];

export type PoiKind = 'spawn' | 'settlement' | 'hive' | 'dungeon' | 'camp' | 'nest' | 'ruin' | 'exit' | 'boss_arena' | 'treasure' | 'shrine';

export interface Poi {
  id: number;
  kind: PoiKind;
  x: number;
  y: number;
  r: number;
  name: string;
  level: number;
  cleared?: boolean;
  discovered?: boolean;
}

export class GameMap {
  readonly w: number;
  readonly h: number;
  readonly kind: 'overworld' | 'dungeon';
  terrain: Uint8Array;
  res: Uint8Array;
  amt: Uint32Array;
  /** tree hit points (0 = none) */
  tree: Uint8Array;
  /** bloodcap fungus: 255 = ripe, else regrowth countdown in seconds/4 */
  fungus: Uint8Array;
  /** building occupancy: building id (0 = none) */
  occ: Int32Array;
  explored: Uint8Array;
  /** destructible props (crates, barrels, pillars) hp */
  prop: Uint8Array;
  pois: Poi[] = [];
  /** incremented on any change to passability (for nav field rebuilds and render cache invalidation) */
  version = 0;
  dirtyChunks = new Set<number>();
  seed: number;

  constructor(w: number, h: number, kind: 'overworld' | 'dungeon', seed: number) {
    this.w = w; this.h = h; this.kind = kind; this.seed = seed;
    const n = w * h;
    this.terrain = new Uint8Array(n);
    this.res = new Uint8Array(n);
    this.amt = new Uint32Array(n);
    this.tree = new Uint8Array(n);
    this.fungus = new Uint8Array(n);
    this.occ = new Int32Array(n);
    this.explored = new Uint8Array(n);
    this.prop = new Uint8Array(n);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  idx(x: number, y: number): number {
    return y * this.w + x;
  }
  /** Ground-unit passability ignoring buildings */
  terrainPassable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.w + x;
    return !SOLID_TERRAIN.has(this.terrain[i]) && this.tree[i] === 0 && this.prop[i] === 0;
  }
  /** Ground-unit passability including buildings */
  passable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.w + x;
    return !SOLID_TERRAIN.has(this.terrain[i]) && this.tree[i] === 0 && this.occ[i] === 0 && this.prop[i] === 0;
  }
  flyPassable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return !FLY_BLOCK.has(this.terrain[y * this.w + x]);
  }
  markDirty(x: number, y: number): void {
    this.version++;
    this.dirtyChunks.add(((y >> 5) << 8) | (x >> 5));
  }
  explore(cx: number, cy: number, r: number): void {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) this.explored[y * this.w + x] = 1;
    for (const p of this.pois) if (!p.discovered && (p.x - cx) ** 2 + (p.y - cy) ** 2 < (r + p.r) ** 2) p.discovered = true;
  }
}
