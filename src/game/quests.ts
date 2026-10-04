import { QUESTS, QUEST_MAP, type QuestDef } from '../data/quests';
import type { Game } from './game';
import type { Enemy } from './types';

/** Main questline tracker. Objectives observe gameplay events and factory statistics. */
export class QuestTracker {
  active: string | null = 'q1';
  progress = 0;
  completed = new Set<string>();
  baseline = 0;
  private g: Game;
  constructor(g: Game) { this.g = g; }

  activeId() { return this.active; }
  def(): QuestDef | null { return this.active ? QUEST_MAP.get(this.active) ?? null : null; }

  private bump(n: number) {
    const q = this.def();
    if (!q) return;
    this.progress = Math.min(q.objective.count, this.progress + n);
    if (this.progress >= q.objective.count) this.complete();
  }

  onKill(e: Enemy) {
    const q = this.def();
    if (!q) return;
    if (q.objective.type === 'kill' && (!q.objective.target || q.objective.target === e.def.id)) this.bump(1);
    if (q.objective.type === 'kill_boss' && q.objective.target === e.def.id) this.bump(1);
  }
  onGather(item: string, n: number) {
    const q = this.def();
    if (q?.objective.type === 'gather' && q.objective.target === item) this.bump(n);
  }
  onBuild(defId: string) {
    const q = this.def();
    if (q?.objective.type === 'build' && q.objective.target === defId) this.bump(1);
  }
  onResearch(techId: string) {
    const q = this.def();
    if (q?.objective.type === 'research' && (!q.objective.target || q.objective.target === techId)) this.bump(1);
  }
  onWaveSurvived() {
    const q = this.def();
    if (q?.objective.type === 'survive_wave') this.bump(1);
  }

  /** Polled objectives (factory production, megaproject). */
  update() {
    const q = this.def();
    if (!q) return;
    if (q.objective.type === 'produce') {
      const total = this.g.factory.totalProduced.get(q.objective.target!) ?? 0;
      const p = total - this.baseline;
      if (p > this.progress) this.bump(p - this.progress);
    }
    if (q.objective.type === 'deliver_beacon' && this.g.factory.beaconComplete) this.bump(1);
    if (q.objective.type === 'research' && q.objective.target && this.g.research.done.has(q.objective.target)) this.bump(1);
  }

  complete() {
    const q = this.def();
    if (!q) return;
    const g = this.g;
    this.completed.add(q.id);
    const pl = g.player;
    if (pl.addXp(q.rewards.xp)) g.onLevelUp();
    if (q.rewards.skillPoint) pl.skillPoints++;
    for (const it of q.rewards.items ?? []) {
      const left = pl.inv.add(it.item, it.count);
      if (left) g.addDrop(g.playerLevel(), pl.x, pl.y, { item: it.item, count: left });
    }
    g.events.emit('quest', { id: q.id, done: true });
    g.events.emit('sfx', { name: 'quest' });
    g.events.emit('banner', { title: 'Quest Complete', sub: q.name, color: '#ffd27a' });
    this.active = q.next ?? null;
    this.progress = 0;
    const nq = this.def();
    if (nq) {
      if (nq.objective.type === 'produce') this.baseline = g.factory.totalProduced.get(nq.objective.target!) ?? 0;
      g.events.emit('quest', { id: nq.id, done: false });
      g.events.emit('dialog', { npc: nq.giver, text: nq.text });
      this.update();
    } else {
      g.events.emit('victory', {});
    }
  }

  serialize() { return { active: this.active, progress: this.progress, completed: [...this.completed], baseline: this.baseline }; }
  load(d: ReturnType<QuestTracker['serialize']>) {
    this.active = d.active; this.progress = d.progress; this.completed = new Set(d.completed); this.baseline = d.baseline;
  }
  all() { return QUESTS; }
}
