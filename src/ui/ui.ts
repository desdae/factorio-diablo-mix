import { BUILDINGS, BUILDING_MAP, type BuildingDef } from '../data/buildings';
import { ITEM_MAP } from '../data/items';
import { SKILL_MAP } from '../data/skills';
import { QUEST_MAP } from '../data/quests';
import { ENEMY_MAP } from '../data/enemies';
import { fmt, fmtPower } from '../core/math';
import type { Game } from '../game/game';
import { emptyInput, type PlayerInput, canUse } from '../game/playerControl';
import { hasMaterials } from '../game/wisps';
import { captureBlueprint, mirrorBlueprint, pasteBlueprint, rotateBlueprint, type Blueprint } from '../game/blueprint';
import type { Building } from '../sim/factory';
import { xpForLevel } from '../game/stats';
import type { Renderer, ViewState } from '../render/renderer';
import type { Audio } from '../audio/audio';
import { Input, PAD, keyLabel } from '../input/input';
import { itemIcon, skillIcon } from '../render/icons';
import { RES_COLOR, T } from '../world/map';
import { $, h, tip, tooltip, uiZoom } from './dom';
import { stackTooltip } from './tooltips';
import { PANELS } from './panels/registry';
import { Console } from './console';

export interface AppHooks {
  newGame(o: { seed: string; difficulty: string; mods: Record<string, boolean> }): void;
  continueGame(): void;
  loadSlot(slot: string): Promise<void>;
  saveSlot(slot: string): Promise<void>;
  quitToTitle(): void;
  exportSave(): Promise<string>;
  importSave(text: string): Promise<void>;
  applySettings(): void;
}

const CATS: { id: BuildingDef['hotkeyGroup']; name: string }[] = [
  { id: 'logistics', name: 'Logistics' }, { id: 'production', name: 'Production' }, { id: 'power', name: 'Power' }, { id: 'defense', name: 'Defense' }, { id: 'research', name: 'Research' },
];

export class UI {
  game: Game | null = null;
  mode: 'title' | 'play' = 'title';
  panel: string | null = null;
  panelArg: unknown = null;
  panelEl: HTMLElement | null = null;
  panelState: Record<string, Record<string, unknown>> = {};
  panelRefreshT = 0;
  buildMode = false;
  buildSel: string | null = null;
  buildDir = 0;
  buildCat: BuildingDef['hotkeyGroup'] = 'logistics';
  tool: 'none' | 'decon' | 'blueprint' | 'paste' = 'none';
  dragStart: { x: number; y: number } | null = null;
  lastPlaced: { x: number; y: number; b: Building | null } | null = null;
  paste: Blueprint | null = null;
  heldInv: number | null = null;
  view: ViewState = { build: null, drag: null, paste: null, hover: null, hoverEnemy: null, mouse: { x: 0, y: 0 }, showPower: false, debugNav: false, debugPower: false, buildMode: false };
  console: Console;
  private hudCache: Record<string, string | number> = {};
  private minimapT = 0;
  private toastEls: HTMLElement[] = [];
  private bannerT = 0;
  private dialogT = 0;
  private lastFps = 0;
  private fpsAcc = { t: 0, n: 0 };
  private unsub: (() => void)[] = [];
  private gatherToggle = false;
  bossLag = 1;
  lastSig = '';
  settings!: import('../game/settings').Settings;

  constructor(public root: HTMLElement, public renderer: Renderer, public audio: Audio, public input: Input, public hooks: AppHooks) {
    this.console = new Console(this);
    this.buildStatic();
  }

  // ───────────────────────────── static DOM
  private buildStatic() {
    this.root.append(
      h('div', { id: 'hud', class: 'hidden' },
        h('div', { id: 'orb-life', class: 'orb' }, h('div', { class: 'fill' }), h('div', { class: 'gloss' }), h('div', { class: 'val' })),
        h('div', { id: 'orb-res', class: 'orb' }, h('div', { class: 'fill' }), h('div', { class: 'gloss' }), h('div', { class: 'val' })),
        h('div', { id: 'lvl-badge' }),
        h('div', { id: 'bar', class: 'frame interactive' }),
        h('div', { id: 'xpbar' }, h('div', { class: 'fill' })),
        h('div', { id: 'buffs' }),
        h('div', { id: 'minimap-wrap', class: 'frame interactive' }, h('canvas', { id: 'minimap', width: 200, height: 200 }), h('div', { id: 'clock' }), h('div', { id: 'threat' }, h('div', { class: 'fill' })), h('div', { id: 'threat-label' })),
        h('div', { id: 'tracker', class: 'frame' }),
        h('div', { id: 'toasts' }),
        h('div', { id: 'banner', class: 'hidden' }, h('div', { class: 't' }), h('div', { class: 'rule' }), h('div', { class: 's' })),
        h('div', { id: 'bossbar', class: 'hidden' }, h('div', { class: 'name' }), h('div', { class: 'bar' }, h('div', { class: 'lag' }), h('div', { class: 'fill' }), h('div', { class: 'phase', style: { left: '66%' } }), h('div', { class: 'phase', style: { left: '33%' } }))),
        h('div', { id: 'prompt', class: 'frame hidden' }),
        h('div', { id: 'dialog', class: 'frame hidden' }, h('div', { class: 'who' }), h('div', { class: 'txt' })),
        h('div', { id: 'buildbar', class: 'frame interactive hidden' }),
        h('div', { id: 'powerinfo', class: 'frame hidden' }),
        h('div', { id: 'fps', class: 'hidden' }),
      ),
      h('div', { id: 'death', class: 'hidden' }, h('div', { class: 't' }, 'FALLEN'), h('div', { class: 'dim' }, 'Rekindling…')),
      h('div', { id: 'panel-host' }),
      h('div', { id: 'tooltip', class: 'frame hidden' }),
      h('img', { id: 'cursor-item', class: 'cursor-item hidden' }),
    );
    document.addEventListener('mousemove', (e) => { this.input.overUi = e.target !== this.renderer.canvas; });
  }

