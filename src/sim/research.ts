import { RECIPES } from '../data/recipes';
import { TECH_MAP, TECHS, type TechDef } from '../data/techs';
import type { ResearchHook } from './factory';

export class Research implements ResearchHook {
  done = new Set<string>();
  progress = new Map<string, number>();
  active: string | null = null;
  relicsDelivered = new Set<string>();
  unlockedRecipes = new Set<string>(RECIPES.filter((r) => r.unlocked).map((r) => r.id));
  onComplete: ((t: TechDef) => void) | null = null;
  bonus = { beltSpeed: 0, miningSpeed: 0, turretDamage: 0, labSpeed: 0, craftSpeed: 0, drones: 0 };

  available(t: TechDef): boolean {
    return !this.done.has(t.id) && t.prereqs.every((p) => this.done.has(p));
  }

  /** Begin researching; relic-gated techs require the relic to have been delivered. */
  start(id: string): { ok: boolean; reason?: string } {
    const t = TECH_MAP.get(id);
    if (!t) return { ok: false, reason: 'Unknown technology' };
    if (!this.available(t)) return { ok: false, reason: 'Prerequisites not met' };
    if (t.relic && !this.relicsDelivered.has(t.relic)) return { ok: false, reason: `Requires ${t.relic}` };
    this.active = id;
    return { ok: true };
  }

  activeCost() {
    if (!this.active) return null;
    return TECH_MAP.get(this.active)!.cost;
  }
  activeUnitTime() {
    const t = this.active ? TECH_MAP.get(this.active)! : null;
    return (t?.unitTime ?? 1) / (1 + this.bonus.labSpeed);
  }
  addUnits(n: number) {
    if (!this.active) return;
    const t = TECH_MAP.get(this.active)!;
    const p = (this.progress.get(t.id) ?? 0) + n;
    this.progress.set(t.id, p);
    if (p >= t.units) this.complete(t);
  }

  complete(t: TechDef) {
    this.done.add(t.id);
    this.progress.set(t.id, t.units);
    for (const u of t.unlocks) this.unlockedRecipes.add(u);
    if (t.bonus) this.bonus[t.bonus.stat] += t.bonus.value;
    if (this.active === t.id) this.active = null;
    this.onComplete?.(t);
  }

  isUnlocked(recipeId: string) {
    return this.unlockedRecipes.has(recipeId);
  }

  serialize() {
    return { done: [...this.done], progress: [...this.progress], active: this.active, relics: [...this.relicsDelivered] };
  }
  load(d: ReturnType<Research['serialize']>) {
    this.done = new Set(); this.progress = new Map(d.progress); this.active = d.active;
    this.relicsDelivered = new Set(d.relics);
    this.unlockedRecipes = new Set(RECIPES.filter((r) => r.unlocked).map((r) => r.id));
    this.bonus = { beltSpeed: 0, miningSpeed: 0, turretDamage: 0, labSpeed: 0, craftSpeed: 0, drones: 0 };
    const cb = this.onComplete; this.onComplete = null;
    for (const id of d.done) { const t = TECH_MAP.get(id); if (t) this.complete(t); }
    this.onComplete = cb;
    this.active = d.active;
  }
}

export { TECHS };
