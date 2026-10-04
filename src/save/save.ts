import { hashString } from '../core/rng';
import { BUILDING_MAP } from '../data/buildings';
import { RECIPE_MAP } from '../data/recipes';
import { Game } from '../game/game';
import { setUidCounter, type Equip, type InvSlot } from '../game/items';
import type { GearSlot } from '../game/player';
import type { Settings } from '../game/settings';
import { ITEM_IDS, ITEM_INDEX } from '../sim/itemIndex';
import type { GameMap } from '../world/map';

export const SAVE_VERSION = 3;

/** Storage abstraction so saves work in browsers (localStorage) and tests (memory). */
export interface SaveStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const memoryStorage = (): SaveStorage => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
};

export const browserStorage = (): SaveStorage => ({
  get: (k) => localStorage.getItem(k),
  set: (k, v) => localStorage.setItem(k, v),
  remove: (k) => localStorage.removeItem(k),
});

type BuildingRec = [
  string, number, number, number, number, // def, x, y, dir, hp
  string | null, [string, number][], [string, number][], number[], number[], // recipe, input, output, belt items(str idx), belt pos
  Record<string, unknown>,
];

export interface SaveData {
  version: number;
  savedAt: number;
  seed: number;
  seedText: string;
  difficulty: string;
  worldMods: Game['worldMods'];
  time: number;
  dungeonDepth: number;
  player: Record<string, unknown>;
  inventory: InvSlot[];
  gear: Record<string, Equip | null>;
  research: ReturnType<Game['research']['serialize']>;
  quests: ReturnType<Game['quests']['serialize']>;
  threat: ReturnType<Game['threat']['serialize']>;
  market: ReturnType<Game['market']['serialize']>;
  flags: string[];
  stats: Game['stats'];
  pois: [number, boolean, boolean][];
  world: { res: number[]; amt: number[]; tree: number[]; prop: number[]; fungus: number[]; explored: string };
  buildings: BuildingRec[];
  ghosts: Game['factory']['ghosts'] extends Map<number, infer G> ? G[] : never;
  loot: { x: number; y: number; item?: string; count?: number; equip?: Equip; embers?: number }[];
  markers: Game['markers'];
  uid: number;
  totalProduced: [string, number][];
  victory: boolean;
}