  setGame(g: Game) {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.game = g;
    this.mode = 'play';
    this.closePanel();
    this.buildMode = false; this.buildSel = null; this.tool = 'none'; this.paste = null;
    $('hud').classList.remove('hidden');
    $('title')?.remove();
    const ev = g.events;
    this.unsub.push(ev.on('toast', (t) => this.toast(t.text, t.kind)));
    this.unsub.push(ev.on('banner', (b) => this.banner(b.title, b.sub, b.color)));
    this.unsub.push(ev.on('dialog', (d) => this.dialog(d.npc, d.text)));
    this.unsub.push(ev.on('quest', () => { this.hudCache.tracker = ''; }));
    this.unsub.push(ev.on('victory', () => { if (g.victory) this.openPanel('victory'); }));
    this.hudCache = {};
    this.buildBar();
    this.renderSkillBar();
    const q = g.quests.def();
    if (q && g.time < 1) this.dialog(q.giver, q.text);
  }

  // ───────────────────────────── notifications
  toast(text: string, kind: string) {
    const host = $('toasts');
    const t = h('div', { class: `toast ${kind}` }, text);
    host.appendChild(t);
    this.toastEls.push(t);
    if (this.toastEls.length > 5) this.toastEls.shift()?.remove();
    setTimeout(() => { t.style.transition = 'opacity 0.5s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, kind === 'legend' ? 5000 : 3200);
  }
  banner(title: string, sub: string, color = '#ffd27a') {
    const b = $('banner');
    b.classList.remove('hidden', 'show');
    void b.offsetWidth;
    b.style.color = color;
    (b.querySelector('.t') as HTMLElement).textContent = title;
    (b.querySelector('.s') as HTMLElement).textContent = sub;
    b.classList.add('show');
    this.bannerT = 4;
  }
  dialog(who: string, text: string) {
    if (this.game && !this.game.settings.subtitles) return;
    const d = $('dialog');
    d.classList.remove('hidden');
    (d.querySelector('.who') as HTMLElement).textContent = who;
    (d.querySelector('.txt') as HTMLElement).textContent = `“${text}”`;
    this.dialogT = 7;
  }

  // ───────────────────────────── panels
  openPanel(name: string, arg: unknown = null) {
    if (this.panel === name && arg === this.panelArg && name !== 'building') { this.closePanel(); return; }
    this.closePanel();
    const def = PANELS[name];
    if (!def) return;
    this.panel = name;
    this.panelArg = arg;
    this.panelState[name] ??= {};
    const host = $('panel-host');
    this.panelEl = def.render(this, arg);
    host.appendChild(this.panelEl);
    this.lastSig = def.sig ? def.sig(this, arg) : '';
    this.audio.play('click');
  }
  refreshPanel() {
    if (!this.panel || !this.panelEl) return;
    const def = PANELS[this.panel];
    const body = this.panelEl.querySelector('.body') as HTMLElement | null;
    const scroll = body?.scrollTop ?? 0;
    const active = document.activeElement as HTMLInputElement | null;
    const focusId = active?.id;
    const selStart = active?.selectionStart;
    const fresh = def.render(this, this.panelArg);
    if (def.sig) this.lastSig = def.sig(this, this.panelArg);
    tooltip.hide();
    this.panelEl.replaceWith(fresh);
    this.panelEl = fresh;
    const nb = fresh.querySelector('.body') as HTMLElement | null;
    if (nb) nb.scrollTop = scroll;
    if (focusId) { const f = document.getElementById(focusId) as HTMLInputElement | null; if (f) { f.focus(); if (selStart !== undefined && selStart !== null) f.setSelectionRange(selStart, selStart); } }
  }
  closePanel() {
    if (this.panelEl) this.panelEl.remove();
    this.panelEl = null;
    this.panel = null;
    this.panelArg = null;
    tooltip.hide();
    if (this.heldInv !== null) { this.heldInv = null; $('cursor-item').classList.add('hidden'); }
  }

  // ───────────────────────────── per-frame
  frame(dt: number): PlayerInput {
    const inp = emptyInput();
    const g = this.game;
    const input = this.input;
    input.pollGamepad();
    if (input.codePressed('Backquote')) this.console.toggle();
    if (!g || this.mode !== 'play') { if (input.codePressed('Escape')) this.closePanel(); return inp; }
    const pl = g.player;
    const mw = this.renderer.screenToWorld(input.mouseX, input.mouseY);
    this.view.mouse = mw;
    const typing = input.textFocus || this.console.open;
    // global hotkeys
    if (!typing) {
      if (input.codePressed('Escape')) this.escape();
      const toggles: [string, string][] = [['inventory', 'inventory'], ['character', 'inventory'], ['skills', 'skills'], ['research', 'research'], ['production', 'production'], ['map', 'map'], ['quests', 'quests'], ['craft', 'craft']];
      for (const [k, p] of toggles) if (input.keyPressed(k)) this.openPanel(p);
      if (input.keyPressed('build')) this.toggleBuild();
      if (input.codePressed('F3')) { g.settings.showFps = !g.settings.showFps; }
      if (input.codePressed('F4')) this.view.showPower = !this.view.showPower;
      if (input.wheel && !input.overUi) this.renderer.targetZoom = Math.max(18, Math.min(80, this.renderer.targetZoom * (input.wheel > 0 ? 0.88 : 1.13)));
      if (input.padPressed(PAD.START)) this.escape();
      if (input.padPressed(PAD.BACK)) this.openPanel('map');
    }
    const modal = this.panel && PANELS[this.panel]?.modal;
    const blockWorld = typing || !!modal || g.player.dead;
    // movement
    if (!blockWorld) {
      inp.moveX = (input.key('right') ? 1 : 0) - (input.key('left') ? 1 : 0) + input.pad.lx;
      inp.moveY = (input.key('down') ? 1 : 0) - (input.key('up') ? 1 : 0) + input.pad.ly;
    }
    // aiming
    if (input.lastDevice === 'pad' && input.pad.connected) {
      const rx = input.pad.rx, ry = input.pad.ry;
      if (Math.hypot(rx, ry) > 0.3) { inp.aimX = pl.x + rx * 5; inp.aimY = pl.y + ry * 5; }
      else if (Math.hypot(inp.moveX, inp.moveY) > 0.2) { inp.aimX = pl.x + inp.moveX * 3; inp.aimY = pl.y + inp.moveY * 3; }
      else { inp.aimX = pl.x + Math.cos(pl.facing) * 3; inp.aimY = pl.y + Math.sin(pl.facing) * 3; }
      // auto-target nearest enemy when using a controller
      const near = g.playerLevel().spatial.query(pl.x, pl.y, 4, []).filter((e) => !e.dead);
      if (near.length && Math.hypot(rx, ry) <= 0.3) { near.sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y)); inp.aimX = near[0].x; inp.aimY = near[0].y; }
      this.view.mouse = { x: inp.aimX, y: inp.aimY };
    } else { inp.aimX = mw.x; inp.aimY = mw.y; }

    // hover detection
    const tx = Math.floor(mw.x), ty = Math.floor(mw.y);
    this.view.hover = g.inOverworld() ? g.factory.at(tx, ty) : null;
    this.view.buildMode = this.buildMode;

    if (this.buildMode && g.inOverworld() && !blockWorld) this.handleBuild(g, tx, ty);
    else { this.view.build = null; this.view.drag = null; this.view.paste = null; }

    if (!blockWorld) {
      const combatMouse = !this.buildMode && !input.overUi;
      inp.skillPressed[0] = combatMouse && input.mousePressed[0];
      inp.skillHeld[0] = combatMouse && input.mouseDown[0];
      inp.skillPressed[1] = combatMouse && input.mousePressed[2];
      if (!this.buildMode) for (let i = 0; i < 4; i++) inp.skillPressed[2 + i] = input.keyPressed(`skill${3 + i}`);
      // controller skills
      if (input.pad.connected) {
        if (input.padHeld(PAD.A) || input.padHeld(PAD.RT)) { inp.skillHeld[0] = true; inp.skillPressed[0] ||= input.padPressed(PAD.A) || input.padPressed(PAD.RT); }
        inp.skillPressed[1] ||= input.padPressed(PAD.X);
        inp.skillPressed[2] ||= input.padPressed(PAD.LB);
        inp.skillPressed[3] ||= input.padPressed(PAD.RB);
        inp.skillPressed[4] ||= input.padPressed(PAD.LT);
        inp.skillPressed[5] ||= input.padPressed(PAD.Y) && false;
      }
      inp.dodge = input.keyPressed('dodge') || input.padPressed(PAD.B);
      inp.tonic = input.keyPressed('tonic') || input.padPressed(PAD.UP);
      inp.charge = input.keyPressed('charge') || input.padPressed(PAD.DOWN);
      // interact / gather share a key: tap near something interactive, hold elsewhere to gather
      const interactPressed = input.keyPressed('interact') || input.padPressed(PAD.Y);
      const near = g.nearestInteractable();
      if (interactPressed) {
        if (near) inp.interact = true;
        else if (this.view.hover && Math.hypot(this.view.hover.x + this.view.hover.w / 2 - pl.x, this.view.hover.y + this.view.hover.h / 2 - pl.y) < 10) this.openPanel('building', this.view.hover.id);
        else if (!g.settings.holdToGather) this.gatherToggle = !this.gatherToggle;
      }
      const gatherHeld = (input.key('interact') || input.padHeld(PAD.Y)) && !near;
      inp.gather = g.settings.holdToGather ? gatherHeld : this.gatherToggle;
      if (inp.gather && (inp.moveX || inp.moveY) && !g.settings.holdToGather) this.gatherToggle = false;
      inp.blockCombat = this.buildMode;
    }
    if (g.interaction) {
      const it = g.interaction;
      g.interaction = null;
      if (it.kind === 'npc') this.openPanel('npc', it.id);
    }
    // vibration on hits taken
    if (pl.hitFlash > 0.14) input.vibrate(0.4, 80);
    this.updateHud(dt);
    this.panelRefreshT -= dt;
    if (this.panelRefreshT <= 0 && this.panel && PANELS[this.panel]?.live) {
      this.panelRefreshT = 0.2;
      const def = PANELS[this.panel];
      const sig = def.sig ? def.sig(this, this.panelArg) : String(g.time);
      if (sig !== this.lastSig) { this.lastSig = sig; this.refreshPanel(); }
    }
    if (this.heldInv !== null) { const c = $('cursor-item') as HTMLImageElement; const z = uiZoom(); c.style.left = `${input.mouseX / z - 23}px`; c.style.top = `${input.mouseY / z - 23}px`; }
    return inp;
  }

