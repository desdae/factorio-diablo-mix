import { EventBus } from '../core/events';
import { Rng, hashString } from '../core/rng';
import { ELITE_MODS, type EliteModId } from '../data/enemies';
import { RECIPE_MAP, type RecipeDef } from '../data/recipes';
import { BUILDING_MAP } from '../data/buildings';
import { TECH_MAP } from '../data/techs';
import { ITEM_MAP } from '../data/items';
import { Factory, type Building, type FactoryContext } from '../sim/factory';
import { PowerGrid } from '../sim/power';
import { Research } from '../sim/research';
import { generateOverworld } from '../world/worldgen';
import { generateDungeon } from '../world/dungeon';
import type { GameMap, Poi } from '../world/map';
import { DIFFICULTIES, type Difficulty, type Settings, type WorldMods, DEFAULT_SETTINGS } from './settings';
import type { GameEvents } from './gameEvents';
import { Level } from './level';
import { Player } from './player';
import { damagePlayer, explode, hitEnemy, spawnEnemy } from './combat';
import { updateEnemies } from './enemyAI';
import { inTelegraph } from './enemyAI';
import { updatePlayer, type PlayerInput } from './playerControl';
import { ThreatSystem } from './threat';
import { WorldEvents } from './worldEvents';
import { QuestTracker } from './quests';
import { Market } from './economy';
import { updateWisps, consumeMaterials, hasMaterials, type Wisp } from './wisps';
import { addDrop, chestLoot } from './loot';
import { generateEquip, type Equip } from './items';
import { packet, type Npc, type DmgType } from './types';
import { damageBuilding } from './combat';
import { Res } from '../world/map';

export interface GameOptions {
  seed: number | string;
  difficulty?: string;
  worldMods?: Partial<WorldMods>;
  settings?: Settings;
  /** world edge length in tiles (default 224); larger worlds for benchmarks */
  size?: number;
}

export interface CraftJob { recipe: string; t: number; total: number }

export const TICK = 1 / 60;

export class Game {
  seed: number;
  seedText: string;
  diff: Difficulty;
  worldMods: WorldMods;
  settings: Settings;
  events = new EventBus<GameEvents>();
  rng: Rng;
  lootRng: Rng;
  time = 0;
  tickCount = 0;
  overworld: GameMap;
  over: Level;
  factory: Factory;
  power: PowerGrid;
  research: Research;
  dungeon: Level | null = null;
  dungeonDepth = 1;
  where: 'overworld' | 'dungeon' = 'overworld';
  player = new Player();
  npcs: Npc[] = [];
  quests: QuestTracker;
  threat = new ThreatSystem();
  worldEvents = new WorldEvents();
  market = new Market();
  wisps: Wisp[] = [];
  craftQueue: CraftJob[] = [];
  flags = new Set<string>();
  stats = { kills: 0, deaths: 0, bosses: 0, dungeons: 0, built: 0 };
  god = false;
  hitStopT = 0;
  timers: { t: number; fn: () => void }[] = [];
  safeZone: { x: number; y: number; r: number } | null = null;
  waveOrigin: { x: number; y: number; t: number } | null = null;
  eventMarker: { x: number; y: number; t: number; kind: string } | null = null;
  camps = new Map<number, { spawned: boolean; respawnAt: number; ids: number[] }>();
  markers: { x: number; y: number; label: string }[] = [];
  spawnPoint = { x: 0, y: 0 };
  interaction: { kind: 'npc' | 'building'; id: string | number } | null = null;
  onAutosave: (() => void) | null = null;
  autosaveT = 300;
  victory = false;
  private idCounter = 1;
  private fungusT = 0;
  private navT = 0;
  factoryCtx: FactoryContext;

  constructor(o: GameOptions) {
    this.seedText = String(o.seed);
    this.seed = typeof o.seed === 'number' ? o.seed >>> 0 : /^\d+$/.test(o.seed) ? Number(o.seed) >>> 0 : hashString(o.seed);
    this.diff = DIFFICULTIES.find((d) => d.id === (o.difficulty ?? 'standard')) ?? DIFFICULTIES[1];
    this.worldMods = { scarce: false, aggressive: false, endless: false, costly: false, ...(o.worldMods ?? {}) };
    this.settings = o.settings ?? { ...DEFAULT_SETTINGS };
    this.rng = new Rng(this.seed ^ 0xa5a5a5);
    this.lootRng = new Rng(this.seed ^ 0x1337);
    this.overworld = generateOverworld({ seed: this.seed, size: o.size, resourceRichness: this.diff.resourceRich * (this.worldMods.scarce ? 0.5 : 1) });
    this.over = new Level(this.overworld);
    this.factory = new Factory(this.overworld);
    this.power = new PowerGrid(this.factory);
    this.research = new Research();
    this.factory.recipeUnlocked = (id) => this.research.isUnlocked(id);
    this.research.onComplete = (t) => {
      this.events.emit('research', { tech: t });
      this.events.emit('banner', { title: 'Research Complete', sub: t.name, color: '#c890ff' });
      this.events.emit('sfx', { name: 'research' });
      this.quests.onResearch(t.id);
      if (t.bonus?.stat === 'drones') { this.player.techDrones += t.bonus.value; this.player.recompute(); }
      if (this.player.addXp(60 * t.tier)) this.onLevelUp();
    };
    this.quests = new QuestTracker(this);
    const spawn = this.overworld.pois.find((p) => p.kind === 'spawn')!;
    this.spawnPoint = { x: spawn.x + 0.5, y: spawn.y + 0.5 };
    this.player.x = this.spawnPoint.x;
    this.player.y = this.spawnPoint.y;
    const settle = this.overworld.pois.find((p) => p.kind === 'settlement')!;
    this.safeZone = { x: settle.x + 0.5, y: settle.y + 0.5, r: 11 };
    this.npcs = makeNpcs(settle);
    // starting kit
    const inv = this.player.inv;
    inv.add('kiln', 2); inv.add('iron_plate', 12); inv.add('wood', 10); inv.add('tonic', 3); inv.add('stone', 10);
    this.player.equip(generateEquip(this.lootRng, { ilvl: 1, rarity: 0, base: 'sword' }));
    this.player.equip(generateEquip(this.lootRng, { ilvl: 1, rarity: 0, base: 'shield' }));
    this.player.equip(generateEquip(this.lootRng, { ilvl: 1, rarity: 0, base: 'coat' }));
    this.player.hp = this.player.stats.maxLife;
    this.factoryCtx = this.makeFactoryCtx();
    this.overworld.explore(this.player.x, this.player.y, 14);
  }