// ───────────────────────── world delta encoding
function deltas(cur: ArrayLike<number>, base: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < cur.length; i++) if (cur[i] !== base[i]) out.push(i, cur[i]);
  return out;
}
function applyDeltas(arr: { [i: number]: number }, d: number[]) {
  for (let k = 0; k < d.length; k += 2) arr[d[k]] = d[k + 1];
}
function bitsToB64(a: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(a.length / 8));
  for (let i = 0; i < a.length; i++) if (a[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBits(s: string, out: Uint8Array) {
  const bin = atob(s);
  for (let i = 0; i < out.length; i++) out[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
}

export interface Pristine { res: Uint8Array; amt: Uint32Array; tree: Uint8Array; prop: Uint8Array; fungus: Uint8Array }
export function snapshotPristine(m: GameMap): Pristine {
  return { res: m.res.slice(), amt: m.amt.slice(), tree: m.tree.slice(), prop: m.prop.slice(), fungus: m.fungus.slice() };
}

export function serializeGame(g: Game, pristine: Pristine): SaveData {
  const pl = g.player;
  const m = g.overworld;
  const buildings: BuildingRec[] = [];
  for (const b of g.factory.buildings.values()) {
    const extra: Record<string, unknown> = {};
    if (b.filter) extra.filter = b.filter;
    if (b.cond) extra.cond = b.cond;
    if (b.fuelEnergy) extra.fuel = b.fuelEnergy;
    if (b.energy) extra.energy = b.energy;
    if (b.stage) extra.stage = b.stage;
    if (b.ammoShots) extra.ammo = b.ammoShots;
    if (b.charge) extra.charge = b.charge;
    if (b.progress) extra.progress = b.progress;
    if (b.working) extra.working = 1;
    if (b.held >= 0) extra.held = ITEM_IDS[b.held];
    if (b.armT) extra.armT = b.armT;
    if (b.vein) extra.vein = b.vein;
    if (b.disabled) extra.disabled = 1;
    if (b.forged.length) extra.forged = b.forged;
    if (b.mineCursor) extra.mc = b.mineCursor;
    buildings.push([b.def.id, b.x, b.y, b.dir, Math.round(b.hp), b.recipe?.id ?? null, [...b.input], [...b.output], b.bItems.map((i) => i), b.bPos.map((p) => Math.round(p * 1000) / 1000), extra]);
  }
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    seed: g.seed,
    seedText: g.seedText,
    difficulty: g.diff.id,
    worldMods: g.worldMods,
    time: g.time,
    dungeonDepth: g.dungeonDepth,
    player: {
      x: g.where === 'dungeon' ? null : pl.x, y: g.where === 'dungeon' ? null : pl.y,
      level: pl.level, xp: pl.xp, hp: pl.hp, resolve: pl.resolve, embers: pl.embers, attrs: pl.attrs, attrPoints: pl.attrPoints,
      skillPoints: pl.skillPoints, passivePoints: pl.passivePoints, bar: pl.bar, techDrones: pl.techDrones,
      skills: [...pl.skills].map(([id, s]) => [id, s.rank, [...s.mods]]), passives: [...pl.passives],
    },
    inventory: pl.inv.slots,
    gear: pl.gear,
    research: g.research.serialize(),
    quests: g.quests.serialize(),
    threat: g.threat.serialize(),
    market: g.market.serialize(),
    flags: [...g.flags],
    stats: g.stats,
    pois: m.pois.map((p) => [p.id, !!p.discovered, !!p.cleared]),
    world: {
      res: deltas(m.res, pristine.res), amt: deltas(m.amt, pristine.amt), tree: deltas(m.tree, pristine.tree),
      prop: deltas(m.prop, pristine.prop), fungus: deltas(m.fungus, pristine.fungus), explored: bitsToB64(m.explored),
    },
    buildings,
    ghosts: [...g.factory.ghosts.values()],
    loot: g.over.loot.map((d) => ({ x: d.x, y: d.y, item: d.item, count: d.count, equip: d.equip, embers: d.embers })),
    markers: g.markers,
    uid: maxUid(g),
    totalProduced: [...g.factory.totalProduced],
    victory: g.victory,
  };
}

function maxUid(g: Game) {
  let m = 0;
  const visit = (e: Equip | null | undefined) => { if (e && e.uid > m) m = e.uid; };
  for (const s of g.player.inv.slots) if (s && 'equip' in s) visit(s.equip);
  for (const e of Object.values(g.player.gear)) visit(e);
  for (const b of g.factory.buildings.values()) for (const e of b.forged as Equip[]) visit(e);
  for (const d of g.over.loot) visit(d.equip);
  return m + 1;
}

/** Upgrades older save formats in place. Each step migrates exactly one version. */
export const MIGRATIONS: Record<number, (d: Record<string, unknown>) => void> = {
  1: (d) => {
    // v1 had no market or action bar
    d.market ??= { sold: [], bought: [] };
    const p = d.player as Record<string, unknown>;
    p.bar ??= ['cleave', 'rush', null, null, null, null];
    d.version = 2;
  },
  2: (d) => {
    // v2 stored belt items as item id strings; v3 stores interned indices
    for (const b of d.buildings as unknown[][]) {
      const items = b[8] as (number | string)[];
      b[8] = items.map((i) => (typeof i === 'string' ? ITEM_INDEX.get(i) ?? 0 : i));
    }
    d.totalProduced ??= [];
    d.version = 3;
  },
};

export function migrate(d: Record<string, unknown>): SaveData {
  let v = (d.version as number) ?? 1;
  if (v > SAVE_VERSION) throw new Error(`Save version ${v} is newer than this build (${SAVE_VERSION})`);
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from save version ${v}`);
    step(d);
    v = d.version as number;
  }
  return d as unknown as SaveData;
}

export function restoreGame(raw: SaveData | Record<string, unknown>, settings?: Settings): { game: Game; pristine: Pristine } {
  const d = migrate(raw as Record<string, unknown>);
  const g = new Game({ seed: d.seed, difficulty: d.difficulty, worldMods: d.worldMods, settings });
  g.seedText = d.seedText;
  const m = g.overworld;
  const pristine = snapshotPristine(m);
  applyDeltas(m.res, d.world.res); applyDeltas(m.amt, d.world.amt); applyDeltas(m.tree, d.world.tree);
  applyDeltas(m.prop, d.world.prop); applyDeltas(m.fungus, d.world.fungus);
  b64ToBits(d.world.explored, m.explored);
  m.version++;
  for (let cy = 0; cy < m.h; cy += 32) for (let cx = 0; cx < m.w; cx += 32) m.markDirty(cx, cy);
  for (const [id, disc, clr] of d.pois) { const p = m.pois.find((x) => x.id === id); if (p) { p.discovered = disc; p.cleared = clr; } }
  g.time = d.time;
  g.dungeonDepth = d.dungeonDepth;
  g.flags = new Set(d.flags);
  g.stats = { ...g.stats, ...d.stats };
  g.victory = d.victory;
  setUidCounter(d.uid);
  // research before factory so unlock predicates are correct
  g.research.load(d.research);
  // player
  const pl = g.player;
  const p = d.player as Record<string, never>;
  pl.level = p.level; pl.xp = p.xp; pl.embers = p.embers; pl.attrs = p.attrs; pl.attrPoints = p.attrPoints;
  pl.skillPoints = p.skillPoints; pl.passivePoints = p.passivePoints; pl.bar = p.bar; pl.techDrones = p.techDrones ?? 0;
  for (const [id, rank, mods] of p.skills as [string, number, string[]][]) { const s = pl.skills.get(id); if (s) { s.rank = rank; s.mods = new Set(mods); } }
  pl.passives = new Set(p.passives);
  pl.inv.slots = d.inventory.slice();
  while (pl.inv.slots.length < 60) pl.inv.slots.push(null);
  for (const k of Object.keys(pl.gear) as GearSlot[]) pl.gear[k] = d.gear[k] ?? null;
  pl.recompute();
  pl.hp = Math.min(p.hp, pl.stats.maxLife);
  pl.resolve = p.resolve;
  if (p.x !== null && p.x !== undefined) { pl.x = p.x; pl.y = p.y; }
  else { const ent = m.pois.find((q) => q.kind === 'dungeon')!; pl.x = ent.x + 0.5; pl.y = ent.y + 2.5; }
  // factory
  const f = g.factory;
  for (const r of d.buildings) {
    const [def, x, y, dir, hp, recipe, input, output, bItems, bPos, ex] = r;
    if (!BUILDING_MAP.has(def)) continue; // content removed: skip safely
    const b = f.place(def, x, y, dir, true)!;
    b.hp = hp;
    if (recipe && RECIPE_MAP.has(recipe)) b.recipe = RECIPE_MAP.get(recipe)!;
    b.input = new Map(input); b.output = new Map(output);
    b.bItems = bItems.slice(); b.bPos = bPos.slice();
    const e = ex as Record<string, never>;
    b.filter = e.filter ?? null; b.cond = e.cond ?? null; b.fuelEnergy = e.fuel ?? 0; b.energy = e.energy ?? 0; b.stage = e.stage ?? 0;
    b.ammoShots = e.ammo ?? 0; b.charge = e.charge ?? 0; b.progress = e.progress ?? 0; b.working = !!e.working;
    b.held = e.held ? ITEM_INDEX.get(e.held) ?? -1 : -1; b.armT = e.armT ?? 0; b.vein = e.vein ?? 0; b.disabled = !!e.disabled;
    b.forged = e.forged ?? []; b.mineCursor = e.mc ?? 0;
  }
  for (const gh of d.ghosts) f.ghosts.set(m.idx(gh.x, gh.y), gh);
  f.totalProduced = new Map(d.totalProduced);
  f.beaconComplete = g.victory || [...f.buildings.values()].some((b) => b.kind === 'beacon' && b.stage >= 3);
  g.quests.load(d.quests);
  g.threat.load(d.threat);
  g.market.load(d.market);
  for (const l of d.loot) g.over.loot.push({ id: g.nextId(), x: l.x, y: l.y, item: l.item, count: l.count, equip: l.equip, embers: l.embers, t: 1, vy: 0, z: 0 });
  g.markers = d.markers ?? [];
  m.explore(pl.x, pl.y, 14);
  return { game: g, pristine };
}

// ───────────────────────── envelope: checksum + compression + backups
async function gzip(s: string): Promise<string | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const cs = new CompressionStream('gzip');
  const buf = await new Response(new Blob([s]).stream().pipeThrough(cs)).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function gunzip(b64: string): Promise<string> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('gzip');
  return await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
}

export interface SlotMeta { slot: string; name: string; level: number; time: number; savedAt: number; version: number; seed: string; quest: string }

export async function encodeSave(data: SaveData): Promise<string> {
  const json = JSON.stringify(data);
  const sum = hashString(json);
  const z = await gzip(json);
  return JSON.stringify(z ? { f: 'ef', sum, z: 1, data: z } : { f: 'ef', sum, z: 0, data: json });
}

export async function decodeSave(text: string): Promise<SaveData> {
  const env = JSON.parse(text);
  if (env.f !== 'ef') throw new Error('Not an Emberforge save');
  const json = env.z ? await gunzip(env.data) : env.data;
  if (hashString(json) !== env.sum) throw new Error('Save checksum mismatch (corrupted)');
  return JSON.parse(json);
}

export async function writeSlot(store: SaveStorage, slot: string, data: SaveData, questName = ''): Promise<void> {
  const encoded = await encodeSave(data);
  // keep the previous good save as a backup before overwriting
  const prev = store.get(`ef.save.${slot}`);
  if (prev) store.set(`ef.save.${slot}.bak`, prev);
  store.set(`ef.save.${slot}`, encoded);
  const meta: SlotMeta = { slot, name: slot, level: (data.player.level as number) ?? 1, time: data.time, savedAt: data.savedAt, version: data.version, seed: data.seedText, quest: questName };
  store.set(`ef.meta.${slot}`, JSON.stringify(meta));
}

/** Loads a slot, falling back to its backup if the primary is corrupted. */
export async function readSlot(store: SaveStorage, slot: string): Promise<{ data: SaveData; fromBackup: boolean }> {
  const main = store.get(`ef.save.${slot}`);
  if (main) {
    try { return { data: await decodeSave(main), fromBackup: false }; } catch (e) { console.warn('Primary save corrupted, trying backup', e); }
  }
  const bak = store.get(`ef.save.${slot}.bak`);
  if (bak) return { data: await decodeSave(bak), fromBackup: true };
  throw new Error('No readable save in this slot');
}

export function listSlots(store: SaveStorage): SlotMeta[] {
  const out: SlotMeta[] = [];
  for (const s of SLOT_NAMES) {
    const m = store.get(`ef.meta.${s}`);
    if (m) try { out.push(JSON.parse(m)); } catch { /* ignore broken meta */ }
  }
  return out;
}

export function deleteSlot(store: SaveStorage, slot: string) {
  for (const k of [`ef.save.${slot}`, `ef.save.${slot}.bak`, `ef.meta.${slot}`]) store.remove(k);
}

export const SLOT_NAMES = ['auto', 'slot1', 'slot2', 'slot3'];
