import { SKILL_MAP } from '../data/skills';
import { BASE_MAP } from '../data/equipment';
import { RES_ITEM } from '../world/map';
import { angleDiff } from '../core/math';
import { breakProps, damagePlayer, explode, healPlayer, hitEnemy } from './combat';
import { moveActor } from './enemyAI';
import type { Game } from './game';
import type { Level } from './level';
import { packet, type DamagePacket, type Enemy } from './types';

export interface PlayerInput {
  moveX: number; moveY: number;
  aimX: number; aimY: number; // world coords
  skillPressed: boolean[]; // edge, 6 slots
  skillHeld: boolean[];
  dodge: boolean;
  interact: boolean; // edge
  gather: boolean; // held/toggled
  tonic: boolean;
  charge: boolean;
  blockCombat: boolean; // e.g. in build mode LMB/RMB are consumed by construction
}

export const emptyInput = (): PlayerInput => ({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, skillPressed: [false, false, false, false, false, false], skillHeld: [false, false, false, false, false, false], dodge: false, interact: false, gather: false, tonic: false, charge: false, blockCombat: false });

const tmp: Enemy[] = [];

/** Builds a damage packet from the player's weapon and stats, scaled by a skill's percentage. */
export function weaponHit(g: Game, pct: number, skill: string, extra: Partial<DamagePacket> = {}): DamagePacket {
  const s = g.player.stats;
  const rng = g.rng;
  const rank = g.player.skillRank(skill);
  const def = SKILL_MAP.get(skill)!;
  const mult = (pct + def.perRank * Math.max(0, rank - 1)) / 100;
  let phys = (rng.range(s.wMin, s.wMax) + s.flat.physical) * mult;
  let fire = s.flat.fire * mult, frost = s.flat.frost * mult, lightning = s.flat.lightning * mult;
  let conv = s.convertFire;
  if (skill === 'cleave' && g.player.hasMod('cleave', 'emberedge')) conv = Math.min(100, conv + 40);
  if (skill === 'judgement') conv = 100;
  fire += phys * conv / 100; phys *= 1 - conv / 100;
  if (s.legendaries.has('leg_capacitor')) lightning += (phys + fire) * 0.4;
  const inc = 1 + s.inc.all / 100;
  phys *= inc * (1 + s.inc.physical / 100);
  fire *= inc * (1 + s.inc.fire / 100);
  frost *= inc * (1 + s.inc.frost / 100);
  lightning *= inc * (1 + s.inc.lightning / 100);
  const crit = rng.chance(s.critChance / 100);
  const cm = crit ? 1 + s.critDmg / 100 : 1;
  const pl = g.player;
  return packet('player', {
    physical: phys * cm, fire: fire * cm, frost: frost * cm, lightning: lightning * cm, crit, skill,
    bleed: s.bleed / 100 + (skill === 'cleave' && pl.hasMod('cleave', 'hemorrhage') ? 1 : 0),
    ignite: s.ignite / 100 + (skill === 'cleave' && pl.hasMod('cleave', 'emberedge') ? 0.3 : 0) + (skill === 'judgement' ? 0.6 : 0),
    chill: s.chill / 100 + (s.legendaries.has('leg_shatter') ? 0.5 : 0), shock: s.shock / 100,
    fromX: pl.x, fromY: pl.y, ...extra,
  });
}

function cooldownOf(g: Game, skill: string): number {
  const d = SKILL_MAP.get(skill)!;
  let cd = d.cooldown;
  if (skill === 'rush' && g.player.hasMod('rush', 'momentum')) cd -= 2;
  if (skill === 'judgement' && g.player.hasMod('judgement', 'tempered')) cd -= 15;
  return Math.max(0, cd * (1 - g.player.stats.cdr / 100));
}

export function canUse(g: Game, skill: string): { ok: boolean; reason?: string } {
  const pl = g.player;
  const st = pl.skills.get(skill);
  const d = SKILL_MAP.get(skill)!;
  if (!st || st.rank === 0) return { ok: false, reason: 'Not learned' };
  if (st.cd > 0) return { ok: false, reason: 'Cooldown' };
  if (pl.resolve < d.cost) return { ok: false, reason: 'Not enough Resolve' };
  return { ok: true };
}

