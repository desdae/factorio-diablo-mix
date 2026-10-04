import type { EliteModId } from '../data/enemies';
import { ELITE_MODS } from '../data/enemies';
import { spawnEnemy } from './combat';
import type { Game } from './game';

/**
 * Rift-bleed threat: working machines emit corruption. Accumulated threat buys assault waves from the
 * Blight Nests. Evolution grows with total emission, raising wave size, enemy level and species variety.
 */
export class ThreatSystem {
  pool = 0;
  totalEmitted = 0;
  nextCost = 70;
  cooldown = 150; // grace period before first assault
  waveNo = 0;
  activeWave = new Set<number>();
  waveInProgress = false;
  rate = 0; // threat per minute (for UI)
  forcedTimer = 0;

  evolution(g: Game): number {
    return Math.min(1, this.totalEmitted / 9000 + g.time / 14400);
  }

  update(g: Game, dt: number) {
    const f = g.factory;
    let emit = f.threatPerSec * dt * g.diff.threat * (g.isNight ? 1.5 : 1);
    if (g.worldMods.endless) emit += dt * 0.15;
    this.rate = f.threatPerSec * 60 * g.diff.threat * (g.isNight ? 1.5 : 1);
    this.pool += emit;
    this.totalEmitted += emit;
    this.cooldown -= dt * g.diff.waveFreq;
    // tutorial pacing: during "They Smell the Smoke" guarantee an assault once defenses exist
    if (g.quests.activeId() === 'q6') {
      this.forcedTimer += dt;
      const hasTurret = [...f.buildings.values()].some((b) => b.kind === 'turret');
      if (hasTurret && this.forcedTimer > 45 && !this.waveInProgress && this.cooldown > 0) this.cooldown = 0, this.pool = Math.max(this.pool, this.nextCost);
    }
    if (this.waveInProgress) {
      for (const id of this.activeWave) {
        const e = g.over.enemies.find((x) => x.id === id);
        if (!e || e.dead) this.activeWave.delete(id);
      }
      if (this.activeWave.size === 0) {
        this.waveInProgress = false;
        g.events.emit('banner', { title: 'Assault Repelled', sub: `Wave ${this.waveNo} broken.`, color: '#7ae0c0' });
        g.events.emit('music', { mood: 'factory' });
        g.quests.onWaveSurvived();
        g.player.addXp(40 + this.waveNo * 20) && g.onLevelUp();
      }
    }
    if (this.cooldown <= 0 && this.pool >= this.nextCost && !this.waveInProgress && f.buildings.size > 0) this.launchWave(g);
  }

  launchWave(g: Game) {
    const evo = this.evolution(g);
    this.pool -= this.nextCost;
    this.nextCost = 70 + this.waveNo * 25;
    this.cooldown = 160 + g.rng.range(0, 80);
    this.waveNo++;
    const nests = g.overworld.pois.filter((p) => p.kind === 'nest');
    // choose the nest closest to the factory centroid
    const c = g.factoryCentroid();
    nests.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
    const nest = nests[g.rng.int(0, Math.min(1, nests.length - 1))];
    if (!nest) return;
    const level = Math.max(1, Math.round(1 + evo * 14 + this.waveNo * 0.4));
    const budget = 6 + this.waveNo * 2.2 + evo * 30;
    const pool: [string, number, number][] = [ // id, cost, min evolution
      ['husk', 1, 0], ['spitter', 2, 0.05], ['moth', 1.5, 0.12], ['bloat', 2.5, 0.2], ['brute', 4, 0.25], ['tunneler', 3, 0.3], ['stalker', 3, 0.4], ['hexcaller', 4, 0.5], ['mender', 3, 0.45],
    ];
    let spent = 0;
    const avail = pool.filter((p) => p[2] <= evo);
    while (spent < budget) {
      const [id, cost] = g.rng.pick(avail);
      const e = spawnEnemy(g, g.over, id, nest.x + g.rng.range(-3, 3), nest.y + g.rng.range(-3, 3), { level, wave: true });
      this.activeWave.add(e.id);
      spent += cost;
    }
    if (evo > 0.25 || this.waveNo >= 4) {
      const mods = g.rng.shuffle(ELITE_MODS.map((m) => m.id)).slice(0, evo > 0.6 ? 2 : 1) as EliteModId[];
      const e = spawnEnemy(g, g.over, g.rng.pick(['brute', 'husk', 'stalker']), nest.x, nest.y, { level: level + 1, wave: true, elite: mods, champion: true });
      this.activeWave.add(e.id);
    }
    this.waveInProgress = true;
    g.events.emit('banner', { title: 'The Ashborn Assault!', sub: `Wave ${this.waveNo} emerges from the ${nest.name} — ${this.activeWave.size} attackers`, color: '#ff5a3a' });
    g.events.emit('music', { mood: 'danger' });
    g.events.emit('sfx', { name: 'alarm' });
    g.waveOrigin = { x: nest.x, y: nest.y, t: g.time };
  }

  serialize() {
    return { pool: this.pool, total: this.totalEmitted, nextCost: this.nextCost, cooldown: this.cooldown, waveNo: this.waveNo };
  }
  load(d: ReturnType<ThreatSystem['serialize']>) {
    this.pool = d.pool; this.totalEmitted = d.total; this.nextCost = d.nextCost; this.cooldown = d.cooldown; this.waveNo = d.waveNo;
  }
}
