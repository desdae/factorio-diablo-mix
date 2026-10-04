import { ITEMS, ITEM_MAP, type ItemDef } from './items';

export type BuildingKind =
  | 'belt' | 'splitter' | 'arm' | 'miner' | 'furnace' | 'assembler' | 'generator'
  | 'pylon' | 'vault' | 'lab' | 'turret' | 'tesla' | 'wall' | 'lamp' | 'capacitor' | 'forge' | 'beacon';

export interface BuildingDef {
  id: string;
  name: string;
  kind: BuildingKind;
  w: number;
  h: number;
  hp: number;
  cost: { item: string; count: number }[];
  /** electric draw while working, kW. 0 = not electric */
  power?: number;
  /** burner: consumes fuel items itself, kW equivalent */
  burner?: number;
  /** generator output kW */
  produce?: number;
  speed?: number; // crafting multiplier / belt tiles per second / mining ore per second
  category?: 'smelting' | 'crafting' | 'forge';
  threat?: number; // rift-bleed emission per minute while working
  color: string;
  accent: string;
  desc: string;
  hotkeyGroup: 'logistics' | 'production' | 'power' | 'defense' | 'research';
  light?: number; // light radius in tiles when active
  range?: number;
  unlocked?: boolean; // available without research
}

const B = (d: BuildingDef) => d;

