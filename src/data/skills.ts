import type { StatId } from './equipment';

export interface SkillMod { id: string; name: string; desc: string; reqRank: number }

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  icon: string; // glyph for procedural icon
  cooldown: number;
  cost: number; // resolve cost
  gain: number; // resolve gain on use/hit
  weaponPct: number; // % of weapon damage at rank 1
  perRank: number; // additive % per extra rank
  maxRank: number;
  reqLevel: number;
  kind: 'attack' | 'movement' | 'aoe' | 'defense' | 'buff' | 'ultimate';
  mods: SkillMod[];
}

const S = (d: SkillDef) => d;

/** Vanguard archetype — heavy melee defender of the Kindled order. */
export const SKILLS: SkillDef[] = [
  S({ id: 'cleave', name: 'Rending Cleave', icon: 'arc', kind: 'attack', desc: 'Sweep your weapon in a wide arc. Generates Resolve per enemy hit.', cooldown: 0, cost: 0, gain: 6, weaponPct: 100, perRank: 12, maxRank: 5, reqLevel: 1, mods: [
    { id: 'hemorrhage', name: 'Hemorrhage', desc: 'Cleave always inflicts Bleed (40% weapon damage per second, 4s).', reqRank: 1 },
    { id: 'widearc', name: 'Grand Arc', desc: '+70° arc and +25% reach.', reqRank: 2 },
    { id: 'emberedge', name: 'Ember Edge', desc: '40% of damage converted to fire; 30% chance to Ignite.', reqRank: 3 },
  ] }),
  S({ id: 'rush', name: 'Shield Rush', icon: 'dash', kind: 'movement', desc: 'Charge forward, damaging and knocking aside enemies in your path. Stuns at the end.', cooldown: 5, cost: 0, gain: 10, weaponPct: 140, perRank: 15, maxRank: 5, reqLevel: 1, mods: [
    { id: 'shockwave', name: 'Shockwave Arrival', desc: 'Releases a shockwave on arrival dealing 120% weapon damage around you.', reqRank: 1 },
    { id: 'momentum', name: 'Momentum', desc: '-2s cooldown. Each enemy hit refunds 0.3s.', reqRank: 2 },
    { id: 'guarded', name: 'Guarded Advance', desc: 'Gain 40% damage reduction for 3s after rushing.', reqRank: 3 },
  ] }),
  S({ id: 'slam', name: 'Quake Slam', icon: 'quake', kind: 'aoe', desc: 'Slam the ground, dealing damage around the target point and stunning.', cooldown: 0, cost: 30, gain: 0, weaponPct: 220, perRank: 25, maxRank: 5, reqLevel: 2, mods: [
    { id: 'aftershock', name: 'Aftershock', desc: 'A second quake erupts after 0.7s for 60% damage.', reqRank: 1 },
    { id: 'fissure', name: 'Fissure', desc: 'Instead creates a 9-tile fissure in a line, hitting everything along it.', reqRank: 2 },
    { id: 'tremor', name: 'Tremor Rift', desc: 'Stunned enemies take +25% damage from all sources.', reqRank: 3 },
  ] }),
  S({ id: 'bulwark', name: 'Iron Bulwark', icon: 'shield', kind: 'defense', desc: 'Brace yourself: 50% damage reduction for 4s and immunity to stun.', cooldown: 14, cost: 0, gain: 20, weaponPct: 0, perRank: 0, maxRank: 5, reqLevel: 4, mods: [
    { id: 'retaliation', name: 'Retaliation', desc: 'Reflect 150% of damage blocked by Bulwark to the attacker.', reqRank: 1 },
    { id: 'restoring', name: 'Restoring Bulwark', desc: 'Heal 25% of maximum life over the duration.', reqRank: 2 },
    { id: 'fortify', name: 'Fortify Works', desc: 'Repair buildings within 10 tiles by 30% and make them invulnerable for the duration.', reqRank: 3 },
  ] }),
  S({ id: 'horn', name: 'Rally Horn', icon: 'horn', kind: 'buff', desc: 'Sound the horn: +25% damage and +15% attack speed for 8s. Taunts nearby enemies.', cooldown: 18, cost: 0, gain: 30, weaponPct: 0, perRank: 0, maxRank: 5, reqLevel: 6, mods: [
    { id: 'overclock', name: 'Overclock Call', desc: 'Machines and turrets within 12 tiles work 75% faster for 10s.', reqRank: 1 },
    { id: 'dread', name: 'Dread Peal', desc: 'Non-boss enemies within 8 tiles flee for 3s.', reqRank: 2 },
    { id: 'kindle', name: 'Kindled Spirit', desc: 'Fully restores Resolve.', reqRank: 3 },
  ] }),
  S({ id: 'judgement', name: 'Forge Judgement', icon: 'hammer', kind: 'ultimate', desc: 'Call down a colossal molten hammer. After 0.8s it strikes for massive fire damage and leaves burning slag.', cooldown: 40, cost: 50, gain: 0, weaponPct: 900, perRank: 120, maxRank: 5, reqLevel: 10, mods: [
    { id: 'thermal', name: 'Thermal Discharge', desc: 'The impact fully recharges capacitors and refuels generators within 10 tiles.', reqRank: 1 },
    { id: 'tempered', name: 'Tempered Verdict', desc: '-15s cooldown.', reqRank: 2 },
    { id: 'meltdown', name: 'Meltdown', desc: 'Slag pools are 2x larger and burn 3x longer.', reqRank: 3 },
  ] }),
];