function begin(g: Game, slot: number, input: PlayerInput) {
  const pl = g.player;
  const skill = pl.bar[slot];
  if (!skill) return;
  const chk = canUse(g, skill);
  if (!chk.ok) {
    if (chk.reason === 'Not enough Resolve') g.events.emit('toast', { text: 'Not enough Resolve', kind: 'warn' });
    return;
  }
  const d = SKILL_MAP.get(skill)!;
  const aps = pl.stats.aps * (1 + pl.stats.atkSpeed / 100);
  const angle = Math.atan2(input.aimY - pl.y, input.aimX - pl.x);
  pl.facing = angle;
  pl.resolve -= d.cost;
  pl.skills.get(skill)!.cd = cooldownOf(g, skill);
  const a = { skill, t: 0, dur: 0.4, hitAt: 0.15, fired: false, angle, tx: input.aimX, ty: input.aimY, moveMult: 0 };
  switch (skill) {
    case 'cleave': a.dur = 1 / aps; a.hitAt = a.dur * 0.4; a.moveMult = 0.45; break;
    case 'rush': a.dur = 0.3; a.hitAt = 0; a.moveMult = 0; break;
    case 'slam': a.dur = 0.75 / Math.min(1.6, aps); a.hitAt = a.dur * 0.6; break;
    case 'bulwark': a.dur = 0.2; a.hitAt = 0.05; a.moveMult = 1; break;
    case 'horn': a.dur = 0.35; a.hitAt = 0.1; a.moveMult = 0.5; break;
    case 'judgement': a.dur = 0.5; a.hitAt = 0.2; break;
  }
  pl.action = a;
  g.events.emit('sfx', { name: skill === 'cleave' ? 'swing' : skill === 'horn' ? 'horn' : skill === 'slam' ? 'windup' : 'skill' });
}

