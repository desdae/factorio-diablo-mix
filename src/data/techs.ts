export interface TechDef {
  id: string;
  name: string;
  desc: string;
  tier: number;
  prereqs: string[];
  cost: { item: string; count: number }[]; // consumed sigils per unit
  units: number;
  unitTime: number; // seconds per unit at lab speed 1
  /** special items that must be delivered by hand (boss relics) */
  relic?: string;
  unlocks: string[]; // recipe ids (building recipes share building ids)
  bonus?: { stat: 'beltSpeed' | 'miningSpeed' | 'turretDamage' | 'labSpeed' | 'craftSpeed' | 'drones'; value: number };
  category: 'logistics' | 'metallurgy' | 'energy' | 'construction' | 'military' | 'arcane' | 'automation';
}

const T = (d: TechDef) => d;

export const TECHS: TechDef[] = [
  T({ id: 'automation', name: 'Mechanized Assembly', tier: 1, category: 'automation', desc: 'Fabricators and Grapple Arms: the foundation of automation.', prereqs: [], cost: [{ item: 'sigil_brass', count: 1 }], units: 10, unitTime: 6, unlocks: ['fabricator', 'arm'] }),
  T({ id: 'ballistics', name: 'Siege Ballistics', tier: 1, category: 'military', desc: 'Bolt Throwers and Bolt Magazines to hold the walls.', prereqs: [], cost: [{ item: 'sigil_brass', count: 1 }], units: 10, unitTime: 6, unlocks: ['bolt_thrower', 'bolts'] }),
  T({ id: 'logistics', name: 'Routed Logistics', tier: 1, category: 'logistics', desc: 'Distributors for splitting and filtering item flow.', prereqs: ['automation'], cost: [{ item: 'sigil_brass', count: 1 }], units: 20, unitTime: 6, unlocks: ['distributor'] }),
  T({ id: 'drones', name: 'Construction Wisps', tier: 1, category: 'construction', desc: '+2 personal construction wisps that build ghosts from your inventory.', prereqs: ['automation'], cost: [{ item: 'sigil_brass', count: 1 }], units: 25, unitTime: 6, unlocks: [], bonus: { stat: 'drones', value: 2 } }),
  T({ id: 'alchemy', name: 'Volatile Alchemy', tier: 2, category: 'military', desc: 'Blast Charges for the hero.', prereqs: ['ballistics'], cost: [{ item: 'sigil_brass', count: 1 }], units: 20, unitTime: 8, unlocks: ['charge'] }),
  T({ id: 'metallurgy', name: 'Tempered Metallurgy', tier: 2, category: 'metallurgy', desc: 'Smelt Tempered Steel from ferrite plates.', prereqs: ['automation'], cost: [{ item: 'sigil_brass', count: 1 }], units: 30, unitTime: 8, unlocks: ['smelt_steel'] }),
  T({ id: 'applied', name: 'Applied Sigilry', tier: 2, category: 'automation', desc: 'Iron Sigils: second-tier research focus.', prereqs: ['metallurgy', 'ballistics'], cost: [{ item: 'sigil_brass', count: 1 }], units: 30, unitTime: 8, unlocks: ['sigil_iron'] }),
  T({ id: 'electrification', name: 'Electrified Industry', tier: 2, category: 'energy', desc: 'Arc Drills and Arc Furnaces.', prereqs: ['applied'], cost: [{ item: 'sigil_brass', count: 1 }, { item: 'sigil_iron', count: 1 }], units: 40, unitTime: 10, unlocks: ['arc_drill', 'arc_furnace'] }),
  T({ id: 'swift_logistics', name: 'Swift Logistics', tier: 2, category: 'logistics', desc: 'Swift Conveyors move twice as many items.', prereqs: ['logistics', 'applied'], cost: [{ item: 'sigil_brass', count: 1 }, { item: 'sigil_iron', count: 1 }], units: 40, unitTime: 10, unlocks: ['swift_conveyor'] }),
  T({ id: 'capacitors', name: 'Lattice Capacitance', tier: 2, category: 'energy', desc: 'Capacitors store energy for emergencies and absorb lightning.', prereqs: ['electrification'], cost: [{ item: 'sigil_brass', count: 1 }, { item: 'sigil_iron', count: 1 }], units: 40, unitTime: 10, unlocks: ['capacitor'] }),
  T({ id: 'arc_defense', name: 'Arc Defense', tier: 2, category: 'military', desc: 'Arc Spires: power-hungry chain lightning towers.', prereqs: ['electrification'], cost: [{ item: 'sigil_brass', count: 1 }, { item: 'sigil_iron', count: 1 }], units: 50, unitTime: 10, unlocks: ['arc_spire'] }),
  T({ id: 'turret_dmg', name: 'Hardened Bolts', tier: 2, category: 'military', desc: '+30% turret damage.', prereqs: ['ballistics', 'applied'], cost: [{ item: 'sigil_brass', count: 1 }, { item: 'sigil_iron', count: 1 }], units: 50, unitTime: 10, unlocks: [], bonus: { stat: 'turretDamage', value: 0.3 } }),
  T({ id: 'armsmith', name: 'Armsmithing', tier: 2, category: 'metallurgy', desc: 'The Arms Forge: manufacture randomized equipment.', prereqs: ['metallurgy', 'applied'], cost: [{ item: 'sigil_brass', count: 1 }, { item: 'sigil_iron', count: 1 }], units: 40, unitTime: 10, unlocks: ['arms_forge', 'forge_weapon', 'forge_armor'] }),
  T({ id: 'mining_prod', name: 'Deep Boring', tier: 2, category: 'metallurgy', desc: '+25% mining speed (drills and by hand).', prereqs: ['electrification'], cost: [{ item: 'sigil_brass', count: 1 }, { item: 'sigil_iron', count: 1 }], units: 60, unitTime: 10, unlocks: [], bonus: { stat: 'miningSpeed', value: 0.25 } }),
  T({ id: 'bioprocess', name: 'Bioprocessing', tier: 2, category: 'arcane', desc: 'Requires the Matriarch Gland. Unlocks Blood Runes and +1 drone.', prereqs: ['applied'], relic: 'matriarch_gland', cost: [{ item: 'sigil_iron', count: 1 }], units: 30, unitTime: 10, unlocks: ['rune_blood'], bonus: { stat: 'drones', value: 1 } }),
  T({ id: 'arcane_industry', name: 'Arcane Industry', tier: 3, category: 'arcane', desc: 'Requires the Colossus Heart. Emberite smelting, Ember Cores and Ember Sigils.', prereqs: ['electrification'], relic: 'colossus_heart', cost: [{ item: 'sigil_brass', count: 1 }, { item: 'sigil_iron', count: 1 }], units: 50, unitTime: 12, unlocks: ['smelt_ember', 'ember_core', 'sigil_ember', 'rune_ember', 'rune_ward', 'rune_cog'] }),
  T({ id: 'masterwork', name: 'Masterwork Forging', tier: 3, category: 'arcane', desc: 'Masterwork Arms (guaranteed Rare+) and forged jewelry.', prereqs: ['arcane_industry', 'armsmith'], cost: [{ item: 'sigil_iron', count: 1 }, { item: 'sigil_ember', count: 1 }], units: 60, unitTime: 15, unlocks: ['forge_master', 'forge_jewel'] }),
  T({ id: 'lattice_fab', name: 'Lattice Fabrication', tier: 3, category: 'automation', desc: 'Lattice Fabricators work twice as fast.', prereqs: ['arcane_industry'], cost: [{ item: 'sigil_iron', count: 1 }, { item: 'sigil_ember', count: 1 }], units: 80, unitTime: 15, unlocks: ['fabricator2'] }),
  T({ id: 'beacon', name: 'The Lattice Beacon', tier: 4, category: 'arcane', desc: 'Megaproject: rekindle the planetary Lattice.', prereqs: ['lattice_fab', 'masterwork'], cost: [{ item: 'sigil_brass', count: 1 }, { item: 'sigil_iron', count: 1 }, { item: 'sigil_ember', count: 1 }], units: 200, unitTime: 20, unlocks: ['beacon', 'lattice_frame'] }),
];

export const TECH_MAP = new Map(TECHS.map((t) => [t.id, t]));
