/** Equipment bases, rarity tiers, affixes and legendary powers. Fully data-driven. */

export type Slot = 'helmet' | 'body' | 'gloves' | 'boots' | 'belt' | 'amulet' | 'ring' | 'mainhand' | 'offhand' | 'relic';

export type StatId =
  | 'str' | 'dex' | 'int' | 'vit' | 'wil' | 'pre' | 'eng'
  | 'life' | 'lifeRegen' | 'leech' | 'armor' | 'resAll' | 'resFire' | 'resFrost' | 'resLightning' | 'resPoison'
  | 'dmgPct' | 'flatPhys' | 'flatFire' | 'flatFrost' | 'flatLightning' | 'firePct' | 'frostPct' | 'lightningPct' | 'physPct'
  | 'critChance' | 'critDmg' | 'atkSpeed' | 'moveSpeed' | 'cdr' | 'resolveGen' | 'block' | 'dodge'
  | 'bleedChance' | 'igniteChance' | 'chillChance' | 'shockChance' | 'aoe' | 'stunDur'
  | 'turretDmg' | 'machineSpeed' | 'drones' | 'mineSpeed' | 'findRarity' | 'allSkills' | 'thorns' | 'convertFire';

export interface StatInfo { name: string; fmt: (v: number) => string; pct?: boolean }

