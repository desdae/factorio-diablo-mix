import { BUILDING_MAP } from '../data/buildings';
import type { Factory } from '../sim/factory';
import type { Game } from './game';

export interface BlueprintEntry { d: string; x: number; y: number; r: number; rc?: string | null; f?: string | null; c?: { item: string; lt: number } | null }
export interface Blueprint { name: string; w: number; h: number; entries: BlueprintEntry[] }

const PREFIX = 'EFBP1:';

/** Captures every building whose origin lies inside the rectangle. */
export function captureBlueprint(f: Factory, x0: number, y0: number, x1: number, y1: number, name = 'Blueprint'): Blueprint | null {
  const lx = Math.min(x0, x1), ly = Math.min(y0, y1), hx = Math.max(x0, x1), hy = Math.max(y0, y1);
  const entries: BlueprintEntry[] = [];
  const seen = new Set<number>();
  let maxX = 0, maxY = 0;
  for (let y = ly; y <= hy; y++)
    for (let x = lx; x <= hx; x++) {
      const b = f.at(x, y);
      if (!b || seen.has(b.id)) continue;
      seen.add(b.id);
      if (b.x < lx || b.y < ly) continue;
      entries.push({ d: b.def.id, x: b.x - lx, y: b.y - ly, r: b.dir, rc: b.recipe && b.kind !== 'furnace' ? b.recipe.id : null, f: b.filter, c: b.cond });
      maxX = Math.max(maxX, b.x - lx + b.w); maxY = Math.max(maxY, b.y - ly + b.h);
    }
  if (!entries.length) return null;
  return { name, w: maxX, h: maxY, entries };
}

function fp(e: BlueprintEntry) {
  const d = BUILDING_MAP.get(e.d)!;
  return e.r % 2 === 1 ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}

/** Rotates 90° clockwise. */
export function rotateBlueprint(bp: Blueprint): Blueprint {
  return {
    name: bp.name, w: bp.h, h: bp.w,
    entries: bp.entries.map((e) => {
      const s = fp(e);
      return { ...e, x: bp.h - e.y - s.h, y: e.x, r: (e.r + 1) % 4 };
    }),
  };
}

/** Mirrors horizontally (east ↔ west). */
export function mirrorBlueprint(bp: Blueprint): Blueprint {
  return {
    name: bp.name, w: bp.w, h: bp.h,
    entries: bp.entries.map((e) => {
      const s = fp(e);
      return { ...e, x: bp.w - e.x - s.w, r: e.r === 0 ? 2 : e.r === 2 ? 0 : e.r };
    }),
  };
}

export function encodeBlueprint(bp: Blueprint): string {
  const json = JSON.stringify(bp);
  return PREFIX + btoa(unescape(encodeURIComponent(json)));
}

export function decodeBlueprint(s: string): Blueprint {
  const t = s.trim();
  if (!t.startsWith(PREFIX)) throw new Error('Not a blueprint string');
  const bp = JSON.parse(decodeURIComponent(escape(atob(t.slice(PREFIX.length))))) as Blueprint;
  if (!Array.isArray(bp.entries)) throw new Error('Malformed blueprint');
  for (const e of bp.entries) if (!BUILDING_MAP.has(e.d)) throw new Error(`Blueprint references unknown building '${e.d}'`);
  return bp;
}

/** Places ghosts for every entry (skipping occupied spots). Wisps then build them from inventory. */
export function pasteBlueprint(g: Game, bp: Blueprint, ox: number, oy: number): { placed: number; blocked: number } {
  let placed = 0, blocked = 0;
  for (const e of bp.entries) {
    const x = ox + e.x, y = oy + e.y;
    if (!g.factory.canPlace(e.d, x, y, e.r).ok) { blocked++; continue; }
    g.placeGhost(e.d, x, y, e.r, e.rc ?? null);
    const gh = g.factory.ghosts.get(g.overworld.idx(x, y));
    if (gh) { gh.filter = e.f ?? null; gh.cond = e.c ?? null; }
    placed++;
  }
  return { placed, blocked };
}

export function blueprintCost(bp: Blueprint): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of bp.entries) m.set(e.d, (m.get(e.d) ?? 0) + 1);
  return m;
}