/** Executes the effect of a skill at its hit frame. */
function fire(g: Game, lvl: Level) {
  const pl = g.player;
  const a = pl.action!;
  const s = pl.stats;
  const aoe = 1 + s.aoe / 100;
  const map = lvl.map.kind;
  switch (a.skill) {
    case 'cleave': {
      const reach = s.reach * (pl.hasMod('cleave', 'widearc') ? 1.25 : 1) * Math.sqrt(aoe);
      const arc = (Math.PI * 2) / 3 + (pl.hasMod('cleave', 'widearc') ? (70 * Math.PI) / 180 : 0);
      let hits = 0;
      for (const e of lvl.spatial.query(pl.x, pl.y, reach + 2, tmp)) {
        if (e.dead || e.state === 'burrowed') continue;
        const d = Math.hypot(e.x - pl.x, e.y - pl.y) - e.r;
        if (d > reach) continue;
        if (Math.abs(angleDiff(a.angle, Math.atan2(e.y - pl.y, e.x - pl.x))) > arc / 2 + 0.15) continue;
        hitEnemy(g, lvl, e, weaponHit(g, 100, 'cleave', { knock: 0.6 }));
        hits++;
      }
      breakPropsArc(g, lvl, pl.x + Math.cos(a.angle) * reach * 0.6, pl.y + Math.sin(a.angle) * reach * 0.6, reach * 0.6);
      gainResolve(g, 6 * hits);
      g.events.emit('fx', { kind: 'slash', x: pl.x, y: pl.y, angle: a.angle, r: reach, color: pl.hasMod('cleave', 'emberedge') ? '#ff8a3a' : '#f2e6d0', map, x2: arc });
      if (hits) { g.events.emit('sfx', { name: 'hit', vol: Math.min(1, 0.5 + hits * 0.15) }); g.hitstop(0.035); }
      break;
    }
    case 'rush': {
      pl.dashT = 0.28; pl.dashDx = Math.cos(a.angle); pl.dashDy = Math.sin(a.angle); pl.dashHit.clear();
      pl.iframes = Math.max(pl.iframes, 0.2);
      g.events.emit('fx', { kind: 'dash', x: pl.x, y: pl.y, angle: a.angle, map });
      gainResolve(g, 10);
      break;
    }
    case 'slam': {
      let tx = a.tx, ty = a.ty;
      const dd = Math.hypot(tx - pl.x, ty - pl.y);
      const maxR = 3.2;
      if (dd > maxR) { tx = pl.x + (tx - pl.x) / dd * maxR; ty = pl.y + (ty - pl.y) / dd * maxR; }
      if (pl.hasMod('slam', 'fissure')) {
        const len = 9 * aoe;
        for (const e of lvl.spatial.query(pl.x + Math.cos(a.angle) * len / 2, pl.y + Math.sin(a.angle) * len / 2, len / 2 + 2, tmp)) {
          const dx = e.x - pl.x, dy = e.y - pl.y;
          const along = dx * Math.cos(a.angle) + dy * Math.sin(a.angle), across = Math.abs(-dx * Math.sin(a.angle) + dy * Math.cos(a.angle));
          if (along > -0.5 && along < len && across < 0.9 + e.r) hitEnemy(g, lvl, e, weaponHit(g, 220, 'slam', { stun: 0.8 }));
        }
        g.events.emit('fx', { kind: 'slam', x: pl.x, y: pl.y, x2: pl.x + Math.cos(a.angle) * len, y2: pl.y + Math.sin(a.angle) * len, r: 1, color: '#ffb04a', map });
      } else {
        const r = 2.4 * aoe;
        slamAt(g, lvl, tx, ty, r, 220);
        if (pl.hasMod('slam', 'aftershock') || s.legendaries.has('leg_doubleslam')) {
          const delay = s.legendaries.has('leg_doubleslam') ? 0.5 : 0.7;
          g.later(delay, () => slamAt(g, lvl, tx, ty, r * 1.15, s.legendaries.has('leg_doubleslam') ? 220 : 130));
        }
      }
      g.events.emit('shake', { amount: 0.35 });
      g.hitstop(0.05);
      break;
    }
    case 'bulwark': {
      const dur = 4 * (s.legendaries.has('leg_bulwark') ? 2 : 1);
      pl.buffs.bulwark = dur;
      pl.st.stun = 0;
      g.events.emit('fx', { kind: 'shield', x: pl.x, y: pl.y, color: '#6ab0ff', map });
      g.events.emit('sfx', { name: 'bulwark' });
      gainResolve(g, 20);
      if (pl.hasMod('bulwark', 'fortify') && g.inOverworld()) {
        for (const b of g.factory.buildings.values()) {
          if ((b.x + b.w / 2 - pl.x) ** 2 + (b.y + b.h / 2 - pl.y) ** 2 > 100) continue;
          b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.3);
          b.invulnUntil = g.time + dur;
        }
        g.events.emit('fx', { kind: 'heal', x: pl.x, y: pl.y, r: 10, color: '#6ab0ff', map });
      }
      break;
    }
    case 'horn': {
      pl.buffs.horn = 8;
      pl.recompute();
      gainResolve(g, 30);
      if (pl.hasMod('horn', 'kindle')) pl.resolve = pl.maxResolve;
      for (const e of lvl.spatial.query(pl.x, pl.y, 9, tmp)) {
        if (e.dead) continue;
        e.st.taunt = 4;
        e.aggro = true;
        if (pl.hasMod('horn', 'dread') && !e.def.boss) e.st.flee = 3;
      }
      if ((pl.hasMod('horn', 'overclock') || s.legendaries.has('leg_overclock')) && g.inOverworld()) {
        const boost = s.legendaries.has('leg_overclock') ? 12 : 12;
        let n = 0;
        for (const b of g.factory.buildings.values()) {
          if ((b.x + b.w / 2 - pl.x) ** 2 + (b.y + b.h / 2 - pl.y) ** 2 > boost * boost) continue;
          b.overclockUntil = g.time + 10; n++;
        }
        if (n) g.events.emit('toast', { text: `Overclock: ${n} structures surge!`, kind: 'good' });
      }
      g.events.emit('fx', { kind: 'horn', x: pl.x, y: pl.y, r: 9, color: '#ffd27a', map });
      g.events.emit('shake', { amount: 0.2 });
      break;
    }
    case 'judgement': {
      const strikes: { x: number; y: number }[] = [];
      let tx = a.tx, ty = a.ty;
      const dd = Math.hypot(tx - pl.x, ty - pl.y);
      if (dd > 9) { tx = pl.x + (tx - pl.x) / dd * 9; ty = pl.y + (ty - pl.y) / dd * 9; }
      strikes.push({ x: tx, y: ty });
      if (s.legendaries.has('leg_judgement')) {
        strikes.push({ x: tx + Math.cos(a.angle) * 4, y: ty + Math.sin(a.angle) * 4 });
        strikes.push({ x: tx - Math.cos(a.angle) * 4, y: ty - Math.sin(a.angle) * 4 });
      }
      const r = 3.4 * aoe;
      for (const p of strikes) {
        const tg = { id: 0, shape: 'circle' as const, x: p.x, y: p.y, r, angle: 0, len: 0, width: 0, t: 0, total: 0.8, color: '#ffb04a', faction: 'player' as const, onDone: () => {} };
        tg.onDone = () => {
          g.events.emit('fx', { kind: 'hammer', x: p.x, y: p.y, r, map });
          g.events.emit('sfx', { name: 'judgement' });
          g.events.emit('shake', { amount: 0.9 });
          g.hitstop(0.09);
          explode(g, lvl, p.x, p.y, r, weaponHit(g, 900, 'judgement', { stun: 1.2, knock: 2 }), 'player');
          const meltdown = pl.hasMod('judgement', 'meltdown');
          lvl.ground.push({ id: g.nextId(), x: p.x, y: p.y, r: r * 0.7 * (meltdown ? 1.4 : 1), t: 0, total: meltdown ? 12 : 4, dps: (s.wMin + s.wMax) * 0.6 * (1 + s.inc.all / 100) * (1 + s.inc.fire / 100), type: 'slag', faction: 'player' });
          if (pl.hasMod('judgement', 'thermal') && g.inOverworld()) {
            const charged = g.power.chargeNear(p.x, p.y, 10, 1e9);
            let refueled = 0;
            for (const b of g.factory.buildings.values()) {
              if (b.kind !== 'generator' && !b.def.burner) continue;
              if ((b.x + b.w / 2 - p.x) ** 2 + (b.y + b.h / 2 - p.y) ** 2 > 100) continue;
              b.fuelEnergy += 30000; refueled++;
            }
            if (charged > 0 || refueled > 0) g.events.emit('toast', { text: `Thermal Discharge: ${Math.round(charged / 1000)} MJ stored, ${refueled} engines refueled`, kind: 'good' });
          }
        };
        lvl.telegraphs.push(tg);
      }
      break;
    }
  }
}

