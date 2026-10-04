import { RECIPE_MAP } from '../data/recipes';
import type { Game } from './game';

export interface Wisp {
  x: number; y: number;
  task: { kind: 'build' | 'repair'; key: number; x: number; y: number } | null;
  t: number;
}

/**
 * Construction wisps: personal drones that fly to ghost blueprints within range and build them using
 * the hero's inventory, and repair damaged structures. Count scales with research, gear and passives.
 */
export function updateWisps(g: Game, dt: number) {
  const pl = g.player;
  const want = g.inOverworld() ? pl.stats.drones : 0;
  while (g.wisps.length < want) g.wisps.push({ x: pl.x, y: pl.y, task: null, t: 0 });
  if (g.wisps.length > want) g.wisps.length = want;
  const f = g.factory;
  const claimed = new Set(g.wisps.filter((w) => w.task).map((w) => w.task!.key));
  for (const w of g.wisps) {
    w.t += dt;
    if (!w.task) {
      // seek nearest ghost or damaged building within 28 tiles
      let best: Wisp['task'] = null, bd = 28 * 28;
      for (const [key, gh] of f.ghosts) {
        if (claimed.has(key)) continue;
        const d = (gh.x - pl.x) ** 2 + (gh.y - pl.y) ** 2;
        if (d < bd && hasMaterials(g, gh.def)) { bd = d; best = { kind: 'build', key, x: gh.x + 0.5, y: gh.y + 0.5 }; }
      }
      if (!best && g.time % 1 < dt * 2) {
        for (const b of f.buildings.values()) {
          if (b.hp >= b.maxHp || claimed.has(-b.id) || g.time - b.lastHit < 3) continue;
          const d = (b.x - pl.x) ** 2 + (b.y - pl.y) ** 2;
          if (d < bd) { bd = d; best = { kind: 'repair', key: -b.id, x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
        }
      }
      if (best) { w.task = best; claimed.add(best.key); }
      else {
        // orbit the hero
        const a = w.t * 2 + g.wisps.indexOf(w) * 2;
        approach(w, pl.x + Math.cos(a) * 1.2, pl.y - 1 + Math.sin(a) * 0.6, dt, 9);
        continue;
      }
    }
    const t = w.task!;
    if (approach(w, t.x, t.y - 0.5, dt, 11)) {
      if (t.kind === 'build') {
        const gh = f.ghosts.get(t.key);
        if (gh && hasMaterials(g, gh.def)) {
          if (f.canPlace(gh.def, gh.x, gh.y, gh.dir).ok) {
            consumeMaterials(g, gh.def);
            const b = f.place(gh.def, gh.x, gh.y, gh.dir);
            if (b) {
              if (gh.recipe && (b.kind === 'assembler' || b.kind === 'forge')) f.setRecipe(b, gh.recipe);
              g.events.emit('fx', { kind: 'build', x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.max(b.w, b.h) / 2, map: 'overworld' });
              g.events.emit('sfx', { name: 'build', x: b.x, y: b.y, vol: 0.5 });
              g.quests.onBuild(b.def.id);
            }
          }
          f.ghosts.delete(t.key);
        }
        w.task = null;
      } else {
        const b = f.buildings.get(-t.key);
        if (!b || b.hp >= b.maxHp) { w.task = null; continue; }
        b.hp = Math.min(b.maxHp, b.hp + 60 * dt);
        if (g.rng.chance(dt * 4)) g.events.emit('fx', { kind: 'sparks', x: t.x, y: t.y, color: '#7ae0c0', map: 'overworld' });
      }
    }
    if (w.task && (w.task.x - pl.x) ** 2 + (w.task.y - pl.y) ** 2 > 40 * 40) w.task = null;
  }
}

function approach(w: Wisp, x: number, y: number, dt: number, speed: number): boolean {
  const dx = x - w.x, dy = y - w.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.3) return true;
  const s = Math.min(d, speed * dt);
  w.x += (dx / d) * s; w.y += (dy / d) * s;
  return d < 0.5;
}

export function hasMaterials(g: Game, defId: string): boolean {
  const inv = g.player.inv;
  if (inv.count(defId) > 0) return true;
  const r = RECIPE_MAP.get(defId);
  return !!r && g.research.isUnlocked(defId) && r.inputs.every((s) => inv.count(s.item) >= s.count);
}

export function consumeMaterials(g: Game, defId: string): boolean {
  const inv = g.player.inv;
  if (inv.remove(defId, 1)) return true;
  const r = RECIPE_MAP.get(defId);
  if (!r || !r.inputs.every((s) => inv.count(s.item) >= s.count)) return false;
  for (const s of r.inputs) inv.remove(s.item, s.count);
  return true;
}
