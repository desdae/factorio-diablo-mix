import { Rng } from '../core/rng';
import {
  AFFIXES, ARTIFACTS, BASES, BASE_MAP, LEGENDARIES, LEGENDARY_MAP, RARITIES, RUNE_SETS, RUNE_STATS, STATS,
  type BaseDef, type Slot, type StatId,
} from '../data/equipment';
import { ITEM_MAP } from '../data/items';

export interface Affix { id: string; stat: StatId; value: number; tier: number }

export interface Equip {
  uid: number;
  base: string;
  name: string;
  rarity: number;
  ilvl: number;
  affixes: Affix[];
  implicit?: { stat: StatId; value: number };
  legendary?: string;
  artifact?: string;
  sockets: number;
  runes: string[];
  dmg?: [number, number];
  armor?: number;
  locked?: boolean;
  favorite?: boolean;
  /** quality from industrial manufacturing (0-20%) boosts base stats */
  quality: number;
}

export type InvSlot = { item: string; count: number } | { equip: Equip } | null;

let uidCounter = 1;
export function setUidCounter(n: number) { uidCounter = Math.max(uidCounter, n); }
export function nextUid() { return uidCounter++; }

const PREFIX = ['Searing', 'Grim', 'Riveted', 'Hollow', 'Ashen', 'Kindled', 'Sundered', 'Gilded', 'Vigilant', 'Molten', 'Iron-Sworn', 'Rift-Touched'];
const SUFFIX = ['of the Lattice', 'of Cinders', 'of the Wrights', 'of Embers', 'of the Watch', 'of Hollow Stars', 'of Ruin', 'of the Forge', 'of Vigil', 'of the Deep'];

export function rollRarity(rng: Rng, bonusPct: number, minRarity = 0): number {
  const mult = 1 + bonusPct / 100;
  const pick = rng.weighted(RARITIES.filter((r) => r.id < 6), (r) => (r.id === 0 ? r.weight : r.weight * mult));
  return Math.max(minRarity, pick.id);
}

function affixValue(rng: Rng, a: (typeof AFFIXES)[number], ilvl: number, rarity: number): { value: number; tier: number } {
  const t = Math.min(1, ilvl / 30);
  const lo = a.min + (a.max - a.min) * t * 0.6;
  const hi = a.min + (a.max - a.min) * Math.min(1, t * 1.1 + rarity * 0.05);
  let v = rng.range(lo, Math.max(lo, hi));
  if (rarity >= 5) v *= 1.15; // mythic rolls higher
  const tier = Math.max(1, 5 - Math.floor(((v - a.min) / Math.max(0.0001, a.max - a.min)) * 5));
  return { value: a.integer ? Math.max(1, Math.round(v)) : Math.round(v * 10) / 10, tier: Math.min(5, tier) };
}

export function generateEquip(rng: Rng, opts: { ilvl: number; rarity?: number; group?: 'weapon' | 'armor' | 'jewel'; base?: string; mf?: number; minRarity?: number; quality?: number }): Equip {
  const candidates = BASES.filter((b) => b.minLevel <= opts.ilvl + 2 && (!opts.group || b.group === opts.group || (opts.group === 'armor' && b.slot === 'offhand')));
  const base: BaseDef = opts.base ? BASE_MAP.get(opts.base)! : rng.pick(candidates.length ? candidates : BASES);
  const rarity = opts.rarity ?? rollRarity(rng, opts.mf ?? 0, opts.minRarity ?? 0);
  const r = RARITIES[rarity];
  const quality = opts.quality ?? 0;
  const e: Equip = { uid: nextUid(), base: base.id, name: base.name, rarity, ilvl: opts.ilvl, affixes: [], sockets: 0, runes: [], quality };
  if (base.implicit) e.implicit = { ...base.implicit };
  const scale = 1 + opts.ilvl * 0.09 + quality / 100;
  if (base.dmg) e.dmg = [Math.round(base.dmg[0] * scale), Math.round(base.dmg[1] * scale)];
  if (base.armor) e.armor = Math.round(base.armor * scale);
  const count = rng.int(r.affixes[0], r.affixes[1]);
  rollAffixes(rng, e, base, count);
  e.sockets = rng.int(0, r.sockets);
  if (rarity === 4 || rarity === 5) {
    const legs = LEGENDARIES.filter((l) => l.groups.includes(base.group) && (!l.slots || l.slots.includes(base.slot)));
    if (legs.length) {
      const leg = rng.pick(legs);
      e.legendary = leg.id;
      e.name = `${leg.title} ${base.name}`;
    }
  } else if (rarity >= 2) {
    e.name = `${rng.pick(PREFIX)} ${base.name} ${rng.pick(SUFFIX)}`;
  } else if (rarity === 1) {
    e.name = `${rng.pick(PREFIX)} ${base.name}`;
  }
  return e;
}

