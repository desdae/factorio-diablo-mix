import { BUILDINGS } from './buildings';

export interface Stack { item: string; count: number }

export interface RecipeDef {
  id: string;
  name: string;
  inputs: Stack[];
  outputs: Stack[];
  time: number; // seconds at speed 1
  category: 'smelting' | 'crafting' | 'forge';
  handcraft: boolean;
  unlocked?: boolean;
  /** forge recipes produce a rolled equipment item instead of stacks */
  forge?: { kind: 'weapon' | 'armor' | 'jewel'; minRarity: number; ilvl: number };
}

const R = (d: RecipeDef) => d;

export const RECIPES: RecipeDef[] = [
  // Smelting (automatic selection by input)
  R({ id: 'smelt_iron', name: 'Ferrite Plate', inputs: [{ item: 'iron_ore', count: 1 }], outputs: [{ item: 'iron_plate', count: 1 }], time: 3.2, category: 'smelting', handcraft: false, unlocked: true }),
  R({ id: 'smelt_copper', name: 'Russet Plate', inputs: [{ item: 'copper_ore', count: 1 }], outputs: [{ item: 'copper_plate', count: 1 }], time: 3.2, category: 'smelting', handcraft: false, unlocked: true }),
  R({ id: 'smelt_brick', name: 'Basalt Brick', inputs: [{ item: 'stone', count: 2 }], outputs: [{ item: 'brick', count: 1 }], time: 3.2, category: 'smelting', handcraft: false, unlocked: true }),
  R({ id: 'smelt_steel', name: 'Tempered Steel', inputs: [{ item: 'iron_plate', count: 5 }], outputs: [{ item: 'steel', count: 1 }], time: 16, category: 'smelting', handcraft: false }),
  R({ id: 'smelt_ember', name: 'Ember Ingot', inputs: [{ item: 'emberite_ore', count: 2 }], outputs: [{ item: 'ember_ingot', count: 1 }], time: 8, category: 'smelting', handcraft: false }),
  // Components
  R({ id: 'gear', name: 'Cog Wheel', inputs: [{ item: 'iron_plate', count: 2 }], outputs: [{ item: 'gear', count: 1 }], time: 0.5, category: 'crafting', handcraft: true, unlocked: true }),
  R({ id: 'coil', name: 'Russet Coil', inputs: [{ item: 'copper_plate', count: 1 }], outputs: [{ item: 'coil', count: 2 }], time: 0.5, category: 'crafting', handcraft: true, unlocked: true }),
  R({ id: 'circuit', name: 'Rune Circuit', inputs: [{ item: 'iron_plate', count: 1 }, { item: 'coil', count: 3 }], outputs: [{ item: 'circuit', count: 1 }], time: 0.5, category: 'crafting', handcraft: true, unlocked: true }),
  R({ id: 'ember_core', name: 'Ember Core', inputs: [{ item: 'ember_ingot', count: 2 }, { item: 'circuit', count: 4 }, { item: 'essence', count: 5 }], outputs: [{ item: 'ember_core', count: 1 }], time: 10, category: 'crafting', handcraft: false }),
  R({ id: 'lattice_frame', name: 'Lattice Frame', inputs: [{ item: 'steel', count: 4 }, { item: 'ember_core', count: 1 }, { item: 'brick', count: 10 }], outputs: [{ item: 'lattice_frame', count: 1 }], time: 20, category: 'crafting', handcraft: false }),
  // Research
  R({ id: 'sigil_brass', name: 'Brass Sigil', inputs: [{ item: 'copper_plate', count: 1 }, { item: 'gear', count: 1 }], outputs: [{ item: 'sigil_brass', count: 1 }], time: 5, category: 'crafting', handcraft: true, unlocked: true }),
  R({ id: 'sigil_iron', name: 'Iron Sigil', inputs: [{ item: 'circuit', count: 1 }, { item: 'gear', count: 1 }, { item: 'bolts', count: 1 }], outputs: [{ item: 'sigil_iron', count: 1 }], time: 6, category: 'crafting', handcraft: true }),
  R({ id: 'sigil_ember', name: 'Ember Sigil', inputs: [{ item: 'ember_ingot', count: 1 }, { item: 'steel', count: 1 }, { item: 'essence', count: 2 }], outputs: [{ item: 'sigil_ember', count: 2 }], time: 12, category: 'crafting', handcraft: false }),
  // Ammo & consumables (industry feeds combat)
  R({ id: 'bolts', name: 'Bolt Magazine', inputs: [{ item: 'iron_plate', count: 2 }, { item: 'wood', count: 1 }], outputs: [{ item: 'bolts', count: 2 }], time: 1, category: 'crafting', handcraft: true }),
  R({ id: 'tonic', name: 'Mending Tonic', inputs: [{ item: 'bloodcap', count: 2 }, { item: 'iron_plate', count: 1 }], outputs: [{ item: 'tonic', count: 1 }], time: 2, category: 'crafting', handcraft: true, unlocked: true }),
  R({ id: 'charge', name: 'Blast Charge', inputs: [{ item: 'coal', count: 2 }, { item: 'iron_plate', count: 1 }, { item: 'venom', count: 1 }], outputs: [{ item: 'charge', count: 2 }], time: 2, category: 'crafting', handcraft: true }),
  R({ id: 'rune_ember', name: 'Ember Rune', inputs: [{ item: 'ember_ingot', count: 1 }, { item: 'rift_shard', count: 2 }], outputs: [{ item: 'rune_ember', count: 1 }], time: 8, category: 'crafting', handcraft: false }),
  R({ id: 'rune_ward', name: 'Ward Rune', inputs: [{ item: 'steel', count: 3 }, { item: 'rift_shard', count: 2 }], outputs: [{ item: 'rune_ward', count: 1 }], time: 8, category: 'crafting', handcraft: false }),
  R({ id: 'rune_cog', name: 'Cog Rune', inputs: [{ item: 'gear', count: 10 }, { item: 'circuit', count: 4 }, { item: 'rift_shard', count: 2 }], outputs: [{ item: 'rune_cog', count: 1 }], time: 8, category: 'crafting', handcraft: false }),
  R({ id: 'rune_blood', name: 'Blood Rune', inputs: [{ item: 'bloodcap', count: 10 }, { item: 'essence', count: 4 }, { item: 'rift_shard', count: 2 }], outputs: [{ item: 'rune_blood', count: 1 }], time: 8, category: 'crafting', handcraft: false }),
  // Arms Forge
  R({ id: 'forge_weapon', name: 'Forge Weapon', inputs: [{ item: 'steel', count: 6 }, { item: 'gear', count: 4 }, { item: 'chitin', count: 5 }], outputs: [], time: 20, category: 'forge', handcraft: false, forge: { kind: 'weapon', minRarity: 1, ilvl: 8 } }),
  R({ id: 'forge_armor', name: 'Forge Armor', inputs: [{ item: 'steel', count: 8 }, { item: 'brick', count: 6 }, { item: 'bone', count: 6 }], outputs: [], time: 20, category: 'forge', handcraft: false, forge: { kind: 'armor', minRarity: 1, ilvl: 8 } }),
  R({ id: 'forge_master', name: 'Masterwork Arms', inputs: [{ item: 'steel', count: 10 }, { item: 'ember_core', count: 1 }, { item: 'essence', count: 10 }], outputs: [], time: 30, category: 'forge', handcraft: false, forge: { kind: 'weapon', minRarity: 2, ilvl: 14 } }),
  R({ id: 'forge_jewel', name: 'Forge Jewelry', inputs: [{ item: 'ember_ingot', count: 3 }, { item: 'circuit', count: 4 }, { item: 'rift_shard', count: 1 }], outputs: [], time: 25, category: 'forge', handcraft: false, forge: { kind: 'jewel', minRarity: 2, ilvl: 12 } }),
];

// Building kit recipes generated from building costs.
for (const b of BUILDINGS) {
  RECIPES.push({
    id: b.id, name: b.name, inputs: b.cost, outputs: [{ item: b.id, count: 1 }],
    time: 0.5 + b.w * b.h * 0.3, category: 'crafting', handcraft: b.kind !== 'beacon', unlocked: b.unlocked,
  });
}

export const RECIPE_MAP = new Map(RECIPES.map((r) => [r.id, r]));

export const SMELTING_BY_INPUT = new Map<string, RecipeDef>();
for (const r of RECIPES) if (r.category === 'smelting') SMELTING_BY_INPUT.set(r.inputs[0].item, r);
