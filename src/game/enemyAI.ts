import { angleDiff, clamp } from '../core/math';
import type { Building } from '../sim/factory';
import { damageBuilding, damagePlayer, explode, spawnEnemy, tickEnemyStatus } from './combat';
import type { Game } from './game';
import type { Level } from './level';
import { packet, type Enemy, type Telegraph } from './types';
import { updateBoss } from './bosses';
import { UNREACHED } from './nav';

let teleId = 1;
export function addTelegraph(lvl: Level, t: Omit<Telegraph, 'id'>): Telegraph {
  const tg = { ...t, id: teleId++ };
  lvl.telegraphs.push(tg);
  return tg;
}

export function inTelegraph(t: Telegraph, x: number, y: number, r: number): boolean {
  const dx = x - t.x, dy = y - t.y;
  switch (t.shape) {
    case 'circle': return dx * dx + dy * dy <= (t.r + r) ** 2;
    case 'ring': { const d = Math.hypot(dx, dy); return d + r >= (t.inner ?? 0) && d - r <= t.r; }
    case 'cone': {
      const d = Math.hypot(dx, dy);
      if (d > t.r + r) return false;
      return Math.abs(angleDiff(t.angle, Math.atan2(dy, dx))) <= t.width / 2 + Math.atan2(r, Math.max(0.1, d));
    }
    case 'line': {
      const ca = Math.cos(t.angle), sa = Math.sin(t.angle);
      const along = dx * ca + dy * sa, across = -dx * sa + dy * ca;
      return along >= -r && along <= t.len + r && Math.abs(across) <= t.width / 2 + r;
    }
  }
}

export function distToBuilding(x: number, y: number, b: Building): number {
  const cx = clamp(x, b.x, b.x + b.w), cy = clamp(y, b.y, b.y + b.h);
  return Math.hypot(x - cx, y - cy);
}

/** Moves an actor with axis-separated tile collision. Returns the building blocking movement, if any. */
export function moveActor(g: Game, lvl: Level, a: { x: number; y: number }, dx: number, dy: number, r: number, mode: 'ground' | 'fly' | 'burrow' | 'player'): Building | null {
  const m = lvl.map;
  let blocker: Building | null = null;
  const solidAt = (tx: number, ty: number): boolean => {
    if (mode === 'fly') return !m.flyPassable(tx, ty);
    if (mode === 'burrow') return !m.terrainPassable(tx, ty) && !(m.inBounds(tx, ty) && m.occ[m.idx(tx, ty)] !== 0 && m.tree[m.idx(tx, ty)] === 0);
    if (!m.inBounds(tx, ty)) return true;
    const i = m.idx(tx, ty);
    if (m.occ[i] !== 0) {
      const b = g.factory.buildings.get(m.occ[i]);
      if (b && b.kind === 'belt' && mode === 'player') return false; // belts are walkable for the hero
      if (b) { blocker = b; return true; }
    }
    return !m.terrainPassable(tx, ty);
  };
  const tryAxis = (nx: number, ny: number) => {
    const x0 = Math.floor(nx - r), x1 = Math.floor(nx + r), y0 = Math.floor(ny - r), y1 = Math.floor(ny + r);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidAt(tx, ty)) return false;
    return true;
  };
  if (dx !== 0 && tryAxis(a.x + dx, a.y)) a.x += dx;
  if (dy !== 0 && tryAxis(a.x, a.y + dy)) a.y += dy;
  return blocker;
}

const tmp: Enemy[] = [];

