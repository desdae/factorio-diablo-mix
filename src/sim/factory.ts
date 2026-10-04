import { BUILDING_MAP, buildingDef, type BuildingDef, type BuildingKind } from '../data/buildings';
import { ITEM_MAP } from '../data/items';
import { RECIPE_MAP, SMELTING_BY_INPUT, type RecipeDef } from '../data/recipes';
import { DX, DY } from '../core/math';
import type { GameMap } from '../world/map';
import { RES_ITEM } from '../world/map';
import { ITEM_IDS, itemIdx } from './itemIndex';

export const BELT_GAP = 0.25;
export const BELT_CAP = 4;
export const VAULT_CAP = 2000;
export const MACHINE_OUT_CAP = 20;

export interface Building {
  id: number;
  def: BuildingDef;
  kind: BuildingKind;
  x: number;
  y: number;
  w: number;
  h: number;
  dir: number;
  hp: number;
  maxHp: number;
  input: Map<string, number>;
  output: Map<string, number>;
  recipe: RecipeDef | null;
  progress: number;
  working: boolean;
  /** status for UI */
  status: 'idle' | 'working' | 'no_input' | 'no_fuel' | 'no_power' | 'output_full' | 'no_recipe' | 'depleted' | 'disabled' | 'no_ammo';
  fuelEnergy: number; // kJ remaining in the currently burning fuel
  net: number; // power network id (-1 none)
  wantPower: number; // kW requested this tick
  // belts (items sorted front→back, item ids interned)
  bItems: number[];
  bPos: number[];
  // splitter / arm
  rr: number;
  filter: string | null;
  held: number; // arm held item idx (-1 none)
  armT: number;
  cond: { item: string; lt: number } | null;
  // miners
  mineCursor: number;
  vein: number; // resource type this drill last mined (deep-vein fallback)
  // turrets/tesla
  cooldown: number;
  aim: number;
  ammoShots: number;
  charge: number;
  // capacitor
  energy: number;
  // beacon
  stage: number;
  // misc
  overclockUntil: number;
  invulnUntil: number;
  disabled: boolean;
  /** forge produced equipment awaiting collection (opaque to the factory) */
  forged: unknown[];
  // cached links
  linkVer: number;
  next: Building | null; // belt: building in front tile
  outs: Building[]; // machine/splitter outgoing neighbors
  back: Building | null; // arm source
  front: Building | null; // arm target
  lastHit: number;
}

export interface FactoryContext {
  time: number;
  /** speed multiplier for machines at (x,y) from player presence/buffs */
  machineBonus(x: number, y: number): number;
  turretFire(b: Building, range: number, dmgMult: number): boolean;
  teslaFire(b: Building, range: number): boolean;
  forgeComplete(b: Building, recipe: RecipeDef): void;
  research: ResearchHook;
  isNight: boolean;
  miningBonus: number;
  turretBonus: number;
}

export interface ResearchHook {
  /** returns per-unit sigil cost for the active tech or null */
  activeCost(): { item: string; count: number }[] | null;
  activeUnitTime(): number;
  addUnits(n: number): void;
}

export interface GhostEntry { def: string; x: number; y: number; dir: number; recipe?: string | null }

export const BEACON_STAGES: { name: string; needs: Record<string, number> }[] = [
  { name: 'Foundation Ring', needs: { brick: 400, steel: 200 } },
  { name: 'Conductor Spire', needs: { circuit: 300, lattice_frame: 20 } },
  { name: 'Heart Chamber', needs: { ember_core: 40, lattice_frame: 40, essence: 300 } },
];