  escape() {
    if (this.console.open) { this.console.toggle(); return; }
    if (this.tool !== 'none') { this.tool = 'none'; this.paste = null; this.dragStart = null; return; }
    if (this.buildSel) { this.buildSel = null; this.buildBar(); return; }
    if (this.panel) { this.closePanel(); return; }
    if (this.buildMode) { this.toggleBuild(); return; }
    this.openPanel('pause');
  }

  toggleBuild() {
    if (!this.game?.inOverworld()) { this.toast('Construction is impossible in the depths.', 'warn'); return; }
    this.buildMode = !this.buildMode;
    this.buildSel = null; this.tool = 'none'; this.paste = null;
    $('buildbar').classList.toggle('hidden', !this.buildMode);
    $('powerinfo').classList.toggle('hidden', !this.buildMode);
    if (this.buildMode) this.buildBar();
  }

  selectBuild(id: string | null) {
    this.buildSel = id;
    this.tool = 'none';
    this.paste = null;
    this.buildBar();
  }

  private handleBuild(g: Game, tx: number, ty: number) {
    const input = this.input;
    const f = g.factory;
    this.view.build = null; this.view.drag = null; this.view.paste = null;
    // build-mode hotkeys
    if (input.keyPressed('deconstruct')) { this.tool = this.tool === 'decon' ? 'none' : 'decon'; this.buildSel = null; this.buildBar(); }
    if (input.keyPressed('blueprint')) { this.tool = this.tool === 'blueprint' ? 'none' : 'blueprint'; this.buildSel = null; this.buildBar(); }
    if (input.keyPressed('pipette') && this.view.hover) { this.selectBuild(this.view.hover.def.id); this.buildDir = this.view.hover.dir; }
    for (let i = 0; i < 9; i++) if (input.codePressed(`Digit${i + 1}`)) {
      const list = BUILDINGS.filter((b) => b.hotkeyGroup === this.buildCat);
      if (list[i]) this.selectBuild(list[i].id);
    }
    if (input.codePressed('Tab')) { const k = CATS.findIndex((c) => c.id === this.buildCat); this.buildCat = CATS[(k + 1) % CATS.length].id; this.buildBar(); }
    if (input.keyPressed('rotate')) {
      if (this.tool === 'paste' && this.paste) this.paste = input.held.has('ShiftLeft') ? mirrorBlueprint(this.paste) : rotateBlueprint(this.paste);
      else this.buildDir = (this.buildDir + (input.held.has('ShiftLeft') ? 3 : 1)) % 4;
    }
    if (input.overUi) return;
    // area tools
    if (this.tool === 'decon' || this.tool === 'blueprint') {
      if (input.mousePressed[0]) this.dragStart = { x: tx, y: ty };
      if (this.dragStart) this.view.drag = { x0: this.dragStart.x, y0: this.dragStart.y, x1: tx, y1: ty, mode: this.tool };
      if (input.mouseReleased[0] && this.dragStart) {
        const s = this.dragStart;
        this.dragStart = null;
        if (this.tool === 'decon') {
          const seen = new Set<Building>();
          for (let y = Math.min(s.y, ty); y <= Math.max(s.y, ty); y++) for (let x = Math.min(s.x, tx); x <= Math.max(s.x, tx); x++) { const b = f.at(x, y); if (b) seen.add(b); f.ghosts.delete(g.overworld.idx(x, y)); }
          for (const b of seen) g.deconstruct(b);
          if (seen.size) this.toast(`Deconstructed ${seen.size} structures`, 'info');
        } else {
          const bp = captureBlueprint(f, s.x, s.y, tx, ty);
          if (bp) { this.paste = bp; this.tool = 'paste'; this.toast(`Blueprint captured: ${bp.entries.length} structures. R rotate, Shift+R mirror, click to paste.`, 'good'); this.panelState.blueprints ??= {}; this.panelState.blueprints.last = bp; }
          else this.toast('Nothing to capture', 'warn');
        }
      }
      if (input.mousePressed[2]) { this.tool = 'none'; this.dragStart = null; }
      return;
    }
    if (this.tool === 'paste' && this.paste) {
      const ox = tx - Math.floor(this.paste.w / 2), oy = ty - Math.floor(this.paste.h / 2);
      this.view.paste = { bp: this.paste, tx: ox, ty: oy };
      if (input.mousePressed[0]) { const r = pasteBlueprint(g, this.paste, ox, oy); this.toast(`Placed ${r.placed} ghosts${r.blocked ? `, ${r.blocked} blocked` : ''} — wisps will build them`, 'info'); this.audio.play('build'); }
      if (input.mousePressed[2]) { this.tool = 'none'; this.paste = null; }
      return;
    }
    if (this.buildSel) {
      const fp = f.footprint(this.buildSel, this.buildDir);
      const bx = tx - Math.floor((fp.w - 1) / 2), by = ty - Math.floor((fp.h - 1) / 2);
      const chk = f.canPlace(this.buildSel, bx, by, this.buildDir);
      const unlocked = g.research.isUnlocked(this.buildSel) || g.player.inv.count(this.buildSel) > 0;
      this.view.build = { def: this.buildSel, dir: this.buildDir, tx: bx, ty: by, valid: chk.ok && unlocked, reason: !unlocked ? 'Not researched' : chk.reason };
      const isBelt = BUILDING_MAP.get(this.buildSel)!.kind === 'belt';
      if (input.mousePressed[0] || (input.mouseDown[0] && (isBelt || this.buildSel === 'wall' || this.buildSel === 'pylon') && (!this.lastPlaced || this.lastPlaced.x !== bx || this.lastPlaced.y !== by))) {
        // drag-to-orient belts
        if (isBelt && this.lastPlaced && input.mouseDown[0] && !input.mousePressed[0]) {
          const dx = bx - this.lastPlaced.x, dy = by - this.lastPlaced.y;
          if (Math.abs(dx) + Math.abs(dy) === 1) {
            this.buildDir = dx === 1 ? 0 : dx === -1 ? 2 : dy === 1 ? 1 : 3;
            if (this.lastPlaced.b && f.buildings.has(this.lastPlaced.b.id) && this.lastPlaced.b.dir !== this.buildDir) {
              const old = this.lastPlaced.b;
              const items = old.bItems.slice(), pos = old.bPos.slice();
              f.remove(old);
              const nb = f.place(old.def.id, old.x, old.y, this.buildDir);
              if (nb) { nb.bItems = items; nb.bPos = pos; }
            }
          } else if (this.buildSel === 'pylon' && Math.hypot(dx, dy) < 6) return;
        }
        const r = g.placeBuilding(this.buildSel, bx, by, this.buildDir);
        if (r.ok) {
          this.lastPlaced = { x: bx, y: by, b: r.b ?? null };
          if (r.ghost && r.reason) this.toast(r.reason, 'info');
          this.buildBar();
        } else if (input.mousePressed[0]) {
          if (this.view.hover && !isBelt) { this.openPanel('building', this.view.hover.id); }
          else { this.toast(r.reason ?? 'Cannot build here', 'warn'); this.audio.play('error'); }
        }
      }
      if (!input.mouseDown[0]) this.lastPlaced = null;
    } else if (input.mousePressed[0] && this.view.hover) {
      this.openPanel('building', this.view.hover.id);
    }
    // right mouse: deconstruct (drag to mass-remove)
    if (input.mouseDown[2]) {
      if (this.buildSel && input.mousePressed[2] && !this.view.hover) { this.selectBuild(null); return; }
      const b = f.at(tx, ty);
      if (b) { g.deconstruct(b); this.buildBar(); }
      const key = g.overworld.idx(tx, ty);
      for (const [k, gh] of f.ghosts) { const fp = f.footprint(gh.def, gh.dir); if (tx >= gh.x && tx < gh.x + fp.w && ty >= gh.y && ty < gh.y + fp.h) f.ghosts.delete(k); }
      void key;
    }
  }