export function updateEnemies(g: Game, lvl: Level, dt: number) {
  const pl = g.player;
  const playerHere = g.playerLevel() === lvl && !pl.dead;
  const safe = g.safeZone;
  for (let k = 0; k < lvl.enemies.length; k++) {
    const e = lvl.enemies[k];
    if (e.dead) { e.deathT += dt; continue; }
    tickEnemyStatus(g, lvl, e, dt);
    if (e.dead) continue;
    // simulation sleep: idle wildlife far from the hero does not think
    if (!e.wave && !e.aggro && (!playerHere || Math.abs(pl.x - e.x) + Math.abs(pl.y - e.y) > 50)) continue;
    e.anim += dt;
    e.atkCd -= dt; e.specialCd -= dt; e.special2Cd -= dt;
    eliteTick(g, lvl, e, dt);
    // knockback decays
    if (e.knockX || e.knockY) {
      moveActor(g, lvl, e, e.knockX * dt * 8, e.knockY * dt * 8, e.r, e.def.flying ? 'fly' : 'ground');
      e.knockX *= Math.pow(0.02, dt); e.knockY *= Math.pow(0.02, dt);
      if (Math.abs(e.knockX) + Math.abs(e.knockY) < 0.05) { e.knockX = 0; e.knockY = 0; }
    }
    if (e.st.frozen > 0 || e.st.stun > 0) { if (e.state === 'windup') e.state = 'chase'; continue; }
    if (e.def.boss) { updateBoss(g, lvl, e, dt, playerHere); continue; }
    updateEnemy(g, lvl, e, dt, playerHere, safe);
  }
  // cull corpses
  if (lvl.enemies.length && lvl.enemies.some((e) => e.dead && e.deathT > 1.2)) lvl.enemies = lvl.enemies.filter((e) => !e.dead || e.deathT <= 1.2);
}

function eliteTick(g: Game, lvl: Level, e: Enemy, dt: number) {
  if (!e.elite.length) return;
  const pl = g.player;
  for (const m of e.elite) {
    switch (m) {
      case 'regenerating': e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.025 * dt); break;
      case 'flaming':
        if (e.state === 'chase' && g.rng.chance(dt * 1.5)) lvl.ground.push({ id: g.nextId(), x: e.x, y: e.y, r: 0.9, t: 0, total: 4, dps: 8 * e.dmgMult, type: 'fire', faction: 'enemy' });
        break;
      case 'shielded':
        if (e.special2Cd <= 0 && e.aggro) { e.shieldHp = e.maxHp * 0.3; e.special2Cd = 9; g.events.emit('fx', { kind: 'shield', x: e.x, y: e.y, color: '#ffe05a', map: lvl.map.kind }); }
        break;
      case 'frozen':
        if (e.aggro && g.rng.chance(dt * 0.18)) {
          addTelegraph(lvl, { shape: 'circle', x: e.x, y: e.y, r: 3.2, angle: 0, len: 0, width: 0, t: 0, total: 1.1, color: '#8ad8ff', faction: 'enemy', owner: e.id,
            onDone: () => { if (e.dead) return; g.events.emit('fx', { kind: 'frost', x: e.x, y: e.y, r: 3.2, map: lvl.map.kind }); if (g.playerLevel() === lvl && Math.hypot(pl.x - e.x, pl.y - e.y) < 3.6) damagePlayer(g, packet('enemy', { frost: 12 * e.dmgMult }), e); } });
        }
        break;
      case 'storming':
        if (e.aggro && g.rng.chance(dt * 0.5)) {
          const ax = e.x + g.rng.range(-5, 5), ay = e.y + g.rng.range(-5, 5);
          addTelegraph(lvl, { shape: 'circle', x: ax, y: ay, r: 1.3, angle: 0, len: 0, width: 0, t: 0, total: 0.9, color: '#7ad7ff', faction: 'enemy',
            onDone: () => { g.events.emit('fx', { kind: 'lightning', x: ax, y: ay - 8, x2: ax, y2: ay, map: lvl.map.kind }); if (g.playerLevel() === lvl && Math.hypot(pl.x - ax, pl.y - ay) < 1.6) damagePlayer(g, packet('enemy', { lightning: 16 * e.dmgMult })); } });
        }
        break;
      case 'teleporting':
        if (e.aggro && e.specialCd <= 0 && g.playerLevel() === lvl && Math.hypot(pl.x - e.x, pl.y - e.y) > 4) {
          e.specialCd = 6;
          const a = g.rng.range(0, Math.PI * 2);
          const nx = pl.x + Math.cos(a) * 1.8, ny = pl.y + Math.sin(a) * 1.8;
          if (lvl.map.passable(Math.floor(nx), Math.floor(ny))) {
            g.events.emit('fx', { kind: 'teleport', x: e.x, y: e.y, color: '#c060ff', map: lvl.map.kind });
            e.x = nx; e.y = ny;
            g.events.emit('fx', { kind: 'teleport', x: e.x, y: e.y, color: '#c060ff', map: lvl.map.kind });
          }
        }
        break;
      case 'summoner':
        if (e.aggro && e.special2Cd <= 0) {
          e.special2Cd = 10;
          for (let i = 0; i < 2; i++) spawnEnemy(g, lvl, 'husk', e.x + g.rng.range(-1, 1), e.y + g.rng.range(-1, 1), { level: e.level, summonedBy: e.id, wave: e.wave });
          g.events.emit('fx', { kind: 'summon', x: e.x, y: e.y, color: '#a07aff', map: lvl.map.kind });
        }
        break;
      case 'enraged':
        if (e.hp < e.maxHp * 0.5 && e.phase === 1) { e.phase = 2; e.speedMult *= 1.35; e.dmgMult *= 1.3; g.events.emit('fx', { kind: 'fire', x: e.x, y: e.y, r: 1.5, map: lvl.map.kind }); }
        break;
      default: break;
    }
  }
}

