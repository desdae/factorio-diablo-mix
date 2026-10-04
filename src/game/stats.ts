import type { StatId } from '../data/equipment';
import { BASE_MAP } from '../data/equipment';
import { PASSIVE_MAP } from '../data/skills';
import { equipStats, type Equip } from './items';

export type Attributes = { str: number; dex: number; int: number; vit: number; wil: number; pre: number; eng: number };
export const ATTR_KEYS: (keyof Attributes)[] = ['str', 'dex', 'int', 'vit', 'wil', 'pre', 'eng'];
export const ATTR_DESC: Record<keyof Attributes, string> = {
  str: '+0.8% damage, +1 armor', dex: '+0.4% attack speed, +0.15% evasion', int: '+1% elemental damage, +0.2% resistances',
  vit: '+5 life, +0.05 life/s', wil: '+0.8% resolve generation, +0.4% cooldown reduction', pre: '+0.15% crit chance, +1% crit damage',
  eng: '+0.6% turret damage, +0.6% machine speed near you, +1% mining speed',
};

export interface DerivedStats {
  maxLife: number;
  lifeRegen: number;
  leech: number;
  armor: number;
  res: { fire: number; frost: number; lightning: number; poison: number };
  wMin: number; wMax: number; aps: number; reach: number;
  flat: { physical: number; fire: number; frost: number; lightning: number };
  inc: { all: number; physical: number; fire: number; frost: number; lightning: number };
  convertFire: number;
  critChance: number; critDmg: number;
  atkSpeed: number; moveSpeed: number; cdr: number; resolveGen: number;
  block: number; dodge: number;
  bleed: number; ignite: number; chill: number; shock: number;
  aoe: number; stunDur: number;
  turretDmg: number; machineSpeed: number; drones: number; mineSpeed: number; findRarity: number;
  allSkills: number; thorns: number;
  legendaries: Set<string>;
  keystones: Set<string>;
  attrs: Attributes;
}

/** Aggregates attributes, gear, passives and buffs into derived combat & industry stats. */
export function computeStats(level: number, base: Attributes, gear: Partial<Record<string, Equip | null>>, passives: Set<string>, buffs: { dmg: number; aspd: number }, techDrones: number): DerivedStats {
  const add: Partial<Record<StatId, number>> = {};
  const put = (s: StatId, v: number) => (add[s] = (add[s] ?? 0) + v);
  const legendaries = new Set<string>(), keystones = new Set<string>();
  let armorBase = 0;
  let weapon: Equip | null = null;
  for (const [slot, e] of Object.entries(gear)) {
    if (!e) continue;
    for (const s of equipStats(e)) put(s.stat, s.value);
    if (e.armor) armorBase += e.armor;
    if (e.legendary) legendaries.add(e.legendary);
    if (slot === 'mainhand') weapon = e;
  }
  for (const id of passives) {
    const p = PASSIVE_MAP.get(id);
    if (!p) continue;
    for (const s of p.stats) put(s.stat, s.value);
    if (p.keystone) keystones.add(p.keystone);
  }
  const g = (s: StatId) => add[s] ?? 0;
  const attrs: Attributes = {
    str: base.str + g('str'), dex: base.dex + g('dex'), int: base.int + g('int'), vit: base.vit + g('vit'),
    wil: base.wil + g('wil'), pre: base.pre + g('pre'), eng: base.eng + g('eng'),
  };
  const wb = weapon ? BASE_MAP.get(weapon.base)! : null;
  const resAll = g('resAll') + attrs.int * 0.2;
  const cap = (v: number) => Math.min(75, v);
  const st: DerivedStats = {
    maxLife: Math.round(90 + level * 14 + attrs.vit * 5 + g('life')),
    lifeRegen: 0.6 + attrs.vit * 0.05 + g('lifeRegen'),
    leech: g('leech'),
    armor: Math.round(armorBase + g('armor') + attrs.str * 1),
    res: { fire: cap(resAll + g('resFire')), frost: cap(resAll + g('resFrost')), lightning: cap(resAll + g('resLightning')), poison: cap(resAll + g('resPoison')) },
    wMin: weapon?.dmg?.[0] ?? 3, wMax: weapon?.dmg?.[1] ?? 6, aps: wb?.aps ?? 1.4, reach: (wb?.reach ?? 1) * 1.9,
    flat: { physical: g('flatPhys'), fire: g('flatFire'), frost: g('flatFrost'), lightning: g('flatLightning') },
    inc: {
      all: g('dmgPct') + attrs.str * 0.8 + buffs.dmg + (level - 1) * 4,
      physical: g('physPct'), fire: g('firePct') + attrs.int, frost: g('frostPct') + attrs.int, lightning: g('lightningPct') + attrs.int,
    },
    convertFire: Math.min(100, g('convertFire')),
    critChance: Math.min(75, 5 + g('critChance') + attrs.pre * 0.15),
    critDmg: 50 + g('critDmg') + attrs.pre,
    atkSpeed: g('atkSpeed') + attrs.dex * 0.4 + buffs.aspd,
    moveSpeed: Math.max(-40, g('moveSpeed')),
    cdr: Math.min(50, g('cdr') + attrs.wil * 0.4),
    resolveGen: g('resolveGen') + attrs.wil * 0.8,
    block: Math.min(60, g('block')),
    dodge: Math.min(40, g('dodge') + attrs.dex * 0.15),
    bleed: g('bleedChance'), ignite: g('igniteChance'), chill: g('chillChance'), shock: g('shockChance'),
    aoe: g('aoe'), stunDur: g('stunDur'),
    turretDmg: g('turretDmg') + attrs.eng * 0.6,
    machineSpeed: g('machineSpeed') + attrs.eng * 0.6,
    drones: 2 + techDrones + g('drones'),
    mineSpeed: g('mineSpeed') + attrs.eng,
    findRarity: g('findRarity'),
    allSkills: g('allSkills'),
    thorns: g('thorns'),
    legendaries, keystones, attrs,
  };
  if (keystones.has('berserk')) st.armor = Math.round(st.armor * 0.8);
  return st;
}

export function xpForLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.65));
}

/** Armor mitigation scales with hit size: big hits pierce armor more. */
export function armorReduction(armor: number, raw: number): number {
  if (armor <= 0) return 0;
  return Math.min(0.85, armor / (armor + 8 * raw + 60));
}
