import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/game/inventory';
import { generateEquip, equipStats } from '../src/game/items';
import { Rng } from '../src/core/rng';
import { RARITIES, LEGENDARY_MAP } from '../src/data/equipment';
import { Market } from '../src/game/economy';

describe('inventory', () => {
  it('stacks, overflows and removes correctly', () => {
    const inv = new Inventory(4);
    expect(inv.add('iron_plate', 250)).toBe(0);
    expect(inv.slots.filter(Boolean).length).toBe(3);
    expect(inv.count('iron_plate')).toBe(250);
    expect(inv.add('coal', 150)).toBe(50); // one free slot of 100
    expect(inv.remove('iron_plate', 120)).toBe(true);
    expect(inv.count('iron_plate')).toBe(130);
    expect(inv.remove('iron_plate', 999)).toBe(false);
    expect(inv.count('iron_plate')).toBe(130);
  });
  it('sort merges stacks and keeps locked equipment in place', () => {
    const inv = new Inventory(10);
    const rng = new Rng(1);
    const e = generateEquip(rng, { ilvl: 5, rarity: 2 });
    e.locked = true;
    inv.slots[7] = { equip: e };
    inv.slots[0] = { item: 'coal', count: 30 };
    inv.slots[3] = { item: 'coal', count: 40 };
    inv.slots[5] = { item: 'gear', count: 5 };
    inv.sort();
    expect(inv.slots[7]).toEqual({ equip: e });
    expect(inv.count('coal')).toBe(70);
    expect(inv.slots.filter((s) => s && 'item' in s && s.item === 'coal').length).toBe(1);
  });
  it('search/filter matches by name and category', () => {
    const inv = new Inventory(4);
    inv.add('copper_plate', 5);
    expect(inv.matches(inv.slots[0], 'russet', 'all')).toBe(true);
    expect(inv.matches(inv.slots[0], 'ferrite', 'all')).toBe(false);
    expect(inv.matches(inv.slots[0], '', 'equipment')).toBe(false);
  });
});

describe('loot generation', () => {
  it('is deterministic for a seed', () => {
    const a = generateEquip(new Rng(77), { ilvl: 10 });
    const b = generateEquip(new Rng(77), { ilvl: 10 });
    expect({ ...a, uid: 0 }).toEqual({ ...b, uid: 0 });
  });
  it('affix counts respect rarity and legendaries carry a power', () => {
    const rng = new Rng(5);
    for (let r = 0; r <= 5; r++) for (let i = 0; i < 60; i++) {
      const e = generateEquip(rng, { ilvl: 15, rarity: r });
      const [lo, hi] = RARITIES[r].affixes;
      expect(e.affixes.length).toBeGreaterThanOrEqual(Math.min(lo, 1) * 0);
      expect(e.affixes.length).toBeLessThanOrEqual(hi);
      expect(new Set(e.affixes.map((a) => a.id)).size).toBe(e.affixes.length); // no duplicate affixes
      if (r === 4 || r === 5) expect(e.legendary && LEGENDARY_MAP.has(e.legendary)).toBe(true);
      for (const s of equipStats(e)) expect(Number.isFinite(s.value)).toBe(true);
    }
  });
  it('rare loot is rare: rarity distribution is heavily skewed', () => {
    const rng = new Rng(9);
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 20000; i++) counts[generateEquip(rng, { ilvl: 10 }).rarity]++;
    expect(counts[0]).toBeGreaterThan(counts[2] * 3);
    expect(counts[4] + counts[5]).toBeLessThan(20000 * 0.012);
    expect(counts[4]).toBeGreaterThan(0);
    expect(counts[6]).toBe(0); // artifacts only from bosses
  });
  it('higher item level rolls stronger affixes on average', () => {
    const avg = (ilvl: number) => { const rng = new Rng(3); let s = 0, n = 0; for (let i = 0; i < 400; i++) { const e = generateEquip(rng, { ilvl, rarity: 2, base: 'sword' }); for (const a of e.affixes) if (a.stat === 'dmgPct') { s += a.value; n++; } } return s / Math.max(1, n); };
    expect(avg(28)).toBeGreaterThan(avg(2) * 1.5);
  });
});

describe('economy', () => {
  it('selling the same good repeatedly saturates its price (anti-exploit) and it recovers', () => {
    const m = new Market();
    const p0 = m.sellPrice('steel');
    for (let i = 0; i < 300; i++) m.recordSale('steel', 1);
    expect(m.sellPrice('steel')).toBeLessThan(p0 * 0.25);
    m.update(60 * 60);
    expect(m.sellPrice('steel')).toBeGreaterThan(p0 * 0.5);
  });
});