interface Target { x: number; y: number; isPlayer: boolean; b: Building | null; dist: number }

function chooseTarget(g: Game, lvl: Level, e: Enemy, playerHere: boolean): Target | null {
  const pl = g.player;
  const dp = playerHere ? Math.hypot(pl.x - e.x, pl.y - e.y) : Infinity;
  if (e.st.taunt > 0 && playerHere) return { x: pl.x, y: pl.y, isPlayer: true, b: null, dist: dp };
  const aggroR = (g.isNight ? 10 : 8) * (e.wave ? 0.9 : 1);
  if (!e.aggro && dp < aggroR) {
    e.aggro = true;
    // alert pack mates
    for (const o of lvl.spatial.query(e.x, e.y, 7, tmp)) if (!o.dead) o.aggro = true;
  }
  if (!e.wave) {
    if (!e.aggro) return null;
    if (dp > 26 || Math.hypot(e.x - e.homeX, e.y - e.homeY) > 34) { e.aggro = false; e.state = 'return'; return null; }
    return { x: pl.x, y: pl.y, isPlayer: true, b: null, dist: dp };
  }
  // assault: player nearby takes precedence
  if (dp < 7) return { x: pl.x, y: pl.y, isPlayer: true, b: null, dist: dp };
  let b = e.targetB ? g.factory.buildings.get(e.targetB) ?? null : null;
  if (!b && e.stateT <= 0) {
    e.stateT = 0.8 + g.rng.next() * 0.4;
    b = findBuildingTarget(g, e, 12);
    e.targetB = b?.id ?? 0;
  }
  if (b) return { x: b.x + b.w / 2, y: b.y + b.h / 2, isPlayer: false, b, dist: distToBuilding(e.x, e.y, b) };
  return null;
}

/** Scans nearby tiles for buildings, choosing by the species' target priority then distance. */
export function findBuildingTarget(g: Game, e: Enemy, radius: number): Building | null {
  const f = g.factory;
  let best: Building | null = null, bestScore = Infinity;
  const pri = e.def.targets;
  const x0 = Math.floor(e.x - radius), x1 = Math.floor(e.x + radius), y0 = Math.floor(e.y - radius), y1 = Math.floor(e.y + radius);
  const seen = new Set<number>();
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      if (!f.map.inBounds(tx, ty)) continue;
      const id = f.map.occ[f.map.idx(tx, ty)];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const b = f.buildings.get(id)!;
      const p = pri.indexOf(b.kind);
      if (p < 0) continue;
      const score = p * 6 + distToBuilding(e.x, e.y, b);
      if (score < bestScore) { bestScore = score; best = b; }
    }
  return best;
}

