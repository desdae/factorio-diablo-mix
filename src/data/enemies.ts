import type { BuildingKind } from './buildings';

export type Behavior = 'rusher' | 'ranged' | 'brute' | 'burrower' | 'bloater' | 'summoner' | 'healer' | 'blinker' | 'flyer' | 'matriarch' | 'colossus';

export interface EnemyDef {
  id: string;
  name: string;
  behavior: Behavior;
  hp: number;
  speed: number; // tiles/s
  radius: number;
  damage: number;
  dmgType: 'physical' | 'fire' | 'frost' | 'lightning' | 'poison';
  attackRange: number;
  attackCooldown: number;
  windup: number; // telegraph seconds before damage
  armor: number;
  res: { fire?: number; frost?: number; lightning?: number; poison?: number };
  xp: number;
  color: string;
  accent: string;
  drops: { item: string; chance: number; min: number; max: number }[];
  /** priority list when assaulting a factory */
  targets: BuildingKind[];
  flying?: boolean;
  boss?: boolean;
  desc: string;
}

const E = (d: EnemyDef) => d;
const ANY: BuildingKind[] = ['turret', 'tesla', 'wall', 'generator', 'miner', 'furnace', 'assembler', 'lab', 'pylon', 'belt', 'vault', 'arm', 'splitter', 'lamp', 'capacitor', 'forge', 'beacon'];

export const ENEMIES: EnemyDef[] = [
  E({ id: 'husk', name: 'Cinder Husk', behavior: 'rusher', hp: 34, speed: 3.6, radius: 0.38, damage: 6, dmgType: 'physical', attackRange: 0.9, attackCooldown: 1.1, windup: 0.25, armor: 5, res: { fire: 25 }, xp: 6, color: '#5a3f30', accent: '#ff7a3a', drops: [{ item: 'chitin', chance: 0.35, min: 1, max: 2 }, { item: 'essence', chance: 0.12, min: 1, max: 1 }], targets: ANY, desc: 'Burnt shells animated by rift-bleed. They swarm.' }),
  E({ id: 'spitter', name: 'Bile Spitter', behavior: 'ranged', hp: 30, speed: 2.8, radius: 0.42, damage: 9, dmgType: 'poison', attackRange: 8, attackCooldown: 2.0, windup: 0.45, armor: 3, res: { poison: 60 }, xp: 9, color: '#4a5a2a', accent: '#a8ff3a', drops: [{ item: 'venom', chance: 0.5, min: 1, max: 1 }, { item: 'essence', chance: 0.15, min: 1, max: 1 }], targets: ['turret', 'tesla', 'pylon', 'miner', 'furnace', 'wall'], desc: 'Lobs caustic bile from range. Keeps its distance.' }),
  E({ id: 'brute', name: 'Slagplate Brute', behavior: 'brute', hp: 160, speed: 2.1, radius: 0.7, damage: 26, dmgType: 'physical', attackRange: 1.6, attackCooldown: 2.4, windup: 0.8, armor: 40, res: { fire: 40 }, xp: 30, color: '#4a4440', accent: '#ffb04a', drops: [{ item: 'bone', chance: 0.6, min: 2, max: 4 }, { item: 'essence', chance: 0.3, min: 1, max: 2 }], targets: ['wall', 'turret', 'tesla', 'generator', 'furnace'], desc: 'Hides behind a slag-plate shield that blocks most frontal damage. Flank it.' }),
  E({ id: 'tunneler', name: 'Ash Tunneler', behavior: 'burrower', hp: 70, speed: 2.6, radius: 0.5, damage: 18, dmgType: 'physical', attackRange: 1.2, attackCooldown: 1.6, windup: 0.6, armor: 15, res: { poison: 30 }, xp: 18, color: '#6a5040', accent: '#e0c080', drops: [{ item: 'chitin', chance: 0.6, min: 2, max: 3 }, { item: 'stone', chance: 0.6, min: 3, max: 6 }], targets: ['miner', 'generator', 'furnace', 'turret'], desc: 'Burrows beneath walls and erupts under its prey.' }),
  E({ id: 'bloat', name: 'Pyre Bloat', behavior: 'bloater', hp: 60, speed: 1.9, radius: 0.6, damage: 30, dmgType: 'fire', attackRange: 1.3, attackCooldown: 1, windup: 0.9, armor: 0, res: { fire: 80, frost: -30 }, xp: 14, color: '#7a3a2a', accent: '#ffcc40', drops: [{ item: 'coal', chance: 0.7, min: 2, max: 5 }], targets: ['generator', 'turret', 'wall', 'furnace', 'belt'], desc: 'A swollen furnace-sack. Detonates when slain or close. Freeze it.' }),
  E({ id: 'hexcaller', name: 'Hexcaller', behavior: 'summoner', hp: 55, speed: 2.4, radius: 0.45, damage: 7, dmgType: 'fire', attackRange: 9, attackCooldown: 5, windup: 1.0, armor: 5, res: { fire: 30, lightning: 20 }, xp: 22, color: '#3a2a4a', accent: '#c060ff', drops: [{ item: 'essence', chance: 0.8, min: 1, max: 3 }, { item: 'rift_shard', chance: 0.06, min: 1, max: 1 }], targets: ['lab', 'pylon', 'turret'], desc: 'Tears husks out of the rift. Kill it first.' }),
  E({ id: 'mender', name: 'Ash Mender', behavior: 'healer', hp: 45, speed: 2.7, radius: 0.42, damage: 5, dmgType: 'poison', attackRange: 7, attackCooldown: 2.5, windup: 0.6, armor: 4, res: { poison: 40 }, xp: 18, color: '#2a4a40', accent: '#5affb0', drops: [{ item: 'bloodcap', chance: 0.6, min: 1, max: 3 }, { item: 'essence', chance: 0.3, min: 1, max: 1 }], targets: ['furnace', 'lab', 'turret'], desc: 'Mends wounded Ashborn. A priority target.' }),
  E({ id: 'stalker', name: 'Riftstalker', behavior: 'blinker', hp: 50, speed: 4.4, radius: 0.4, damage: 13, dmgType: 'lightning', attackRange: 1.0, attackCooldown: 0.9, windup: 0.2, armor: 8, res: { lightning: 50 }, xp: 20, color: '#2a3a5a', accent: '#7ad7ff', drops: [{ item: 'rift_shard', chance: 0.1, min: 1, max: 1 }, { item: 'essence', chance: 0.4, min: 1, max: 2 }], targets: ['tesla', 'capacitor', 'pylon', 'generator'], desc: 'Blinks behind its prey. Watch for the shimmer.' }),
  E({ id: 'moth', name: 'Cinder Moth', behavior: 'flyer', hp: 26, speed: 4.0, radius: 0.4, damage: 7, dmgType: 'fire', attackRange: 1.0, attackCooldown: 1.0, windup: 0.2, armor: 0, res: { fire: 50, lightning: -40 }, xp: 10, flying: true, color: '#5a4a3a', accent: '#ffd27a', drops: [{ item: 'essence', chance: 0.2, min: 1, max: 1 }], targets: ['pylon', 'lamp', 'generator', 'capacitor', 'tesla'], desc: 'Flies over walls toward light and current. Weak to lightning.' }),
  // Mini-boss
  E({ id: 'matriarch', name: 'Slagjaw, Brood Matriarch', behavior: 'matriarch', hp: 1500, speed: 2.4, radius: 1.3, damage: 30, dmgType: 'physical', attackRange: 2.2, attackCooldown: 2.0, windup: 0.8, armor: 30, res: { poison: 50, fire: 20 }, xp: 400, boss: true, color: '#4a3a2a', accent: '#c8ff5a', drops: [{ item: 'matriarch_gland', chance: 1, min: 1, max: 1 }, { item: 'rift_shard', chance: 1, min: 3, max: 6 }, { item: 'venom', chance: 1, min: 5, max: 10 }], targets: ANY, desc: 'Mother of the hive. Charges, spits acid, and calls her brood.' }),
  // Major boss
  E({ id: 'colossus', name: 'The Cinder Colossus', behavior: 'colossus', hp: 5200, speed: 1.6, radius: 1.9, damage: 45, dmgType: 'fire', attackRange: 3.2, attackCooldown: 2.4, windup: 1.0, armor: 50, res: { fire: 70, frost: -20 }, xp: 1500, boss: true, color: '#3a2a26', accent: '#ff6a2a', drops: [{ item: 'colossus_heart', chance: 1, min: 1, max: 1 }, { item: 'rift_shard', chance: 1, min: 8, max: 12 }, { item: 'emberite_ore', chance: 1, min: 20, max: 30 }], targets: ANY, desc: 'An ancient Lattice warden, its core now leaking rift-fire.' }),
];

