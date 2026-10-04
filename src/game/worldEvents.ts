import { ELITE_MODS, type EliteModId } from '../data/enemies';
import { Res } from '../world/map';
import { spawnEnemy } from './combat';
import { addTelegraph } from './enemyAI';
import type { Game } from './game';
import { chestLoot } from './loot';

export type WeatherKind = 'clear' | 'ashfall' | 'rain' | 'storm' | 'fog' | 'riftstorm';

/** Dynamic world events: meteors that seed rich ore, rift portals, wandering champions; plus weather. */
export class WorldEvents {
  nextEvent = 240;
  weather: WeatherKind = 'clear';
  weatherT = 180;
  active: { kind: string; x: number; y: number; t: number; data?: number }[] = [];

  update(g: Game, dt: number) {
    this.weatherT -= dt;
    if (this.weatherT <= 0) {
      this.weatherT = g.rng.range(120, 260);
      const prev = this.weather;
      this.weather = g.rng.weighted<WeatherKind>(['clear', 'ashfall', 'rain', 'storm', 'fog', 'riftstorm'], (w) => ({ clear: 4, ashfall: 2, rain: 2, storm: 1, fog: 1.5, riftstorm: 0.5 }[w]));
      if (this.weather !== prev && this.weather !== 'clear') g.events.emit('toast', { text: WEATHER_TEXT[this.weather], kind: 'info' });
    }
    // storms strike the land; strikes near capacitors charge them
    if ((this.weather === 'storm' || this.weather === 'riftstorm') && g.rng.chance(dt * 0.25) && g.inOverworld()) {
      const pl = g.player;
      const x = pl.x + g.rng.range(-18, 18), y = pl.y + g.rng.range(-12, 12);
      addTelegraph(g.over, { shape: 'circle', x, y, r: 1.4, angle: 0, len: 0, width: 0, t: 0, total: 1.2, color: '#d0c0ff', faction: 'enemy',
        onDone: () => {
          g.events.emit('fx', { kind: 'lightning', x, y: y - 12, x2: x, y2: y, map: 'overworld' });
          g.events.emit('sfx', { name: 'thunder', x, y });
          const stored = g.power.chargeNear(x, y, 6, 2500);
          if (stored > 0) g.events.emit('toast', { text: `Lightning strike stored ${Math.round(stored)} kJ in capacitors`, kind: 'good' });
          if (Math.hypot(pl.x - x, pl.y - y) < 1.8) g.hurtPlayerEnv('lightning', 25);
        } });
    }
    this.nextEvent -= dt;
    if (this.nextEvent <= 0 && g.inOverworld()) {
      this.nextEvent = g.rng.range(240, 420);
      const kind = g.rng.weighted(['meteor', 'rift', 'champion', 'cache'], (k) => ({ meteor: 3, rift: 2, champion: 2, cache: 1.5 }[k]!));
      this.trigger(g, kind);
    }
    for (const ev of this.active) {
      ev.t += dt;
      if (ev.kind === 'rift') {
        if (ev.t < 30 && g.rng.chance(dt * 0.6)) {
          spawnEnemy(g, g.over, g.rng.pick(['husk', 'stalker', 'hexcaller', 'spitter']), ev.x + g.rng.range(-1, 1), ev.y + g.rng.range(-1, 1), { level: g.zoneLevel(ev.x, ev.y) + 1 });
        }
        if (ev.t >= 30 && ev.data !== 1) {
          ev.data = 1;
          g.events.emit('toast', { text: 'The rift collapses, leaving shards behind.', kind: 'good' });
          g.events.emit('fx', { kind: 'portal', x: ev.x, y: ev.y, r: 2, map: 'overworld' });
          for (let i = 0; i < 3; i++) g.addDrop(g.over, ev.x, ev.y, { item: 'rift_shard', count: 1 });
        }
      }
    }
    this.active = this.active.filter((e) => e.t < 60);
  }

