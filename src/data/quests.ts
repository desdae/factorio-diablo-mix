export type ObjectiveType =
  | 'kill' | 'gather' | 'build' | 'produce' | 'research' | 'survive_wave' | 'kill_boss' | 'enter' | 'talk' | 'equip' | 'craft' | 'deliver_beacon';

export interface QuestDef {
  id: string;
  name: string;
  giver: string;
  text: string; // short, in-character
  hint: string; // tutorial hint shown in tracker
  objective: { type: ObjectiveType; target?: string; count: number };
  rewards: { xp: number; items?: { item: string; count: number }[]; skillPoint?: boolean };
  next?: string;
  unlockMsg?: string;
}

/** Main questline doubles as the first-time-user experience: teaches systems in order. */
export const QUESTS: QuestDef[] = [
  { id: 'q1', name: 'Embers in the Ash', giver: 'Warden Ysolde', text: 'Husks prowl the road. Show me the Kindled can still fight.', hint: 'Move with WASD. Left-click to Cleave, right-click to Shield Rush. Space to dodge.', objective: { type: 'kill', target: 'husk', count: 5 }, rewards: { xp: 60, items: [{ item: 'tonic', count: 3 }] }, next: 'q2' },
  { id: 'q2', name: 'Hands in the Earth', giver: 'Warden Ysolde', text: 'Before we build, we dig. Ferrite and basalt lie west of the gate.', hint: 'Stand near ore or rocks and hold F to mine. Gather ferrite ore and basalt.', objective: { type: 'gather', target: 'iron_ore', count: 10 }, rewards: { xp: 60, items: [{ item: 'coal', count: 20 }, { item: 'iron_plate', count: 20 }] }, next: 'q3' },
  { id: 'q3', name: 'The First Drill', giver: 'Engineer Tamsin Cogg', text: 'My grandmother built drills like this. Set one atop an ore field and feed it cinderstone.', hint: 'Press B for construction. Pick the Ember Drill and place it over ore. Click it and add Cinderstone as fuel.', objective: { type: 'build', target: 'ember_drill', count: 1 }, rewards: { xp: 80, items: [{ item: 'conveyor', count: 20 }] }, next: 'q4' },
  { id: 'q4', name: 'Fire and Iron', giver: 'Engineer Tamsin Cogg', text: 'Run a belt from the drill to a kiln. Let the machines do the walking.', hint: 'Place conveyors (R rotates) from the drill into a Basalt Kiln. Fuel the kiln. Automatically produce 20 ferrite plates.', objective: { type: 'produce', target: 'iron_plate', count: 20 }, rewards: { xp: 120, items: [{ item: 'cinder_engine', count: 1 }, { item: 'pylon', count: 6 }] }, next: 'q5' },
  { id: 'q5', name: 'Spark of the Lattice', giver: 'Engineer Tamsin Cogg', text: 'Engines turn fire into current. Build a lectern and power it.', hint: 'Place a Cinder Engine (fuel it), Conductor Pylons and a Sigil Lectern. Feed Brass Sigils to the lectern and research a technology (T).', objective: { type: 'research', count: 1 }, rewards: { xp: 150, skillPoint: true }, next: 'q6' },
  { id: 'q6', name: 'They Smell the Smoke', giver: 'Warden Ysolde', text: 'Your engines bleed rift-heat. The Ashborn will come. Be ready.', hint: 'Research Siege Ballistics, build Bolt Throwers fed with Bolt Magazines, and walls. Survive an assault on your works.', objective: { type: 'survive_wave', count: 1 }, rewards: { xp: 250, items: [{ item: 'rift_shard', count: 2 }] }, next: 'q7' },
  { id: 'q7', name: 'The Brood Mother', giver: 'Warden Ysolde', text: 'The assaults come from the Hive to the east. Its matriarch must die.', hint: 'Find the Slagjaw hive (marked on the map, M) and slay the Matriarch. Her gland unlocks Bioprocessing.', objective: { type: 'kill_boss', target: 'matriarch', count: 1 }, rewards: { xp: 400, skillPoint: true }, next: 'q8' },
  { id: 'q8', name: 'The Sunken Foundry', giver: 'Archivist Orren', text: 'Beneath the old Wright works lies a warden still burning. Its heart holds the old knowledge.', hint: 'Enter the Sunken Foundry (marked on the map) and defeat the Cinder Colossus.', objective: { type: 'kill_boss', target: 'colossus', count: 1 }, rewards: { xp: 1000, skillPoint: true }, next: 'q9' },
  { id: 'q9', name: 'Heart of the Machine', giver: 'Archivist Orren', text: 'Bring the heart to your lectern. Learn what the Wrights knew.', hint: 'With the Colossus Heart in your inventory, research Arcane Industry.', objective: { type: 'research', target: 'arcane_industry', count: 1 }, rewards: { xp: 600 }, next: 'q10' },
  { id: 'q10', name: 'Rekindle the Lattice', giver: 'Archivist Orren', text: 'The Beacon will decide whether the Lattice heals or burns. Build it.', hint: 'Research The Lattice Beacon, build it, and complete all of its construction stages.', objective: { type: 'deliver_beacon', count: 1 }, rewards: { xp: 5000 } },
];
export const QUEST_MAP = new Map(QUESTS.map((q) => [q.id, q]));