  // ───────────────────────────── helpers
  nextId() { return this.idCounter++; }
  playerLevel(): Level { return this.where === 'dungeon' && this.dungeon ? this.dungeon : this.over; }
  inOverworld() { return this.where === 'overworld'; }
  daylight(): number {
    const ph = (this.time / this.settings.dayLength + 0.15) % 1;
    return 0.5 + 0.5 * Math.cos(ph * Math.PI * 2);
  }
  get isNight() { return this.daylight() < 0.28; }
  zoneLevel(x: number, y: number) { return Math.max(1, Math.round(1 + Math.hypot(x - this.spawnPoint.x, y - this.spawnPoint.y) / 11)); }
  factoryCentroid() {
    let sx = 0, sy = 0, n = 0;
    for (const b of this.factory.buildings.values()) { sx += b.x; sy += b.y; n++; }
    return n ? { x: sx / n, y: sy / n } : { ...this.spawnPoint };
  }
  poweredNear(x: number, y: number, r: number) {
    for (let ty = Math.floor(y - r); ty <= y + r; ty += 2)
      for (let tx = Math.floor(x - r); tx <= x + r; tx += 2) {
        const b = this.factory.at(tx, ty);
        if (b && b.net >= 0 && this.power.satisfaction(b) > 0) return true;
      }
    return false;
  }
  later(t: number, fn: () => void) { this.timers.push({ t, fn }); }
  hitstop(t: number) { this.hitStopT = Math.max(this.hitStopT, t); this.events.emit('hitstop', { t }); }
  addDrop(lvl: Level, x: number, y: number, d: { item?: string; count?: number; equip?: Equip; embers?: number }) { return addDrop(this, lvl, x, y, d); }
  dropPropLoot(lvl: Level, x: number, y: number) {
    const r = this.lootRng;
    if (r.chance(0.5)) this.addDrop(lvl, x, y, { embers: r.int(1, 4) * this.zoneLevel(x, y) });
    if (r.chance(0.25)) this.addDrop(lvl, x, y, { item: r.pick(['wood', 'coal', 'iron_plate', 'bloodcap', 'bone', 'copper_plate']), count: r.int(1, 5) });
    if (r.chance(0.04)) this.addDrop(lvl, x, y, { equip: generateEquip(r, { ilvl: lvl.dungeon ? 8 + this.dungeonDepth * 2 : this.zoneLevel(x, y), mf: this.player.stats.findRarity }) });
  }
  hurtPlayerEnv(type: DmgType, amount: number) {
    if (this.where !== 'overworld') return;
    damagePlayer(this, packet('env', { [type]: amount }));
  }

  onLevelUp() {
    const pl = this.player;
    this.events.emit('levelUp', { level: pl.level });
    this.events.emit('fx', { kind: 'levelup', x: pl.x, y: pl.y, map: this.playerLevel().map.kind });
    this.events.emit('sfx', { name: 'levelup' });
    this.events.emit('toast', { text: `Level ${pl.level}! +5 attribute points, +1 skill point${pl.level % 2 === 0 ? ', +1 passive point' : ''}`, kind: 'good' });
  }

  playerDied() {
    const pl = this.player;
    if (pl.dead) return;
    pl.dead = true;
    pl.hp = 0;
    pl.respawnT = 4;
    pl.action = null;
    this.stats.deaths++;
    const pen = this.diff.deathPenalty;
    let lost = 0;
    if (pen === 'mild') { lost = Math.floor(pl.embers * 0.1); pl.buffs.sick = 60; }
    if (pen === 'harsh') {
      lost = Math.floor(pl.embers * 0.3); pl.buffs.sick = 120;
      for (const s of pl.inv.slots) if (s && 'item' in s && ITEM_MAP.get(s.item)!.category === 'resource') s.count = Math.max(1, Math.floor(s.count * 0.75));
    }
    pl.embers -= lost;
    pl.recompute();
    this.events.emit('death', {});
    this.events.emit('sfx', { name: 'death' });
    this.events.emit('banner', { title: 'You have fallen', sub: pen === 'none' ? 'The Lattice remembers you.' : `Lost ${lost} embers. Ember-Sickness weakens you for a time.`, color: '#d02a3a' });
  }