export const BUILDINGS: BuildingDef[] = [
  // Logistics
  B({ id: 'conveyor', name: 'Conveyor', kind: 'belt', w: 1, h: 1, hp: 60, cost: [{ item: 'iron_plate', count: 1 }, { item: 'gear', count: 1 }], speed: 1.9, color: '#3d3a36', accent: '#c9a24a', desc: 'Moves items. Belts pointing into machines feed them; belts leading away collect output.', hotkeyGroup: 'logistics', unlocked: true }),
  B({ id: 'swift_conveyor', name: 'Swift Conveyor', kind: 'belt', w: 1, h: 1, hp: 80, cost: [{ item: 'conveyor', count: 1 }, { item: 'gear', count: 2 }, { item: 'steel', count: 1 }], speed: 3.8, color: '#3a3d45', accent: '#e0473a', desc: 'Twice the throughput of a standard conveyor.', hotkeyGroup: 'logistics' }),
  B({ id: 'distributor', name: 'Distributor', kind: 'splitter', w: 1, h: 1, hp: 90, cost: [{ item: 'iron_plate', count: 4 }, { item: 'circuit', count: 2 }], color: '#433b33', accent: '#7ae0c0', desc: 'Accepts items from any incoming belt and deals them round-robin to outgoing belts. Can filter one item type to the front.', hotkeyGroup: 'logistics' }),
  B({ id: 'arm', name: 'Grapple Arm', kind: 'arm', w: 1, h: 1, hp: 50, cost: [{ item: 'iron_plate', count: 1 }, { item: 'gear', count: 1 }, { item: 'circuit', count: 1 }], power: 13, speed: 1.6, color: '#4a4436', accent: '#f0c050', desc: 'Moves items from the building behind it to the building in front. Can be set to work only while the target holds fewer than N items.', hotkeyGroup: 'logistics' }),
  B({ id: 'vault', name: 'Strongbox', kind: 'vault', w: 1, h: 1, hp: 150, cost: [{ item: 'iron_plate', count: 8 }], color: '#5a4630', accent: '#c9a24a', desc: 'Stores up to 2000 items.', hotkeyGroup: 'logistics', unlocked: true }),
  // Production
  B({ id: 'ember_drill', name: 'Ember Drill', kind: 'miner', w: 2, h: 2, hp: 150, cost: [{ item: 'iron_plate', count: 3 }, { item: 'gear', count: 3 }, { item: 'brick', count: 5 }], burner: 150, speed: 0.4, threat: 10, color: '#4c3b2e', accent: '#ff8a3a', desc: 'Burns fuel to mine the ore beneath it. Outputs to adjacent outgoing belts or machines.', hotkeyGroup: 'production', unlocked: true, light: 2 }),
  B({ id: 'arc_drill', name: 'Arc Drill', kind: 'miner', w: 2, h: 2, hp: 220, cost: [{ item: 'ember_drill', count: 1 }, { item: 'circuit', count: 3 }, { item: 'steel', count: 4 }], power: 90, speed: 0.9, threat: 10, color: '#3a4250', accent: '#6ad0ff', desc: 'Electric miner. Twice as fast as an Ember Drill, no fuel needed.', hotkeyGroup: 'production' }),
  B({ id: 'kiln', name: 'Basalt Kiln', kind: 'furnace', w: 2, h: 2, hp: 200, cost: [{ item: 'stone', count: 5 }], burner: 90, speed: 1, category: 'smelting', threat: 2, color: '#5a514a', accent: '#ff7a2a', desc: 'Burns fuel to smelt ore into plates.', hotkeyGroup: 'production', unlocked: true, light: 3 }),
  B({ id: 'arc_furnace', name: 'Arc Furnace', kind: 'furnace', w: 2, h: 2, hp: 300, cost: [{ item: 'steel', count: 8 }, { item: 'circuit', count: 5 }, { item: 'brick', count: 10 }], power: 180, speed: 2, category: 'smelting', threat: 1, color: '#3e4048', accent: '#7ab0ff', desc: 'Electric smelter. Required for Emberite and Steel at scale.', hotkeyGroup: 'production', light: 3 }),
  B({ id: 'fabricator', name: 'Fabricator', kind: 'assembler', w: 3, h: 3, hp: 300, cost: [{ item: 'iron_plate', count: 9 }, { item: 'gear', count: 5 }, { item: 'circuit', count: 3 }], power: 75, speed: 0.75, category: 'crafting', threat: 4, color: '#3d4446', accent: '#7ae0c0', desc: 'Automatically assembles components from a chosen recipe.', hotkeyGroup: 'production', light: 1 }),
  B({ id: 'fabricator2', name: 'Lattice Fabricator', kind: 'assembler', w: 3, h: 3, hp: 400, cost: [{ item: 'fabricator', count: 1 }, { item: 'ember_core', count: 1 }, { item: 'steel', count: 6 }], power: 150, speed: 1.5, category: 'crafting', threat: 3, color: '#463d50', accent: '#c890ff', desc: 'Lattice-tuned fabricator. Double speed.', hotkeyGroup: 'production', light: 2 }),
  B({ id: 'arms_forge', name: 'Arms Forge', kind: 'forge', w: 3, h: 3, hp: 400, cost: [{ item: 'steel', count: 10 }, { item: 'circuit', count: 5 }, { item: 'brick', count: 20 }], power: 150, speed: 1, category: 'forge', threat: 6, color: '#4a3530', accent: '#ff5a2a', desc: 'Forges randomized equipment from manufactured materials. Better materials guarantee better rarity.', hotkeyGroup: 'production', light: 4 }),
  // Power
  B({ id: 'cinder_engine', name: 'Cinder Engine', kind: 'generator', w: 2, h: 3, hp: 300, cost: [{ item: 'iron_plate', count: 10 }, { item: 'gear', count: 5 }, { item: 'brick', count: 10 }], produce: 900, threat: 15, color: '#4a3c32', accent: '#ffb04a', desc: 'Burns fuel to generate 900 kW. Connect with pylons.', hotkeyGroup: 'power', unlocked: true, light: 3 }),
  B({ id: 'pylon', name: 'Conductor Pylon', kind: 'pylon', w: 1, h: 1, hp: 80, cost: [{ item: 'wood', count: 1 }, { item: 'coil', count: 2 }], color: '#5a4a3a', accent: '#ffd27a', range: 7.5, desc: 'Connects to pylons within 7.5 tiles. Powers buildings within 3 tiles.', hotkeyGroup: 'power', unlocked: true }),
  B({ id: 'capacitor', name: 'Lattice Capacitor', kind: 'capacitor', w: 2, h: 2, hp: 200, cost: [{ item: 'iron_plate', count: 2 }, { item: 'circuit', count: 4 }, { item: 'copper_plate', count: 10 }], color: '#36404a', accent: '#6ad0ff', desc: 'Stores 5 MJ. Lightning damage dealt nearby also recharges it.', hotkeyGroup: 'power' }),
  B({ id: 'glowlamp', name: 'Glowlamp', kind: 'lamp', w: 1, h: 1, hp: 40, cost: [{ item: 'coil', count: 3 }, { item: 'iron_plate', count: 1 }], power: 5, color: '#4a4a40', accent: '#fff0b0', light: 8, desc: 'Lights the night. Lit areas discourage roaming Ashborn.', hotkeyGroup: 'power', unlocked: true }),
  // Research
  B({ id: 'lectern', name: 'Sigil Lectern', kind: 'lab', w: 3, h: 3, hp: 250, cost: [{ item: 'coil', count: 10 }, { item: 'gear', count: 10 }, { item: 'iron_plate', count: 4 }], power: 60, speed: 1, threat: 1, color: '#3e3550', accent: '#c890ff', desc: 'Consumes research sigils to advance the active technology.', hotkeyGroup: 'research', unlocked: true, light: 3 }),
  B({ id: 'beacon', name: 'Lattice Beacon', kind: 'beacon', w: 5, h: 5, hp: 5000, cost: [{ item: 'steel', count: 100 }, { item: 'ember_core', count: 10 }, { item: 'brick', count: 200 }], power: 2000, threat: 40, color: '#2e2a3a', accent: '#ffd27a', desc: 'MEGAPROJECT. Feed it Lattice Frames, Ember Cores and Rune Circuits to reignite the planetary Lattice.', hotkeyGroup: 'research', light: 10 }),
  // Defense
  B({ id: 'bolt_thrower', name: 'Bolt Thrower', kind: 'turret', w: 2, h: 2, hp: 400, cost: [{ item: 'iron_plate', count: 10 }, { item: 'gear', count: 10 }, { item: 'copper_plate', count: 5 }], range: 17, speed: 4, color: '#4a4036', accent: '#e0c080', desc: 'Fires bolts from Bolt Magazines. 18 physical damage per bolt.', hotkeyGroup: 'defense' }),
  B({ id: 'arc_spire', name: 'Arc Spire', kind: 'tesla', w: 2, h: 2, hp: 500, cost: [{ item: 'steel', count: 10 }, { item: 'circuit', count: 10 }, { item: 'coil', count: 20 }], power: 400, range: 14, speed: 1.2, color: '#363a4a', accent: '#8ad8ff', desc: 'Electric tower that chains lightning between foes. Shocked enemies take more damage from all sources.', hotkeyGroup: 'defense', light: 3 }),
  B({ id: 'wall', name: 'Bastion Wall', kind: 'wall', w: 1, h: 1, hp: 450, cost: [{ item: 'brick', count: 5 }], color: '#6a625a', accent: '#8a8278', desc: 'Sturdy wall. Ashborn must break through.', hotkeyGroup: 'defense', unlocked: true }),
];

export const BUILDING_MAP = new Map(BUILDINGS.map((b) => [b.id, b]));

export function buildingDef(id: string): BuildingDef {
  const d = BUILDING_MAP.get(id);
  if (!d) throw new Error(`Unknown building '${id}'`);
  return d;
}

// Every building is also an item kit that can be crafted, carried, belted and placed.
for (const b of BUILDINGS) {
  const kit: ItemDef = {
    id: b.id, name: b.name, category: 'building', stack: b.kind === 'belt' || b.kind === 'wall' || b.kind === 'pylon' ? 100 : 20,
    color: b.accent, shape: 'kit', value: 10, desc: b.desc, building: b.id,
  };
  if (!ITEM_MAP.has(b.id)) {
    ITEMS.push(kit);
    ITEM_MAP.set(b.id, kit);
  }
}