function slamAt(g: Game, lvl: Level, x: number, y: number, r: number, pct: number) {
  for (const e of lvl.spatial.query(x, y, r + 2, tmp)) {
    if (e.dead || Math.hypot(e.x - x, e.y - y) > r + e.r) continue;
    hitEnemy(g, lvl, e, weaponHit(g, pct, 'slam', { stun: 0.8, fromX: x, fromY: y, knock: 0.8 }));
  }
  breakProps(g, lvl, x, y, r);
  g.events.emit('fx', { kind: 'slam', x, y, r, color: '#ffb04a', map: lvl.map.kind });
  g.events.emit('sfx', { name: 'slam' });
}

function breakPropsArc(g: Game, lvl: Level, x: number, y: number, r: number) {
  breakProps(g, lvl, x, y, r);
}

function gainResolve(g: Game, n: number) {
  const pl = g.player;
  pl.resolve = Math.min(pl.maxResolve, pl.resolve + n * (1 + pl.stats.resolveGen / 100));
}

export function updatePlayer(g: Game, dt: number, input: PlayerInput) {
  const pl = g.player;
  const lvl = g.playerLevel();
  if (pl.dead) {
    pl.respawnT -= dt;
    if (pl.respawnT <= 0) g.respawn();
    return;
  }
  pl.anim += dt;
  // timers
  for (const s of pl.skills.values()) if (s.cd > 0) s.cd -= dt;
  const hadHorn = pl.buffs.horn > 0, hadSick = pl.buffs.sick > 0;
  for (const k of Object.keys(pl.buffs) as (keyof typeof pl.buffs)[]) if (pl.buffs[k] > 0) pl.buffs[k] -= dt;
  if ((hadHorn && pl.buffs.horn <= 0) || (hadSick && pl.buffs.sick <= 0)) pl.recompute();
  if (pl.iframes > 0) pl.iframes -= dt;
  if (pl.dodgeCd > 0) pl.dodgeCd -= dt;
  if (pl.hitFlash > 0) pl.hitFlash -= dt;
  if (pl.potionCd > 0) pl.potionCd -= dt;
  if (pl.chargeCd > 0) pl.chargeCd -= dt;
  if (pl.recentHurt > 0) pl.recentHurt -= dt;
  // statuses
  const st = pl.st;
  let dot = 0;
  if (st.burn > 0) { st.burn -= dt; dot += st.burnDps; }
  if (st.poison > 0) { st.poison -= dt; dot += st.poisonDps; }
  if (dot > 0) { pl.hp -= dot * dt; if (pl.hp <= 0) { g.playerDied(); return; } }
  if (st.chill > 0) st.chill -= dt;
  if (st.stun > 0) st.stun -= dt;
  // regen
  const regen = pl.stats.lifeRegen + (pl.buffs.tonic > 0 ? pl.stats.maxLife * 0.225 : 0) + (pl.buffs.bulwark > 0 && pl.hasMod('bulwark', 'restoring') ? pl.stats.maxLife * 0.25 / 4 : 0) + (pl.buffs.bulwark > 0 && pl.stats.legendaries.has('leg_bulwark') ? pl.stats.maxLife * 0.04 : 0);
  healPlayer(g, regen * dt, true);
  if (pl.recentHurt <= 0 && !pl.action) pl.resolve = Math.max(0, pl.resolve - 2 * dt);
  if (st.stun > 0) return;

  // consumables
  if (input.tonic && pl.potionCd <= 0) {
    if (pl.inv.remove('tonic', 1)) { pl.buffs.tonic = 2; pl.potionCd = 1; g.events.emit('fx', { kind: 'heal', x: pl.x, y: pl.y, r: 1.2, color: '#ff4a5a', map: lvl.map.kind }); g.events.emit('sfx', { name: 'drink' }); }
    else g.events.emit('toast', { text: 'No Mending Tonics — craft them from Bloodcap (H)', kind: 'warn' });
  }
  if (input.charge && pl.chargeCd <= 0) {
    if (pl.inv.remove('charge', 1)) {
      pl.chargeCd = 0.6;
      const dx = input.aimX - pl.x, dy = input.aimY - pl.y;
      const d = Math.min(8, Math.hypot(dx, dy)) || 1;
      const tx = pl.x + dx / (Math.hypot(dx, dy) || 1) * d, ty = pl.y + dy / (Math.hypot(dx, dy) || 1) * d;
      lvl.projectiles.push({ id: g.nextId(), x: pl.x, y: pl.y, vx: 0, vy: 0, r: 0.25, life: 0.7, faction: 'player', kind: 'charge', pierce: 0, hit: new Set(), tx, ty, t0: 0.7, arc: 1, aoe: 2.4,
        dmg: packet('player', { fire: 60 + pl.level * 12 * (1 + pl.stats.inc.fire / 100), physical: 20 + pl.level * 4, stun: 0.6, knock: 1.5, fromX: tx, fromY: ty }) });
      g.events.emit('sfx', { name: 'throw' });
    } else g.events.emit('toast', { text: 'No Blast Charges (research Volatile Alchemy)', kind: 'warn' });
  }

  // dodge (cancels attack before its hit frame: animation-cancel window)
  if (input.dodge && pl.dodgeCd <= 0 && pl.dashT <= 0) {
    let dx = input.moveX, dy = input.moveY;
    if (!dx && !dy) { dx = Math.cos(pl.facing); dy = Math.sin(pl.facing); }
    const l = Math.hypot(dx, dy) || 1;
    pl.dodgeDx = dx / l; pl.dodgeDy = dy / l;
    pl.dodgeT = 0.28; pl.dodgeCd = 0.85; pl.iframes = 0.3;
    if (pl.action && !pl.action.fired) pl.action = null;
    else if (pl.action && pl.action.fired) pl.action = null;
    g.events.emit('fx', { kind: 'dust', x: pl.x, y: pl.y, r: 0.6, color: '#8a7a6a', map: lvl.map.kind });
    g.events.emit('sfx', { name: 'dodge' });
  }
  // movement
  const msMult = 1 + pl.stats.moveSpeed / 100;
  const baseSpeed = 5.4 * msMult * (st.chill > 0 ? 0.7 : 1);
  let mx = input.moveX, my = input.moveY;
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  if (pl.dodgeT > 0) {
    pl.dodgeT -= dt;
    moveActor(g, lvl, pl, pl.dodgeDx * 15 * dt, pl.dodgeDy * 15 * dt, pl.r, 'player');
  } else if (pl.dashT > 0) {
    pl.dashT -= dt;
    const before = { x: pl.x, y: pl.y };
    moveActor(g, lvl, pl, pl.dashDx * 24 * dt, pl.dashDy * 24 * dt, pl.r, 'player');
    for (const e of lvl.spatial.query(pl.x, pl.y, 1.6, tmp)) {
      if (e.dead || pl.dashHit.has(e.id)) continue;
      pl.dashHit.add(e.id);
      hitEnemy(g, lvl, e, weaponHit(g, 140, 'rush', { knock: 1.2 }));
    }
    const stuck = before.x === pl.x && before.y === pl.y;
    if (pl.buffs && pl.skills.get('rush')!.mods.has('guarded')) pl.buffs.guarded = 3;
    if (stuck) pl.dashT = 0;
    if (pl.dashT <= 0) {
      for (const e of lvl.spatial.query(pl.x, pl.y, 2, tmp)) if (!e.dead) hitEnemy(g, lvl, e, packet('player', { physical: 1, stun: 1, noLeech: true }));
      if (pl.hasMod('rush', 'shockwave')) {
        explode(g, lvl, pl.x, pl.y, 2.6, weaponHit(g, 120, 'rush', { stun: 0.5, knock: 1 }), 'player');
      }
      if (pl.stats.legendaries.has('leg_rushfire')) {
        // fire trail along the dash path
        for (let k = 0; k < 5; k++) lvl.ground.push({ id: g.nextId(), x: pl.x - pl.dashDx * k * 1.3, y: pl.y - pl.dashDy * k * 1.3, r: 0.9, t: 0, total: 4, dps: (pl.stats.wMin + pl.stats.wMax) * 0.5, type: 'fire', faction: 'player' });
      }
      g.events.emit('shake', { amount: 0.25 });
    }
  } else {
    let mm = 1;
    if (pl.action) mm = pl.action.moveMult;
    pl.vx = mx * baseSpeed * mm; pl.vy = my * baseSpeed * mm;
    if (pl.vx || pl.vy) moveActor(g, lvl, pl, pl.vx * dt, pl.vy * dt, pl.r, 'player');
    if (!pl.action && (mx || my)) pl.facing = Math.atan2(my, mx);
  }
  // hazards: lava/vents
  const ti = lvl.map.idx(Math.floor(pl.x), Math.floor(pl.y));
  if (lvl.map.terrain[ti] === 11 && Math.sin(g.time * 2 + (ti % 7)) > 0.6) damagePlayer(g, packet('env', { fire: 15 * dt * 8 }));

  // skill actions with input buffering
  if (!input.blockCombat) {
    for (let i = 0; i < 6; i++) {
      if (input.skillPressed[i] || (input.skillHeld[i] && (i === 0))) {
        if (!pl.action && pl.dodgeT <= 0 && pl.dashT <= 0) begin(g, i, input);
        else if (input.skillPressed[i]) pl.buffered = { slot: i, t: 0.25 };
      }
    }
  }
  if (pl.buffered) {
    pl.buffered.t -= dt;
    if (pl.buffered.t <= 0) pl.buffered = null;
    else if (!pl.action && pl.dodgeT <= 0 && pl.dashT <= 0) { begin(g, pl.buffered.slot, input); pl.buffered = null; }
  }
  if (pl.action) {
    const a = pl.action;
    a.t += dt;
    if (!a.fired && a.t >= a.hitAt) { a.fired = true; fire(g, lvl); }
    if (a.t >= a.dur) pl.action = null;
  }

  // gathering
  updateGather(g, dt, input.gather && !pl.action);
  // interaction
  if (input.interact) g.interact();
}

