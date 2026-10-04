import { describe, it, expect } from 'vitest';
import { Res } from '../src/world/map';
import { blankWorld, oreField, countItem } from './helpers';

describe('logistics & production', () => {
  it('drill → belt → kiln → vault produces plates and conserves items', () => {
    const { map, factory: f, step } = blankWorld();
    oreField(map, 10, 10, 2, 2, Res.Iron, 50);
    const drill = f.place('ember_drill', 10, 10, 0)!;
    expect(drill).toBeTruthy();
    f.insert(drill, 'coal'); f.insert(drill, 'coal'); f.insert(drill, 'coal');
    // belt from x=12..15 heading east into a kiln at 16
    for (let x = 12; x <= 15; x++) expect(f.place('conveyor', x, 10, 0)).toBeTruthy();
    const kiln = f.place('kiln', 16, 10, 0)!;
    for (let i = 0; i < 5; i++) f.insert(kiln, 'coal');
    const vault = f.place('vault', 18, 10, 0)!;
    step(120);
    const plates = vault.input.get('iron_plate') ?? 0;
    expect(plates).toBeGreaterThan(10);
    // conservation: every ore mined is either still in transit/buffers or became a plate (1:1 recipe)
    const mined = 200 - [0, 1, 2, 3].reduce((s, k) => s + map.amt[map.idx(10 + (k % 2), 10 + (k >> 1))], 0);
    const ore = countItem(f, 'iron_ore');
    const platesAll = countItem(f, 'iron_plate');
    const inProcess = kiln.working ? 1 : 0;
    expect(ore + platesAll + inProcess).toBe(mined);
  });

  it('machines stop without fuel and without input', () => {
    const { map, factory: f, step } = blankWorld();
    oreField(map, 5, 5, 2, 2, Res.Iron, 50);
    const drill = f.place('ember_drill', 5, 5, 0)!;
    step(5);
    expect(drill.status).toBe('no_fuel');
    expect(f.totalProduced.get('iron_ore') ?? 0).toBe(0);
    const kiln = f.place('kiln', 20, 20, 0)!;
    f.insert(kiln, 'coal');
    step(5);
    expect(kiln.status).toBe('no_input');
  });

  it('belts respect capacity and do not lose items when blocked', () => {
    const { factory: f, step } = blankWorld();
    for (let x = 0; x < 6; x++) f.place('conveyor', 10 + x, 5, 0);
    const first = f.at(10, 5)!;
    let inserted = 0;
    for (let i = 0; i < 200; i++) { if (f.beltInsertBack(first, 3)) inserted++; step(0.2); }
    let onBelts = 0;
    for (const b of f.buildings.values()) { onBelts += b.bItems.length; expect(b.bItems.length).toBeLessThanOrEqual(4); }
    expect(onBelts).toBe(inserted);
    expect(onBelts).toBe(24); // 6 belts × 4 when fully compressed and blocked
  });

  it('distributor splits evenly across outputs', () => {
    const { factory: f, step } = blankWorld();
    f.place('conveyor', 9, 10, 0); // feeds splitter from west
    const s = f.place('distributor', 10, 10, 0)!;
    f.place('conveyor', 11, 10, 0); // east output
    f.place('conveyor', 10, 11, 1); // south output
    f.place('conveyor', 10, 9, 3); // north output
    const outs = [f.place('vault', 12, 10, 0)!, f.place('vault', 10, 12, 0)!, f.place('vault', 10, 8, 0)!];
    const feeder = f.at(9, 10)!;
    for (let i = 0; i < 600; i++) { f.beltInsertBack(feeder, 5); step(1 / 15); }
    const counts = outs.map((v) => f.vaultTotal(v));
    const total = counts.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(100);
    for (const c of counts) expect(Math.abs(c - total / 3)).toBeLessThan(total * 0.1);
    expect(s).toBeTruthy();
  });

  it('distributor filter routes the filtered item to the front', () => {
    const { factory: f, step } = blankWorld();
    f.place('conveyor', 9, 10, 0);
    const s = f.place('distributor', 10, 10, 0)!;
    s.filter = 'coal';
    f.place('conveyor', 11, 10, 0);
    f.place('conveyor', 10, 11, 1);
    const front = f.place('vault', 12, 10, 0)!;
    const side = f.place('vault', 10, 12, 0)!;
    const feeder = f.at(9, 10)!;
    const coal = 4, iron = 2; // indices in ITEMS
    for (let i = 0; i < 300; i++) { f.beltInsertBack(feeder, i % 2 ? coal : iron); step(1 / 5); }
    expect(front.input.get('coal') ?? 0).toBeGreaterThan(50);
    expect(front.input.get("iron_ore") ?? 0).toBe(0);
    expect(side.input.get('coal') ?? 0).toBe(0);
  });

  it('power: no generator fuel → electric machines stop; fuel → they run', () => {
    const { factory: f, step, research } = blankWorld();
    research.unlockedRecipes.add('fabricator');
    const gen = f.place('cinder_engine', 10, 10, 0)!;
    f.place('pylon', 13, 11, 0);
    const fab = f.place('fabricator', 14, 9, 0)!;
    f.setRecipe(fab, 'gear');
    for (let i = 0; i < 10; i++) f.insert(fab, 'iron_plate');
    step(3);
    expect(fab.status).toBe('no_power');
    expect(fab.output.get('gear') ?? 0).toBe(0);
    for (let i = 0; i < 5; i++) f.insert(gen, 'coal');
    step(5);
    expect(fab.output.get('gear') ?? 0).toBeGreaterThan(0);
    expect(gen.status).not.toBe("no_fuel");
    expect(gen.fuelEnergy).toBeLessThan(4000);
  });

  it('power: overload reduces satisfaction proportionally', () => {
    const { factory: f, step, power, research } = blankWorld(96);
    research.unlockedRecipes.add('fabricator');
    const gen = f.place('cinder_engine', 2, 2, 0)!;
    for (let i = 0; i < 20; i++) f.insert(gen, 'coal');
    // 900kW supply vs 15 fabricators × 75kW = 1125 kW demand
    let x = 5;
    f.place('pylon', 4, 3, 0);
    const fabs = [];
    for (let i = 0; i < 15; i++) {
      const fab = f.place('fabricator', x, 2, 0)!; f.setRecipe(fab, 'gear');
      for (let k = 0; k < 6; k++) f.insert(fab, 'iron_plate');
      fabs.push(fab);
      if (i % 2 === 0) f.place('pylon', x + 3, 5, 0);
      x += 3;
    }
    step(1);
    const net = power.nets[0];
    expect(net.demand).toBeGreaterThan(900);
    expect(net.satisfaction).toBeCloseTo(900 / net.demand, 2);
  });

  it('grapple arm with threshold only fills target up to N', () => {
    const { factory: f, step, research } = blankWorld();
    research.unlockedRecipes.add('arm');
    const gen = f.place('cinder_engine', 1, 1, 0)!;
    for (let i = 0; i < 10; i++) f.insert(gen, 'coal');
    f.place('pylon', 4, 2, 0);
    const src = f.place('vault', 5, 3, 0)!;
    for (let i = 0; i < 100; i++) f.insert(src, 'iron_plate');
    const arm = f.place('arm', 6, 3, 0)!;
    arm.cond = { item: 'iron_plate', lt: 12 };
    const dst = f.place('vault', 7, 3, 0)!;
    step(30);
    expect(dst.input.get('iron_plate')).toBe(12);
    expect((src.input.get('iron_plate') ?? 0) + 12 + (arm.held >= 0 ? 1 : 0)).toBe(100);
  });

  it('research consumes sigils at lectern and completes technology', () => {
    const { factory: f, step, research } = blankWorld();
    const gen = f.place('cinder_engine', 1, 1, 0)!;
    for (let i = 0; i < 20; i++) f.insert(gen, 'coal');
    f.place('pylon', 4, 2, 0);
    const lab = f.place('lectern', 5, 1, 0)!;
    expect(research.start('automation').ok).toBe(true);
    for (let i = 0; i < 10; i++) f.insert(lab, 'sigil_brass');
    step(80);
    expect(research.done.has('automation')).toBe(true);
    expect(research.isUnlocked('fabricator')).toBe(true);
    expect(lab.input.get('sigil_brass') ?? 0).toBe(0);
  });

  it('relic-gated research cannot start without the relic', () => {
    const { research } = blankWorld();
    for (const id of ['automation', 'ballistics', 'metallurgy', 'applied', 'electrification']) research.complete((research as never as { done: Set<string> }).done && ({ id } as never) && (globalThis as never, require_tech(id)));
    expect(research.start('arcane_industry').ok).toBe(false);
    research.relicsDelivered.add('colossus_heart');
    expect(research.start('arcane_industry').ok).toBe(true);
  });

  it('deep veins keep depleted drills trickling (no soft-lock)', () => {
    const { map, factory: f, step } = blankWorld();
    oreField(map, 10, 10, 2, 2, Res.Copper, 2);
    const drill = f.place('ember_drill', 10, 10, 0)!;
    for (let i = 0; i < 10; i++) f.insert(drill, 'coal');
    f.place('vault', 12, 10, 0);
    step(200);
    const total = f.totalProduced.get('copper_ore') ?? 0;
    expect(total).toBeGreaterThan(8);
    expect(drill.status === 'depleted' || drill.status === 'working').toBe(true);
  });
});

import { TECH_MAP } from '../src/data/techs';
function require_tech(id: string) { return TECH_MAP.get(id)!; }
