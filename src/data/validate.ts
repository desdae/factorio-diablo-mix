import { ITEM_MAP } from './items';
import { BUILDINGS, BUILDING_MAP } from './buildings';
import { RECIPES, RECIPE_MAP } from './recipes';
import { TECHS, TECH_MAP } from './techs';
import { ENEMIES } from './enemies';
import { AFFIXES, BASES, ARTIFACTS, BASE_MAP, LEGENDARY_MAP, STATS } from './equipment';
import { SKILLS, PASSIVES, PASSIVE_MAP } from './skills';
import { QUESTS, QUEST_MAP } from './quests';

/** Detects broken cross references in content data. Returns a list of human-readable errors. */
export function validateContent(): string[] {
  const errs: string[] = [];
  const item = (id: string, ctx: string) => { if (!ITEM_MAP.has(id)) errs.push(`${ctx}: unknown item '${id}'`); };
  for (const b of BUILDINGS) {
    for (const c of b.cost) item(c.item, `building ${b.id} cost`);
    if (b.w < 1 || b.h < 1) errs.push(`building ${b.id}: bad size`);
  }
  const ids = new Set<string>();
  for (const r of RECIPES) {
    if (ids.has(r.id)) errs.push(`recipe ${r.id}: duplicate id`);
    ids.add(r.id);
    for (const s of r.inputs) item(s.item, `recipe ${r.id} input`);
    for (const s of r.outputs) item(s.item, `recipe ${r.id} output`);
    if (r.time <= 0) errs.push(`recipe ${r.id}: non-positive time`);
    if (!r.forge && r.outputs.length === 0) errs.push(`recipe ${r.id}: no outputs`);
  }
  // every non-unlocked recipe must be reachable by some tech
  const unlockedByTech = new Set(TECHS.flatMap((t) => t.unlocks));
  for (const r of RECIPES) if (!r.unlocked && !unlockedByTech.has(r.id)) errs.push(`recipe ${r.id}: never unlocked`);
  for (const t of TECHS) {
    for (const p of t.prereqs) if (!TECH_MAP.has(p)) errs.push(`tech ${t.id}: unknown prereq '${p}'`);
    for (const u of t.unlocks) if (!RECIPE_MAP.has(u)) errs.push(`tech ${t.id}: unlocks unknown recipe '${u}'`);
    for (const c of t.cost) item(c.item, `tech ${t.id} cost`);
    if (t.relic) item(t.relic, `tech ${t.id} relic`);
  }
  // tech prereq cycles
  const visiting = new Set<string>(), done = new Set<string>();
  const visit = (id: string) => {
    if (done.has(id)) return;
    if (visiting.has(id)) { errs.push(`tech cycle at ${id}`); return; }
    visiting.add(id);
    for (const p of TECH_MAP.get(id)?.prereqs ?? []) visit(p);
    visiting.delete(id); done.add(id);
  };
  TECHS.forEach((t) => visit(t.id));
  // sigils used by techs must be producible by some unlocked-at-some-point recipe
  const producible = new Set(RECIPES.flatMap((r) => r.outputs.map((o) => o.item)));
  for (const t of TECHS) for (const c of t.cost) if (!producible.has(c.item)) errs.push(`tech ${t.id}: sigil ${c.item} not producible`);
  for (const e of ENEMIES) for (const d of e.drops) item(d.item, `enemy ${e.id} drop`);
  for (const b of BUILDINGS) if (!BUILDING_MAP.has(b.id)) errs.push(`building ${b.id} missing in map`);
  for (const a of AFFIXES) if (!(a.stat in STATS)) errs.push(`affix ${a.id}: unknown stat`);
  for (const b of BASES) if (b.implicit && !(b.implicit.stat in STATS)) errs.push(`base ${b.id}: unknown implicit stat`);
  for (const a of ARTIFACTS) {
    if (!BASE_MAP.has(a.base)) errs.push(`artifact ${a.id}: unknown base`);
    if (!LEGENDARY_MAP.has(a.power)) errs.push(`artifact ${a.id}: unknown power`);
  }
  for (const s of SKILLS) if (s.mods.length === 0) errs.push(`skill ${s.id}: no mods`);
  for (const p of PASSIVES) for (const r of p.prereq) if (!PASSIVE_MAP.has(r)) errs.push(`passive ${p.id}: unknown prereq ${r}`);
  for (const q of QUESTS) {
    if (q.next && !QUEST_MAP.has(q.next)) errs.push(`quest ${q.id}: unknown next`);
    for (const it of q.rewards.items ?? []) item(it.item, `quest ${q.id} reward`);
  }
  return errs;
}