export class Factory {
  map: GameMap;
  buildings = new Map<number, Building>();
  nextId = 1;
  topoVer = 1;
  // iteration lists rebuilt on topology change
  belts: Building[] = [];
  machines: Building[] = [];
  splitters: Building[] = [];
  arms: Building[] = [];
  others: Building[] = [];
  listVer = 0;
  ghosts = new Map<number, GhostEntry>();
  /** stats: count of items produced / consumed this second, flushed into history */
  producedNow = new Map<string, number>();
  consumedNow = new Map<string, number>();
  history: { t: number; produced: Map<string, number>; consumed: Map<string, number>; power: number; powerCap: number }[] = [];
  totalProduced = new Map<string, number>();
  threatPerSec = 0;
  threatAccum = 0;
  beaconComplete = false;
  onBuildingDestroyed: ((b: Building) => void) | null = null;
  private statT = 0;

  constructor(map: GameMap) {
    this.map = map;
  }

  // ──────────────────────────────── placement
  footprint(defId: string, dir: number): { w: number; h: number } {
    const d = buildingDef(defId);
    return dir % 2 === 1 ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
  }

  canPlace(defId: string, x: number, y: number, dir: number, ignoreId = 0): { ok: boolean; reason?: string } {
    const d = buildingDef(defId);
    const { w, h } = this.footprint(defId, dir);
    let hasOre = false;
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        if (!this.map.inBounds(xx, yy)) return { ok: false, reason: 'Out of bounds' };
        const i = this.map.idx(xx, yy);
        if (!this.map.terrainPassable(xx, yy)) return { ok: false, reason: this.map.tree[i] ? 'Blocked by trees' : this.map.prop[i] ? 'Blocked by debris' : 'Blocked by terrain' };
        if (this.map.occ[i] !== 0 && this.map.occ[i] !== ignoreId) return { ok: false, reason: 'Occupied' };
        if (this.map.res[i]) hasOre = true;
      }
    if (d.kind === 'miner' && !hasOre) return { ok: false, reason: 'Must be placed over ore' };
    return { ok: true };
  }

  place(defId: string, x: number, y: number, dir: number): Building | null {
    if (!this.canPlace(defId, x, y, dir).ok) return null;
    const def = buildingDef(defId);
    const { w, h } = this.footprint(defId, dir);
    const b: Building = {
      id: this.nextId++, def, kind: def.kind, x, y, w, h, dir, hp: def.hp, maxHp: def.hp,
      input: new Map(), output: new Map(), recipe: null, progress: 0, working: false, status: 'idle',
      fuelEnergy: 0, net: -1, wantPower: 0, bItems: [], bPos: [], rr: 0, filter: null, held: -1, armT: 0, cond: null,
      mineCursor: 0, vein: 0, cooldown: 0, aim: 0, ammoShots: 0, charge: 0, energy: 0, stage: 0, overclockUntil: 0, invulnUntil: 0,
      disabled: false, forged: [], linkVer: 0, next: null, outs: [], back: null, front: null, lastHit: -999,
    };
    if (def.kind === 'furnace') b.recipe = null;
    this.buildings.set(b.id, b);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      this.map.occ[this.map.idx(xx, yy)] = b.id;
      this.map.markDirty(xx, yy);
    }
    this.ghosts.delete(this.map.idx(x, y));
    this.topoVer++;
    return b;
  }

  /** Removes a building and returns the items it contained (for refund). */
  remove(b: Building): Map<string, number> {
    const refund = new Map<string, number>();
    const add = (id: string, n: number) => n > 0 && refund.set(id, (refund.get(id) ?? 0) + n);
    for (const [k, v] of b.input) add(k, v);
    for (const [k, v] of b.output) add(k, v);
    for (const it of b.bItems) add(ITEM_IDS[it], 1);
    if (b.held >= 0) add(ITEM_IDS[b.held], 1);
    if (b.ammoShots > 0) add('bolts', Math.floor(b.ammoShots / 10));
    if (b.working && b.recipe && b.kind !== 'miner') for (const s of b.recipe.inputs) add(s.item, s.count);
    for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) {
      this.map.occ[this.map.idx(xx, yy)] = 0;
      this.map.markDirty(xx, yy);
    }
    this.buildings.delete(b.id);
    this.topoVer++;
    return refund;
  }

  at(x: number, y: number): Building | null {
    if (!this.map.inBounds(x, y)) return null;
    const id = this.map.occ[this.map.idx(x, y)];
    return id ? this.buildings.get(id) ?? null : null;
  }

  damage(b: Building, amount: number, time: number): boolean {
    if (time < b.invulnUntil) return false;
    b.hp -= amount;
    b.lastHit = time;
    if (b.hp <= 0) {
      // destroyed buildings leave a ghost blueprint so wisps can rebuild them
      this.ghosts.set(this.map.idx(b.x, b.y), { def: b.def.id, x: b.x, y: b.y, dir: b.dir, recipe: b.recipe?.id ?? null });
      this.remove(b);
      this.onBuildingDestroyed?.(b);
      return true;
    }
    return false;
  }

  setRecipe(b: Building, recipeId: string | null): Map<string, number> {
    // refund buffered inputs when changing recipe
    const refund = new Map(b.input);
    b.input.clear();
    if (b.working && b.recipe) for (const s of b.recipe.inputs) refund.set(s.item, (refund.get(s.item) ?? 0) + s.count);
    b.recipe = recipeId ? RECIPE_MAP.get(recipeId) ?? null : null;
    b.progress = 0;
    b.working = false;
    return refund;
  }

  // ──────────────────────────────── links
  private rebuildLists() {
    this.belts = []; this.machines = []; this.splitters = []; this.arms = []; this.others = [];
    for (const b of this.buildings.values()) {
      if (b.kind === 'belt') this.belts.push(b);
      else if (b.kind === 'splitter') this.splitters.push(b);
      else if (b.kind === 'arm') this.arms.push(b);
      else if (b.kind === 'miner' || b.kind === 'furnace' || b.kind === 'assembler' || b.kind === 'forge' || b.kind === 'lab') this.machines.push(b);
      else this.others.push(b);
    }
    this.listVer = this.topoVer;
  }

  private link(b: Building) {
    b.linkVer = this.topoVer;
    b.outs = [];
    if (b.kind === 'belt') {
      b.next = this.at(b.x + DX[b.dir], b.y + DY[b.dir]);
      return;
    }
    if (b.kind === 'arm') {
      b.back = this.at(b.x - DX[b.dir], b.y - DY[b.dir]);
      b.front = this.at(b.x + DX[b.dir], b.y + DY[b.dir]);
      return;
    }
    // perimeter neighbors
    const seen = new Set<number>();
    const consider = (tx: number, ty: number) => {
      const n = this.at(tx, ty);
      if (!n || n === b || seen.has(n.id)) return;
      if (n.kind === 'belt') {
        // only belts leading away from b
        const nx = n.x + DX[n.dir], ny = n.y + DY[n.dir];
        if (nx >= b.x && nx < b.x + b.w && ny >= b.y && ny < b.y + b.h) return;
        seen.add(n.id);
        b.outs.push(n);
        return;
      }
      if (b.kind === 'splitter') return;
      if (directInsertAllowed(b, n)) { seen.add(n.id); b.outs.push(n); }
    };
    for (let xx = b.x; xx < b.x + b.w; xx++) { consider(xx, b.y - 1); consider(xx, b.y + b.h); }
    for (let yy = b.y; yy < b.y + b.h; yy++) { consider(b.x - 1, yy); consider(b.x + b.w, yy); }
    if (b.kind === 'splitter') {
      // front output first in list for filter routing
      const f = this.at(b.x + DX[b.dir], b.y + DY[b.dir]);
      b.outs.sort((a, c) => (a === f ? -1 : c === f ? 1 : 0));
    }
  }

  // ──────────────────────────────── item acceptance
  accepts(b: Building, item: string): boolean {
    if (b.disabled && b.kind !== 'vault') return false;
    const def = ITEM_MAP.get(item);
    if (!def) return false;
    switch (b.kind) {
      case 'vault': return this.vaultTotal(b) < VAULT_CAP;
      case 'generator': return !!def.fuel && (b.input.get(item) ?? 0) < 20 && this.fuelKinds(b) <= (b.input.has(item) ? 1 : 0);
      case 'miner': return !!b.def.burner && !!def.fuel && (b.input.get(item) ?? 0) < 10 && this.fuelKinds(b) <= (b.input.has(item) ? 1 : 0);
      case 'furnace': {
        if (b.def.burner && def.fuel && !SMELTING_BY_INPUT.has(item)) return (b.input.get(item) ?? 0) < 10;
        const r = SMELTING_BY_INPUT.get(item);
        if (!r || !this.recipeUnlocked(r.id)) return false;
        // only one smelting input type buffered at a time
        for (const [k, v] of b.input) if (v > 0 && k !== item && SMELTING_BY_INPUT.has(k)) return false;
        return (b.input.get(item) ?? 0) < r.inputs[0].count * 4;
      }
      case 'assembler':
      case 'forge': {
        if (!b.recipe) return false;
        const s = b.recipe.inputs.find((i) => i.item === item);
        return !!s && (b.input.get(item) ?? 0) < Math.max(s.count * 3, 4);
      }
      case 'lab': return def.category === 'sigil' && (b.input.get(item) ?? 0) < 20;
      case 'turret': return item === 'bolts' && (b.input.get(item) ?? 0) < 20;
      case 'beacon': {
        const st = BEACON_STAGES[b.stage];
        if (!st) return false;
        const need = st.needs[item];
        return need !== undefined && (b.input.get(item) ?? 0) < need;
      }
      default: return false;
    }
  }

  /** global unlock predicate injected by research */
  recipeUnlocked: (id: string) => boolean = () => true;

  insert(b: Building, item: string, n = 1): boolean {
    if (!this.accepts(b, item)) return false;
    b.input.set(item, (b.input.get(item) ?? 0) + n);
    return true;
  }

  vaultTotal(b: Building): number {
    let t = 0;
    for (const v of b.input.values()) t += v;
    return t;
  }

  private fuelKinds(b: Building): number {
    let k = 0;
    for (const [id, v] of b.input) if (v > 0 && ITEM_MAP.get(id)?.fuel) k++;
    return k;
  }

  /** Take one item from a building's output (or vault contents) that passes the filter. */
  take(b: Building, want: (item: string) => boolean): string | null {
    const src = b.kind === 'vault' ? b.input : b.output;
    for (const [k, v] of src) {
      if (v > 0 && want(k)) {
        if (v === 1) src.delete(k); else src.set(k, v - 1);
        return k;
      }
    }
    return null;
  }

  beltInsertBack(b: Building, itemIndex: number): boolean {
    const n = b.bItems.length;
    if (n >= BELT_CAP) return false;
    if (n > 0 && b.bPos[n - 1] < BELT_GAP) return false;
    b.bItems.push(itemIndex);
    b.bPos.push(0);
    return true;
  }

  /** Mid-belt insertion used by arms: drops at the first gap. */
  beltInsertAny(b: Building, itemIndex: number): boolean {
    return this.beltInsertBack(b, itemIndex);
  }

  countInTarget(b: Building, item: string): number {
    if (b.kind === 'belt') return b.bItems.filter((i) => ITEM_IDS[i] === item).length;
    return (b.input.get(item) ?? 0) + (b.output.get(item) ?? 0);
  }

  // ──────────────────────────────── simulation tick
  update(dt: number, ctx: FactoryContext): void {
    if (this.listVer !== this.topoVer) this.rebuildLists();
    const tv = this.topoVer;
    this.threatPerSec = 0;
    // 1. belts
    for (let k = 0; k < this.belts.length; k++) {
      const b = this.belts[k];
      if (b.linkVer !== tv) this.link(b);
      const n = b.bItems.length;
      if (n === 0) continue;
      const step = b.def.speed! * dt;
      const pos = b.bPos;
      let limit = 1;
      for (let i = 0; i < n; i++) {
        const np = pos[i] + step;
        pos[i] = np < limit ? np : limit > pos[i] ? limit : pos[i];
        limit = pos[i] - BELT_GAP;
      }
      if (pos[0] >= 1) this.beltTransfer(b);
    }
    // 2. splitters
    for (const s of this.splitters) {
      if (s.linkVer !== tv) this.link(s);
      this.pushOutputs(s, true);
    }
    // 3. arms
    for (const a of this.arms) {
      if (a.linkVer !== tv) this.link(a);
      this.updateArm(a, dt);
    }
    // 4. machines
    for (const m of this.machines) {
      if (m.linkVer !== tv) this.link(m);
      this.updateMachine(m, dt, ctx);
    }
    // 5. others (generators, turrets, lamps, vaults, beacons...)
    for (const o of this.others) {
      if (o.linkVer !== tv) this.link(o);
      this.updateOther(o, dt, ctx);
    }
    // stats
    this.statT += dt;
    if (this.statT >= 1) {
      this.statT -= 1;
      this.flushStats(ctx.time);
    }
  }

  private beltTransfer(b: Building) {
    const nb = b.next;
    if (!nb) return;
    const item = b.bItems[0];
    let moved = false;
    if (nb.kind === 'belt') {
      if (nb.dir === (b.dir + 2) % 4) return;
      const m = nb.bItems.length;
      if (m < BELT_CAP && (m === 0 || nb.bPos[m - 1] >= BELT_GAP)) {
        const carry = Math.min(b.bPos[0] - 1, m === 0 ? 1 : nb.bPos[m - 1] - BELT_GAP);
        nb.bItems.push(item);
        nb.bPos.push(Math.max(0, carry));
        moved = true;
      }
    } else if (nb.kind === 'splitter') {
      if (this.splitterBuffered(nb) < 2) {
        const id = ITEM_IDS[item];
        nb.input.set(id, (nb.input.get(id) ?? 0) + 1);
        moved = true;
      }
    } else {
      moved = this.insert(nb, ITEM_IDS[item]);
    }
    if (moved) {
      b.bItems.shift();
      b.bPos.shift();
    }
  }

  private splitterBuffered(s: Building) {
    let t = 0;
    for (const v of s.input.values()) t += v;
    return t;
  }

  /** Push buffered output to outgoing belts and adjacent acceptors (round robin). */
  private pushOutputs(b: Building, fromInput = false): void {
    const src = fromInput ? b.input : b.output;
    if (src.size === 0 || b.outs.length === 0) return;
    for (const [item, count] of src) {
      if (count <= 0) { src.delete(item); continue; }
      const idx = itemIdx(item);
      const n = b.outs.length;
      let candidates = b.outs;
      if (b.kind === 'splitter' && b.filter) {
        const front = this.at(b.x + DX[b.dir], b.y + DY[b.dir]);
        if (item === b.filter) candidates = front && b.outs.includes(front) ? [front] : [];
        else candidates = b.outs.filter((o) => o !== front);
        if (candidates.length === 0) candidates = b.outs; // no dedicated lane: fall back
      }
      const cn = candidates.length;
      for (let k = 0; k < cn; k++) {
        const o = candidates[(b.rr + k) % cn];
        const ok = o.kind === 'belt' ? this.beltInsertBack(o, idx) : this.insert(o, item);
        if (ok) {
          b.rr = (b.rr + k + 1) % Math.max(1, n);
          const left = (src.get(item) ?? 1) - 1;
          if (left <= 0) src.delete(item); else src.set(item, left);
          return; // one item per tick per building keeps flow smooth
        }
      }
    }
  }

  private updateArm(a: Building, dt: number) {
    if (a.disabled) { a.status = 'disabled'; return; }
    const sat = this.netSat(a);
    if (a.held < 0) {
      a.wantPower = a.def.power! * 0.2;
      const src = a.back, dst = a.front;
      if (!src || !dst) { a.status = 'idle'; return; }
      if (a.cond && this.countInTarget(dst, a.cond.item) >= a.cond.lt) { a.status = 'idle'; return; }
      const wantFn = (item: string) => (dst.kind === 'belt' ? true : this.accepts(dst, item)) && (!a.cond || a.cond.item === item || a.cond.item === '*');
      let picked: string | null = null;
      if (src.kind === 'belt') {
        for (let i = 0; i < src.bItems.length; i++) {
          const id = ITEM_IDS[src.bItems[i]];
          if (src.bPos[i] > 0.4 && wantFn(id)) { picked = id; src.bItems.splice(i, 1); src.bPos.splice(i, 1); break; }
        }
      } else if (src.kind !== 'splitter') {
        picked = this.take(src, wantFn);
      }
      if (picked) { a.held = itemIdx(picked); a.armT = 0; a.status = 'working'; }
      else a.status = 'no_input';
      return;
    }
    a.wantPower = a.def.power!;
    if (sat <= 0) { a.status = 'no_power'; return; }
    a.armT += dt * a.def.speed! * sat;
    if (a.armT < 1) return;
    const dst = a.front;
    if (!dst) return;
    const id = ITEM_IDS[a.held];
    const ok = dst.kind === 'belt' ? this.beltInsertAny(dst, a.held) : this.insert(dst, id);
    if (ok) { a.held = -1; a.armT = 0; } else a.status = 'output_full';
  }

  netSat: (b: Building) => number = () => 1;

  private burn(b: Building, dt: number, kw: number): boolean {
    if (b.fuelEnergy <= 0) {
      for (const [k, v] of b.input) {
        const fd = ITEM_MAP.get(k);
        if (v > 0 && fd?.fuel && !SMELTING_BY_INPUT.has(k)) {
          if (v === 1) b.input.delete(k); else b.input.set(k, v - 1);
          this.consumed(k, 1);
          b.fuelEnergy += fd.fuel;
          break;
        }
      }
    }
    if (b.fuelEnergy <= 0) return false;
    b.fuelEnergy -= kw * dt;
    return true;
  }

  private updateMachine(m: Building, dt: number, ctx: FactoryContext) {
    m.wantPower = 0;
    this.pushOutputs(m);
    if (m.disabled) { m.status = 'disabled'; return; }
    const bonus = ctx.machineBonus(m.x + m.w / 2, m.y + m.h / 2) * (ctx.time < m.overclockUntil ? 1.75 : 1);
    if (m.kind === 'miner') return this.updateMiner(m, dt, ctx, bonus);
    if (m.kind === 'lab') return this.updateLab(m, dt, ctx, bonus);
    // pick recipe for furnaces from buffered input
    if (m.kind === 'furnace' && !m.working) {
      let chosen: RecipeDef | null = null;
      for (const [k, v] of m.input) {
        const r = SMELTING_BY_INPUT.get(k);
        if (r && v >= r.inputs[0].count && this.recipeUnlocked(r.id)) { chosen = r; break; }
      }
      if (chosen) m.recipe = chosen;
    }
    const r = m.recipe;
    if (!r) { m.status = m.kind === 'furnace' ? 'no_input' : 'no_recipe'; return; }
    if (!m.working) {
      // output space check
      for (const o of r.outputs) if ((m.output.get(o.item) ?? 0) + o.count > MACHINE_OUT_CAP) { m.status = 'output_full'; return; }
      if (r.forge && m.forged.length >= 3) { m.status = 'output_full'; return; }
      for (const s of r.inputs) if ((m.input.get(s.item) ?? 0) < s.count) { m.status = 'no_input'; return; }
      for (const s of r.inputs) {
        const left = m.input.get(s.item)! - s.count;
        if (left <= 0) m.input.delete(s.item); else m.input.set(s.item, left);
        this.consumed(s.item, s.count);
      }
      m.working = true;
      m.progress = 0;
    }
    let factor = 1;
    if (m.def.burner) {
      if (!this.burn(m, dt, m.def.burner)) { m.status = 'no_fuel'; return; }
    } else if (m.def.power) {
      m.wantPower = m.def.power;
      factor = this.netSat(m);
      if (factor <= 0) { m.status = 'no_power'; return; }
    }
    m.status = 'working';
    this.threatPerSec += (m.def.threat ?? 0) / 60;
    m.progress += (dt * m.def.speed! * factor * bonus) / r.time;
    if (m.progress >= 1) {
      m.progress = 0;
      m.working = false;
      if (r.forge) ctx.forgeComplete(m, r);
      for (const o of r.outputs) {
        m.output.set(o.item, (m.output.get(o.item) ?? 0) + o.count);
        this.produced(o.item, o.count);
      }
    }
  }

  private updateMiner(m: Building, dt: number, ctx: FactoryContext, bonus: number) {
    let outTotal = 0;
    for (const v of m.output.values()) outTotal += v;
    if (outTotal >= 10) { m.status = 'output_full'; return; }
    let factor = 1;
    if (m.def.burner) {
      if (!this.burn(m, dt, m.def.burner)) { m.status = 'no_fuel'; return; }
    } else {
      m.wantPower = m.def.power!;
      factor = this.netSat(m);
      if (factor <= 0) { m.status = 'no_power'; return; }
    }
    m.status = 'working';
    this.threatPerSec += (m.def.threat ?? 0) / 60;
    m.progress += dt * m.def.speed! * factor * bonus * (1 + ctx.miningBonus);
    if (m.progress < 1) return;
    m.progress -= 1;
    const tiles = m.w * m.h;
    let mainRes = 0;
    for (let k = 0; k < tiles; k++) {
      const c = (m.mineCursor + k) % tiles;
      const tx = m.x + (c % m.w), ty = m.y + Math.floor(c / m.w);
      const i = this.map.idx(tx, ty);
      const res = this.map.res[i];
      if (!res) continue;
      mainRes = res;
      if (this.map.amt[i] > 0) {
        this.map.amt[i]--;
        if (this.map.amt[i] === 0) { this.map.res[i] = 0; this.map.markDirty(tx, ty); }
        m.mineCursor = (c + 1) % tiles;
        this.addOut(m, RES_ITEM[res]);
        return;
      }
    }
    // depleted deposit: deep-vein trickle keeps the patch renewable at 15% speed (prevents soft-locks)
    if (!mainRes) {
      m.status = 'depleted';
      m.progress -= 1 / 0.15 - 1;
      if (m.vein) this.addOut(m, RES_ITEM[m.vein]);
    }
  }

  private addOut(m: Building, item: string) {
    m.output.set(item, (m.output.get(item) ?? 0) + 1);
    this.produced(item, 1);
    if (m.kind === 'miner') m.vein = RES_ITEM.indexOf(item);
  }

  private updateLab(m: Building, dt: number, ctx: FactoryContext, bonus: number) {
    const cost = ctx.research.activeCost();
    if (!cost) { m.status = 'idle'; m.working = false; return; }
    if (!m.working) {
      for (const c of cost) if ((m.input.get(c.item) ?? 0) < c.count) { m.status = 'no_input'; return; }
      for (const c of cost) {
        const left = m.input.get(c.item)! - c.count;
        if (left <= 0) m.input.delete(c.item); else m.input.set(c.item, left);
        this.consumed(c.item, c.count);
      }
      m.working = true; m.progress = 0;
    }
    m.wantPower = m.def.power!;
    const f = this.netSat(m);
    if (f <= 0) { m.status = 'no_power'; return; }
    m.status = 'working';
    this.threatPerSec += (m.def.threat ?? 0) / 60;
    m.progress += (dt * f * bonus) / ctx.research.activeUnitTime();
    if (m.progress >= 1) { m.working = false; m.progress = 0; ctx.research.addUnits(1); }
  }

  private updateOther(o: Building, dt: number, ctx: FactoryContext) {
    o.wantPower = 0;
    switch (o.kind) {
      case 'generator':
        // generators burn fuel in the power step; here only threat accounting
        if (o.working) this.threatPerSec += (o.def.threat ?? 0) / 60;
        break;
      case 'lamp':
        o.wantPower = ctx.isNight && !o.disabled ? o.def.power! : 0;
        o.working = ctx.isNight && this.netSat(o) > 0.2;
        break;
      case 'turret': {
        o.cooldown -= dt;
        if (o.ammoShots <= 0) {
          const mags = o.input.get('bolts') ?? 0;
          if (mags > 0) { o.input.set('bolts', mags - 1); o.ammoShots += 10; this.consumed('bolts', 1); }
        }
        if (o.ammoShots <= 0) { o.status = 'no_ammo'; break; }
        o.status = 'idle';
        const oc = ctx.time < o.overclockUntil ? 1.75 : 1;
        if (o.cooldown <= 0 && ctx.turretFire(o, o.def.range!, 1 + ctx.turretBonus)) {
          o.ammoShots--;
          o.cooldown = 1 / (o.def.speed! * oc);
          o.status = 'working';
        }
        break;
      }
      case 'tesla': {
        const sat = this.netSat(o);
        if (o.charge < 1) {
          o.wantPower = o.def.power!;
          o.charge += dt * o.def.speed! * sat * (ctx.time < o.overclockUntil ? 1.75 : 1);
          o.status = sat > 0 ? 'idle' : 'no_power';
        } else {
          o.wantPower = o.def.power! * 0.05;
          if (ctx.teslaFire(o, o.def.range!)) { o.charge = 0; o.status = 'working'; }
        }
        break;
      }
      case 'beacon': {
        const st = BEACON_STAGES[o.stage];
        o.wantPower = st ? o.def.power! * 0.1 : o.def.power!;
        if (!st) { o.working = true; break; }
        let done = true;
        for (const [item, need] of Object.entries(st.needs)) if ((o.input.get(item) ?? 0) < need) done = false;
        if (done) {
          for (const item of Object.keys(st.needs)) this.consumed(item, st.needs[item]);
          o.input.clear();
          o.stage++;
          if (o.stage >= BEACON_STAGES.length) this.beaconComplete = true;
        }
        break;
      }
      default:
        break;
    }
  }

  produced(item: string, n: number) {
    this.producedNow.set(item, (this.producedNow.get(item) ?? 0) + n);
    this.totalProduced.set(item, (this.totalProduced.get(item) ?? 0) + n);
  }
  consumed(item: string, n: number) {
    this.consumedNow.set(item, (this.consumedNow.get(item) ?? 0) + n);
  }

  powerSample = { use: 0, cap: 0 };
  private flushStats(t: number) {
    this.history.push({ t, produced: this.producedNow, consumed: this.consumedNow, power: this.powerSample.use, powerCap: this.powerSample.cap });
    if (this.history.length > 600) this.history.shift();
    this.producedNow = new Map();
    this.consumedNow = new Map();
  }

  /** Rate per minute over the last `seconds` of history. */
  rate(item: string, seconds: number, which: 'produced' | 'consumed'): number {
    const h = this.history;
    const n = Math.min(seconds, h.length);
    if (n === 0) return 0;
    let s = 0;
    for (let i = h.length - n; i < h.length; i++) s += h[i][which].get(item) ?? 0;
    return (s / n) * 60;
  }

  totalItems(): number {
    let t = 0;
    for (const b of this.buildings.values()) {
      t += b.bItems.length;
      for (const v of b.input.values()) t += v;
      for (const v of b.output.values()) t += v;
    }
    return t;
  }
}

/** Direct (belt-less) insertion between adjacent buildings: lets drills feed kilns and machines feed vaults/turrets. */
function directInsertAllowed(src: Building, dst: Building): boolean {
  if (src.kind === 'vault' || src.kind === 'lab' || src.kind === 'turret' || src.kind === 'wall' || src.kind === 'pylon') return false;
  switch (dst.kind) {
    case 'vault': case 'assembler': case 'forge': case 'turret': case 'lab': case 'beacon': case 'generator':
      return src.kind !== 'generator';
    case 'furnace': case 'miner':
      return src.kind === 'miner';
    default:
      return false;
  }
}

export function buildingCenter(b: Building) {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export { BUILDING_MAP };