function updateEnemy(g: Game, lvl: Level, e: Enemy, dt: number, playerHere: boolean, safe: { x: number; y: number; r: number } | null) {
  const pl = g.player;
  const def = e.def;
  const slow = (e.st.chill > 0 ? 0.65 : 1) * e.speedMult;
  let speed = def.speed * slow;
  e.stateT -= dt;

  // windup resolution
  if (e.state === 'windup') {
    if (e.stateT > 0) return;
    resolveAttack(g, lvl, e);
    e.state = 'recover';
    e.stateT = 0.25;
    return;
  }
  if (e.state === 'recover') { if (e.stateT > 0) return; e.state = 'chase'; }

  if (e.st.flee > 0 && playerHere) {
    const a = Math.atan2(e.y - pl.y, e.x - pl.x);
    moveActor(g, lvl, e, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt, e.r, def.flying ? 'fly' : 'ground');
    return;
  }

  // burrowers move underground until close
  if (def.behavior === 'burrower' && e.state === 'burrowed') {
    const t = chooseTarget(g, lvl, e, playerHere);
    if (!t) { e.state = 'idle'; return; }
    const a = Math.atan2(t.y - e.y, t.x - e.x);
    moveActor(g, lvl, e, Math.cos(a) * speed * 2 * dt, Math.sin(a) * speed * 2 * dt, e.r, 'burrow');
    if (t.dist < 1.6) {
      e.state = 'windup'; e.stateT = def.windup;
      e.windX = t.x; e.windY = t.y;
      addTelegraph(lvl, { shape: 'circle', x: e.x, y: e.y, r: 1.8, angle: 0, len: 0, width: 0, t: 0, total: def.windup, color: '#e0c080', faction: 'enemy', owner: e.id, onDone: () => {} });
      e.special = 'erupt';
    }
    return;
  }

  const t = chooseTarget(g, lvl, e, playerHere);
  if (!t) {
    // idle wander / return home / follow base field for waves
    if (e.wave && lvl.navBase) {
      const dir = lvl.navBase.at(e.x, e.y) !== UNREACHED ? lvl.navBase.direction(e.x, e.y, (x, y) => lvl.map.terrainPassable(x, y)) : null;
      if (dir) steer(g, lvl, e, dir.x, dir.y, speed, dt);
      else if (playerHere) steer(g, lvl, e, Math.sign(pl.x - e.x), Math.sign(pl.y - e.y), speed, dt);
    } else if (e.state === 'return' || Math.hypot(e.x - e.homeX, e.y - e.homeY) > 6) {
      const a = Math.atan2(e.homeY - e.y, e.homeX - e.x);
      steer(g, lvl, e, Math.cos(a), Math.sin(a), speed, dt);
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2 * dt);
      if (Math.hypot(e.x - e.homeX, e.y - e.homeY) < 1.5) e.state = 'idle';
    } else if (g.rng.chance(dt * 0.3)) {
      e.vx = g.rng.range(-1, 1); e.vy = g.rng.range(-1, 1);
    } else {
      moveActor(g, lvl, e, e.vx * 0.6 * dt, e.vy * 0.6 * dt, e.r, def.flying ? 'fly' : 'ground');
    }
    return;
  }
  // settlement is a sanctuary
  if (safe && t.isPlayer && Math.hypot(t.x - safe.x, t.y - safe.y) < safe.r) {
    const a = Math.atan2(e.y - safe.y, e.x - safe.x);
    if (Math.hypot(e.x - safe.x, e.y - safe.y) < safe.r + 4) steer(g, lvl, e, Math.cos(a), Math.sin(a), speed, dt);
    return;
  }
  e.facing = turnToward(e.facing, Math.atan2(t.y - e.y, t.x - e.x), dt * (def.behavior === 'brute' ? 2.2 : 10));
  const reach = def.attackRange + (t.isPlayer ? pl.r : 0) + e.r * 0.5;

  switch (def.behavior) {
    case 'ranged': case 'summoner': case 'healer': {
      const keep = def.behavior === 'ranged' ? 6 : 7.5;
      if (def.behavior === 'summoner' && e.specialCd <= 0) {
        e.specialCd = 7;
        const alive = lvl.enemies.filter((o) => o.summonedBy === e.id && !o.dead).length;
        if (alive < 6) {
          for (let i = 0; i < 3; i++) spawnEnemy(g, lvl, 'husk', e.x + g.rng.range(-1.5, 1.5), e.y + g.rng.range(-1.5, 1.5), { level: e.level, summonedBy: e.id, wave: e.wave });
          g.events.emit('fx', { kind: 'summon', x: e.x, y: e.y, color: '#c060ff', map: lvl.map.kind });
          g.events.emit('sfx', { name: 'summon', x: e.x, y: e.y });
        }
      }
      if (def.behavior === 'healer' && e.specialCd <= 0) {
        e.specialCd = 3;
        let healed = 0;
        for (const o of lvl.spatial.query(e.x, e.y, 7, tmp)) {
          if (o.dead || o === e || o.hp >= o.maxHp * 0.95) continue;
          o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.25);
          g.events.emit('fx', { kind: 'beam', x: e.x, y: e.y, x2: o.x, y2: o.y, color: '#5affb0', map: lvl.map.kind });
          if (++healed >= 3) break;
        }
      }
      if (t.dist < keep - 1.5) steer(g, lvl, e, (e.x - t.x) / t.dist, (e.y - t.y) / t.dist, speed, dt);
      else if (t.dist > (t.isPlayer ? def.attackRange : 5)) pathTo(g, lvl, e, t, speed, dt);
      if (t.dist <= def.attackRange + 1 && e.atkCd <= 0) startWindup(e, t);
      break;
    }
    case 'blinker': {
      if (t.dist > 3 && e.specialCd <= 0 && t.isPlayer) {
        e.specialCd = 4;
        const behind = Math.atan2(t.y - e.y, t.x - e.x);
        const nx = t.x + Math.cos(behind) * 1.4, ny = t.y + Math.sin(behind) * 1.4;
        if (lvl.map.passable(Math.floor(nx), Math.floor(ny))) {
          g.events.emit('fx', { kind: 'teleport', x: e.x, y: e.y, color: '#7ad7ff', map: lvl.map.kind });
          e.x = nx; e.y = ny; e.atkCd = 0.35;
          g.events.emit('fx', { kind: 'teleport', x: e.x, y: e.y, color: '#7ad7ff', map: lvl.map.kind });
          g.events.emit('sfx', { name: 'blink', x: e.x, y: e.y });
        }
      }
      if (t.dist > reach) pathTo(g, lvl, e, t, speed, dt);
      else if (e.atkCd <= 0) startWindup(e, t);
      break;
    }
    case 'burrower': {
      if (t.dist > 4.5 && e.specialCd <= 0) { e.state = 'burrowed'; e.specialCd = 6; g.events.emit('fx', { kind: 'dust', x: e.x, y: e.y, r: 1.2, color: '#8a7a6a', map: lvl.map.kind }); return; }
      if (t.dist > reach) pathTo(g, lvl, e, t, speed, dt);
      else if (e.atkCd <= 0) startWindup(e, t);
      break;
    }
    case 'bloater': {
      if (t.dist > reach) pathTo(g, lvl, e, t, speed, dt);
      else if (e.atkCd <= 0) {
        startWindup(e, t);
        addTelegraph(lvl, { shape: 'circle', x: e.x, y: e.y, r: 2.6, angle: 0, len: 0, width: 0, t: 0, total: def.windup, color: '#ff8a3a', faction: 'enemy', owner: e.id, onDone: () => {} });
      }
      break;
    }
    case 'brute': {
      if (t.dist > reach) pathTo(g, lvl, e, t, speed, dt);
      else if (e.atkCd <= 0) {
        startWindup(e, t);
        addTelegraph(lvl, { shape: 'cone', x: e.x, y: e.y, r: def.attackRange + 0.9, angle: e.facing, len: 0, width: Math.PI * 0.65, t: 0, total: def.windup, color: '#ffb04a', faction: 'enemy', owner: e.id, onDone: () => {} });
      }
      break;
    }
    default: {
      if (t.dist > reach) pathTo(g, lvl, e, t, speed, dt);
      else if (e.atkCd <= 0) startWindup(e, t);
    }
  }
}

