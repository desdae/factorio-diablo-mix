import { ENEMY_MAP, type EliteModId } from '../data/enemies';
import { armorReduction } from './stats';
import { DMG_TYPES, newStatuses, packet, type DamagePacket, type DmgType, type Enemy } from './types';
import type { Game } from './game';
import type { Level } from './level';
import { rollDrops } from './loot';
import type { Building } from '../sim/factory';
import { angleDiff } from '../core/math';

let enemyId = 1;
export function setEnemyIdCounter(n: number) { enemyId = Math.max(enemyId, n); }

export interface SpawnOpts {
  level: number;
  elite?: EliteModId[];
  champion?: boolean;
  minion?: boolean;
  wave?: boolean;
  poi?: number;
  summonedBy?: number;
}

export function spawnEnemy(g: Game, lvl: Level, defId: string, x: number, y: number, o: SpawnOpts): Enemy {
  const def = ENEMY_MAP.get(defId)!;
  const L = Math.max(1, o.level);
  const d = g.diff;
  const mods = lvl.dungeon?.mods ?? [];
  const elite = o.elite ?? [];
  const eliteMult = o.champion ? 3.2 : o.minion ? 1.6 : 1;
  const hp = def.hp * (1 + 0.24 * (L - 1)) * d.enemyHp * eliteMult * (g.worldMods.aggressive ? 1.2 : 1);
  const e: Enemy = {
    id: enemyId++, def, x, y, vx: 0, vy: 0, r: def.radius * (o.champion ? 1.15 : 1),
    hp, maxHp: hp, level: L,
    dmgMult: (1 + 0.15 * (L - 1)) * d.enemyDmg * (o.champion ? 1.4 : 1) * (g.worldMods.aggressive ? 1.25 : 1),
    speedMult: (mods.includes('swift') ? 1.25 : 1) * (g.worldMods.aggressive ? 1.1 : 1),
    armor: (def.armor + L * 4) * (mods.includes('armored') ? 1.5 : 1),
    elite, champion: !!o.champion, minion: !!o.minion, dead: false, deathT: 0, st: newStatuses(), facing: 0,
    state: 'idle', stateT: 0, atkCd: g.rng.range(0.2, 1), specialCd: g.rng.range(1, 4), special2Cd: 6,
    aggro: !!o.wave, homeX: x, homeY: y, wave: !!o.wave, targetB: 0, hitFlash: 0, shieldHp: 0, phase: 1,
    poi: o.poi ?? 0, summonedBy: o.summonedBy ?? 0, anim: g.rng.next() * 10, knockX: 0, knockY: 0, windAngle: 0, windX: 0, windY: 0,
    name: def.name, dotAcc: 0, special: '',
  };
  if (o.champion && elite.length) e.name = `${elite.map((m) => m[0].toUpperCase() + m.slice(1)).join(' ')} ${def.name}`;
  if (def.behavior === 'burrower') e.state = 'idle';
  lvl.enemies.push(e);
  return e;
}

function resistOf(e: Enemy, t: DmgType): number {
  if (t === 'physical') return 0;
  return e.def.res[t] ?? 0;
}