export function rollAffixes(rng: Rng, e: Equip, base: BaseDef, count: number) {
  const pool = AFFIXES.filter((a) => a.groups.includes(base.group) && (!a.slots || a.slots.includes(base.slot)) && !e.affixes.some((x) => x.id === a.id));
  for (let i = 0; i < count && pool.length; i++) {
    const a = rng.weighted(pool, (x) => x.weight);
    pool.splice(pool.indexOf(a), 1);
    const { value, tier } = affixValue(rng, a, e.ilvl, e.rarity);
    e.affixes.push({ id: a.id, stat: a.stat, value, tier });
  }
}

export function makeArtifact(id: string, ilvl: number): Equip {
  const a = ARTIFACTS.find((x) => x.id === id)!;
  const base = BASE_MAP.get(a.base)!;
  const scale = 1 + ilvl * 0.09;
  return {
    uid: nextUid(), base: base.id, name: a.name, rarity: 6, ilvl, sockets: 2, runes: [], quality: 10,
    affixes: a.stats.map((s) => ({ id: s.stat, stat: s.stat, value: s.value, tier: 1 })),
    implicit: base.implicit ? { ...base.implicit } : undefined,
    legendary: a.power, artifact: a.id,
    dmg: base.dmg ? [Math.round(base.dmg[0] * scale * 1.2), Math.round(base.dmg[1] * scale * 1.2)] : undefined,
    armor: base.armor ? Math.round(base.armor * scale * 1.2) : undefined,
  };
}

/** All stat contributions of an item including runes and rune pair bonuses. */
export function equipStats(e: Equip): { stat: StatId; value: number }[] {
  const out: { stat: StatId; value: number }[] = [];
  if (e.implicit) out.push(e.implicit);
  for (const a of e.affixes) out.push({ stat: a.stat, value: a.value });
  for (const r of e.runes) if (RUNE_STATS[r]) out.push(RUNE_STATS[r]);
  for (const set of RUNE_SETS) if (e.runes.includes(set.a) && e.runes.includes(set.b)) out.push(...set.stats);
  const base = BASE_MAP.get(e.base)!;
  if (base.block) out.push({ stat: 'block', value: base.block });
  return out;
}

export function slotOf(e: Equip): Slot {
  return BASE_MAP.get(e.base)!.slot;
}

export function equipValue(e: Equip): number {
  return Math.round((5 + e.ilvl * 2) * (1 + e.rarity * e.rarity * 0.8) * (1 + e.affixes.length * 0.15));
}

export function describeEquip(e: Equip): string[] {
  const lines: string[] = [];
  const base = BASE_MAP.get(e.base)!;
  if (e.dmg) lines.push(`${e.dmg[0]}–${e.dmg[1]} damage · ${base.aps!.toFixed(2)} attacks/s${base.twoHanded ? ' · two-handed' : ''}`);
  if (e.armor) lines.push(`${e.armor} armor${base.block ? ` · ${base.block}% block` : ''}`);
  if (e.implicit) lines.push(`${STATS[e.implicit.stat].fmt(e.implicit.value)} ${STATS[e.implicit.stat].name}`);
  return lines;
}

export function runeSetNames(e: Equip): string[] {
  return RUNE_SETS.filter((s) => e.runes.includes(s.a) && e.runes.includes(s.b)).map((s) => `${s.name}: ${s.desc}`);
}

export function legendaryText(e: Equip) {
  return e.legendary ? LEGENDARY_MAP.get(e.legendary) : undefined;
}

export function isStack(s: InvSlot): s is { item: string; count: number } {
  return !!s && 'item' in s;
}
export function isEquip(s: InvSlot): s is { equip: Equip } {
  return !!s && 'equip' in s;
}

export function stackSize(id: string) {
  return ITEM_MAP.get(id)?.stack ?? 100;
}