const p = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}%`;
const n = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;

export const STATS: Record<StatId, StatInfo> = {
  str: { name: 'Strength', fmt: n }, dex: { name: 'Dexterity', fmt: n }, int: { name: 'Intelligence', fmt: n },
  vit: { name: 'Vitality', fmt: n }, wil: { name: 'Willpower', fmt: n }, pre: { name: 'Precision', fmt: n }, eng: { name: 'Engineering', fmt: n },
  life: { name: 'Maximum Life', fmt: n }, lifeRegen: { name: 'Life per Second', fmt: (v) => `+${v.toFixed(1)}` },
  leech: { name: 'Life Leech', fmt: (v) => `${v.toFixed(1)}%` }, armor: { name: 'Armor', fmt: n },
  resAll: { name: 'All Resistances', fmt: p, pct: true }, resFire: { name: 'Fire Resistance', fmt: p, pct: true },
  resFrost: { name: 'Frost Resistance', fmt: p, pct: true }, resLightning: { name: 'Lightning Resistance', fmt: p, pct: true },
  resPoison: { name: 'Poison Resistance', fmt: p, pct: true },
  dmgPct: { name: 'Increased Damage', fmt: p, pct: true }, flatPhys: { name: 'Physical Damage to Attacks', fmt: n },
  flatFire: { name: 'Fire Damage to Attacks', fmt: n }, flatFrost: { name: 'Frost Damage to Attacks', fmt: n },
  flatLightning: { name: 'Lightning Damage to Attacks', fmt: n },
  firePct: { name: 'Increased Fire Damage', fmt: p, pct: true }, frostPct: { name: 'Increased Frost Damage', fmt: p, pct: true },
  lightningPct: { name: 'Increased Lightning Damage', fmt: p, pct: true }, physPct: { name: 'Increased Physical Damage', fmt: p, pct: true },
  critChance: { name: 'Critical Strike Chance', fmt: p, pct: true }, critDmg: { name: 'Critical Strike Damage', fmt: p, pct: true },
  atkSpeed: { name: 'Attack Speed', fmt: p, pct: true }, moveSpeed: { name: 'Movement Speed', fmt: p, pct: true },
  cdr: { name: 'Cooldown Reduction', fmt: p, pct: true }, resolveGen: { name: 'Resolve Generation', fmt: p, pct: true },
  block: { name: 'Block Chance', fmt: p, pct: true }, dodge: { name: 'Evasion Chance', fmt: p, pct: true },
  bleedChance: { name: 'Chance to Bleed', fmt: p, pct: true }, igniteChance: { name: 'Chance to Ignite', fmt: p, pct: true },
  chillChance: { name: 'Chance to Chill', fmt: p, pct: true }, shockChance: { name: 'Chance to Shock', fmt: p, pct: true },
  aoe: { name: 'Area of Effect', fmt: p, pct: true }, stunDur: { name: 'Stun Duration', fmt: p, pct: true },
  turretDmg: { name: 'Turret Damage', fmt: p, pct: true }, machineSpeed: { name: 'Speed of Machines Near You', fmt: p, pct: true },
  drones: { name: 'Construction Wisps', fmt: n }, mineSpeed: { name: 'Manual Mining Speed', fmt: p, pct: true },
  findRarity: { name: 'Rarity of Items Found', fmt: p, pct: true }, allSkills: { name: 'to All Skills', fmt: n },
  thorns: { name: 'Thorns Damage', fmt: n }, convertFire: { name: 'Physical Converted to Fire', fmt: p, pct: true },
};

export interface Rarity { id: number; name: string; color: string; cbColor: string; affixes: [number, number]; weight: number; sockets: number }
export const RARITIES: Rarity[] = [
  { id: 0, name: 'Common', color: '#c8c8c8', cbColor: '#c8c8c8', affixes: [0, 0], weight: 600, sockets: 1 },
  { id: 1, name: 'Refined', color: '#5aa0ff', cbColor: '#4aa0ff', affixes: [1, 2], weight: 280, sockets: 1 },
  { id: 2, name: 'Rare', color: '#ffe05a', cbColor: '#ffff40', affixes: [3, 4], weight: 100, sockets: 2 },
  { id: 3, name: 'Exalted', color: '#c060ff', cbColor: '#ff40ff', affixes: [4, 5], weight: 25, sockets: 2 },
  { id: 4, name: 'Legendary', color: '#ff8a20', cbColor: '#ff8000', affixes: [4, 4], weight: 7, sockets: 2 },
  { id: 5, name: 'Mythic', color: '#ff3a5a', cbColor: '#ffffff', affixes: [5, 5], weight: 1.2, sockets: 3 },
  { id: 6, name: 'Artifact', color: '#3af0c0', cbColor: '#00ffc0', affixes: [5, 5], weight: 0, sockets: 3 },
];

export interface BaseDef {
  id: string;
  name: string;
  slot: Slot;
  group: 'weapon' | 'armor' | 'jewel';
  /** weapons: base damage range and attacks per second; two-handed occupy offhand */
  dmg?: [number, number];
  aps?: number;
  twoHanded?: boolean;
  reach?: number; // melee reach multiplier
  armor?: number;
  block?: number;
  implicit?: { stat: StatId; value: number };
  minLevel: number;
  shape: string;
}

const W = (d: BaseDef) => d;

export const BASES: BaseDef[] = [
  W({ id: 'sword', name: 'Ashsteel Blade', slot: 'mainhand', group: 'weapon', dmg: [7, 13], aps: 1.3, minLevel: 1, shape: 'sword', implicit: { stat: 'critChance', value: 3 } }),
  W({ id: 'axe', name: 'Hewing Axe', slot: 'mainhand', group: 'weapon', dmg: [9, 16], aps: 1.15, minLevel: 1, shape: 'axe', implicit: { stat: 'bleedChance', value: 10 } }),
  W({ id: 'mace', name: 'Rivet Maul', slot: 'mainhand', group: 'weapon', dmg: [10, 15], aps: 1.1, minLevel: 3, shape: 'mace', implicit: { stat: 'stunDur', value: 20 } }),
  W({ id: 'spear', name: 'Pike of the Watch', slot: 'mainhand', group: 'weapon', dmg: [8, 18], aps: 1.2, reach: 1.35, minLevel: 4, shape: 'spear' }),
  W({ id: 'greataxe', name: 'Furnace Cleaver', slot: 'mainhand', group: 'weapon', dmg: [20, 34], aps: 0.9, twoHanded: true, reach: 1.15, minLevel: 6, shape: 'greataxe', implicit: { stat: 'aoe', value: 15 } }),
  W({ id: 'hammer', name: 'Piston Hammer', slot: 'mainhand', group: 'weapon', dmg: [24, 30], aps: 0.85, twoHanded: true, minLevel: 8, shape: 'hammer', implicit: { stat: 'turretDmg', value: 15 } }),
  W({ id: 'dagger', name: 'Rift Dirk', slot: 'mainhand', group: 'weapon', dmg: [5, 10], aps: 1.6, reach: 0.85, minLevel: 2, shape: 'dagger', implicit: { stat: 'critDmg', value: 25 } }),
  W({ id: 'shield', name: 'Riveted Kite Shield', slot: 'offhand', group: 'armor', armor: 30, block: 12, minLevel: 1, shape: 'shield' }),
  W({ id: 'tower', name: 'Bulwark Tower Shield', slot: 'offhand', group: 'armor', armor: 60, block: 18, minLevel: 7, shape: 'tower', implicit: { stat: 'moveSpeed', value: -5 } }),
  W({ id: 'focus', name: 'Cogwork Focus', slot: 'offhand', group: 'armor', armor: 5, minLevel: 3, shape: 'focus', implicit: { stat: 'machineSpeed', value: 10 } }),
  W({ id: 'helm', name: 'Visored Helm', slot: 'helmet', group: 'armor', armor: 22, minLevel: 1, shape: 'helm' }),
  W({ id: 'hood', name: 'Ash-Weave Hood', slot: 'helmet', group: 'armor', armor: 12, minLevel: 1, shape: 'hood', implicit: { stat: 'findRarity', value: 8 } }),
  W({ id: 'plate', name: 'Foundry Plate', slot: 'body', group: 'armor', armor: 55, minLevel: 1, shape: 'plate', implicit: { stat: 'moveSpeed', value: -3 } }),
  W({ id: 'coat', name: 'Engineer\'s Coat', slot: 'body', group: 'armor', armor: 32, minLevel: 1, shape: 'coat', implicit: { stat: 'eng', value: 5 } }),
  W({ id: 'gauntlets', name: 'Smithing Gauntlets', slot: 'gloves', group: 'armor', armor: 14, minLevel: 1, shape: 'gloves' }),
  W({ id: 'greaves', name: 'Hobnail Greaves', slot: 'boots', group: 'armor', armor: 14, minLevel: 1, shape: 'boots', implicit: { stat: 'moveSpeed', value: 5 } }),
  W({ id: 'girdle', name: 'Tool Girdle', slot: 'belt', group: 'armor', armor: 10, minLevel: 1, shape: 'belt', implicit: { stat: 'life', value: 15 } }),
  W({ id: 'amulet', name: 'Lattice Pendant', slot: 'amulet', group: 'jewel', minLevel: 1, shape: 'amulet', implicit: { stat: 'resAll', value: 5 } }),
  W({ id: 'ring', name: 'Signet Band', slot: 'ring', group: 'jewel', minLevel: 1, shape: 'ring' }),
  W({ id: 'relic', name: 'Wright\'s Reliquary', slot: 'relic', group: 'jewel', minLevel: 5, shape: 'relic', implicit: { stat: 'eng', value: 8 } }),
];
export const BASE_MAP = new Map(BASES.map((b) => [b.id, b]));

export interface AffixDef {
  id: string;
  stat: StatId;
  groups: ('weapon' | 'armor' | 'jewel')[];
  slots?: Slot[];
  min: number; // value at item level 1
  max: number; // value at item level 30
  weight: number;
  integer?: boolean;
}

const A = (d: AffixDef) => d;
export const AFFIXES: AffixDef[] = [
  A({ id: 'str', stat: 'str', groups: ['weapon', 'armor', 'jewel'], min: 2, max: 25, weight: 10, integer: true }),
  A({ id: 'dex', stat: 'dex', groups: ['weapon', 'armor', 'jewel'], min: 2, max: 25, weight: 8, integer: true }),
  A({ id: 'vit', stat: 'vit', groups: ['armor', 'jewel'], min: 2, max: 25, weight: 10, integer: true }),
  A({ id: 'wil', stat: 'wil', groups: ['armor', 'jewel'], min: 2, max: 20, weight: 6, integer: true }),
  A({ id: 'pre', stat: 'pre', groups: ['weapon', 'jewel'], min: 2, max: 20, weight: 6, integer: true }),
  A({ id: 'eng', stat: 'eng', groups: ['armor', 'jewel'], min: 2, max: 20, weight: 6, integer: true }),
  A({ id: 'life', stat: 'life', groups: ['armor', 'jewel'], min: 10, max: 140, weight: 12, integer: true }),
  A({ id: 'regen', stat: 'lifeRegen', groups: ['armor', 'jewel'], min: 0.5, max: 8, weight: 5 }),
  A({ id: 'leech', stat: 'leech', groups: ['weapon', 'jewel'], slots: ['mainhand', 'ring', 'amulet'], min: 0.5, max: 3, weight: 4 }),
  A({ id: 'armor', stat: 'armor', groups: ['armor'], min: 8, max: 120, weight: 12, integer: true }),
  A({ id: 'resAll', stat: 'resAll', groups: ['armor', 'jewel'], min: 3, max: 15, weight: 4, integer: true }),
  A({ id: 'resFire', stat: 'resFire', groups: ['armor', 'jewel'], min: 6, max: 35, weight: 7, integer: true }),
  A({ id: 'resFrost', stat: 'resFrost', groups: ['armor', 'jewel'], min: 6, max: 35, weight: 6, integer: true }),
  A({ id: 'resLightning', stat: 'resLightning', groups: ['armor', 'jewel'], min: 6, max: 35, weight: 6, integer: true }),
  A({ id: 'resPoison', stat: 'resPoison', groups: ['armor', 'jewel'], min: 6, max: 35, weight: 6, integer: true }),
  A({ id: 'dmgPct', stat: 'dmgPct', groups: ['weapon', 'jewel'], min: 8, max: 70, weight: 12, integer: true }),
  A({ id: 'flatPhys', stat: 'flatPhys', groups: ['weapon', 'jewel'], slots: ['mainhand', 'ring', 'amulet', 'gloves'], min: 1, max: 18, weight: 9, integer: true }),
  A({ id: 'flatFire', stat: 'flatFire', groups: ['weapon', 'jewel'], slots: ['mainhand', 'ring', 'amulet'], min: 2, max: 22, weight: 7, integer: true }),
  A({ id: 'flatFrost', stat: 'flatFrost', groups: ['weapon', 'jewel'], slots: ['mainhand', 'ring', 'amulet'], min: 2, max: 20, weight: 6, integer: true }),
  A({ id: 'flatLightning', stat: 'flatLightning', groups: ['weapon', 'jewel'], slots: ['mainhand', 'ring', 'amulet'], min: 1, max: 26, weight: 6, integer: true }),
  A({ id: 'firePct', stat: 'firePct', groups: ['weapon', 'jewel'], min: 10, max: 60, weight: 5, integer: true }),
  A({ id: 'frostPct', stat: 'frostPct', groups: ['weapon', 'jewel'], min: 10, max: 60, weight: 4, integer: true }),
  A({ id: 'lightningPct', stat: 'lightningPct', groups: ['weapon', 'jewel'], min: 10, max: 60, weight: 4, integer: true }),
  A({ id: 'physPct', stat: 'physPct', groups: ['weapon', 'jewel'], min: 10, max: 60, weight: 6, integer: true }),
  A({ id: 'crit', stat: 'critChance', groups: ['weapon', 'jewel'], slots: ['mainhand', 'ring', 'amulet', 'gloves', 'helmet'], min: 2, max: 10, weight: 7 }),
  A({ id: 'critDmg', stat: 'critDmg', groups: ['weapon', 'jewel'], slots: ['mainhand', 'ring', 'amulet', 'gloves'], min: 10, max: 75, weight: 6, integer: true }),
  A({ id: 'atkSpeed', stat: 'atkSpeed', groups: ['weapon', 'armor', 'jewel'], slots: ['mainhand', 'gloves', 'ring', 'amulet'], min: 3, max: 18, weight: 7, integer: true }),
  A({ id: 'moveSpeed', stat: 'moveSpeed', groups: ['armor'], slots: ['boots'], min: 4, max: 22, weight: 14, integer: true }),
  A({ id: 'cdr', stat: 'cdr', groups: ['armor', 'jewel'], slots: ['helmet', 'amulet', 'gloves', 'relic'], min: 3, max: 16, weight: 5, integer: true }),
  A({ id: 'resolve', stat: 'resolveGen', groups: ['weapon', 'armor', 'jewel'], min: 5, max: 30, weight: 5, integer: true }),
  A({ id: 'block', stat: 'block', groups: ['armor'], slots: ['offhand'], min: 3, max: 15, weight: 8, integer: true }),
  A({ id: 'dodge', stat: 'dodge', groups: ['armor'], slots: ['boots', 'body', 'gloves'], min: 2, max: 10, weight: 5, integer: true }),
  A({ id: 'bleed', stat: 'bleedChance', groups: ['weapon', 'jewel'], min: 5, max: 30, weight: 5, integer: true }),
  A({ id: 'ignite', stat: 'igniteChance', groups: ['weapon', 'jewel'], min: 5, max: 30, weight: 5, integer: true }),
  A({ id: 'chill', stat: 'chillChance', groups: ['weapon', 'jewel'], min: 5, max: 30, weight: 4, integer: true }),
  A({ id: 'shock', stat: 'shockChance', groups: ['weapon', 'jewel'], min: 5, max: 30, weight: 4, integer: true }),
  A({ id: 'aoe', stat: 'aoe', groups: ['weapon', 'jewel', 'armor'], slots: ['mainhand', 'amulet', 'helmet', 'relic'], min: 5, max: 30, weight: 4, integer: true }),
  A({ id: 'turret', stat: 'turretDmg', groups: ['weapon', 'armor', 'jewel'], min: 6, max: 35, weight: 5, integer: true }),
  A({ id: 'machine', stat: 'machineSpeed', groups: ['armor', 'jewel'], min: 5, max: 30, weight: 4, integer: true }),
  A({ id: 'drones', stat: 'drones', groups: ['jewel', 'armor'], slots: ['relic', 'amulet', 'body'], min: 1, max: 3, weight: 2, integer: true }),
  A({ id: 'mine', stat: 'mineSpeed', groups: ['armor', 'jewel'], slots: ['gloves', 'ring', 'relic'], min: 15, max: 80, weight: 4, integer: true }),
  A({ id: 'mf', stat: 'findRarity', groups: ['armor', 'jewel'], min: 5, max: 35, weight: 4, integer: true }),
  A({ id: 'thorns', stat: 'thorns', groups: ['armor'], min: 3, max: 60, weight: 4, integer: true }),
  A({ id: 'skills', stat: 'allSkills', groups: ['jewel', 'weapon'], slots: ['amulet', 'mainhand', 'relic'], min: 1, max: 2, weight: 1.5, integer: true }),
];

export interface LegendaryDef {
  id: string;
  name: string;
  /** item name override when this power rolls */
  title: string;
  desc: string;
  groups: ('weapon' | 'armor' | 'jewel')[];
  slots?: Slot[];
}

/** Legendary powers transform skills or bridge combat and industry. Checked by id in gameplay code. */
export const LEGENDARIES: LegendaryDef[] = [
  { id: 'leg_mark', title: 'Overseer\'s', name: 'Targeting Mandate', desc: 'Rending Cleave marks enemies for 6s. Your turrets deal +40% damage to marked enemies.', groups: ['weapon', 'jewel'] },
  { id: 'leg_rushfire', title: 'Kiln-Stride', name: 'Kiln Stride', desc: 'Shield Rush leaves a trail of fire that burns for 4s.', groups: ['armor'], slots: ['boots', 'offhand'] },
  { id: 'leg_doubleslam', title: 'Twinquake', name: 'Echoing Fault', desc: 'Quake Slam strikes a second time 0.5s later.', groups: ['weapon', 'armor'], slots: ['mainhand', 'gloves'] },
  { id: 'leg_overclock', title: 'Foreman\'s', name: 'Foreman\'s Bellow', desc: 'Rally Horn always overclocks machines within 12 tiles by +100% for 10s.', groups: ['armor', 'jewel'], slots: ['helmet', 'amulet'] },
  { id: 'leg_shatter', title: 'Rimebreaker', name: 'Rimebreaker', desc: 'Your hits chill. Killing a chilled enemy shatters it, dealing 30% of its life as frost damage nearby.', groups: ['weapon', 'jewel'] },
  { id: 'leg_scavenger', title: 'Scrapwright\'s', name: 'Scrapwright\'s Eye', desc: 'Kills have a 15% chance to drop crafting materials (plates, gears, circuits).', groups: ['armor', 'jewel'] },
  { id: 'leg_capacitor', title: 'Stormbound', name: 'Stormbound Core', desc: 'Your attacks deal +40% lightning as extra damage and recharge nearby capacitors.', groups: ['weapon', 'jewel'] },
  { id: 'leg_bulwark', title: 'Unbroken', name: 'Unbroken Rampart', desc: 'Iron Bulwark lasts twice as long and heals 4% life per second.', groups: ['armor'], slots: ['body', 'offhand', 'helmet'] },
  { id: 'leg_judgement', title: 'Worldforge', name: 'Worldforge Verdict', desc: 'Forge Judgement drops three hammers in a line.', groups: ['weapon', 'jewel'], slots: ['mainhand', 'amulet', 'relic'] },
  { id: 'leg_vampire', title: 'Sanguine', name: 'Sanguine Covenant', desc: 'Bleeding enemies heal you for 1% of your life per second each.', groups: ['weapon', 'armor'] },
];
export const LEGENDARY_MAP = new Map(LEGENDARIES.map((l) => [l.id, l]));

/** Fixed artifacts dropped by bosses. */
export interface ArtifactDef { id: string; name: string; base: string; stats: { stat: StatId; value: number }[]; power: string; lore: string }
export const ARTIFACTS: ArtifactDef[] = [
  { id: 'art_colossus', name: 'Heartfire Maul', base: 'hammer', stats: [{ stat: 'flatFire', value: 30 }, { stat: 'firePct', value: 60 }, { stat: 'convertFire', value: 50 }, { stat: 'life', value: 80 }, { stat: 'allSkills', value: 1 }], power: 'leg_judgement', lore: 'It still beats.' },
  { id: 'art_matriarch', name: 'Broodmother\'s Carapace', base: 'plate', stats: [{ stat: 'armor', value: 140 }, { stat: 'life', value: 120 }, { stat: 'resPoison', value: 40 }, { stat: 'thorns', value: 40 }, { stat: 'vit', value: 15 }], power: 'leg_bulwark', lore: 'Plates of a mother who would not let go.' },
];

export const RUNE_SETS: { a: string; b: string; name: string; desc: string; stats: { stat: StatId; value: number }[] }[] = [
  { a: 'rune_ember', b: 'rune_cog', name: 'Molten Gears', desc: '+25% turret damage, +15% fire damage', stats: [{ stat: 'turretDmg', value: 25 }, { stat: 'firePct', value: 15 }] },
  { a: 'rune_ember', b: 'rune_ward', name: 'Kiln Ward', desc: '+25% fire resistance, +80 armor', stats: [{ stat: 'resFire', value: 25 }, { stat: 'armor', value: 80 }] },
  { a: 'rune_ward', b: 'rune_blood', name: 'Iron Vein', desc: '+60 life, +2 life per second', stats: [{ stat: 'life', value: 60 }, { stat: 'lifeRegen', value: 2 }] },
];
export const RUNE_STATS: Record<string, { stat: StatId; value: number }> = {
  rune_ember: { stat: 'firePct', value: 8 }, rune_ward: { stat: 'armor', value: 60 },
  rune_cog: { stat: 'turretDmg', value: 10 }, rune_blood: { stat: 'leech', value: 1.5 },
};
