import { h } from './dom';
import type { UI } from './ui';
import { ITEM_MAP, ITEMS } from '../data/items';
import { ENEMY_MAP, ELITE_MODS, type EliteModId } from '../data/enemies';
import { generateEquip } from '../game/items';
import { spawnEnemy } from '../game/combat';

/** Developer console: spawn, give, teleport, inspect, profile. */
export class Console {
  open = false;
  el: HTMLElement | null = null;
  log: HTMLElement | null = null;
  history: string[] = [];
  constructor(private ui: UI) {}

  toggle() {
    this.open = !this.open;
    if (this.open) {
      this.el = h('div', { id: 'console' }, (this.log = h('div', { class: 'log' }, 'Emberforge developer console. Type "help".\n')), (() => {
        const inp = h('input', { type: 'text', id: 'console-input' }) as HTMLInputElement;
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { const c = inp.value; inp.value = ''; this.run(c); }
          if (e.key === 'ArrowUp' && this.history.length) inp.value = this.history[this.history.length - 1];
          e.stopPropagation();
        });
        setTimeout(() => inp.focus());
        return inp;
      })());
      document.body.appendChild(this.el);
    } else { this.el?.remove(); this.el = null; this.ui.input.textFocus = false; }
  }

  print(s: string) { if (this.log) { this.log.textContent += s + '\n'; this.log.scrollTop = 1e9; } }

  run(cmd: string) {
    this.history.push(cmd);
    this.print('> ' + cmd);
    const g = this.ui.game;
    if (!g) { this.print('No game running'); return; }
    const [c, ...a] = cmd.trim().split(/\s+/);
    const pl = g.player;
    const lvl = g.playerLevel();
    try {
      switch (c) {
        case 'help': this.print('give <item> [n] · equip <rarity 0-6> [ilvl] · spawn <enemy> [n] [elite mods,comma] · tp <x> <y> · tpoi <kind> · level <n> · god · research all|<id> · embers <n> · wave · event <meteor|rift|champion|cache> · time <seconds> · weather <kind> · kill · nav · power · items · enemies · fps · heal · dungeon · seed'); break;
        case 'give': { const id = a[0]; if (!ITEM_MAP.has(id)) { this.print('Unknown item. Try "items".'); break; } const left = pl.inv.add(id, Number(a[1] ?? 1)); this.print(`Gave ${Number(a[1] ?? 1) - left} ${id}`); break; }
        case 'items': this.print(ITEMS.map((i) => i.id).join(' ')); break;
        case 'enemies': this.print([...ENEMY_MAP.keys()].join(' ') + '\nelite mods: ' + ELITE_MODS.map((m) => m.id).join(' ')); break;
        case 'equip': { const e = generateEquip(g.lootRng, { ilvl: Number(a[1] ?? pl.level), rarity: Math.min(5, Number(a[0] ?? 4)) }); pl.inv.addEquip(e); this.print(`Created ${e.name}`); break; }
        case 'spawn': {
          const id = a[0]; if (!ENEMY_MAP.has(id)) { this.print('Unknown enemy'); break; }
          const n = Number(a[1] ?? 1); const mods = (a[2]?.split(',') ?? []) as EliteModId[];
          for (let i = 0; i < n; i++) spawnEnemy(g, lvl, id, pl.x + 4 + Math.random() * 3, pl.y + (Math.random() - 0.5) * 6, { level: g.zoneLevel(pl.x, pl.y) + 1, elite: mods, champion: mods.length > 0 });
          this.print(`Spawned ${n} ${id}`); break;
        }
        case 'tp': pl.x = Number(a[0]) + 0.5; pl.y = Number(a[1]) + 0.5; break;
        case 'tpoi': { const p = lvl.map.pois.find((q) => q.kind === a[0]); if (p) { pl.x = p.x + 0.5; pl.y = p.y + 3.5; } else this.print('No such POI'); break; }
        case 'level': { const n = Number(a[0] ?? 1); for (let i = 0; i < n; i++) pl.addXp(1e9 > 0 ? (100 * Math.pow(pl.level, 1.65)) | 0 : 0); g.onLevelUp(); break; }
        case 'god': g.god = !g.god; this.print(`God mode ${g.god ? 'on' : 'off'}`); break;
        case 'heal': pl.hp = pl.stats.maxLife; pl.resolve = pl.maxResolve; break;
        case 'research': if (a[0] === 'all') g.debugGrantAll(); else { const t = [...g.research.done]; g.research.complete((require_tech(a[0]))); this.print(`done: ${t.length + 1}`); } break;
        case 'embers': pl.embers += Number(a[0] ?? 1000); break;
        case 'wave': g.threat.cooldown = 0; g.threat.pool = g.threat.nextCost; this.print('Assault incoming'); break;
        case 'event': g.worldEvents.trigger(g, a[0] ?? 'meteor'); break;
        case 'time': g.time += Number(a[0] ?? 60); break;
        case 'weather': g.worldEvents.weather = (a[0] ?? 'storm') as never; g.worldEvents.weatherT = 200; break;
        case 'kill': for (const e of lvl.enemies) if (!e.dead && Math.hypot(e.x - pl.x, e.y - pl.y) < 30) { e.hp = 1; e.st.burn = 1; e.st.burnDps = 999; } break;
        case 'nav': this.ui.view.debugNav = !this.ui.view.debugNav; break;
        case 'power': this.ui.view.debugPower = !this.ui.view.debugPower; break;
        case 'fps': g.settings.showFps = !g.settings.showFps; break;
        case 'dungeon': g.enterDungeon(); break;
        case 'seed': this.print(`seed ${g.seedText} (${g.seed})`); break;
        case 'inspect': { const b = this.ui.view.hover; this.print(b ? JSON.stringify({ id: b.id, def: b.def.id, status: b.status, input: [...b.input], output: [...b.output], net: b.net, hp: b.hp }) : 'Hover a building'); break; }
        default: this.print('Unknown command');
      }
    } catch (e) { this.print('Error: ' + (e as Error).message); }
  }
}

import { TECH_MAP } from '../data/techs';
function require_tech(id: string) { const t = TECH_MAP.get(id); if (!t) throw new Error('Unknown tech'); return t; }