/** Applies a damage packet to an enemy. Returns total damage dealt. */
export function hitEnemy(g: Game, lvl: Level, e: Enemy, p: DamagePacket): number {
  if (e.dead || e.state === 'burrowed') return 0;
  const pl = g.player;
  let mult = 1;
  if (e.st.shock > 0) mult *= 1.2;
  if (e.st.stun > 0 && p.source === 'player' && pl.hasMod('slam', 'tremor')) mult *= 1.25;
  if (p.source === 'turret' && e.st.mark > 0) mult *= 1.6;
  if (p.source === 'player') mult *= g.diff.playerDmg;
  // frontal shield
  let blocked = false;
  if (e.def.behavior === 'brute' && p.fromX !== undefined && p.fromY !== undefined && e.st.stun <= 0 && e.st.frozen <= 0) {
    const a = Math.atan2(p.fromY - e.y, p.fromX - e.x);
    if (Math.abs(angleDiff(e.facing, a)) < Math.PI / 3) { mult *= 0.2; blocked = true; }
  }
  let total = 0;
  let maxType: DmgType = 'physical', maxV = 0;
  for (const t of DMG_TYPES) {
    let v = p[t];
    if (v <= 0) continue;
    v *= mult * (1 - resistOf(e, t) / 100);
    if (t === 'physical') v *= 1 - armorReduction(e.armor, v);
    if (v > maxV) { maxV = v; maxType = t; }
    total += v;
  }
  if (total <= 0) return 0;
  if (e.shieldHp > 0) {
    const absorbed = Math.min(e.shieldHp, total);
    e.shieldHp -= absorbed; total -= absorbed;
    if (total <= 0) { g.events.emit('hit', { x: e.x, y: e.y - 1, amount: 0, crit: false, type: 'lightning', target: 'enemy', map: lvl.map.kind, text: 'Warded' }); return 0; }
  }
  e.hp -= total;
  e.hitFlash = 0.12;
  e.aggro = true;
  g.events.emit('hit', { x: e.x, y: e.y - e.r - 0.4, amount: total, crit: !!p.crit, type: maxType, target: 'enemy', map: lvl.map.kind, text: blocked ? 'Blocked' : undefined });
  if (blocked) g.events.emit('fx', { kind: 'sparks', x: e.x + Math.cos(e.facing) * e.r, y: e.y + Math.sin(e.facing) * e.r, color: '#ffd27a', map: lvl.map.kind });
  // statuses
  const rng = g.rng;
  if (p.bleed && rng.chance(p.bleed)) { e.st.bleed = 4; e.st.bleedDps = Math.max(e.st.bleedDps, (p.physical * mult) * 0.4); }
  if (p.ignite && rng.chance(p.ignite)) { e.st.burn = 3; e.st.burnDps = Math.max(e.st.burnDps, Math.max(p.fire, p.physical * 0.3) * mult * 0.45); }
  if (p.poison > 0) { e.st.poison = 4; e.st.poisonDps = Math.max(e.st.poisonDps, p.poison * 0.3); }
  if (p.chill && rng.chance(p.chill)) {
    e.st.chill = 3;
    e.st.chillStacks += e.def.boss ? 0.12 : 0.35;
    if (e.st.chillStacks >= 1) { e.st.frozen = e.def.boss ? 0.8 : 1.6; e.st.chillStacks = 0; g.events.emit('fx', { kind: 'frost', x: e.x, y: e.y, r: e.r, map: lvl.map.kind }); }
  }
  if (p.shock && rng.chance(p.shock)) e.st.shock = 4;
  if (p.stun && !e.def.boss) e.st.stun = Math.max(e.st.stun, p.stun * (1 + pl.stats.stunDur / 100));
  else if (p.stun && e.def.boss) e.st.stun = Math.max(e.st.stun, p.stun * 0.15);
  if (p.knock && !e.def.boss && p.fromX !== undefined) {
    const a = Math.atan2(e.y - p.fromY!, e.x - p.fromX);
    const k = p.knock / (e.r * 2);
    e.knockX += Math.cos(a) * k; e.knockY += Math.sin(a) * k;
  }
  if (p.source === 'player') {
    if (!p.noLeech && pl.stats.leech > 0) healPlayer(g, total * pl.stats.leech / 100, true);
    if (pl.stats.legendaries.has('leg_mark') && p.skill === 'cleave') e.st.mark = 6;
    if (pl.stats.legendaries.has('leg_capacitor')) g.power.chargeNear(e.x, e.y, 14, total * 4);
    if (pl.stats.legendaries.has('leg_shatter')) { e.st.chill = 3; e.st.chillStacks = Math.min(0.99, e.st.chillStacks + 0.1); }
    if (pl.stats.keystones.has('conductor') && g.inOverworld() && g.poweredNear(e.x, e.y, 8)) e.st.shock = 4;
    if (p.skill === 'rush' && pl.hasMod('rush', 'momentum')) { const s = pl.skills.get('rush')!; s.cd = Math.max(0, s.cd - 0.3); }
  }
  if (p.lightning > 0 && p.source === 'player' && g.inOverworld()) g.power.chargeNear(e.x, e.y, 10, p.lightning * 3);
  if (e.hp <= 0) killEnemy(g, lvl, e, p);
  return total;
}