function turnToward(cur: number, target: number, maxStep: number) {
  const d = angleDiff(cur, target);
  return cur + clamp(d, -maxStep, maxStep);
}

function startWindup(e: Enemy, t: Target) {
  e.state = 'windup';
  e.stateT = e.def.windup;
  e.windX = t.x; e.windY = t.y;
  e.windAngle = Math.atan2(t.y - e.y, t.x - e.x);
  e.targetB = t.b?.id ?? e.targetB;
  e.special = t.isPlayer ? 'player' : 'building';
}

function resolveAttack(g: Game, lvl: Level, e: Enemy) {
  const def = e.def;
  const pl = g.player;
  const dmg = def.damage * e.dmgMult;
  e.atkCd = def.attackCooldown;
  const mk = () => packet('enemy', { [def.dmgType]: dmg, fromX: e.x, fromY: e.y, ...(e.elite.includes('flaming') ? { fire: dmg * 0.4 + (def.dmgType === 'fire' ? dmg : 0) } : {}) });
  if (def.behavior === 'bloater') {
    explodeSelf(g, lvl, e);
    return;
  }
  if (e.special === 'erupt') {
    e.state = 'chase';
    g.events.emit('fx', { kind: 'dust', x: e.x, y: e.y, r: 2, color: '#a08a6a', map: lvl.map.kind });
    g.events.emit('shake', { amount: 0.2 });
    if (g.playerLevel() === lvl && Math.hypot(pl.x - e.x, pl.y - e.y) < 2.2) damagePlayer(g, packet('enemy', { physical: dmg * 1.3, stun: 0.6 }), e);
    damageBuildingsAround(g, lvl, e.x, e.y, 1.8, dmg);
    e.special = '';
    return;
  }
  if (def.behavior === 'ranged' || def.behavior === 'summoner' || def.behavior === 'healer') {
    // aim with simple lead
    const tx = e.windX + (e.special === 'player' ? pl.vx * 0.3 : 0), ty = e.windY + (e.special === 'player' ? pl.vy * 0.3 : 0);
    const a = Math.atan2(ty - e.y, tx - e.x);
    const sp = def.behavior === 'ranged' ? 9 : 7;
    lvl.projectiles.push({ id: g.nextId(), x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 0.3, life: 2, faction: 'enemy', dmg: mk(),
      kind: def.behavior === 'ranged' ? 'bile' : def.behavior === 'summoner' ? 'hex' : 'acid', pierce: 0, hit: new Set(), aoe: def.behavior === 'ranged' ? 1 : 0 });
    g.events.emit('sfx', { name: 'spit', x: e.x, y: e.y });
    return;
  }
  // melee
  if (e.special === 'player' && g.playerLevel() === lvl) {
    const d = Math.hypot(pl.x - e.x, pl.y - e.y);
    const inArc = def.behavior !== 'brute' || Math.abs(angleDiff(e.facing, Math.atan2(pl.y - e.y, pl.x - e.x))) < Math.PI * 0.4;
    if (d <= def.attackRange + pl.r + e.r * 0.5 + 0.35 && inArc) {
      damagePlayer(g, { ...mk(), stun: def.behavior === 'brute' ? 0.5 : 0 }, e);
      g.events.emit('sfx', { name: def.behavior === 'brute' ? 'heavy_hit' : 'enemy_hit', x: e.x, y: e.y });
    } else g.events.emit('sfx', { name: 'whiff', x: e.x, y: e.y });
  } else if (e.targetB) {
    const b = g.factory.buildings.get(e.targetB);
    if (b && distToBuilding(e.x, e.y, b) <= def.attackRange + e.r + 0.4) {
      damageBuilding(g, b, dmg * (def.behavior === 'brute' ? 2 : 1));
      g.events.emit('fx', { kind: 'sparks', x: e.x + Math.cos(e.facing) * e.r, y: e.y + Math.sin(e.facing) * e.r, color: '#ffd27a', map: lvl.map.kind });
      g.events.emit('sfx', { name: 'metal_hit', x: b.x, y: b.y, vol: 0.5 });
    } else e.targetB = 0;
  }
}