export const ENEMY_MAP = new Map(ENEMIES.map((e) => [e.id, e]));

export type EliteModId = 'flaming' | 'frozen' | 'shielded' | 'vampiric' | 'teleporting' | 'explosive' | 'enraged' | 'regenerating' | 'summoner' | 'storming';
export interface EliteModDef { id: EliteModId; name: string; color: string; desc: string }
export const ELITE_MODS: EliteModDef[] = [
  { id: 'flaming', name: 'Flaming', color: '#ff6a2a', desc: 'Leaves burning ground; attacks deal extra fire.' },
  { id: 'frozen', name: 'Frostbound', color: '#8ad8ff', desc: 'Periodically releases a chilling nova.' },
  { id: 'shielded', name: 'Warded', color: '#ffe05a', desc: 'Raises a damage shield every few seconds.' },
  { id: 'vampiric', name: 'Vampiric', color: '#d02a3a', desc: 'Heals for damage dealt.' },
  { id: 'teleporting', name: 'Blinking', color: '#c060ff', desc: 'Teleports next to its target.' },
  { id: 'explosive', name: 'Volatile', color: '#ffa03a', desc: 'Explodes violently on death.' },
  { id: 'enraged', name: 'Enraged', color: '#ff3a3a', desc: 'Faster and stronger below half life.' },
  { id: 'regenerating', name: 'Regenerating', color: '#5aff8a', desc: 'Rapidly regenerates life.' },
  { id: 'summoner', name: 'Broodcaller', color: '#a07aff', desc: 'Summons husks.' },
  { id: 'storming', name: 'Stormcharged', color: '#7ad7ff', desc: 'Calls down lightning strikes around itself.' },
];