  buildBar() {
    const g = this.game;
    if (!g) return;
    const bar = $('buildbar');
    bar.innerHTML = '';
    const cats = h('div', { class: 'cats' }, ...CATS.map((c) => h('button', { class: `btn small tab ${c.id === this.buildCat ? 'active' : ''}`, onclick: () => { this.buildCat = c.id; this.buildBar(); } }, c.name)),
      h('div', { class: 'grow' }),
      h('button', { class: `btn small ${this.tool === 'decon' ? 'primary' : ''}`, onclick: () => { this.tool = this.tool === 'decon' ? 'none' : 'decon'; this.buildSel = null; this.buildBar(); } }, `Deconstruct [${keyLabel(g.settings.keys.deconstruct)}]`),
      h('button', { class: `btn small ${this.tool === 'blueprint' || this.tool === 'paste' ? 'primary' : ''}`, onclick: () => { this.tool = this.tool === 'blueprint' ? 'none' : 'blueprint'; this.buildSel = null; this.buildBar(); } }, `Blueprint [${keyLabel(g.settings.keys.blueprint)}]`),
      h('button', { class: 'btn small', onclick: () => this.openPanel('blueprints') }, 'Library'),
      h('button', { class: `btn small ${this.view.showPower ? 'primary' : ''}`, onclick: () => { this.view.showPower = !this.view.showPower; this.buildBar(); } }, 'Power Grid'));
    const items = h('div', { class: 'items' });
    BUILDINGS.filter((b) => b.hotkeyGroup === this.buildCat).forEach((b, i) => {
      const have = g.player.inv.count(b.id);
      const unlocked = g.research.isUnlocked(b.id) || have > 0;
      const craftable = !have && hasMaterials(g, b.id);
      const el = h('div', { class: `bslot ${this.buildSel === b.id ? 'sel' : ''} ${unlocked ? '' : 'locked'}`, onclick: () => unlocked ? this.selectBuild(this.buildSel === b.id ? null : b.id) : this.toast('Research required', 'warn') },
        h('img', { src: itemIcon(b.id, 52) }),
        h('div', { class: 'slot-key', style: { position: 'absolute', top: '1px', left: '3px', fontSize: '0.7em', color: '#ffe2a0' } }, String(i + 1)),
        h('div', { class: `cnt ${craftable ? 'craft' : ''}` }, have ? String(have) : craftable ? '⚒' : ''));
      tip(el, () => stackTooltip(b.id, have, g) + (craftable ? '<div class="good" style="font-size:0.85em">Will be crafted from your materials on placement.</div>' : '') + (!unlocked ? '<div class="bad">Requires research</div>' : ''));
      items.appendChild(el);
    });
    const help = h('div', { id: 'buildhelp' }, this.tool === 'decon' ? 'Drag to deconstruct an area · Right-click cancels' : this.tool === 'blueprint' ? 'Drag to capture a blueprint' : this.tool === 'paste' ? 'Click to paste ghosts · R rotate · Shift+R mirror · Right-click cancel' :
      this.buildSel ? 'Click to place (drag for belts/walls) · R rotate · Right-click remove · E pipette · Esc deselect' : 'Select a structure (1–9, Tab switches category) · Click a structure to inspect · Right-click/drag to deconstruct');
    bar.append(cats, items, help);
  }

