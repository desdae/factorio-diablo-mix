/**
 * Stackable item definitions (resources, materials, components, consumables, building kits).
 * Equipment is generated at runtime from bases in equipment.ts and is not listed here.
 */
export type ItemCategory =
  | 'resource' | 'biological' | 'arcane' | 'material' | 'component'
  | 'sigil' | 'ammo' | 'consumable' | 'building' | 'rune' | 'relic';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  stack: number;
  color: string;
  /** glyph shape used by procedural icon renderer */
  shape: 'ore' | 'plate' | 'gear' | 'coil' | 'chip' | 'orb' | 'vial' | 'sigil' | 'bolt' | 'log' | 'brick' | 'kit' | 'rune' | 'shard' | 'bone' | 'heart' | 'bomb' | 'crate';
  fuel?: number; // kJ of energy when burned
  value: number; // base trade value
  desc: string;
  building?: string; // building id placed by this kit
}

const I = (d: ItemDef) => d;

export const ITEMS: ItemDef[] = [
  // ── Basic resources
  I({ id: 'wood', name: 'Ashwood Log', category: 'resource', stack: 100, color: '#8a5a32', shape: 'log', fuel: 2000, value: 1, desc: 'Charred timber from the ash-choked groves. Burns slowly.' }),
  I({ id: 'stone', name: 'Basalt', category: 'resource', stack: 100, color: '#7d7a78', shape: 'ore', value: 1, desc: 'Dense volcanic rock.' }),
  I({ id: 'iron_ore', name: 'Ferrite Ore', category: 'resource', stack: 100, color: '#8fa2b8', shape: 'ore', value: 2, desc: 'Iron-rich ore streaked with blue.' }),
  I({ id: 'copper_ore', name: 'Russet Ore', category: 'resource', stack: 100, color: '#d4774a', shape: 'ore', value: 2, desc: 'Copper ore that hums faintly near rift-bleed.' }),
  I({ id: 'coal', name: 'Cinderstone', category: 'resource', stack: 100, color: '#3a3433', shape: 'ore', fuel: 4000, value: 2, desc: 'Combustible black rock. The lifeblood of early industry.' }),
  I({ id: 'emberite_ore', name: 'Emberite Ore', category: 'resource', stack: 50, color: '#ff6a2a', shape: 'ore', value: 12, desc: 'Ore saturated with ancient Lattice heat. Requires arc smelting.' }),
  I({ id: 'bloodcap', name: 'Bloodcap', category: 'biological', stack: 50, color: '#b8323f', shape: 'orb', value: 3, desc: 'A crimson fungus with restorative sap.' }),
  // ── Biological
  I({ id: 'chitin', name: 'Husk Chitin', category: 'biological', stack: 100, color: '#5b4a3a', shape: 'shard', value: 3, desc: 'Brittle carapace plates from Ashborn husks.' }),
  I({ id: 'venom', name: 'Bile Gland', category: 'biological', stack: 50, color: '#8fcf3a', shape: 'vial', value: 5, desc: 'Caustic organ harvested from spitters.' }),
  I({ id: 'bone', name: 'Scorched Bone', category: 'biological', stack: 100, color: '#d9cfb8', shape: 'bone', value: 2, desc: 'Bones hardened by rift-heat.' }),
  // ── Arcane
  I({ id: 'essence', name: 'Rift Essence', category: 'arcane', stack: 100, color: '#b56cff', shape: 'orb', value: 8, desc: 'Condensed rift-bleed drawn from slain Ashborn.' }),
  I({ id: 'rift_shard', name: 'Rift Shard', category: 'arcane', stack: 50, color: '#7ad7ff', shape: 'shard', value: 20, desc: 'A sliver of fractured reality. Used to reforge equipment.' }),
  I({ id: 'colossus_heart', name: 'Colossus Heart', category: 'relic', stack: 5, color: '#ff8a3a', shape: 'heart', value: 500, desc: 'The still-burning core of the Cinder Colossus. Unlocks Arcane Industry research.' }),
  I({ id: 'matriarch_gland', name: 'Matriarch Gland', category: 'relic', stack: 5, color: '#c8ff5a', shape: 'heart', value: 200, desc: 'Brood organ of Slagjaw. Unlocks Bioprocessing research.' }),
  // ── Materials
  I({ id: 'iron_plate', name: 'Ferrite Plate', category: 'material', stack: 100, color: '#b6c3cf', shape: 'plate', value: 3, desc: 'Smelted ferrite.' }),
  I({ id: 'copper_plate', name: 'Russet Plate', category: 'material', stack: 100, color: '#e48a5a', shape: 'plate', value: 3, desc: 'Smelted russet copper.' }),
  I({ id: 'brick', name: 'Basalt Brick', category: 'material', stack: 100, color: '#a59e95', shape: 'brick', value: 2, desc: 'Kiln-fired basalt brick.' }),
  I({ id: 'steel', name: 'Tempered Steel', category: 'material', stack: 100, color: '#dfe7ef', shape: 'plate', value: 12, desc: 'Ferrite plate re-smelted with cinderstone carbon.' }),
  I({ id: 'ember_ingot', name: 'Ember Ingot', category: 'material', stack: 50, color: '#ff9a3a', shape: 'plate', value: 30, desc: 'Emberite refined in an arc furnace. Warm to the touch.' }),
  // ── Components
  I({ id: 'gear', name: 'Cog Wheel', category: 'component', stack: 100, color: '#9aa8b4', shape: 'gear', value: 7, desc: 'The humblest mechanism.' }),
  I({ id: 'coil', name: 'Russet Coil', category: 'component', stack: 200, color: '#f0a070', shape: 'coil', value: 2, desc: 'Drawn copper wire.' }),
  I({ id: 'circuit', name: 'Rune Circuit', category: 'component', stack: 100, color: '#5ad08a', shape: 'chip', value: 14, desc: 'Etched plate that channels current along sigil paths.' }),
  I({ id: 'ember_core', name: 'Ember Core', category: 'component', stack: 50, color: '#ffb84a', shape: 'orb', value: 90, desc: 'A stabilized heart of Lattice fire.' }),
  I({ id: 'lattice_frame', name: 'Lattice Frame', category: 'component', stack: 50, color: '#ffd27a', shape: 'crate', value: 160, desc: 'Megastructure segment for the Beacon.' }),
  // ── Research sigils
  I({ id: 'sigil_brass', name: 'Brass Sigil', category: 'sigil', stack: 200, color: '#e0a040', shape: 'sigil', value: 10, desc: 'Basic research focus.' }),
  I({ id: 'sigil_iron', name: 'Iron Sigil', category: 'sigil', stack: 200, color: '#8fb0d0', shape: 'sigil', value: 25, desc: 'Applied research focus.' }),
  I({ id: 'sigil_ember', name: 'Ember Sigil', category: 'sigil', stack: 200, color: '#ff6a3a', shape: 'sigil', value: 80, desc: 'Arcane research focus. Requires the Colossus Heart to understand.' }),
  // ── Ammo & consumables
  I({ id: 'bolts', name: 'Bolt Magazine', category: 'ammo', stack: 100, color: '#c7b089', shape: 'bolt', value: 4, desc: 'Ammunition for Bolt Throwers.' }),
  I({ id: 'tonic', name: 'Mending Tonic', category: 'consumable', stack: 20, color: '#ff4a5a', shape: 'vial', value: 15, desc: 'Restores 45% life over 2 seconds. [Q]' }),
  I({ id: 'charge', name: 'Blast Charge', category: 'consumable', stack: 20, color: '#ffa03a', shape: 'bomb', value: 12, desc: 'Thrown explosive dealing heavy fire damage. [G]' }),
  // ── Runes
  I({ id: 'rune_ember', name: 'Ember Rune', category: 'rune', stack: 20, color: '#ff6a3a', shape: 'rune', value: 40, desc: 'Socket: +8% fire damage. Pairs with Cog Rune: Molten Gears.' }),
  I({ id: 'rune_ward', name: 'Ward Rune', category: 'rune', stack: 20, color: '#6ab0ff', shape: 'rune', value: 40, desc: 'Socket: +60 armor. Pairs with Ember Rune: Kiln Ward.' }),
  I({ id: 'rune_cog', name: 'Cog Rune', category: 'rune', stack: 20, color: '#d0c080', shape: 'rune', value: 40, desc: 'Socket: +10% turret damage. Pairs with Ember Rune: Molten Gears.' }),
  I({ id: 'rune_blood', name: 'Blood Rune', category: 'rune', stack: 20, color: '#d02a3a', shape: 'rune', value: 40, desc: 'Socket: 1.5% life leech. Pairs with Ward Rune: Iron Vein.' }),
];

export const ITEM_MAP = new Map(ITEMS.map((i) => [i.id, i]));

export function itemDef(id: string): ItemDef {
  const d = ITEM_MAP.get(id);
  if (!d) throw new Error(`Unknown item '${id}'`);
  return d;
}
