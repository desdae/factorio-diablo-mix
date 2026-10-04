import { describe, it, expect } from 'vitest';
import { Game } from '../src/game/game';
import { emptyInput } from '../src/game/playerControl';
import { spawnEnemy } from '../src/game/combat';
import { Res } from '../src/world/map';
import { generateEquip } from '../src/game/items';

/**
 * Builds a megabase: 2,000 production lines, each  [drill]→5 belts→[furnace]→[vault], rows separated by pylon lanes.
 * ≥10,000 belt segments · 4,000 production machines · ≥100,000 logical items · 100 generators on one grid · 500 enemies.
 */
function megabase() {
  const g = new Game({ seed: 'megabase', size: 480 });
  const m = g.overworld;
  const f = g.factory;
  g.god = true;
  for (const t of ['automation', 'ballistics', 'metallurgy', 'applied', 'electrification']) g.research.complete(require_tech(t));
  const X0 = 20, Y0 = 20, COLS = 40, ROWS = 50, LW = 11, RH = 3;
  // clear region
  for (let y = Y0 - 1; y < Y0 + ROWS * RH + 2; y++) for (let x = X0 - 3; x < X0 + COLS * LW + 2; x++) { const i = m.idx(x, y); m.terrain[i] = 0; m.tree[i] = 0; m.prop[i] = 0; m.res[i] = 0; m.amt[i] = 0; }
  let belts = 0, machines = 0, gens = 0;
  for (let r = 0; r < ROWS; r++) {
    const y = Y0 + r * RH;
    // generator at row start (2x3 fills the row band), pylon lane on y+2
    f.place('cinder_engine', X0 - 3, y, 0, true)!.input.set('coal', 20); gens++;
    for (let x = X0; x < X0 + COLS * LW; x += 6) f.place('pylon', x, y + 2, 0, true);
    for (let c = 0; c < COLS; c++) {
      const x = X0 + c * LW;
      for (let k = 0; k < 4; k++) { const i = m.idx(x + (k % 2), y + (k >> 1)); m.res[i] = Res.Iron; m.amt[i] = 100000; }
      const electric = c < 10;
      const d = f.place(electric ? 'arc_drill' : 'ember_drill', x, y, 0, true)!; machines++;
      if (!electric) d.input.set('coal', 10);
      for (let b = 0; b < 5; b++) { const belt = f.place('conveyor', x + 2 + b, y, 0, true)!; belt.bItems = [2, 2, 2]; belt.bPos = [0.9, 0.6, 0.3]; belts++; }
      const fu = f.place(electric ? 'arc_furnace' : 'kiln', x + 7, y, 0, true)!; machines++;
      if (!electric) fu.input.set('coal', 10);
      fu.input.set('iron_ore', 8);
      const v = f.place('vault', x + 9, y, 0, true)!;
      v.input.set('iron_plate', 25 + ((c * 7 + r) % 10));
      v.input.set('stone', 15);
    }
  }
  return { g, belts, machines, gens };
}

import { TECH_MAP } from '../src/data/techs';
function require_tech(id: string) { return TECH_MAP.get(id)!; }