export function killEnemy(g: Game, lvl: Level, e: Enemy, p?: DamagePacket) {
  if (e.dead) return;
  e.dead = true;
  e.deathT = 0;
  e.hp = 0;
  const pl = g.player;
  const ups = pl.addXp(Math.round(e.def.xp * (1 + e.level * 0.15) * (e.champion ? 3 : e.minion ? 1.5 : 1)));
  if (ups) g.onLevelUp();
  g.stats.kills++;
  g.events.emit('kill', { enemy: e });
  g.events.emit('fx', { kind: 'death', x: e.x, y: e.y, r: e.r, color: e.def.accent, map: lvl.map.kind });
  g.quests.onKill(e);
  if (e.def.boss) g.onBossKilled(e.def.id);
  const volatile = (lvl.dungeon?.mods.includes('volatile') && !e.def.boss) || e.elite.includes('explosive') || e.def.behavior === 'bloater';
  if (volatile) {
    const r = e.def.behavior === 'bloater' ? 2.6 : 2.2;
    const dmg = e.def.damage * e.dmgMult * (e.def.behavior === 'bloater' ? 1 : 0.8);
    explode(g, lvl, e.x, e.y, r, packet('enemy', { fire: dmg, fromX: e.x, fromY: e.y }), 'enemy');
  }
  if (pl.stats.legendaries.has('leg_shatter') && e.st.chill > 0 && p?.source === 'player') {
    g.events.emit('fx', { kind: 'shatter', x: e.x, y: e.y, r: 2.5, map: lvl.map.kind });
    for (const o of lvl.spatial.query(e.x, e.y, 2.5, [])) if (o !== e && !o.dead) hitEnemy(g, lvl, o, packet('player', { frost: e.maxHp * 0.3, chill: 1, noLeech: true }));
  }
  rollDrops(g, lvl, e);
}

/** Area damage helper. faction='enemy' hurts player and buildings; 'player' hurts enemies. */
export function explode(g: Game, lvl: Level, x: number, y: number, r: number, p: DamagePacket, faction: 'player' | 'enemy') {
  g.events.emit('fx', { kind: 'explosion', x, y, r, color: p.fire > 0 ? '#ff8a3a' : '#c8ff5a', map: lvl.map.kind });
  g.events.emit('sfx', { name: 'explosion', x, y });
  g.events.emit('shake', { amount: 0.25 + r * 0.08 });
  if (faction === 'enemy') {
    if (g.playerLevel() === lvl && (g.player.x - x) ** 2 + (g.player.y - y) ** 2 <= (r + g.player.r) ** 2) damagePlayer(g, p);
    if (lvl.map.kind === 'overworld') {
      const seen = new Set<Building>();
      for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++)
        for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
          const b = g.factory.at(tx, ty);
          if (b && !seen.has(b) && (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2 <= r * r) { seen.add(b); damageBuilding(g, b, (p.fire + p.physical + p.poison) * 1.2); }
        }
    }
  } else {
    for (const o of lvl.spatial.query(x, y, r + 1, [])) if (!o.dead && (o.x - x) ** 2 + (o.y - y) ** 2 <= (r + o.r) ** 2) hitEnemy(g, lvl, o, p);
    breakProps(g, lvl, x, y, r);
  }
}