  respawn() {
    const pl = this.player;
    pl.dead = false;
    pl.hp = pl.stats.maxLife;
    pl.st.burn = pl.st.poison = pl.st.stun = pl.st.chill = 0;
    if (this.where === 'dungeon' && this.dungeon?.dungeon) {
      pl.x = this.dungeon.dungeon.start.x; pl.y = this.dungeon.dungeon.start.y;
    } else { pl.x = this.spawnPoint.x; pl.y = this.spawnPoint.y; }
    pl.iframes = 2;
  }

  // ───────────────────────────── interaction
  interactables(): { kind: string; x: number; y: number; label: string; act: () => void }[] {
    const out: { kind: string; x: number; y: number; label: string; act: () => void }[] = [];
    const lvl = this.playerLevel();
    if (this.where === 'overworld') for (const n of this.npcs) out.push({ kind: 'npc', x: n.x, y: n.y, label: `Talk to ${n.name}`, act: () => { this.interaction = { kind: 'npc', id: n.id }; } });
    for (const p of lvl.map.pois) {
      if (p.kind === 'dungeon') out.push({ kind: 'poi', x: p.x + 0.5, y: p.y + 0.5, label: `Descend into ${p.name}${this.flags.has('colossus_dead') ? ` (Depth ${this.dungeonDepth})` : ''}`, act: () => this.enterDungeon() });
      if (p.kind === 'exit') out.push({ kind: 'poi', x: p.x + 0.5, y: p.y + 0.5, label: 'Return to the surface', act: () => this.exitDungeon() });
      if ((p.kind === 'ruin' || p.kind === 'treasure') && !p.cleared) out.push({ kind: 'poi', x: p.x + 0.5, y: p.y + 0.5, label: `Open ${p.kind === 'ruin' ? 'Wright Cache' : p.name}`, act: () => { p.cleared = true; chestLoot(this, lvl, p.x + 0.5, p.y + 0.5, lvl.dungeon ? 9 + this.dungeonDepth * 2 : p.level, p.kind === 'treasure' ? 2 : 1); this.events.emit('sfx', { name: 'chest' }); this.events.emit('fx', { kind: 'beam', x: p.x + 0.5, y: p.y + 0.5, x2: p.x + 0.5, y2: p.y - 3, color: '#ffd27a', map: lvl.map.kind }); } });
      if (p.kind === 'shrine' && !p.cleared) out.push({ kind: 'poi', x: p.x + 0.5, y: p.y + 0.5, label: 'Touch the Forgotten Shrine', act: () => { p.cleared = true; this.player.buffs.horn = 60; this.player.recompute(); this.events.emit('banner', { title: 'Shrine of Fury', sub: '+25% damage and +15% attack speed for 60 seconds', color: '#ffd27a' }); } });
    }
    return out;
  }