describe('stress benchmarks', () => {
  it('factory megabase: ≥10k belts, ≥2k machines, ≥100k items, 500 enemies stays within frame budget', () => {
    const t0 = performance.now();
    const { g, belts, machines, gens } = megabase();
    const buildMs = performance.now() - t0;
    // 500 active enemies: half assault the base, half engage the hero elsewhere
    const pl = g.player;
    pl.x = 300; pl.y = 300;
    const m = g.overworld;
    for (let y = 280; y < 330; y++) for (let x = 280; x < 330; x++) { const i = m.idx(x, y); m.terrain[i] = 0; m.tree[i] = 0; m.prop[i] = 0; }
    for (let i = 0; i < 250; i++) spawnEnemy(g, g.over, ['husk', 'spitter', 'brute', 'moth'][i % 4], 300 + Math.cos(i) * 12, 300 + Math.sin(i) * 12, { level: 5 }).aggro = true;
    for (let i = 0; i < 250; i++) spawnEnemy(g, g.over, ['husk', 'bloat', 'tunneler', 'moth'][i % 4], 200 + (i % 25) * 4, 200 + Math.floor(i / 25) * 3, { level: 5, wave: true });
    const items = g.factory.totalItems();
    expect(belts).toBeGreaterThanOrEqual(10000);
    expect(machines).toBeGreaterThanOrEqual(2000);
    expect(items).toBeGreaterThanOrEqual(100000);
    expect(g.over.enemies.length).toBeGreaterThanOrEqual(500);
    const inp = emptyInput();
    for (let i = 0; i < 30; i++) g.update(1 / 60, inp); // warm-up (JIT, nav fields)
    const N = 300;
    const samples: number[] = [];
    for (let i = 0; i < N; i++) { const a = performance.now(); g.update(1 / 60, inp); samples.push(performance.now() - a); }
    samples.sort((a, b) => a - b);
    const avg = samples.reduce((s, v) => s + v, 0) / N;
    const p95 = samples[Math.floor(N * 0.95)];
    const nets = g.power.nets.length;
    const working = [...g.factory.buildings.values()].filter((b) => b.status === 'working').length;
    console.log(`[megabase] build ${buildMs.toFixed(0)}ms · belts ${belts} · machines ${machines} · generators ${gens} · items ${items} · enemies ${g.over.enemies.filter((e) => !e.dead).length} · power nets ${nets} · working ${working} · tick avg ${avg.toFixed(2)}ms p95 ${p95.toFixed(2)}ms`);
    expect(nets).toBe(1);
    expect(working).toBeGreaterThan(2000);
    // Simulation must stay well inside a 60 FPS frame (16.7 ms) including rendering headroom.
    expect(avg).toBeLessThan(12);
  });

  it('combat stress: 220 monsters, projectiles, statuses and skills stay responsive', () => {
    const g = new Game({ seed: 'arena' });
    const pl = g.player;
    g.god = true;
    const m = g.overworld;
    for (let y = Math.floor(pl.y) - 20; y < pl.y + 20; y++) for (let x = Math.floor(pl.x) - 20; x < pl.x + 20; x++) { const i = m.idx(x, y); m.terrain[i] = 0; m.tree[i] = 0; m.prop[i] = 0; }
    const kinds = ['husk', 'spitter', 'brute', 'bloat', 'hexcaller', 'mender', 'stalker', 'moth', 'tunneler'];
    for (let i = 0; i < 220; i++) {
      const a = (i / 220) * Math.PI * 2, r = 6 + (i % 7) * 2;
      const e = spawnEnemy(g, g.over, kinds[i % kinds.length], pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r, { level: 6, elite: i % 30 === 0 ? ['flaming', 'shielded'] : [], champion: i % 30 === 0 });
      e.aggro = true;
      if (i % 5 === 0) { e.st.burn = 3; e.st.burnDps = 5; e.st.bleed = 3; e.st.bleedDps = 4; }
    }
    for (let i = 0; i < 18; i++) pl.addXp(100 * Math.pow(pl.level, 1.65));
    pl.equip(generateEquip(g.lootRng, { ilvl: 25, rarity: 4, base: 'greataxe' }));
    pl.skills.get('slam')!.rank = 3;
    pl.bar[2] = 'slam';
    pl.resolve = 100;
    const inp = emptyInput();
    const samples: number[] = [];
    for (let i = 0; i < 600; i++) {
      inp.skillHeld[0] = true;
      inp.aimX = pl.x + Math.cos(i * 0.1) * 3; inp.aimY = pl.y + Math.sin(i * 0.1) * 3;
      inp.skillPressed[1] = i % 120 === 0;
      inp.skillPressed[2] = i % 45 === 0;
      if (i % 45 === 0) pl.resolve = 100;
      const a = performance.now();
      g.update(1 / 60, inp);
      samples.push(performance.now() - a);
    }
    samples.sort((a, b) => a - b);
    const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
    const p99 = samples[Math.floor(samples.length * 0.99)];
    const alive = g.over.enemies.filter((e) => !e.dead).length;
    console.log(`[combat] avg ${avg.toFixed(2)}ms p99 ${p99.toFixed(2)}ms · kills ${g.stats.kills} · alive ${alive} · projectiles ${g.over.projectiles.length}`);
    expect(g.stats.kills).toBeGreaterThan(20);
    expect(avg).toBeLessThan(6);
  });
});
