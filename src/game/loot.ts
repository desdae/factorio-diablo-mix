import { RARITIES } from '../data/equipment';
import { generateEquip, makeArtifact, equipValue, type Equip } from './items';
import type { Game } from './game';
import type { Level } from './level';
import type { Enemy, LootDrop } from './types';

let dropId = 1;

export function addDrop(g: Game, lvl: Level, x: number, y: number, d: { item?: string; count?: number; equip?: Equip; embers?: number }) {
  // loot filter: below-threshold equipment is auto-salvaged into embers
  if (d.equip && d.equip.rarity < g.settings.lootFilter.minRarity && d.equip.rarity < 4) {
    if (g.settings.lootFilter.autoSalvage) d = { embers: Math.max(1, Math.round(equipValue(d.equip) * 0.3)) };
    else return;
  }
  const drop: LootDrop = { id: dropId++, x: x + g.rng.range(-0.6, 0.6), y: y + g.rng.range(-0.6, 0.6), t: 0, vy: -4 - g.rng.next() * 2, z: 0.1, ...d };
  lvl.loot.push(drop);
  if (drop.equip && drop.equip.rarity >= 3) {
    g.events.emit('loot', { drop });
    g.events.emit('sfx', { name: drop.equip.rarity >= 4 ? 'legendary' : 'rare_drop', x, y });
    if (drop.equip.rarity >= 4) g.events.emit('toast', { text: `${RARITIES[drop.equip.rarity].name} drop: ${drop.equip.name}`, kind: 'legend' });
  }
  return drop;
}

/** Enemy loot tables: embers, crafting materials from data, equipment scaled by level, elite & boss bonuses. */
export function rollDrops(g: Game, lvl: Level, e: Enemy) {
  const rng = g.lootRng;
  const pl = g.player;
  const bounty = lvl.dungeon?.mods.includes('bounty') ? 60 : 0;
  const mf = pl.stats.findRarity + bounty + (e.champion ? 100 : e.minion ? 30 : 0) + (e.def.boss ? 250 : 0);
  if (e.summonedBy) {
    if (rng.chance(0.15)) addDrop(g, lvl, e.x, e.y, { embers: 1 + Math.floor(e.level / 2) });
    return;
  }
  if (rng.chance(0.45 + (e.champion ? 0.5 : 0))) addDrop(g, lvl, e.x, e.y, { embers: Math.round((1 + e.level * 1.6) * rng.range(0.6, 1.4) * (e.champion ? 4 : 1) * (e.def.boss ? 25 : 1)) });
  for (const d of e.def.drops) {
    if (rng.chance(Math.min(1, d.chance * (e.champion ? 2 : 1)))) addDrop(g, lvl, e.x, e.y, { item: d.item, count: rng.int(d.min, d.max) });
  }
  if (pl.stats.legendaries.has('leg_scavenger') && rng.chance(0.15)) addDrop(g, lvl, e.x, e.y, { item: rng.pick(['iron_plate', 'copper_plate', 'gear', 'circuit', 'steel']), count: rng.int(2, 6) });
  if (e.champion) {
    addDrop(g, lvl, e.x, e.y, { item: 'rift_shard', count: rng.int(1, 2) + (bounty ? 1 : 0) });
    if (rng.chance(0.25)) addDrop(g, lvl, e.x, e.y, { item: rng.pick(['rune_ember', 'rune_ward', 'rune_cog', 'rune_blood']), count: 1 });
  }
  let equipCount = 0;
  if (e.def.boss) equipCount = e.def.id === 'colossus' ? 5 : 3;
  else if (e.champion) equipCount = rng.int(1, 3);
  else if (e.minion) equipCount = rng.chance(0.25) ? 1 : 0;
  else equipCount = rng.chance(0.07) ? 1 : 0;
  for (let i = 0; i < equipCount; i++) {
    const eq = generateEquip(rng, { ilvl: e.level + (e.def.boss ? 2 : 0), mf, minRarity: e.def.boss ? 2 : 0 });
    addDrop(g, lvl, e.x, e.y, { equip: eq });
  }
  if (e.def.id === 'colossus' && !g.flags.has('art_colossus')) {
    g.flags.add('art_colossus');
    addDrop(g, lvl, e.x, e.y, { equip: makeArtifact('art_colossus', e.level) });
  }
  if (e.def.id === 'matriarch' && !g.flags.has('art_matriarch')) {
    g.flags.add('art_matriarch');
    addDrop(g, lvl, e.x, e.y, { equip: makeArtifact('art_matriarch', e.level) });
  }
}

export function chestLoot(g: Game, lvl: Level, x: number, y: number, level: number, rich: number) {
  const rng = g.lootRng;
  addDrop(g, lvl, x, y, { embers: Math.round(level * 8 * rich * rng.range(0.8, 1.3)) });
  const n = Math.round(rng.range(1, 2.5) * rich);
  for (let i = 0; i < n; i++) addDrop(g, lvl, x, y, { equip: generateEquip(rng, { ilvl: level, mf: g.player.stats.findRarity + 50 * rich, minRarity: rich > 1.5 ? 2 : 1 }) });
  addDrop(g, lvl, x, y, { item: rng.pick(['iron_plate', 'copper_plate', 'gear', 'circuit', 'coal', 'steel', 'bloodcap']), count: rng.int(5, 15) });
  if (rng.chance(0.3 * rich)) addDrop(g, lvl, x, y, { item: 'rift_shard', count: rng.int(1, 3) });
}