export function breakProps(g: Game, lvl: Level, x: number, y: number, r: number) {
  const m = lvl.map;
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++)
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (!m.inBounds(tx, ty)) continue;
      const i = m.idx(tx, ty);
      if (!m.prop[i] || (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2 > r * r) continue;
      if (m.prop[i] > 40) { m.prop[i] = Math.max(41, m.prop[i] - 40); if (m.prop[i] <= 41) { m.prop[i] = 0; } }
      else m.prop[i] = 0;
      if (m.prop[i] === 0) {
        m.markDirty(tx, ty);
        g.events.emit('fx', { kind: 'dust', x: tx + 0.5, y: ty + 0.5, r: 1, color: '#8a7a6a', map: m.kind });
        g.events.emit('sfx', { name: 'crate', x: tx, y: ty });
        g.dropPropLoot(lvl, tx + 0.5, ty + 0.5);
      }
    }
}

export function healPlayer(g: Game, amount: number, silent = false) {
  const pl = g.player;
  if (pl.dead) return;
  const grim = g.playerLevel().dungeon?.mods.includes('grim') ? 0.6 : 1;
  const before = pl.hp;
  pl.hp = Math.min(pl.stats.maxLife, pl.hp + amount * grim);
  if (!silent && pl.hp - before > 1) g.events.emit('hit', { x: pl.x, y: pl.y - 1.2, amount: pl.hp - before, crit: false, type: 'poison', target: 'player', map: g.playerLevel().map.kind, text: `+${Math.round(pl.hp - before)}` });
}

export function damagePlayer(g: Game, p: DamagePacket, attacker?: Enemy): number {
  const pl = g.player;
  if (pl.dead || g.god) return 0;
  const kind = g.playerLevel().map.kind;
  if (pl.iframes > 0) return 0;
  const s = pl.stats;
  if (g.rng.chance(s.dodge / 100)) {
    g.events.emit('hit', { x: pl.x, y: pl.y - 1.2, amount: 0, crit: false, type: 'physical', target: 'player', map: kind, text: 'Evaded' });
    return 0;
  }
  if (attacker && g.rng.chance(s.block / 100)) {
    g.events.emit('hit', { x: pl.x, y: pl.y - 1.2, amount: 0, crit: false, type: 'physical', target: 'player', map: kind, text: 'Blocked' });
    g.events.emit('fx', { kind: 'shield', x: pl.x, y: pl.y, map: kind });
    g.events.emit('sfx', { name: 'block' });
    if (s.keystones.has('bastion')) { healPlayer(g, s.maxLife * 0.03, true); pl.resolve = Math.min(pl.maxResolve, pl.resolve + 8); }
    return 0;
  }
  let total = 0;
  for (const t of DMG_TYPES) {
    let v = p[t];
    if (v <= 0) continue;
    if (t === 'physical') v *= 1 - armorReduction(s.armor, v);
    else v *= 1 - s.res[t] / 100;
    total += v;
  }
  let reduce = 1;
  if (pl.buffs.bulwark > 0) reduce *= 0.5;
  if (pl.buffs.guarded > 0) reduce *= 0.6;
  const prevented = total * (1 - reduce);
  total *= reduce;
  if (pl.buffs.bulwark > 0 && attacker && pl.hasMod('bulwark', 'retaliation')) {
    const lvl = g.playerLevel();
    hitEnemy(g, lvl, attacker, packet('player', { physical: prevented * 1.5 + 10, noLeech: true }));
  }
  if (attacker && s.thorns > 0 && (attacker.x - pl.x) ** 2 + (attacker.y - pl.y) ** 2 < 9) {
    hitEnemy(g, g.playerLevel(), attacker, packet('player', { physical: s.thorns, noLeech: true }));
  }
  pl.hp -= total;
  pl.hitFlash = 0.15;
  pl.recentHurt = 3;
  g.events.emit('hit', { x: pl.x, y: pl.y - 1.2, amount: total, crit: false, type: p.fire > p.physical ? 'fire' : p.poison > p.physical ? 'poison' : 'physical', target: 'player', map: kind });
  if (total > s.maxLife * 0.08) g.events.emit('shake', { amount: Math.min(0.6, total / s.maxLife) });
  g.events.emit('sfx', { name: 'hurt', vol: Math.min(1, total / 30) });
  if (p.poison > 0) { pl.st.poison = 3; pl.st.poisonDps = Math.max(pl.st.poisonDps, p.poison * 0.2 * (1 - s.res.poison / 100)); }
  if (p.fire > 0 && g.rng.chance(0.2)) { pl.st.burn = 2; pl.st.burnDps = Math.max(pl.st.burnDps, p.fire * 0.15 * (1 - s.res.fire / 100)); }
  if (p.frost > 0) { pl.st.chill = 2; }
  if (p.stun && pl.buffs.bulwark <= 0) pl.st.stun = Math.max(pl.st.stun, p.stun * 0.5);
  if (attacker?.elite.includes('vampiric')) attacker.hp = Math.min(attacker.maxHp, attacker.hp + total * 2);
  if (pl.hp <= 0) g.playerDied();
  return total;
}