  trigger(g: Game, kind: string) {
    const pl = g.player;
    const ang = g.rng.range(0, Math.PI * 2), d = g.rng.range(14, 26);
    let x = Math.round(pl.x + Math.cos(ang) * d), y = Math.round(pl.y + Math.sin(ang) * d);
    const m = g.overworld;
    x = Math.max(8, Math.min(m.w - 8, x)); y = Math.max(8, Math.min(m.h - 8, y));
    switch (kind) {
      case 'meteor': {
        g.events.emit('banner', { title: 'Ember Meteor', sub: 'A fragment of the old Lattice falls nearby — rich ore and guardians await.', color: '#ff8a3a' });
        addTelegraph(g.over, { shape: 'circle', x, y, r: 3, angle: 0, len: 0, width: 0, t: 0, total: 3, color: '#ff6a2a', faction: 'enemy',
          onDone: () => {
            g.events.emit('fx', { kind: 'meteor', x, y, r: 3.5, map: 'overworld' });
            g.events.emit('shake', { amount: 0.8 });
            g.events.emit('sfx', { name: 'explosion' });
            if (Math.hypot(pl.x - x, pl.y - y) < 3.5) g.hurtPlayerEnv('fire', 40);
            for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
              if (ox * ox + oy * oy > 10 || !m.inBounds(x + ox, y + oy)) continue;
              const i = m.idx(x + ox, y + oy);
              if (m.occ[i] || !m.terrainPassable(x + ox, y + oy) && m.tree[i] === 0) continue;
              m.tree[i] = 0; m.res[i] = ox * ox + oy * oy < 3 ? Res.Emberite : Res.Iron; m.amt[i] = 300 + g.rng.int(0, 300);
              m.markDirty(x + ox, y + oy);
            }
            for (let i = 0; i < 4; i++) spawnEnemy(g, g.over, g.rng.pick(['husk', 'brute', 'bloat']), x + g.rng.range(-3, 3), y + g.rng.range(-3, 3), { level: g.zoneLevel(x, y) + 1 });
          } });
        break;
      }
      case 'rift':
        g.events.emit('banner', { title: 'Rift Tear', sub: 'Reality splits open. Close it by surviving for 30 seconds.', color: '#b56cff' });
        this.active.push({ kind: 'rift', x, y, t: 0 });
        g.events.emit('fx', { kind: 'portal', x, y, r: 2, map: 'overworld' });
        break;
      case 'champion': {
        const mods = g.rng.shuffle(ELITE_MODS.map((e) => e.id)).slice(0, 2) as EliteModId[];
        const lv = g.zoneLevel(x, y) + 2;
        spawnEnemy(g, g.over, g.rng.pick(['brute', 'stalker', 'hexcaller']), x, y, { level: lv, elite: mods, champion: true });
        for (let i = 0; i < 3; i++) spawnEnemy(g, g.over, 'husk', x + g.rng.range(-2, 2), y + g.rng.range(-2, 2), { level: lv, minion: true });
        g.events.emit('banner', { title: 'Wandering Champion', sub: `A ${mods.join(' & ')} champion stalks the wilds.`, color: '#ffe05a' });
        break;
      }
      case 'cache':
        g.events.emit('banner', { title: 'Abandoned Convoy', sub: 'A wrecked Wright supply wagon lies nearby, guarded by scavengers.', color: '#c9a24a' });
        for (let i = 0; i < 4; i++) spawnEnemy(g, g.over, g.rng.pick(['husk', 'spitter', 'mender']), x + g.rng.range(-2, 2), y + g.rng.range(-2, 2), { level: g.zoneLevel(x, y) });
        g.later(1, () => chestLoot(g, g.over, x, y, g.zoneLevel(x, y) + 2, 1.3));
        break;
    }
    g.eventMarker = { x, y, t: g.time, kind };
  }
}

const WEATHER_TEXT: Record<WeatherKind, string> = {
  clear: 'The skies clear.', ashfall: 'Ash begins to fall.', rain: 'A cold rain sweeps in.', storm: 'A thunderstorm rolls in. Capacitors may catch lightning.',
  fog: 'Fog rises from the cinders.', riftstorm: 'A rift-storm crackles overhead! Lightning strikes empower capacitors.',
};