  // ───────────────────────────── HUD
  private setText(id: string, v: string) {
    if (this.hudCache[id] === v) return;
    this.hudCache[id] = v;
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  renderSkillBar() {
    const g = this.game!;
    const bar = $('bar');
    bar.innerHTML = '';
    const keys = ['LMB', 'RMB', keyLabel(g.settings.keys.skill3), keyLabel(g.settings.keys.skill4), keyLabel(g.settings.keys.skill5), keyLabel(g.settings.keys.skill6)];
    g.player.bar.forEach((sk, i) => {
      const s = h('div', { class: 'slot', id: `skill-${i}` },
        sk ? h('img', { src: skillIcon(sk, 54) }) : null,
        h('div', { class: 'cd', style: { '--p': '0%' } as never }), h('div', { class: 'cdt' }), h('div', { class: 'key' }, keys[i]));
      if (sk) tip(s, () => { const d = SKILL_MAP.get(sk)!; const st = g.player.skills.get(sk)!; return `<div class="tname gold">${d.name} <span class="dim">rank ${g.player.skillRank(sk)}</span></div><div>${d.desc}</div>${d.cost ? `<div class="warn">Costs ${d.cost} Resolve</div>` : ''}${d.cooldown ? `<div class="dim">Cooldown ${d.cooldown}s</div>` : ''}${[...st.mods].map((m) => `<div class="gold">◆ ${d.mods.find((x) => x.id === m)?.name}</div>`).join('')}`; });
      bar.appendChild(s);
    });
    bar.appendChild(h('div', { style: { width: '10px' } }));
    for (const [id, key] of [['tonic', g.settings.keys.tonic], ['charge', g.settings.keys.charge]] as const) {
      const s = h('div', { class: 'slot small', id: `cons-${id}` }, h('img', { src: itemIcon(id, 42) }), h('div', { class: 'key' }, keyLabel(key)), h('div', { class: 'cnt' }));
      tip(s, () => stackTooltip(id, g.player.inv.count(id)));
      bar.appendChild(s);
    }
  }

  private updateHud(dt: number) {
    const g = this.game!;
    const pl = g.player;
    const lifeFrac = Math.max(0, pl.hp / pl.stats.maxLife);
    ($('orb-life').querySelector('.fill') as HTMLElement).style.height = `${lifeFrac * 100}%`;
    ($('orb-res').querySelector('.fill') as HTMLElement).style.height = `${(pl.resolve / pl.maxResolve) * 100}%`;
    this.setTextEl($('orb-life').querySelector('.val') as HTMLElement, 'lifev', `${Math.ceil(Math.max(0, pl.hp))} / ${pl.stats.maxLife}`);
    this.setTextEl($('orb-res').querySelector('.val') as HTMLElement, 'resv', `${Math.floor(pl.resolve)}`);
    const pts = pl.attrPoints + pl.skillPoints + pl.passivePoints;
    this.setText('lvl-badge', `Level ${pl.level}${pts ? `  ✦ ${pts} unspent` : ''}`);
    ($('xpbar').querySelector('.fill') as HTMLElement).style.width = `${(pl.xp / xpForLevel(pl.level)) * 100}%`;
    // skills
    pl.bar.forEach((sk, i) => {
      const el = document.getElementById(`skill-${i}`);
      if (!el || !sk) return;
      const st = pl.skills.get(sk)!;
      const d = SKILL_MAP.get(sk)!;
      const cdTotal = Math.max(0.01, d.cooldown);
      const p = st.cd > 0 ? Math.min(100, (st.cd / cdTotal) * 100) : 0;
      (el.querySelector('.cd') as HTMLElement).style.setProperty('--p', `${p}%`);
      this.setTextEl(el.querySelector('.cdt') as HTMLElement, `cdt${i}`, st.cd > 0.05 ? st.cd.toFixed(st.cd < 3 ? 1 : 0) : '');
      el.classList.toggle('nores', !canUse(g, sk).ok && st.cd <= 0);
    });
    for (const id of ['tonic', 'charge']) { const el = document.getElementById(`cons-${id}`); if (el) this.setTextEl(el.querySelector('.cnt') as HTMLElement, `c${id}`, String(pl.inv.count(id))); }
    // buffs
    const buffs: string[] = [];
    if (pl.buffs.bulwark > 0) buffs.push(`<span class="buff" style="color:#6ab0ff">Bulwark ${pl.buffs.bulwark.toFixed(0)}s</span>`);
    if (pl.buffs.horn > 0) buffs.push(`<span class="buff gold">Rallied ${pl.buffs.horn.toFixed(0)}s</span>`);
    if (pl.buffs.sick > 0) buffs.push(`<span class="buff bad">Ember-Sick ${pl.buffs.sick.toFixed(0)}s</span>`);
    if (pl.st.burn > 0) buffs.push('<span class="buff warn">Burning</span>');
    if (pl.st.poison > 0) buffs.push('<span class="buff good">Poisoned</span>');
    if (pl.st.chill > 0) buffs.push('<span class="buff" style="color:#8ad8ff">Chilled</span>');
    const bh = buffs.join('');
    if (this.hudCache.buffs !== bh) { this.hudCache.buffs = bh; $('buffs').innerHTML = bh; }
    // clock & threat
    const dl = g.daylight();
    const hour = Math.floor(((g.time / g.settings.dayLength + 0.15) % 1) * 24 + 12) % 24;
    this.setText('clock', `${g.isNight ? '☾' : '☀'} ${String(hour).padStart(2, '0')}:00 · ${g.worldEvents.weather}${g.where === 'dungeon' ? ' · Depth ' + g.dungeonDepth : ''}`);
    const th = g.threat;
    ($('threat').querySelector('.fill') as HTMLElement).style.width = `${Math.min(100, (th.pool / th.nextCost) * 100)}%`;
    this.setText('threat-label', th.waveInProgress ? `⚠ Assault in progress — ${th.activeWave.size} attackers` : `Rift-bleed ${fmt(th.rate)}/min · evolution ${(th.evolution(g) * 100).toFixed(0)}%`);
    void dl;
    // minimap
    this.minimapT -= dt;
    if (this.minimapT <= 0) { this.minimapT = 0.25; this.drawMinimap(); }
    // tracker
    const q = g.quests.def();
    const tr = q ? `${q.id}:${g.quests.progress}` : 'none';
    if (this.hudCache.tracker !== tr) {
      this.hudCache.tracker = tr;
      const el = $('tracker');
      if (q) el.innerHTML = `<div class="qname">${q.name}</div><div class="qobj">${objectiveText(q.objective.type, q.objective.target)} <span class="gold">${Math.floor(g.quests.progress)}/${q.objective.count}</span></div><div class="qbar"><div style="width:${(g.quests.progress / q.objective.count) * 100}%"></div></div><div class="qhint">${q.hint}</div>`;
      else el.innerHTML = `<div class="qname">The Lattice Endures</div><div class="qhint">Delve deeper into the Foundry for greater relics, and expand your industry.</div>`;
    }
    // boss bar
    const lvl = g.playerLevel();
    const boss = lvl.enemies.find((e) => e.def.boss && e.aggro && !e.dead);
    const bb = $('bossbar');
    if (boss) {
      bb.classList.remove('hidden');
      this.setTextEl(bb.querySelector('.name') as HTMLElement, 'bossn', `${boss.name} — Lv ${boss.level}`);
      const f = boss.hp / boss.maxHp;
      (bb.querySelector('.fill') as HTMLElement).style.width = `${f * 100}%`;
      (bb.querySelector('.lag') as HTMLElement).style.width = `${f * 100}%`;
    } else bb.classList.add('hidden');
    // prompt
    const near = g.nearestInteractable();
    const pr = $('prompt');
    const hoverB = this.view.hover && !this.buildMode && Math.hypot(this.view.hover.x - pl.x, this.view.hover.y - pl.y) < 10 ? this.view.hover : null;
    const ptxt = near ? `<kbd>${keyLabel(g.settings.keys.interact)}</kbd> ${near.label}` : hoverB ? `<kbd>${keyLabel(g.settings.keys.interact)}</kbd> Inspect ${hoverB.def.name}` : pl.gatherTarget ? `Gathering… (${pl.gatherTarget.kind})` : '';
    if (this.hudCache.prompt !== ptxt) { this.hudCache.prompt = ptxt; pr.innerHTML = ptxt; pr.classList.toggle('hidden', !ptxt); }
    // death
    $('death').classList.toggle('hidden', !pl.dead);
    // banner/dialog timers
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) $('banner').classList.add('hidden'); }
    if (this.dialogT > 0) { this.dialogT -= dt; if (this.dialogT <= 0) $('dialog').classList.add('hidden'); }
    // power info
    if (this.buildMode) {
      let use = 0, cap = 0, stored = 0;
      for (const n of g.power.nets) { use += n.demand; cap += n.supplyCap; stored += n.stored; }
      const hov = this.view.hover ? g.power.netOf(this.view.hover) : undefined;
      const txt = `⚡ Grid: ${fmtPower(use)} / ${fmtPower(cap)}${stored ? ` · stored ${(stored / 1000).toFixed(1)} MJ` : ''} · ${g.power.nets.length} network${g.power.nets.length === 1 ? '' : 's'}` + (hov ? ` · hovered net: ${(hov.satisfaction * 100).toFixed(0)}% satisfied` : '');
      this.setText('powerinfo', txt);
    }
    // fps
    this.fpsAcc.t += dt; this.fpsAcc.n++;
    if (this.fpsAcc.t >= 0.5) { this.lastFps = this.fpsAcc.n / this.fpsAcc.t; this.fpsAcc = { t: 0, n: 0 }; }
    const fpsEl = $('fps');
    fpsEl.classList.toggle('hidden', !g.settings.showFps);
    if (g.settings.showFps) fpsEl.textContent = `FPS ${this.lastFps.toFixed(0)}  render ${this.renderer.frameMs.toFixed(1)}ms  sim ${(g as unknown as { simMs?: number }).simMs?.toFixed(2) ?? '?'}ms\nbuildings ${g.factory.buildings.size}  items ${g.factory.totalItems()}  enemies ${g.playerLevel().enemies.length}\nparticles ${this.renderer.particles.list.length}  pos ${pl.x.toFixed(1)},${pl.y.toFixed(1)}`;
  }

  private setTextEl(el: HTMLElement, key: string, v: string) {
    if (this.hudCache[key] === v) return;
    this.hudCache[key] = v;
    el.textContent = v;
  }

  private mmBase: ImageData | null = null;
  private mmMapVer = -1;
  private mmMap: unknown = null;
  drawMinimap() {
    const g = this.game!;
    const cv = $('minimap') as HTMLCanvasElement;
    const ctx = cv.getContext('2d')!;
    const lvl = g.playerLevel();
    const m = lvl.map;
    const pl = g.player;
    const S = 2; // px per tile
    const R = cv.width / 2;
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
    const half = Math.ceil(R / S);
    const x0 = Math.floor(pl.x) - half, y0 = Math.floor(pl.y) - half;
    const img = ctx.createImageData(cv.width, cv.height);
    const d = img.data;
    for (let ty = 0; ty < half * 2; ty++)
      for (let tx = 0; tx < half * 2; tx++) {
        const x = x0 + tx, y = y0 + ty;
        if (!m.inBounds(x, y)) continue;
        const i = m.idx(x, y);
        if (!m.explored[i]) continue;
        const c = this.tileColor(m, i);
        for (let oy = 0; oy < S; oy++) for (let ox = 0; ox < S; ox++) {
          const p = ((ty * S + oy) * cv.width + tx * S + ox) * 4;
          d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
        }
      }
    ctx.putImageData(img, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
    const toS = (wx: number, wy: number) => [(wx - x0) * S, (wy - y0) * S];
    for (const e of lvl.enemies) {
      if (e.dead) continue;
      const [sx, sy] = toS(e.x, e.y);
      ctx.fillStyle = e.def.boss ? '#ff3a1a' : e.champion ? '#ffe05a' : '#d03030';
      ctx.fillRect(sx - (e.def.boss ? 3 : 1.5), sy - (e.def.boss ? 3 : 1.5), e.def.boss ? 6 : 3, e.def.boss ? 6 : 3);
    }
    for (const p of m.pois) {
      if (!p.discovered && p.kind !== 'dungeon' && p.kind !== 'hive' && p.kind !== 'settlement') continue;
      const [sx, sy] = toS(p.x + 0.5, p.y + 0.5);
      const col = { dungeon: '#ff8a3a', hive: '#c8ff5a', nest: '#c060ff', camp: '#a03030', ruin: '#d6b26a', settlement: '#7ae0c0', exit: '#7ad7ff', boss_arena: '#ff3a1a', treasure: '#ffd27a', shrine: '#ffd27a', spawn: '#ffffff' }[p.kind] ?? '#fff';
      if (p.kind === 'camp' && p.cleared) continue;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, p.kind === 'camp' ? 2 : 3.5, 0, Math.PI * 2); ctx.fill();
    }
    if (g.eventMarker && g.time - g.eventMarker.t < 60 && g.inOverworld()) { const [sx, sy] = toS(g.eventMarker.x, g.eventMarker.y); ctx.strokeStyle = '#ffb04a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 5 + Math.sin(g.time * 4) * 2, 0, Math.PI * 2); ctx.stroke(); }
    for (const mk of g.markers) { const [sx, sy] = toS(mk.x, mk.y); ctx.fillStyle = '#7ad7ff'; ctx.fillRect(sx - 2, sy - 2, 4, 4); }
    // player arrow
    ctx.translate(R + (pl.x - Math.floor(pl.x)) * S, R + (pl.y - Math.floor(pl.y)) * S);
    ctx.rotate(pl.facing);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-2, 0); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
    void this.mmBase; void this.mmMapVer; void this.mmMap;
  }

  tileColor(m: import('../world/map').GameMap, i: number): [number, number, number] {
    if (m.occ[i]) {
      const b = this.game!.factory.buildings.get(m.occ[i]);
      if (b) return b.kind === 'belt' ? [200, 170, 90] : b.kind === 'wall' ? [150, 140, 130] : b.kind === 'turret' || b.kind === 'tesla' ? [230, 110, 80] : [120, 200, 180];
    }
    if (m.res[i]) { const c = RES_COLOR[m.res[i]]; return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
    if (m.tree[i]) return [52, 50, 34];
    switch (m.terrain[i]) {
      case T.Rock: return [90, 86, 80];
      case T.Water: return [30, 55, 75];
      case T.Lava: return [150, 50, 15];
      case T.Road: case T.Bridge: return [110, 98, 86];
      case T.Plaza: return [130, 118, 100];
      case T.DWall: return [30, 26, 24];
      case T.DFloor: return [70, 62, 56];
      case T.Vent: return [120, 50, 20];
      case T.Hive: return [80, 40, 70];
      case T.Scorch: return [70, 52, 44];
      default: return [62, 57, 52];
    }
  }
}

export function objectiveText(type: string, target?: string): string {
  const name = (id?: string) => (id ? ITEM_MAP.get(id)?.name ?? ENEMY_MAP.get(id)?.name ?? BUILDING_MAP.get(id)?.name ?? id : '');
  switch (type) {
    case 'kill': return `Slay ${name(target) || 'Ashborn'}`;
    case 'gather': return `Gather ${name(target)}`;
    case 'build': return `Build ${name(target)}`;
    case 'produce': return `Automate ${name(target)}`;
    case 'research': return target ? `Research ${target.replace('_', ' ')}` : 'Complete a research';
    case 'survive_wave': return 'Repel an assault';
    case 'kill_boss': return `Defeat ${name(target)}`;
    case 'deliver_beacon': return 'Complete the Lattice Beacon';
    default: return type;
  }
}

export { QUEST_MAP };