/** A bloater reaching its target detonates itself (no rewards — kill it first). */
function explodeSelf(g: Game, lvl: Level, e: Enemy) {
  e.dead = true;
  e.hp = 0;
  e.deathT = 0;
  explode(g, lvl, e.x, e.y, 2.6, packet('enemy', { fire: e.def.damage * e.dmgMult, fromX: e.x, fromY: e.y }), 'enemy');
}

function damageBuildingsAround(g: Game, lvl: Level, x: number, y: number, r: number, dmg: number) {
  if (lvl.map.kind !== 'overworld') return;
  const seen = new Set<number>();
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++)
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      const b = g.factory.at(tx, ty);
      if (b && !seen.has(b.id)) { seen.add(b.id); damageBuilding(g, b, dmg); }
    }
}

/** Path toward target: flow field toward player when it's the target, direct otherwise; attacks blocking buildings. */
function pathTo(g: Game, lvl: Level, e: Enemy, t: Target, speed: number, dt: number) {
  let dx = t.x - e.x, dy = t.y - e.y;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  if (!e.def.flying && t.isPlayer && l > 1.5) {
    const dir = lvl.navPlayer.direction(e.x, e.y, (x, y) => lvl.map.passable(x, y));
    if (dir) { dx = dir.x; dy = dir.y; }
  } else if (!e.def.flying && !t.isPlayer && e.wave && lvl.navBase && l > 3) {
    const dir = lvl.navBase.direction(e.x, e.y, (x, y) => lvl.map.terrainPassable(x, y));
    if (dir) { dx = dir.x; dy = dir.y; }
  }
  const blocker = steer(g, lvl, e, dx, dy, speed, dt);
  if (blocker && e.wave && blocker.id !== e.targetB) {
    // something is in the way: break through it
    e.targetB = blocker.id;
  }
}

function steer(g: Game, lvl: Level, e: Enemy, dx: number, dy: number, speed: number, dt: number): Building | null {
  // separation
  let sx = 0, sy = 0;
  const near = lvl.spatial.query(e.x, e.y, e.r * 2.5, tmp);
  for (const o of near) {
    if (o === e || o.dead) continue;
    const ox = e.x - o.x, oy = e.y - o.y;
    const d = Math.hypot(ox, oy) || 0.01;
    const min = e.r + o.r;
    if (d < min) { sx += (ox / d) * (min - d); sy += (oy / d) * (min - d); }
  }
  e.vx = dx * speed; e.vy = dy * speed;
  if (Math.abs(dx) + Math.abs(dy) > 0.01 && e.def.behavior !== 'brute') e.facing = Math.atan2(dy, dx);
  return moveActor(g, lvl, e, (dx * speed + sx * 4) * dt, (dy * speed + sy * 4) * dt, e.r, e.def.flying ? 'fly' : 'ground');
}