  nearestInteractable(range = 2.2) {
    const pl = this.player;
    let best = null, bd = range;
    for (const it of this.interactables()) {
      const d = Math.hypot(it.x - pl.x, it.y - pl.y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  interact() {
    const it = this.nearestInteractable();
    if (it) it.act();
  }

  // ───────────────────────────── dungeons
  enterDungeon() {
    const depth = this.dungeonDepth;
    const info = generateDungeon(this.seed + 777, depth);
    const lvl = new Level(info.map, info);
    this.dungeon = lvl;
    this.where = 'dungeon';
    this.player.x = info.start.x; this.player.y = info.start.y;
    this.populateDungeon(lvl);
    info.map.explore(this.player.x, this.player.y, 10);
    this.events.emit('mapChange', { kind: 'dungeon' });
    this.events.emit('banner', { title: depth === 1 ? 'The Sunken Foundry' : `The Sunken Foundry — Depth ${depth}`, sub: info.mods.length ? info.mods.map((m) => m[0].toUpperCase() + m.slice(1)).join(' · ') : 'Ancient Wright works, drowned in cinder.', color: '#ff8a3a' });
    this.events.emit('music', { mood: 'dungeon' });
    this.quests.update();
  }

  exitDungeon() {
    const entrance = this.overworld.pois.find((p) => p.kind === 'dungeon')!;
    this.where = 'overworld';
    this.dungeon = null;
    this.player.x = entrance.x + 0.5; this.player.y = entrance.y + 2.5;
    this.events.emit('mapChange', { kind: 'overworld' });
    this.events.emit('music', { mood: 'explore' });
  }

  private populateDungeon(lvl: Level) {
    const info = lvl.dungeon!;
    const L = 7 + info.depth * 2;
    const pool = ['husk', 'husk', 'spitter', 'brute', 'bloat', 'hexcaller', 'mender', 'stalker', 'tunneler'];
    let eliteRooms = info.mods.includes('elite') ? 4 : 2;
    for (const r of info.rooms) {
      if (r.kind === 'start' || r.kind === 'boss') continue;
      const n = Math.round((r.w * r.h) / 22) + (r.kind === 'treasure' ? 2 : 0);
      const champion = eliteRooms > 0 && r.kind !== 'secret' && this.rng.chance(0.45);
      if (champion) {
        eliteRooms--;
        const mods = this.rng.shuffle(ELITE_MODS.map((m) => m.id)).slice(0, 1 + Math.min(2, Math.floor(info.depth / 2))) as EliteModId[];
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        spawnEnemy(this, lvl, this.rng.pick(['brute', 'stalker', 'hexcaller', 'husk']), cx, cy, { level: L + 1, elite: mods, champion: true });
        for (let i = 0; i < 3; i++) spawnEnemy(this, lvl, 'husk', cx + this.rng.range(-2, 2), cy + this.rng.range(-2, 2), { level: L, minion: true, elite: [] });
      }
      for (let i = 0; i < n; i++) {
        const x = r.x + 1 + this.rng.next() * (r.w - 2), y = r.y + 1 + this.rng.next() * (r.h - 2);
        if (!lvl.map.passable(Math.floor(x), Math.floor(y))) continue;
        spawnEnemy(this, lvl, this.rng.pick(pool), x, y, { level: L });
      }
    }
    const b = info.boss;
    spawnEnemy(this, lvl, 'colossus', b.x + b.w / 2, b.y + b.h / 2, { level: L + 2 });
  }

  // ───────────────────────────── construction API (used by UI and blueprints)
  buildRange = 14;

  /** Place with materials if in range; otherwise (or without materials) leave a ghost for wisps. */
  placeBuilding(defId: string, x: number, y: number, dir: number, recipe?: string | null): { ok: boolean; ghost?: boolean; reason?: string; b?: Building } {
    if (this.where !== 'overworld') return { ok: false, reason: 'Cannot build here' };
    if (!this.research.isUnlocked(defId) && this.player.inv.count(defId) === 0) return { ok: false, reason: 'Not researched' };
    const chk = this.factory.canPlace(defId, x, y, dir);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    const fp = this.factory.footprint(defId, dir);
    const inRange = Math.hypot(x + fp.w / 2 - this.player.x, y + fp.h / 2 - this.player.y) <= this.buildRange;
    if (inRange && hasMaterials(this, defId)) {
      consumeMaterials(this, defId);
      const b = this.factory.place(defId, x, y, dir)!;
      if (recipe && (b.kind === 'assembler' || b.kind === 'forge')) this.factory.setRecipe(b, recipe);
      this.events.emit('fx', { kind: 'build', x: x + fp.w / 2, y: y + fp.h / 2, r: Math.max(fp.w, fp.h) / 2, map: 'overworld' });
      this.events.emit('sfx', { name: 'build', x, y });
      this.quests.onBuild(defId);
      this.stats.built++;
      return { ok: true, b };
    }
    this.placeGhost(defId, x, y, dir, recipe ?? null);
    return { ok: true, ghost: true, reason: inRange ? 'Missing materials — ghost placed' : 'Out of reach — ghost placed for wisps' };
  }

  placeGhost(defId: string, x: number, y: number, dir: number, recipe: string | null) {
    const key = this.overworld.idx(x, y);
    // ghosts must not overlap other ghosts
    const fp = this.factory.footprint(defId, dir);
    for (const [k, g] of this.factory.ghosts) {
      const gf = this.factory.footprint(g.def, g.dir);
      if (x < g.x + gf.w && x + fp.w > g.x && y < g.y + gf.h && y + fp.h > g.y) this.factory.ghosts.delete(k);
    }
    this.factory.ghosts.set(key, { def: defId, x, y, dir, recipe });
  }

  deconstruct(b: Building) {
    const refund = this.factory.remove(b);
    refund.set(b.def.id, (refund.get(b.def.id) ?? 0) + 1);
    const inv = this.player.inv;
    for (const [id, n] of refund) {
      const left = inv.add(id, n);
      if (left) this.addDrop(this.over, b.x + b.w / 2, b.y + b.h / 2, { item: id, count: left });
    }
    for (const e of b.forged as Equip[]) if (!inv.addEquip(e)) this.addDrop(this.over, b.x, b.y, { equip: e });
    this.events.emit('fx', { kind: 'dust', x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.max(b.w, b.h) / 2, color: '#8a7a6a', map: 'overworld' });
    this.events.emit('sfx', { name: 'deconstruct' });
  }

  /** Move items from the player into a building (fuel, ammo, inputs). */
  giveToBuilding(b: Building, item: string, count: number): number {
    let moved = 0;
    const inv = this.player.inv;
    if (b.kind === 'beacon' || b.kind === 'vault' || this.factory.accepts(b, item)) {
      while (moved < count && inv.count(item) > 0 && this.factory.insert(b, item)) { inv.remove(item, 1); moved++; }
    }
    return moved;
  }

  takeFromBuilding(b: Building, item: string, count: number, from: 'input' | 'output'): number {
    const src = from === 'input' ? b.input : b.output;
    const have = src.get(item) ?? 0;
    const n = Math.min(have, count);
    const left = this.player.inv.add(item, n);
    const moved = n - left;
    if (have - moved <= 0) src.delete(item); else src.set(item, have - moved);
    return moved;
  }

  // ───────────────────────────── handcrafting
  canHandcraft(r: RecipeDef, times = 1) {
    return r.handcraft && this.research.isUnlocked(r.id) && r.inputs.every((s) => this.player.inv.count(s.item) >= s.count * times);
  }
  handcraft(recipeId: string, times = 1): number {
    const r = RECIPE_MAP.get(recipeId);
    if (!r) return 0;
    let n = 0;
    while (n < times && this.canHandcraft(r)) {
      for (const s of r.inputs) this.player.inv.remove(s.item, s.count);
      this.craftQueue.push({ recipe: r.id, t: 0, total: r.time * 0.5 });
      n++;
    }
    return n;
  }
  cancelCraft(i: number) {
    const job = this.craftQueue[i];
    if (!job) return;
    this.craftQueue.splice(i, 1);
    for (const s of RECIPE_MAP.get(job.recipe)!.inputs) this.player.inv.add(s.item, s.count);
  }

  // ───────────────────────────── factory hooks
  private makeFactoryCtx(): FactoryContext {
    const g = this;
    const tmp: import('./types').Enemy[] = [];
    return {
      time: 0,
      isNight: false,
      miningBonus: 0,
      turretBonus: 0,
      research: this.research,
      machineBonus(x, y) {
        const pl = g.player;
        if (g.where !== 'overworld' || pl.stats.machineSpeed <= 0) return 1;
        return (pl.x - x) ** 2 + (pl.y - y) ** 2 < 64 ? 1 + pl.stats.machineSpeed / 100 : 1;
      },
      turretFire(b, range, mult) {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        let best = null, bs = Infinity;
        for (const e of g.over.spatial.query(cx, cy, range, tmp)) {
          if (e.dead || e.state === 'burrowed') continue;
          const d = (e.x - cx) ** 2 + (e.y - cy) ** 2 - (e.st.mark > 0 ? 200 : 0);
          if (d < bs) { bs = d; best = e; }
        }
        if (!best) return false;
        const a = Math.atan2(best.y - cy, best.x - cx);
        b.aim = a;
        const dmg = 18 * mult * (1 + g.player.stats.turretDmg / 100);
        g.over.projectiles.push({ id: g.nextId(), x: cx + Math.cos(a) * 0.9, y: cy + Math.sin(a) * 0.9, vx: Math.cos(a) * 32, vy: Math.sin(a) * 32, r: 0.15, life: range / 32 + 0.1, faction: 'player', kind: 'bolt', pierce: 0, hit: new Set(), dmg: packet('turret', { physical: dmg, fromX: cx, fromY: cy }) });
        g.events.emit('fx', { kind: 'muzzle', x: cx + Math.cos(a) * 0.9, y: cy + Math.sin(a) * 0.9, angle: a, map: 'overworld' });
        g.events.emit('sfx', { name: 'turret', x: cx, y: cy, vol: 0.35 });
        return true;
      },
      teslaFire(b, range) {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        let cur = null, bs = range * range;
        for (const e of g.over.spatial.query(cx, cy, range, tmp)) {
          if (e.dead || e.state === 'burrowed') continue;
          const d = (e.x - cx) ** 2 + (e.y - cy) ** 2;
          if (d < bs) { bs = d; cur = e; }
        }
        if (!cur) return false;
        const pts = [{ x: cx, y: cy - 1.2 }];
        const hit = new Set<number>();
        const dmg = 45 * (1 + g.research.bonus.turretDamage + g.player.stats.turretDmg / 100);
        for (let k = 0; k < 5 && cur; k++) {
          hit.add(cur.id);
          pts.push({ x: cur.x, y: cur.y });
          hitEnemy(g, g.over, cur, packet('tesla', { lightning: dmg * Math.pow(0.85, k), shock: 1 }));
          let next = null, nd = 4.5 * 4.5;
          for (const e of g.over.spatial.query(cur.x, cur.y, 4.5, tmp)) {
            if (e.dead || hit.has(e.id)) continue;
            const d = (e.x - cur.x) ** 2 + (e.y - cur.y) ** 2;
            if (d < nd) { nd = d; next = e; }
          }
          cur = next;
        }
        g.events.emit('fx', { kind: 'lightning', x: cx, y: cy, pts, map: 'overworld' });
        g.events.emit('sfx', { name: 'zap', x: cx, y: cy, vol: 0.6 });
        return true;
      },
      forgeComplete(b, r) {
        const f = r.forge!;
        const quality = Math.min(20, g.research.done.size);
        const e = generateEquip(g.lootRng, { ilvl: f.ilvl + Math.floor(g.player.level / 2), group: f.kind, minRarity: f.minRarity, mf: g.player.stats.findRarity + 40, quality });
        b.forged.push(e);
        g.events.emit('toast', { text: `Arms Forge completed: ${e.name}`, kind: e.rarity >= 4 ? 'legend' : 'good' });
      },
    };
  }

  // ───────────────────────────── main update
  update(dt: number, input: PlayerInput) {
    if (this.hitStopT > 0) { this.hitStopT -= dt; return; }
    this.time += dt;
    this.tickCount++;
    // timers
    if (this.timers.length) {
      for (const t of this.timers) t.t -= dt;
      const due = this.timers.filter((t) => t.t <= 0);
      this.timers = this.timers.filter((t) => t.t > 0);
      for (const t of due) t.fn();
    }
    updatePlayer(this, dt, input);
    const pl = this.player;
    const lvl = this.playerLevel();
    if (this.tickCount % 10 === 0) lvl.map.explore(pl.x, pl.y, lvl.map.kind === 'dungeon' ? 9 : 16);
    this.updateLevel(this.over, dt);
    if (this.dungeon) this.updateLevel(this.dungeon, dt);
    // factory
    const ctx = this.factoryCtx;
    ctx.time = this.time;
    ctx.isNight = this.isNight;
    ctx.miningBonus = this.research.bonus.miningSpeed;
    ctx.turretBonus = this.research.bonus.turretDamage;
    this.factory.update(dt, ctx);
    this.power.update(dt);
    this.threat.update(this, dt);
    this.worldEvents.update(this, dt);
    this.market.update(dt);
    updateWisps(this, dt);
    this.updateCraft(dt);
    if (this.tickCount % 30 === 0) this.quests.update();
    if (this.tickCount % 30 === 0 && this.where === 'overworld') this.updateCamps();
    this.fungusT += dt;
    if (this.fungusT >= 4) { this.fungusT = 0; this.regrowFungus(); }
    if (this.factory.beaconComplete && !this.victory) {
      this.victory = true;
      this.events.emit('banner', { title: 'The Lattice Rekindles', sub: 'The Beacon blazes. The world begins to heal — and deeper threats stir.', color: '#ffd27a' });
      this.events.emit('victory', {});
    }
    this.autosaveT -= dt;
    if (this.autosaveT <= 0) { this.autosaveT = 300; this.onAutosave?.(); }
  }

  private updateCraft(dt: number) {
    const job = this.craftQueue[0];
    if (!job) return;
    job.t += dt * (1 + this.research.bonus.craftSpeed);
    if (job.t >= job.total) {
      this.craftQueue.shift();
      const r = RECIPE_MAP.get(job.recipe)!;
      for (const o of r.outputs) {
        const left = this.player.inv.add(o.item, o.count);
        if (left) this.addDrop(this.playerLevel(), this.player.x, this.player.y, { item: o.item, count: left });
      }
      this.events.emit('sfx', { name: 'craft', vol: 0.4 });
    }
  }

  private regrowFungus() {
    const m = this.overworld;
    const f = m.fungus;
    for (let i = 0; i < f.length; i++) if (f[i] > 0 && f[i] < 255) { f[i]--; if (f[i] === 0) { f[i] = 255; m.markDirty(i % m.w, (i / m.w) | 0); } }
  }

  private updateCamps() {
    const pl = this.player;
    for (const p of this.overworld.pois) {
      if (p.kind !== 'camp' && p.kind !== 'hive' && p.kind !== 'nest') continue;
      let st = this.camps.get(p.id);
      if (!st) { st = { spawned: false, respawnAt: 0, ids: [] }; this.camps.set(p.id, st); }
      const d = Math.hypot(pl.x - p.x, pl.y - p.y);
      if (!st.spawned && d < 34 && this.time >= st.respawnAt) {
        st.spawned = true;
        st.ids = this.spawnCamp(p).map((e) => e.id);
      } else if (st.spawned) {
        const alive = this.over.enemies.filter((e) => st!.ids.includes(e.id) && !e.dead);
        if (alive.length === 0) {
          st.spawned = false; st.respawnAt = this.time + 600;
          if (!p.cleared) { p.cleared = true; this.events.emit('toast', { text: `${p.name} cleared`, kind: 'good' }); if (pl.addXp(20 * p.level)) this.onLevelUp(); }
        } else if (d > 60) {
          // simulation sleep: despawn far camps, respawn when the player returns
          for (const e of alive) e.dead = true, e.deathT = 99;
          st.spawned = false;
        }
      }
    }
  }

  private spawnCamp(p: Poi) {
    const r = new Rng(this.seed ^ (p.id * 7919) ^ Math.floor(this.time / 600));
    const lv = p.level;
    const out = [] as ReturnType<typeof spawnEnemy>[];
    if (p.kind === 'hive') {
      if (!this.flags.has('matriarch_dead')) out.push(spawnEnemy(this, this.over, 'matriarch', p.x + 0.5, p.y + 0.5, { level: lv + 1, poi: p.id }));
      for (let i = 0; i < 6; i++) out.push(spawnEnemy(this, this.over, r.pick(['husk', 'spitter', 'husk']), p.x + r.range(-6, 6), p.y + r.range(-6, 6), { level: lv, poi: p.id }));
      return out;
    }
    const pool = lv < 3 ? ['husk', 'husk', 'spitter'] : lv < 6 ? ['husk', 'spitter', 'bloat', 'brute', 'moth', 'mender'] : ['husk', 'spitter', 'brute', 'bloat', 'tunneler', 'stalker', 'hexcaller', 'mender', 'moth'];
    const n = r.int(3, 5) + Math.floor(lv / 3);
    for (let i = 0; i < n; i++) {
      const x = p.x + r.range(-3, 3), y = p.y + r.range(-3, 3);
      if (!this.overworld.passable(Math.floor(x), Math.floor(y))) continue;
      out.push(spawnEnemy(this, this.over, r.pick(pool), x, y, { level: lv, poi: p.id }));
    }
    if (lv >= 3 && r.chance(0.3)) {
      const mods = r.shuffle(ELITE_MODS.map((m) => m.id)).slice(0, lv > 7 ? 2 : 1) as EliteModId[];
      out.push(spawnEnemy(this, this.over, r.pick(['brute', 'husk', 'spitter', 'stalker']), p.x, p.y, { level: lv + 1, elite: mods, champion: true, poi: p.id }));
    }
    return out;
  }

  private updateLevel(lvl: Level, dt: number) {
    const pl = this.player;
    const playerHere = this.playerLevel() === lvl;
    // spatial
    lvl.spatial.clear();
    for (const e of lvl.enemies) if (!e.dead) lvl.spatial.insert(e);
    // navigation fields
    lvl.navPlayerT -= dt;
    if (playerHere && !pl.dead) {
      const tile = lvl.map.idx(Math.floor(pl.x), Math.floor(pl.y));
      if ((tile !== lvl.navPlayerTile || lvl.navPlayer.version !== lvl.map.version) && lvl.navPlayerT <= 0) {
        lvl.navPlayerTile = tile;
        lvl.navPlayerT = 0.2;
        lvl.navPlayer.build([tile], (x, y) => lvl.map.passable(x, y), 48);
      }
    }
    if (lvl.navBase) {
      this.navT -= dt;
      if (lvl.navBaseTopo !== this.factory.topoVer && this.navT <= 0) {
        this.navT = 3;
        lvl.navBaseTopo = this.factory.topoVer;
        const seeds: number[] = [];
        for (const b of this.factory.buildings.values()) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) seeds.push(lvl.map.idx(x, y));
        lvl.navBase.build(seeds, (x, y) => lvl.map.terrainPassable(x, y));
      }
    }
    // enemies: far non-wave enemies sleep (only statuses tick)
    updateEnemies(this, lvl, dt);
    this.updateProjectiles(lvl, dt);
    this.updateGround(lvl, dt);
    // telegraphs
    if (lvl.telegraphs.length) {
      const done = [] as typeof lvl.telegraphs;
      for (const t of lvl.telegraphs) { t.t += dt; if (t.t >= t.total) done.push(t); }
      if (done.length) {
        lvl.telegraphs = lvl.telegraphs.filter((t) => t.t < t.total);
        for (const t of done) t.onDone();
      }
    }
    // loot
    if (playerHere && !pl.dead) this.updateLoot(lvl, dt);
    else for (const d of lvl.loot) d.t += dt;
    if (lvl.loot.length > 400) lvl.loot.splice(0, lvl.loot.length - 400);
  }

  private updateLoot(lvl: Level, dt: number) {
    const pl = this.player;
    let full = false;
    for (let i = lvl.loot.length - 1; i >= 0; i--) {
      const d = lvl.loot[i];
      d.t += dt;
      if (d.z > 0 || d.vy < 0) { d.vy += 18 * dt; d.z = Math.max(0, d.z - d.vy * dt); if (d.z === 0) d.vy = 0; }
      const dist = Math.hypot(d.x - pl.x, d.y - pl.y);
      const magnet = d.equip ? 1.4 : 3;
      if (dist < magnet && d.t > 0.4) {
        if (dist > 0.6) { d.x += (pl.x - d.x) * Math.min(1, dt * 10); d.y += (pl.y - d.y) * Math.min(1, dt * 10); continue; }
        let taken = false;
        if (d.embers) { pl.embers += d.embers; taken = true; this.events.emit('sfx', { name: 'coin', vol: 0.4 }); }
        else if (d.item) { const left = pl.inv.add(d.item, d.count ?? 1); if (left === 0) taken = true; else { d.count = left; full = true; } this.events.emit('sfx', { name: 'pickup', vol: 0.3 }); }
        else if (d.equip) { if (pl.inv.addEquip(d.equip)) { taken = true; this.events.emit('sfx', { name: 'pickup_equip' }); } else full = true; }
        if (taken) lvl.loot.splice(i, 1);
      }
      if (d.t > 600 && !(d.equip && d.equip.rarity >= 4)) lvl.loot.splice(i, 1);
    }
    if (full && this.tickCount % 120 === 0) this.events.emit('toast', { text: 'Inventory full!', kind: 'warn' });
  }

  private updateProjectiles(lvl: Level, dt: number) {
    if (!lvl.projectiles.length) return;
    const pl = this.player;
    const playerHere = this.playerLevel() === lvl;
    const m = lvl.map;
    const tmp: import('./types').Enemy[] = [];
    const keep = [] as typeof lvl.projectiles;
    for (const p of lvl.projectiles) {
      p.life -= dt;
      if (p.kind === 'charge' && p.tx !== undefined) {
        // arcing throw
        const k = Math.min(1, dt / Math.max(0.001, p.life + dt));
        p.x += (p.tx - p.x) * k; p.y += (p.ty! - p.y) * k;
        if (p.life <= 0) { explode(this, lvl, p.tx, p.ty!, p.aoe!, p.dmg, 'player'); continue; }
        keep.push(p); continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const tx = Math.floor(p.x), ty = Math.floor(p.y);
      let dead = p.life <= 0 || !m.inBounds(tx, ty) || m.terrain[m.idx(tx, ty)] === 3 || m.terrain[m.idx(tx, ty)] === 9;
      if (!dead && p.faction === 'player') {
        for (const e of lvl.spatial.query(p.x, p.y, p.r + 2, tmp)) {
          if (e.dead || p.hit.has(e.id) || e.state === 'burrowed') continue;
          if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > (e.r + p.r) ** 2) continue;
          if (e.def.flying && p.kind === 'bolt' && this.rng.chance(0.3)) continue; // flyers dodge some bolts
          hitEnemy(this, lvl, e, p.dmg);
          p.hit.add(e.id);
          if (p.pierce-- <= 0) { dead = true; break; }
        }
      } else if (!dead && p.faction === 'enemy') {
        if (playerHere && !pl.dead && (pl.x - p.x) ** 2 + (pl.y - p.y) ** 2 < (pl.r + p.r) ** 2) {
          damagePlayer(this, p.dmg);
          dead = true;
        } else if (m.kind === 'overworld' && m.occ[m.idx(tx, ty)]) {
          const b = this.factory.buildings.get(m.occ[m.idx(tx, ty)]);
          if (b && b.kind !== 'belt') { damageBuilding(this, b, p.dmg.poison + p.dmg.fire + p.dmg.physical + p.dmg.lightning); dead = true; }
        }
        if (dead && p.aoe && p.kind === 'bile') lvl.ground.push({ id: this.nextId(), x: p.x, y: p.y, r: 1, t: 0, total: 3, dps: (p.dmg.poison || 5) * 0.3, type: 'acid', faction: 'enemy' });
      }
      if (!dead) keep.push(p);
      else if (p.kind !== 'bolt') this.events.emit('fx', { kind: p.kind === 'bile' || p.kind === 'acid' ? 'acid' : 'sparks', x: p.x, y: p.y, r: 0.6, map: m.kind });
    }
    lvl.projectiles = keep;
  }

  private groundPulse = 0;
  private updateGround(lvl: Level, dt: number) {
    if (!lvl.ground.length) return;
    this.groundPulse += dt;
    const pulse = this.groundPulse >= 0.25;
    const pl = this.player;
    const playerHere = this.playerLevel() === lvl;
    const tmp: import('./types').Enemy[] = [];
    for (const gnd of lvl.ground) {
      gnd.t += dt;
      if (!pulse) continue;
      const amount = gnd.dps * 0.25;
      if (gnd.faction === 'enemy') {
        if (playerHere && Math.hypot(pl.x - gnd.x, pl.y - gnd.y) < gnd.r + pl.r * 0.5) {
          damagePlayer(this, packet('env', { [gnd.type === 'acid' ? 'poison' : gnd.type === 'frost' ? 'frost' : 'fire']: amount }));
        }
      } else {
        for (const e of lvl.spatial.query(gnd.x, gnd.y, gnd.r + 1, tmp)) {
          if (e.dead || e.def.flying) continue;
          if (Math.hypot(e.x - gnd.x, e.y - gnd.y) < gnd.r + e.r * 0.5) hitEnemy(this, lvl, e, packet('player', { fire: amount, ignite: 0.3, noLeech: true }));
        }
      }
    }
    if (pulse) this.groundPulse = 0;
    lvl.ground = lvl.ground.filter((g) => g.t < g.total);
  }

  telegraphHitsPlayer = inTelegraph;

  /** Seed resources around the start in sandbox debug. */
  debugGrantAll() {
    for (const t of TECH_MAP.values()) if (!this.research.done.has(t.id)) this.research.complete(t);
    for (const [id] of BUILDING_MAP) this.player.inv.add(id, 20);
  }

  onBossKilled(id: string) {
    this.stats.bosses++;
    if (id === 'matriarch') this.flags.add('matriarch_dead');
    if (id === 'colossus') {
      this.flags.add('colossus_dead');
      this.dungeonDepth++;
      this.stats.dungeons++;
      this.events.emit('banner', { title: 'The Colossus Falls', sub: 'Its heart still burns. The Foundry descends deeper…', color: '#ff8a3a' });
    }
    this.events.emit('music', { mood: this.where === 'dungeon' ? 'dungeon' : 'explore' });
  }

  /** Relic delivery for gated research. */
  deliverRelic(techId: string): boolean {
    const t = TECH_MAP.get(techId);
    if (!t?.relic) return false;
    if (this.research.relicsDelivered.has(t.relic)) return true;
    if (!this.player.inv.remove(t.relic, 1)) return false;
    this.research.relicsDelivered.add(t.relic);
    this.events.emit('toast', { text: `${ITEM_MAP.get(t.relic)!.name} offered to the Lattice.`, kind: 'legend' });
    return true;
  }
}

function makeNpcs(s: Poi): Npc[] {
  return [
    { id: 'ysolde', name: 'Warden Ysolde', role: 'elder', x: s.x + 0.5, y: s.y - 3.5, color: '#c9a24a', lines: ['Hearthmoor stands because we refuse to kneel.', 'The Ashborn grow bolder with every engine you light. Build walls.'] },
    { id: 'tamsin', name: 'Engineer Tamsin Cogg', role: 'engineer', x: s.x + 4.5, y: s.y - 1.5, color: '#7ae0c0', lines: ['Every machine is a promise kept.', 'A belt leading away from a machine collects its output. A belt pointing in feeds it.'] },
    { id: 'brannoc', name: 'Brannoc the Smith', role: 'smith', x: s.x - 4.5, y: s.y - 1.5, color: '#ff8a3a', lines: ['Bring me shards and I\'ll make that steel sing differently.'] },
    { id: 'mirela', name: 'Mirela Vance', role: 'merchant', x: s.x - 3.5, y: s.y + 3.5, color: '#e0c080', lines: ['Coin is coin, even at the end of the world.'] },
    { id: 'orren', name: 'Archivist Orren', role: 'archivist', x: s.x + 3.5, y: s.y + 3.5, color: '#b56cff', lines: ['The Wrights did not fall. They were consumed by what they built.'] },
  ];
}

export { Res };
