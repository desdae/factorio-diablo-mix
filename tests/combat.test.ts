import { describe, it, expect } from 'vitest';
import { Game } from '../src/game/game';
import { spawnEnemy, hitEnemy, damagePlayer } from '../src/game/combat';
import { armorReduction, computeStats } from '../src/game/stats';
import { packet } from '../src/game/types';
import { emptyInput } from '../src/game/playerControl';

const mk = () => new Game({ seed: 11 });

describe('damage calculations', () => {
  it('armor mitigates small hits more than big hits and is capped', () => {
    expect(armorReduction(200, 5)).toBeGreaterThan(armorReduction(200, 100));
    expect(armorReduction(1e9, 1)).toBeLessThanOrEqual(0.85);
    expect(armorReduction(0, 50)).toBe(0);
  });
  it('resistances reduce elemental damage; negative resistance amplifies it', () => {
    const g = mk();
    const bloat = spawnEnemy(g, g.over, 'bloat', 10, 10, { level: 1 }); // fire 80, frost -30
    const fire = hitEnemy(g, g.over, bloat, packet('env', { fire: 10 }));
    const frost = hitEnemy(g, g.over, bloat, packet('env', { frost: 10 }));
    expect(fire).toBeCloseTo(2, 5);
    expect(frost).toBeCloseTo(13, 5);
  });
  it('brute shields block frontal damage; flanking bypasses it', () => {
    const g = mk();
    const brute = spawnEnemy(g, g.over, 'brute', 50, 50, { level: 1 });
    brute.facing = 0; // facing east
    const front = hitEnemy(g, g.over, brute, packet('env', { fire: 50, fromX: 55, fromY: 50 }));
    brute.hp = brute.maxHp;
    const back = hitEnemy(g, g.over, brute, packet('env', { fire: 50, fromX: 45, fromY: 50 }));
    expect(front).toBeLessThan(back * 0.3);
  });
  it('shocked enemies take 20% more damage; bleed deals damage over time', () => {
    const g = mk();
    const a = spawnEnemy(g, g.over, 'husk', 30, 30, { level: 1 });
    const base = hitEnemy(g, g.over, a, packet('env', { fire: 10 }));
    a.st.shock = 4;
    const shocked = hitEnemy(g, g.over, a, packet('env', { fire: 10 }));
    expect(shocked / base).toBeCloseTo(1.2, 5);
    const b = spawnEnemy(g, g.over, 'brute', 60, 60, { level: 5 });
    b.st.bleed = 4; b.st.bleedDps = 10;
    const hp0 = b.hp;
    for (let i = 0; i < 60; i++) g.update(1 / 60, emptyInput());
    expect(hp0 - b.hp).toBeGreaterThan(8);
  });
  it('player mitigation: bulwark halves damage, iframes prevent it', () => {
    const g = mk();
    g.player.stats.dodge = 0; g.player.stats.block = 0;
    const raw = () => damagePlayer(g, packet('enemy', { fire: 20 }));
    const h0 = g.player.hp; const d1 = raw(); g.player.hp = h0;
    g.player.buffs.bulwark = 3; const d2 = raw(); g.player.hp = h0; g.player.buffs.bulwark = 0;
    g.player.iframes = 1; const d3 = raw();
    expect(d2).toBeCloseTo(d1 / 2, 5);
    expect(d3).toBe(0);
  });
  it('enemy level scaling increases life and damage', () => {
    const g = mk();
    const l1 = spawnEnemy(g, g.over, 'husk', 5, 5, { level: 1 });
    const l10 = spawnEnemy(g, g.over, 'husk', 5, 6, { level: 10 });
    expect(l10.maxHp).toBeGreaterThan(l1.maxHp * 2.5);
    expect(l10.dmgMult).toBeGreaterThan(l1.dmgMult * 2);
  });
  it('derived stats respond to attributes and gear', () => {
    const base = { str: 10, dex: 10, int: 10, vit: 10, wil: 10, pre: 10, eng: 10 };
    const a = computeStats(1, base, {}, new Set(), { dmg: 0, aspd: 0 }, 0);
    const b = computeStats(1, { ...base, vit: 30, pre: 40 }, {}, new Set(), { dmg: 0, aspd: 0 }, 0);
    expect(b.maxLife - a.maxLife).toBe(100);
    expect(b.critChance).toBeGreaterThan(a.critChance);
  });
});

describe('enemy behaviours & bosses', () => {
  it('summoners raise husks and healers heal wounded allies', () => {
    const g = mk();
    const pl = g.player;
    g.god = true;
    const caller = spawnEnemy(g, g.over, 'hexcaller', pl.x + 6, pl.y, { level: 3 });
    caller.aggro = true; caller.specialCd = 0;
    const mender = spawnEnemy(g, g.over, 'mender', pl.x - 5, pl.y, { level: 3 });
    const hurt = spawnEnemy(g, g.over, 'brute', pl.x - 6, pl.y + 1, { level: 3 });
    hurt.hp = hurt.maxHp * 0.3; mender.aggro = true; mender.specialCd = 0;
    for (let i = 0; i < 240; i++) g.update(1 / 60, emptyInput());
    expect(g.over.enemies.some((e) => e.summonedBy === caller.id)).toBe(true);
    expect(hurt.hp).toBeGreaterThan(hurt.maxHp * 0.4);
  });
  it('the Colossus cycles through phases and uses telegraphed attacks', () => {
    const g = mk();
    g.god = true;
    g.enterDungeon();
    const boss = g.dungeon!.enemies.find((e) => e.def.id === 'colossus')!;
    g.player.x = boss.x - 5; g.player.y = boss.y;
    let sawTelegraph = false;
    for (let i = 0; i < 60 * 12; i++) {
      g.update(1 / 60, emptyInput());
      if (g.dungeon!.telegraphs.some((t) => t.owner === boss.id)) sawTelegraph = true;
      if (i === 60 * 4) boss.hp = boss.maxHp * 0.5;
      if (i === 60 * 8) boss.hp = boss.maxHp * 0.2;
    }
    expect(sawTelegraph).toBe(true);
    expect(boss.phase).toBe(3);
  });
});
