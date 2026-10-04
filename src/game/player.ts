import { SKILLS, SKILL_MAP, PASSIVES, PASSIVE_MAP } from '../data/skills';
import type { Slot } from '../data/equipment';
import { BASE_MAP } from '../data/equipment';
import { Inventory } from './inventory';
import { computeStats, xpForLevel, type Attributes, type DerivedStats } from './stats';
import { newStatuses, type Statuses } from './types';
import { slotOf, type Equip } from './items';

export type GearSlot = 'helmet' | 'body' | 'gloves' | 'boots' | 'belt' | 'amulet' | 'ring1' | 'ring2' | 'mainhand' | 'offhand' | 'relic';
export const GEAR_SLOTS: GearSlot[] = ['helmet', 'amulet', 'mainhand', 'body', 'offhand', 'gloves', 'belt', 'boots', 'ring1', 'ring2', 'relic'];

export interface SkillState { rank: number; mods: Set<string>; cd: number }

export interface Action {
  skill: string;
  t: number; // elapsed
  dur: number;
  hitAt: number;
  fired: boolean;
  angle: number;
  tx: number; ty: number;
  moveMult: number;
}

export class Player {
  x = 0; y = 0;
  vx = 0; vy = 0;
  r = 0.4;
  facing = 0;
  level = 1;
  xp = 0;
  hp = 100;
  resolve = 0;
  maxResolve = 100;
  embers = 0;
  attrs: Attributes = { str: 10, dex: 6, int: 4, vit: 10, wil: 5, pre: 5, eng: 6 };
  attrPoints = 0;
  skillPoints = 1;
  passivePoints = 0;
  skills = new Map<string, SkillState>();
  passives = new Set<string>();
  /** ids of skills on the 6 action slots: LMB, RMB, 1..4 */
  bar: (string | null)[] = ['cleave', 'rush', null, null, null, null];
  gear: Record<GearSlot, Equip | null> = { helmet: null, body: null, gloves: null, boots: null, belt: null, amulet: null, ring1: null, ring2: null, mainhand: null, offhand: null, relic: null };
  inv = new Inventory(60);
  st: Statuses = newStatuses();
  stats!: DerivedStats;
  action: Action | null = null;
  buffered: { slot: number; t: number } | null = null;
  dodgeT = 0; dodgeCd = 0; dodgeDx = 0; dodgeDy = 0;
  iframes = 0;
  dashT = 0; dashDx = 0; dashDy = 0; dashHit = new Set<number>();
  buffs = { bulwark: 0, horn: 0, guarded: 0, sick: 0, tonic: 0 };
  hitFlash = 0;
  dead = false;
  respawnT = 0;
  gatherT = 0;
  gatherTarget: { x: number; y: number; kind: string } | null = null;
  quick = { tonic: 0, charge: 0 };
  potionCd = 0;
  chargeCd = 0;
  anim = 0;
  techDrones = 0;
  recentHurt = 0;

  constructor() {
    for (const s of SKILLS) this.skills.set(s.id, { rank: 0, mods: new Set(), cd: 0 });
    this.skills.get('cleave')!.rank = 1;
    this.skills.get('rush')!.rank = 1;
    this.recompute();
    this.hp = this.stats.maxLife;
  }

  recompute() {
    const buffs = { dmg: (this.buffs.horn > 0 ? 25 : 0) - (this.buffs.sick > 0 ? 20 : 0), aspd: this.buffs.horn > 0 ? 15 : 0 };
    this.stats = computeStats(this.level, this.attrs, this.gear, this.passives, buffs, this.techDrones);
    if (this.hp > this.stats.maxLife) this.hp = this.stats.maxLife;
  }

  skillRank(id: string): number {
    const s = this.skills.get(id);
    if (!s || s.rank === 0) return 0;
    return s.rank + this.stats.allSkills;
  }
  hasMod(skill: string, mod: string) {
    return this.skills.get(skill)?.mods.has(mod) ?? false;
  }

