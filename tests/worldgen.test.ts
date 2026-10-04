import { describe, it, expect } from 'vitest';
import { generateOverworld, floodReach } from '../src/world/worldgen';
import { generateDungeon } from '../src/world/dungeon';
import { Res } from '../src/world/map';

describe('procedural generation', () => {
  it('is deterministic for a seed', () => {
    const a = generateOverworld({ seed: 1234 });
    const b = generateOverworld({ seed: 1234 });
    expect(Buffer.from(a.terrain)).toEqual(Buffer.from(b.terrain));
    expect(Buffer.from(a.amt.buffer)).toEqual(Buffer.from(b.amt.buffer));
    expect(a.pois).toEqual(b.pois);
  });
  it('different seeds produce different worlds', () => {
    const a = generateOverworld({ seed: 1 });
    const b = generateOverworld({ seed: 2 });
    let diff = 0;
    for (let i = 0; i < a.terrain.length; i++) if (a.terrain[i] !== b.terrain[i]) diff++;
    expect(diff).toBeGreaterThan(a.terrain.length * 0.2);
  });
  for (const seed of [7, 99, 2024, 31337, 555555]) {
    it(`seed ${seed}: all points of interest are reachable and starter resources exist`, () => {
      const m = generateOverworld({ seed });
      const settle = m.pois.find((p) => p.kind === 'settlement')!;
      const reach = floodReach(m, settle.x, settle.y);
      for (const p of m.pois) expect(reach[m.idx(p.x, p.y)], `${p.kind} ${p.name} at ${p.x},${p.y}`).toBe(1);
      const spawn = m.pois.find((p) => p.kind === 'spawn')!;
      for (const r of [Res.Iron, Res.Copper, Res.Coal, Res.Stone]) {
        let found = 0;
        for (let y = spawn.y - 22; y <= spawn.y + 22; y++) for (let x = spawn.x - 22; x <= spawn.x + 22; x++) if (m.res[m.idx(x, y)] === r && m.amt[m.idx(x, y)] > 0) found++;
        expect(found, `resource ${r} near spawn`).toBeGreaterThan(8);
      }
      // no resources inside solid terrain
      for (let i = 0; i < m.res.length; i++) if (m.res[i]) expect([3, 4, 5, 9]).not.toContain(m.terrain[i]);
      expect(m.pois.filter((p) => p.kind === 'nest').length).toBeGreaterThan(0);
      expect(m.pois.some((p) => p.kind === 'dungeon')).toBe(true);
      expect(m.pois.some((p) => p.kind === 'hive')).toBe(true);
    });
  }
  it('dungeons: every room reachable, boss arena exists, depth scales modifiers', () => {
    for (let depth = 1; depth <= 6; depth++) {
      const d = generateDungeon(4242, depth);
      const reach = floodReach(d.map, Math.floor(d.start.x), Math.floor(d.start.y));
      for (const r of d.rooms) {
        // at least one floor tile of every room reachable
        let ok = false;
        for (let y = r.y; y < r.y + r.h && !ok; y++) for (let x = r.x; x < r.x + r.w && !ok; x++) if (reach[d.map.idx(x, y)]) ok = true;
        expect(ok, `room ${r.kind} depth ${depth}`).toBe(true);
      }
      expect(d.rooms.filter((r) => r.kind === 'boss').length).toBe(1);
      expect(d.mods.length).toBe(depth <= 1 ? 0 : Math.min(4, Math.floor((depth + 1) / 2)));
    }
  });
});
