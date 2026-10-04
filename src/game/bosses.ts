import { angleDiff } from '../core/math';
import { damagePlayer, spawnEnemy } from './combat';
import { addTelegraph, inTelegraph, moveActor } from './enemyAI';
import type { Game } from './game';
import type { Level } from './level';
import { packet, type Enemy } from './types';

/**
 * Boss encounters: phase-driven state machines with readable telegraphs.
 * Every damaging ability is telegraphed and dodgeable.
 */
export function updateBoss(g: Game, lvl: Level, e: Enemy, dt: number, playerHere: boolean) {
  const pl = g.player;
  if (!playerHere) return;
  const d = Math.hypot(pl.x - e.x, pl.y - e.y);
  if (!e.aggro) {
    if (d < 13) {
      e.aggro = true;
      g.events.emit('banner', { title: e.name, sub: e.def.id === 'colossus' ? 'Warden of the Heart Furnace' : 'Mother of the Slagjaw Brood', color: e.def.accent });
      g.events.emit('music', { mood: 'boss' });
      g.events.emit('sfx', { name: 'roar' });
      g.events.emit('shake', { amount: 0.6 });
    }
    return;
  }
  if (d > 40) { e.aggro = false; e.hp = e.maxHp; e.phase = 1; return; }
  const frac = e.hp / e.maxHp;
  const newPhase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  if (newPhase > e.phase) {
    e.phase = newPhase;
    e.state = 'special'; e.stateT = 1.4; // transition: invulnerable-feeling roar
    g.events.emit('banner', { title: newPhase === 2 ? 'Phase II' : 'Final Phase', sub: e.def.id === 'colossus' ? (newPhase === 2 ? 'The Colossus ignites its forge-heart!' : 'The core is breaching!') : (newPhase === 2 ? 'Slagjaw calls her brood!' : 'Slagjaw is frenzied!'), color: e.def.accent });
    g.events.emit('sfx', { name: 'roar' });
    g.events.emit('shake', { amount: 0.8 });
    g.events.emit('fx', { kind: 'fire', x: e.x, y: e.y, r: 4, color: e.def.accent, map: lvl.map.kind });
    if (newPhase === 3) e.speedMult *= 1.3;
  }
  e.stateT -= dt;
  if (e.state === 'special') { if (e.stateT <= 0) e.state = 'chase'; return; }
  if (e.state === 'windup') return; // telegraph in flight; damage resolves in telegraph callbacks
  if (e.state === 'attack') { // charging dash
    const sp = 14;
    const nx = Math.cos(e.windAngle) * sp * dt, ny = Math.sin(e.windAngle) * sp * dt;
    const bx = e.x, by = e.y;
    moveActor(g, lvl, e, nx, ny, e.r * 0.8, 'ground');
    // pillar collision: the Colossus stuns itself on arena pillars and shatters them
    const ax = Math.floor(e.x + Math.cos(e.windAngle) * (e.r + 0.3)), ay = Math.floor(e.y + Math.sin(e.windAngle) * (e.r + 0.3));
    const m = lvl.map;
    if (m.inBounds(ax, ay) && m.prop[m.idx(ax, ay)] > 40) {
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (m.inBounds(ax + ox, ay + oy) && m.prop[m.idx(ax + ox, ay + oy)] > 40) { m.prop[m.idx(ax + ox, ay + oy)] = 0; m.markDirty(ax + ox, ay + oy); }
      e.st.stun = 3.5; e.state = 'chase';
      g.events.emit('fx', { kind: 'dust', x: ax, y: ay, r: 3, color: '#a08a6a', map: m.kind });
      g.events.emit('shake', { amount: 1 });
      g.events.emit('sfx', { name: 'explosion' });
      g.events.emit('toast', { text: 'The pillar collapses on the Colossus — it is stunned!', kind: 'good' });
      return;
    }
    if (Math.hypot(pl.x - e.x, pl.y - e.y) < e.r + pl.r + 0.2 && !e.special) {
      damagePlayer(g, packet('enemy', { physical: e.def.damage * e.dmgMult * 1.2, stun: 0.6 }), e);
      e.special = 'hit';
    }
    if ((e.x === bx && e.y === by) || e.stateT <= 0) { e.state = 'chase'; e.special = ''; }
    return;
  }
  const a = Math.atan2(pl.y - e.y, pl.x - e.x);
  e.facing = e.facing + Math.max(-dt * 3, Math.min(dt * 3, angleDiff(e.facing, a)));
  if (e.def.id === 'matriarch') matriarch(g, lvl, e, dt, d, a);
  else colossus(g, lvl, e, dt, d, a);
}

function approach(g: Game, lvl: Level, e: Enemy, dt: number, d: number, stop: number) {
  if (d <= stop) return;
  const pl = g.player;
  const dir = lvl.navPlayer.direction(e.x, e.y, (x, y) => lvl.map.passable(x, y));
  const a = Math.atan2(pl.y - e.y, pl.x - e.x);
  const dx = dir && d > 4 ? dir.x : Math.cos(a), dy = dir && d > 4 ? dir.y : Math.sin(a);
  const sp = e.def.speed * e.speedMult * (e.st.chill > 0 ? 0.75 : 1);
  moveActor(g, lvl, e, dx * sp * dt, dy * sp * dt, e.r * 0.8, 'ground');
}