  addXp(n: number): number {
    this.xp += n;
    let ups = 0;
    while (this.xp >= xpForLevel(this.level)) {
      this.xp -= xpForLevel(this.level);
      this.level++;
      ups++;
      this.attrPoints += 5;
      this.skillPoints += 1;
      if (this.level % 2 === 0) this.passivePoints += 1;
    }
    if (ups) { this.recompute(); this.hp = this.stats.maxLife; }
    return ups;
  }

  canLearnSkill(id: string): boolean {
    const d = SKILL_MAP.get(id)!;
    const s = this.skills.get(id)!;
    return this.skillPoints > 0 && s.rank < d.maxRank && this.level >= d.reqLevel;
  }
  learnSkill(id: string): boolean {
    if (!this.canLearnSkill(id)) return false;
    const s = this.skills.get(id)!;
    s.rank++;
    this.skillPoints--;
    if (s.rank === 1 && !this.bar.includes(id)) {
      const free = this.bar.indexOf(null);
      if (free >= 0) this.bar[free] = id;
    }
    return true;
  }
  learnMod(skill: string, mod: string): boolean {
    const d = SKILL_MAP.get(skill)!;
    const s = this.skills.get(skill)!;
    const m = d.mods.find((x) => x.id === mod);
    if (!m || s.mods.has(mod) || this.skillPoints <= 0 || s.rank < m.reqRank) return false;
    // Fissure replaces the base shape of Quake Slam, so it excludes Aftershock's second circle only visually; both allowed.
    s.mods.add(mod);
    this.skillPoints--;
    return true;
  }
  canTakePassive(id: string): boolean {
    const p = PASSIVE_MAP.get(id);
    if (!p || this.passives.has(id) || this.passivePoints <= 0) return false;
    return p.prereq.length === 0 || p.prereq.some((r) => this.passives.has(r));
  }
  takePassive(id: string): boolean {
    if (!this.canTakePassive(id)) return false;
    this.passives.add(id);
    this.passivePoints--;
    this.recompute();
    return true;
  }
  /** Full respec for a fee, returns refunded points. */
  respec() {
    let sp = 0;
    for (const [id, s] of this.skills) {
      const base = id === 'cleave' || id === 'rush' ? 1 : 0;
      sp += s.rank - base + s.mods.size;
      s.rank = base; s.mods.clear();
    }
    this.skillPoints += sp;
    this.passivePoints += this.passives.size;
    this.passives.clear();
    this.bar = ['cleave', 'rush', null, null, null, null];
    this.recompute();
  }

  spendAttr(k: keyof Attributes) {
    if (this.attrPoints <= 0) return false;
    this.attrs[k]++;
    this.attrPoints--;
    this.recompute();
    return true;
  }

  equip(e: Equip): Equip[] {
    const slot = slotOf(e);
    const removed: Equip[] = [];
    let target: GearSlot = slot === 'ring' ? (this.gear.ring1 ? (this.gear.ring2 ? 'ring1' : 'ring2') : 'ring1') : (slot as GearSlot);
    if (slot === 'ring' && this.gear.ring1 && this.gear.ring2) target = 'ring1';
    const base = BASE_MAP.get(e.base)!;
    if (target === 'offhand') {
      const mh = this.gear.mainhand;
      if (mh && BASE_MAP.get(mh.base)!.twoHanded) { removed.push(mh); this.gear.mainhand = null; }
    }
    if (target === 'mainhand' && base.twoHanded && this.gear.offhand) { removed.push(this.gear.offhand); this.gear.offhand = null; }
    if (this.gear[target]) removed.push(this.gear[target]!);
    this.gear[target] = e;
    this.recompute();
    return removed;
  }

  unequip(slot: GearSlot): Equip | null {
    const e = this.gear[slot];
    this.gear[slot] = null;
    this.recompute();
    return e;
  }

  /** Which gear slot an item would replace (for comparison tooltips). */
  compareSlot(e: Equip): GearSlot {
    const s: Slot = slotOf(e);
    if (s === 'ring') return this.gear.ring1 && !this.gear.ring2 ? 'ring2' : 'ring1';
    return s as GearSlot;
  }

  allPassives() {
    return PASSIVES;
  }
}
