import { describe, it, expect } from 'vitest';
import { Game } from '../src/game/game';
import { emptyInput } from '../src/game/playerControl';
import { planCraft, consumeMaterials } from '../src/game/wisps';

const step = (g: Game, s: number) => { const inp = emptyInput(); for (let i = 0; i < s * 60; i++) g.update(1 / 60, inp); };

describe('threat, assaults and defenses', () => {
  it('working machines emit rift-bleed which launches an assault; turrets fight it', () => {
    const g = new Game({ seed: 'siege' });
    g.god = true;
    const pl = g.player;
    // move the hero away so turrets do the work
    const m = g.overworld;
    // build a cleared compound near spawn
    const bx = Math.floor(pl.x) + 4, by = Math.floor(pl.y) - 6;
    for (let y = by - 3; y < by + 12; y++) for (let x = bx - 3; x < bx + 14; x++) { const i = m.idx(x, y); m.terrain[i] = 0; m.tree[i] = 0; m.prop[i] = 0; m.res[i] = 0; }
    g.research.complete(require_tech('ballistics'));
    const gen = g.factory.place('cinder_engine', bx, by, 0, true)!;
    gen.input.set('coal', 20);
    const kiln = g.factory.place('kiln', bx + 4, by, 0, true)!;
    kiln.input.set('coal', 10); kiln.input.set('stone', 8);
    const t1 = g.factory.place('bolt_thrower', bx + 6, by + 4, 0, true)!; t1.input.set('bolts', 20);
    const t2 = g.factory.place('bolt_thrower', bx + 2, by + 4, 0, true)!; t2.input.set('bolts', 20);
    pl.x = bx + 30; pl.y = by + 30;
    g.threat.cooldown = 0;
    g.threat.pool = 0;
    step(g, 4);
    expect(g.threat.totalEmitted).toBeGreaterThan(0);
    // force the assault and watch it resolve
    g.threat.pool = g.threat.nextCost;
    step(g, 1);
    expect(g.threat.waveInProgress).toBe(true);
    const n = g.threat.activeWave.size;
    expect(n).toBeGreaterThan(3);
    let turretHits = 0;
    g.events.on('hit', (h) => { if (h.src === 'turret') turretHits++; });
    step(g, 90);
    expect(turretHits).toBeGreaterThan(5);
    expect(t1.ammoShots + (t1.input.get('bolts') ?? 0) * 10).toBeLessThan(200 + 10);
    // the wave either got wiped or damaged structures — it engaged the base
    const damaged = [...g.factory.buildings.values()].some((b) => b.hp < b.maxHp) || g.factory.ghosts.size > 0;
    expect(g.threat.activeWave.size < n || damaged).toBe(true);
  });

  it('destroyed structures leave ghosts that wisps rebuild from inventory', () => {
    const g = new Game({ seed: 'rebuild' });
    const pl = g.player;
    const x = Math.floor(pl.x) + 3, y = Math.floor(pl.y) + 3;
    const m = g.overworld;
    for (let yy = y - 1; yy < y + 3; yy++) for (let xx = x - 1; xx < x + 3; xx++) { const i = m.idx(xx, yy); m.terrain[i] = 0; m.tree[i] = 0; m.prop[i] = 0; }
    const wall = g.factory.place('wall', x, y, 0, true)!;
    g.factory.damage(wall, 9999, g.time);
    expect(g.factory.buildings.has(wall.id)).toBe(false);
    expect(g.factory.ghosts.size).toBe(1);
    g.player.inv.add('brick', 10);
    step(g, 5);
    expect(g.factory.at(x, y)?.def.id).toBe('wall');
    expect(g.player.inv.count('brick')).toBe(5);
  });

  it('placing structures auto-crafts missing intermediates recursively', () => {
    const g = new Game({ seed: 'craft' });
    const inv = g.player.inv;
    inv.slots.fill(null);
    inv.add('iron_plate', 9); inv.add('brick', 5);
    // ember drill = 3 plates + 3 gears (6 plates) + 5 bricks
    expect(planCraft(g, 'ember_drill')).not.toBeNull();
    expect(consumeMaterials(g, 'ember_drill')).toBe(true);
    expect(inv.count('iron_plate')).toBe(0);
    expect(inv.count('brick')).toBe(0);
    expect(planCraft(g, 'ember_drill')).toBeNull();
    // coil batch surplus is returned: pylon needs 2 coils = 1 copper plate
    inv.add('copper_plate', 1); inv.add('wood', 1);
    expect(consumeMaterials(g, 'pylon')).toBe(true);
    expect(inv.count('copper_plate')).toBe(0);
  });
});

import { TECH_MAP } from '../src/data/techs';
function require_tech(id: string) { return TECH_MAP.get(id)!; }