function updateGather(g: Game, dt: number, active: boolean) {
  const pl = g.player;
  const lvl = g.playerLevel();
  const m = lvl.map;
  if (!active) { pl.gatherTarget = null; pl.gatherT = 0; return; }
  // find nearest gatherable within 2 tiles of the player (prefers cursor-less proximity)
  let best: { x: number; y: number; kind: string } | null = null, bd = 99;
  const px = Math.floor(pl.x), py = Math.floor(pl.y);
  for (let oy = -2; oy <= 2; oy++)
    for (let ox = -2; ox <= 2; ox++) {
      const tx = px + ox, ty = py + oy;
      if (!m.inBounds(tx, ty)) continue;
      const i = m.idx(tx, ty);
      let kind = '';
      if (m.tree[i]) kind = 'tree';
      else if (m.fungus[i] === 255) kind = 'fungus';
      else if (m.res[i] && m.amt[i] > 0 && m.occ[i] === 0) kind = 'ore';
      else if (m.terrain[i] === 3 && m.kind === 'overworld') kind = 'rock';
      if (!kind) continue;
      const d = Math.hypot(tx + 0.5 - pl.x, ty + 0.5 - pl.y) + (kind === 'rock' ? 0.8 : 0);
      if (d < bd) { bd = d; best = { x: tx, y: ty, kind }; }
    }
  if (!best || bd > 2.3) { pl.gatherTarget = null; return; }
  if (!pl.gatherTarget || pl.gatherTarget.x !== best.x || pl.gatherTarget.y !== best.y) { pl.gatherTarget = best; pl.gatherT = 0; }
  pl.facing = Math.atan2(best.y + 0.5 - pl.y, best.x + 0.5 - pl.x);
  const speed = 1.6 * (1 + pl.stats.mineSpeed / 100) * (1 + g.research.bonus.miningSpeed);
  pl.gatherT += dt * speed;
  const need = best.kind === 'tree' ? 0.9 : best.kind === 'fungus' ? 1.2 : 1;
  if (pl.gatherT < need) return;
  pl.gatherT = 0;
  const i = m.idx(best.x, best.y);
  const give = (id: string, n: number) => {
    const left = pl.inv.add(id, n);
    if (left < n) { g.quests.onGather(id, n - left); g.events.emit('fx', { kind: 'gather', x: best!.x + 0.5, y: best!.y + 0.5, color: '#ffd27a', map: m.kind }); }
    if (left > 0) g.events.emit('toast', { text: 'Inventory full', kind: 'warn' });
  };
  g.events.emit('sfx', { name: best.kind === 'tree' ? 'chop' : 'mine' });
  switch (best.kind) {
    case 'tree':
      give('wood', 1);
      m.tree[i]--;
      if (m.tree[i] === 0) { m.markDirty(best.x, best.y); g.events.emit('fx', { kind: 'dust', x: best.x + 0.5, y: best.y + 0.5, r: 1, color: '#6a5a3a', map: m.kind }); }
      break;
    case 'fungus':
      give('bloodcap', 2);
      m.fungus[i] = 60; // regrows
      m.markDirty(best.x, best.y);
      break;
    case 'ore': {
      give(RES_ITEM[m.res[i]], 1);
      m.amt[i]--;
      if (m.amt[i] === 0) { m.res[i] = 0; m.markDirty(best.x, best.y); }
      break;
    }
    case 'rock':
      give('stone', 1);
      break;
  }
}

export function weaponName(g: Game) {
  const w = g.player.gear.mainhand;
  return w ? BASE_MAP.get(w.base)!.name : 'Bare Fists';
}