export const SKILL_MAP = new Map(SKILLS.map((s) => [s.id, s]));

export interface PassiveDef {
  id: string;
  name: string;
  desc: string;
  stats: { stat: StatId; value: number }[];
  prereq: string[];
  x: number; // layout
  y: number;
  keystone?: string;
}

export const PASSIVES: PassiveDef[] = [
  { id: 'p_root', name: 'Kindled Oath', desc: '+20 life, +5% damage', stats: [{ stat: 'life', value: 20 }, { stat: 'dmgPct', value: 5 }], prereq: [], x: 3, y: 0 },
  // Warpath branch (offense)
  { id: 'p_might1', name: 'Forgeborn Might', desc: '+10 Strength', stats: [{ stat: 'str', value: 10 }], prereq: ['p_root'], x: 1, y: 1 },
  { id: 'p_crit1', name: 'Honed Edge', desc: '+5% critical strike chance', stats: [{ stat: 'critChance', value: 5 }], prereq: ['p_might1'], x: 0, y: 2 },
  { id: 'p_bleed', name: 'Serrated Steel', desc: '+20% chance to bleed', stats: [{ stat: 'bleedChance', value: 20 }], prereq: ['p_might1'], x: 1, y: 2 },
  { id: 'p_critdmg', name: 'Executioner', desc: '+40% critical strike damage', stats: [{ stat: 'critDmg', value: 40 }], prereq: ['p_crit1'], x: 0, y: 3 },
  { id: 'p_aspd', name: 'Relentless', desc: '+12% attack speed', stats: [{ stat: 'atkSpeed', value: 12 }], prereq: ['p_bleed'], x: 1, y: 3 },
  { id: 'p_k_berserk', name: 'Keystone: Molten Fury', desc: '+35% damage, -20% armor-based mitigation. Strike harder, bleed easier.', stats: [{ stat: 'dmgPct', value: 35 }], prereq: ['p_critdmg', 'p_aspd'], x: 0.5, y: 4, keystone: 'berserk' },
  // Bastion branch (defense)
  { id: 'p_vit1', name: 'Iron Constitution', desc: '+10 Vitality', stats: [{ stat: 'vit', value: 10 }], prereq: ['p_root'], x: 3, y: 1 },
  { id: 'p_armor', name: 'Riveted Hide', desc: '+80 armor', stats: [{ stat: 'armor', value: 80 }], prereq: ['p_vit1'], x: 2.5, y: 2 },
  { id: 'p_res', name: 'Ashwalker', desc: '+10% all resistances', stats: [{ stat: 'resAll', value: 10 }], prereq: ['p_vit1'], x: 3.5, y: 2 },
  { id: 'p_block', name: 'Shieldwall', desc: '+8% block chance', stats: [{ stat: 'block', value: 8 }], prereq: ['p_armor'], x: 2.5, y: 3 },
  { id: 'p_regen', name: 'Second Wind', desc: '+3 life per second', stats: [{ stat: 'lifeRegen', value: 3 }], prereq: ['p_res'], x: 3.5, y: 3 },
  { id: 'p_k_bastion', name: 'Keystone: Living Bastion', desc: 'Blocking restores 3% life and grants 8 Resolve. +60 thorns.', stats: [{ stat: 'thorns', value: 60 }], prereq: ['p_block', 'p_regen'], x: 3, y: 4, keystone: 'bastion' },
  // Foundry branch (industry)
  { id: 'p_eng1', name: 'Wright\'s Lessons', desc: '+10 Engineering', stats: [{ stat: 'eng', value: 10 }], prereq: ['p_root'], x: 5, y: 1 },
  { id: 'p_turret', name: 'Battery Captain', desc: '+25% turret damage', stats: [{ stat: 'turretDmg', value: 25 }], prereq: ['p_eng1'], x: 4.5, y: 2 },
  { id: 'p_mine', name: 'Prospector', desc: '+50% manual mining speed', stats: [{ stat: 'mineSpeed', value: 50 }], prereq: ['p_eng1'], x: 5.5, y: 2 },
  { id: 'p_machine', name: 'Foreman\'s Presence', desc: 'Machines within 8 tiles of you work +20% faster', stats: [{ stat: 'machineSpeed', value: 20 }], prereq: ['p_turret'], x: 4.5, y: 3 },
  { id: 'p_drones', name: 'Wisp Keeper', desc: '+2 construction wisps', stats: [{ stat: 'drones', value: 2 }], prereq: ['p_mine'], x: 5.5, y: 3 },
  { id: 'p_k_conductor', name: 'Keystone: Living Conductor', desc: 'Your hits shock enemies near your powered buildings. +30% lightning damage.', stats: [{ stat: 'lightningPct', value: 30 }, { stat: 'shockChance', value: 15 }], prereq: ['p_machine', 'p_drones'], x: 5, y: 4, keystone: 'conductor' },
];
export const PASSIVE_MAP = new Map(PASSIVES.map((p) => [p.id, p]));