export function damageBuilding(g: Game, b: Building, amount: number) {
  if (amount <= 0) return;
  const destroyed = g.factory.damage(b, amount, g.time);
  g.events.emit('hit', { x: b.x + b.w / 2, y: b.y, amount, crit: false, type: 'physical', target: 'building', map: 'overworld' });
  if (destroyed) {
    g.events.emit('fx', { kind: 'explosion', x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.max(b.w, b.h) * 0.7, color: '#ffb04a', map: 'overworld' });
    g.events.emit('sfx', { name: 'explosion', x: b.x, y: b.y });
    g.events.emit('toast', { text: `${b.def.name} destroyed! A ghost marks it for rebuilding.`, kind: 'bad' });
  }
}

/** Damage over time and status timers for enemies. */
export function tickEnemyStatus(g: Game, lvl: Level, e: Enemy, dt: number) {
  const s = e.st;
  let dot = 0;
  if (s.burn > 0) { s.burn -= dt; dot += s.burnDps * (1 - (e.def.res.fire ?? 0) / 100); if (s.burn <= 0) s.burnDps = 0; }
  if (s.bleed > 0) {
    s.bleed -= dt; dot += s.bleedDps;
    if (g.player.stats.legendaries.has('leg_vampire') && g.playerLevel() === lvl) healPlayer(g, g.player.stats.maxLife * 0.01 * dt, true);
    if (s.bleed <= 0) s.bleedDps = 0;
  }
  if (s.poison > 0) { s.poison -= dt; dot += s.poisonDps * (1 - (e.def.res.poison ?? 0) / 100); if (s.poison <= 0) s.poisonDps = 0; }
  if (dot > 0) {
    e.hp -= dot * dt;
    e.dotAcc += dot * dt;
    if (e.dotAcc > 6 || (e.hp <= 0 && e.dotAcc > 0)) {
      g.events.emit('hit', { x: e.x + 0.3, y: e.y - e.r - 0.2, amount: e.dotAcc, crit: false, type: s.burn > 0 ? 'fire' : s.poison > 0 ? 'poison' : 'physical', target: 'enemy', map: lvl.map.kind });
      e.dotAcc = 0;
    }
    if (e.hp <= 0) killEnemy(g, lvl, e, packet('player', { physical: 0 }));
  }
  if (s.chill > 0) { s.chill -= dt; if (s.chill <= 0) s.chillStacks = 0; }
  if (s.frozen > 0) s.frozen -= dt;
  if (s.shock > 0) s.shock -= dt;
  if (s.stun > 0) s.stun -= dt;
  if (s.mark > 0) s.mark -= dt;
  if (s.flee > 0) s.flee -= dt;
  if (s.taunt > 0) s.taunt -= dt;
  if (e.hitFlash > 0) e.hitFlash -= dt;
}