function windup(e: Enemy, t: number) { e.state = 'windup'; e.stateT = t; }

function matriarch(g: Game, lvl: Level, e: Enemy, dt: number, d: number, a: number) {
  const pl = g.player;
  const dmg = e.def.damage * e.dmgMult;
  if (e.specialCd <= 0 && d > 4) {
    // charge
    e.specialCd = e.phase === 3 ? 4 : 7;
    const ang = a;
    windup(e, 0.9);
    addTelegraph(lvl, { shape: 'line', x: e.x, y: e.y, r: 0, angle: ang, len: 12, width: e.r * 2, t: 0, total: 0.9, color: '#c8ff5a', faction: 'enemy', owner: e.id,
      onDone: () => { if (e.dead) return; e.state = 'attack'; e.stateT = 0.85; e.windAngle = ang; e.special = ''; g.events.emit('sfx', { name: 'charge' }); } });
    return;
  }
  if (e.special2Cd <= 0) {
    e.special2Cd = e.phase >= 2 ? 11 : 16;
    // brood call
    const n = e.phase === 1 ? 3 : 5;
    for (let i = 0; i < n; i++) spawnEnemy(g, lvl, i % 3 === 2 && e.phase >= 2 ? 'spitter' : 'husk', e.x + g.rng.range(-3, 3), e.y + g.rng.range(-3, 3), { level: e.level - 1, summonedBy: e.id });
    g.events.emit('fx', { kind: 'summon', x: e.x, y: e.y, color: '#c8ff5a', map: lvl.map.kind });
    g.events.emit('sfx', { name: 'summon' });
    return;
  }
  if (e.atkCd <= 0 && d < 9 && d > 3 && g.rng.chance(0.5)) {
    // acid spray: 5 lobbed globs that leave pools
    e.atkCd = 3.2;
    windup(e, 0.6);
    const spots = [] as { x: number; y: number }[];
    for (let i = 0; i < 5; i++) spots.push({ x: pl.x + g.rng.range(-2.5, 2.5), y: pl.y + g.rng.range(-2.5, 2.5) });
    for (const s of spots)
      addTelegraph(lvl, { shape: 'circle', x: s.x, y: s.y, r: 1.2, angle: 0, len: 0, width: 0, t: 0, total: 1.0, color: '#a8ff3a', faction: 'enemy', owner: e.id,
        onDone: () => {
          if (Math.hypot(pl.x - s.x, pl.y - s.y) < 1.2 + pl.r && g.playerLevel() === lvl) damagePlayer(g, packet('enemy', { poison: dmg * 0.6 }), e);
          lvl.ground.push({ id: g.nextId(), x: s.x, y: s.y, r: 1.2, t: 0, total: 6, dps: dmg * 0.25, type: 'acid', faction: 'enemy' });
          g.events.emit('fx', { kind: 'acid', x: s.x, y: s.y, r: 1.2, map: lvl.map.kind });
          if (e.state === 'windup') e.state = 'chase';
        } });
    return;
  }
  if (d <= e.def.attackRange + e.r && e.atkCd <= 0) {
    e.atkCd = e.def.attackCooldown / (e.phase === 3 ? 1.5 : 1);
    windup(e, e.def.windup);
    const ang = a;
    addTelegraph(lvl, { shape: 'cone', x: e.x, y: e.y, r: e.def.attackRange + e.r + 0.5, angle: ang, len: 0, width: Math.PI * 0.7, t: 0, total: e.def.windup, color: '#ff8a3a', faction: 'enemy', owner: e.id,
      onDone: function (this: void) { /* resolved below */ } });
    const tg = lvl.telegraphs[lvl.telegraphs.length - 1];
    tg.onDone = () => {
      if (e.dead) return;
      if (g.playerLevel() === lvl && inTelegraph(tg, pl.x, pl.y, pl.r)) damagePlayer(g, packet('enemy', { physical: dmg, fromX: e.x, fromY: e.y }), e);
      if (e.state === 'windup') e.state = 'chase';
      g.events.emit('sfx', { name: 'heavy_hit' });
    };
    return;
  }
  approach(g, lvl, e, dt, d, e.def.attackRange + e.r - 0.3);
}

function colossus(g: Game, lvl: Level, e: Enemy, dt: number, d: number, a: number) {
  const pl = g.player;
  const dmg = e.def.damage * e.dmgMult;
  const hurtIf = (tg: ReturnType<typeof addTelegraph>, mult: number, type: 'fire' | 'physical' = 'fire', stun = 0) => {
    if (g.playerLevel() === lvl && inTelegraph(tg, pl.x, pl.y, pl.r)) damagePlayer(g, packet('enemy', { [type]: dmg * mult, stun, fromX: e.x, fromY: e.y }), e);
  };
  const release = () => { if (e.state === 'windup') e.state = 'chase'; };
  // Phase 3: nova rings (stand in the safe band)
  if (e.phase === 3 && e.special2Cd <= 0) {
    e.special2Cd = 12;
    windup(e, 2.6);
    const bands = g.rng.chance(0.5) ? [[0, 3], [5.5, 8.5], [11, 14]] : [[2.5, 5.5], [8, 11], [13, 16]];
    bands.forEach(([inner, outer], i) => {
      const tg = addTelegraph(lvl, { shape: 'ring', x: e.x, y: e.y, r: outer, inner, angle: 0, len: 0, width: 0, t: -i * 0.55, total: 1.4 + i * 0.55, color: '#ff4a2a', faction: 'enemy', owner: e.id, onDone: () => {} });
      tg.onDone = () => { hurtIf(tg, 0.9); g.events.emit('fx', { kind: 'fire', x: e.x, y: e.y, r: outer, map: lvl.map.kind }); g.events.emit('shake', { amount: 0.3 }); if (i === 2) release(); };
    });
    g.events.emit('sfx', { name: 'roar' });
    return;
  }
  // Phase 2+: molten pools and husk waves
  if (e.phase >= 2 && e.special2Cd <= 0) {
    e.special2Cd = 14;
    for (let i = 0; i < 4; i++) spawnEnemy(g, lvl, i === 3 ? 'bloat' : 'husk', e.x + g.rng.range(-4, 4), e.y + g.rng.range(-4, 4), { level: e.level - 2, summonedBy: e.id });
    for (let i = 0; i < 3; i++) {
      const px = pl.x + g.rng.range(-5, 5), py = pl.y + g.rng.range(-5, 5);
      const tg = addTelegraph(lvl, { shape: 'circle', x: px, y: py, r: 1.8, angle: 0, len: 0, width: 0, t: 0, total: 1.3, color: '#ff6a2a', faction: 'enemy', owner: e.id, onDone: () => {} });
      tg.onDone = () => { hurtIf(tg, 0.5); lvl.ground.push({ id: g.nextId(), x: px, y: py, r: 1.8, t: 0, total: 9, dps: dmg * 0.25, type: 'slag', faction: 'enemy' }); g.events.emit('fx', { kind: 'meteor', x: px, y: py, r: 1.8, map: lvl.map.kind }); };
    }
    g.events.emit('fx', { kind: 'summon', x: e.x, y: e.y, color: '#ff6a2a', map: lvl.map.kind });
    return;
  }
  // Rolling charge (phase 2+) — lure it into pillars
  if (e.phase >= 2 && e.specialCd <= 0 && d > 5) {
    e.specialCd = 8;
    const ang = a;
    windup(e, 1.1);
    addTelegraph(lvl, { shape: 'line', x: e.x, y: e.y, r: 0, angle: ang, len: 16, width: e.r * 2, t: 0, total: 1.1, color: '#ffb04a', faction: 'enemy', owner: e.id,
      onDone: () => { if (e.dead) return; e.state = 'attack'; e.stateT = 1.2; e.windAngle = ang; e.special = ''; g.events.emit('sfx', { name: 'charge' }); } });
    return;
  }
  if (e.atkCd <= 0) {
    e.atkCd = e.def.attackCooldown / (e.phase === 3 ? 1.4 : 1);
    if (d < 6.5 && g.rng.chance(0.5)) {
      // flame sweep cone
      windup(e, 1.0);
      const tg = addTelegraph(lvl, { shape: 'cone', x: e.x, y: e.y, r: 7.5, angle: a, len: 0, width: Math.PI * 0.75, t: 0, total: 1.0, color: '#ff6a2a', faction: 'enemy', owner: e.id, onDone: () => {} });
      tg.onDone = () => { if (e.dead) return; hurtIf(tg, 1); release(); g.events.emit('fx', { kind: 'fire', x: e.x + Math.cos(a) * 3, y: e.y + Math.sin(a) * 3, r: 3, map: lvl.map.kind }); g.events.emit('sfx', { name: 'flame' }); };
    } else {
      // hammer slam at the player's position
      windup(e, 1.2);
      const px = pl.x, py = pl.y;
      const tg = addTelegraph(lvl, { shape: 'circle', x: px, y: py, r: 3.3, angle: 0, len: 0, width: 0, t: 0, total: 1.2, color: '#ffb04a', faction: 'enemy', owner: e.id, onDone: () => {} });
      tg.onDone = () => {
        if (e.dead) return;
        hurtIf(tg, 1.3, 'physical', 0.8);
        release();
        g.events.emit('fx', { kind: 'slam', x: px, y: py, r: 3.3, color: '#ffb04a', map: lvl.map.kind });
        g.events.emit('shake', { amount: 0.7 });
        g.events.emit('sfx', { name: 'slam' });
        if (e.phase >= 2) lvl.ground.push({ id: g.nextId(), x: px, y: py, r: 1.5, t: 0, total: 5, dps: dmg * 0.2, type: 'slag', faction: 'enemy' });
      };
    }
    return;
  }
  approach(g, lvl, e, dt, d, 4);
}
