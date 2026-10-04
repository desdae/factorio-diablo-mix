import './ui/styles.css';
import { Game, TICK } from './game/game';
import { emptyInput, type PlayerInput } from './game/playerControl';
import { loadSettings, saveSettings } from './game/settings';
import { Renderer } from './render/renderer';
import { Audio } from './audio/audio';
import { Input } from './input/input';
import { UI } from './ui/ui';
import { titleScreen } from './ui/panels/menus';
import { browserStorage, decodeSave, encodeSave, listSlots, readSlot, restoreGame, serializeGame, snapshotPristine, writeSlot, type Pristine } from './save/save';
import { validateContent } from './data/validate';
import { spawnEnemy } from './game/combat';
import { generateEquip } from './game/items';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const root = document.getElementById('ui') as HTMLElement;
const settings = loadSettings();
let game: Game | null = null;
let pristine: Pristine | null = null;

const contentErrors = validateContent();
if (contentErrors.length) console.error('Content validation errors:', contentErrors);

const renderer = new Renderer(canvas, () => game!);
const audio = new Audio();
const input = new Input(() => settings, canvas);

const hooks = {
  newGame(o: { seed: string; difficulty: string; mods: Record<string, boolean> }) {
    const g = new Game({ seed: o.seed, difficulty: o.difficulty, worldMods: o.mods, settings });
    pristine = snapshotPristine(g.overworld);
    start(g);
    ui.banner('Kindling Point', 'The Ashen Highlands — where the Lattice once burned brightest', '#ff8a3a');
  },
  async continueGame() {
    const latest = listSlots(browserStorage()).sort((a, b) => b.savedAt - a.savedAt)[0];
    if (latest) await hooks.loadSlot(latest.slot);
  },
  async loadSlot(slot: string) {
    const { data, fromBackup } = await readSlot(browserStorage(), slot);
    const r = restoreGame(data, settings);
    pristine = r.pristine;
    start(r.game);
    ui.toast(fromBackup ? 'Primary save was damaged — restored from backup.' : 'Game loaded', fromBackup ? 'warn' : 'good');
  },
  async saveSlot(slot: string) {
    if (!game || !pristine) return;
    await writeSlot(browserStorage(), slot, serializeGame(game, pristine), game.quests.def()?.name ?? '');
  },
  quitToTitle() {
    if (game && pristine) void hooks.saveSlot('auto');
    game = null;
    ui.game = null;
    ui.mode = 'title';
    document.getElementById('hud')!.classList.add('hidden');
    document.getElementById('buildbar')!.classList.add('hidden');
    root.appendChild(titleScreen(ui, settings));
  },
  async exportSave() {
    return encodeSave(serializeGame(game!, pristine!));
  },
  async importSave(text: string) {
    const data = await decodeSave(text.trim());
    const r = restoreGame(data, settings);
    pristine = r.pristine;
    start(r.game);
    ui.toast('Save imported', 'good');
  },
  applySettings,
};

const ui = new UI(root, renderer, audio, input, hooks);
ui.settings = settings;

function applySettings() {
  document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale));
  audio.volumes = { master: settings.master, music: settings.music, sfx: settings.sfx };
  audio.applyVolumes();
  saveSettings(settings);
}
applySettings();

function start(g: Game) {
  game = g;
  renderer.attach(g);
  ui.setGame(g);
  g.events.on('sfx', (e) => {
    if (g.where === 'dungeon' && e.x !== undefined && (e.name === 'turret' || e.name === 'zap' || e.name === 'metal_hit')) return;
    audio.play(e.name, e.x, e.y, e.vol ?? 1);
  });
  g.events.on('hitstop', (h) => input.vibrate(0.3, h.t * 1000));
  g.events.on('levelUp', () => input.vibrate(0.5, 200));
  g.onAutosave = () => { void hooks.saveSlot('auto').then(() => ui.toast('Autosaved', 'info')); };
}

// first interaction unlocks audio (browser autoplay policy)
const unlock = () => { audio.init(); audio.resume(); applySettings(); };
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
window.addEventListener('beforeunload', () => { if (game && pristine) { try { const data = serializeGame(game, pristine); localStorage.setItem('ef.emergency', JSON.stringify(data)); } catch { /* best effort */ } } });

// ───────────── main loop: fixed 60 Hz simulation, variable-rate rendering
let last = performance.now();
let acc = 0;
let lastRender = 0;
let moodT = 0;
let pending: PlayerInput = emptyInput();

function mergeEdges(into: PlayerInput, from: PlayerInput) {
  // continuous values: latest wins; edges: OR until a simulation step consumes them
  into.moveX = from.moveX; into.moveY = from.moveY; into.aimX = from.aimX; into.aimY = from.aimY;
  into.skillHeld = from.skillHeld; into.gather = from.gather; into.blockCombat = from.blockCombat;
  for (let i = 0; i < 6; i++) into.skillPressed[i] ||= from.skillPressed[i];
  into.dodge ||= from.dodge; into.interact ||= from.interact; into.tonic ||= from.tonic; into.charge ||= from.charge;
}

function frame(now: number) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  const pin = ui.frame(dt);
  if (game && ui.mode === 'play') {
    const paused = !!(ui.panel && ['pause', 'settings', 'saves', 'help', 'victory'].includes(ui.panel)) || ui.console.open && false;
    mergeEdges(pending, pin);
    if (!paused) {
      acc += dt;
      let steps = 0;
      const t0 = performance.now();
      while (acc >= TICK && steps < 5) {
        game.update(TICK, pending);
        pending.skillPressed = [false, false, false, false, false, false];
        pending.dodge = pending.interact = pending.tonic = pending.charge = false;
        acc -= TICK;
        steps++;
      }
      if (steps === 5) acc = 0; // avoid spiral of death under extreme load
      (game as unknown as { simMs: number }).simMs = steps ? (performance.now() - t0) / steps : 0;
    }
    const limit = settings.fpsLimit;
    if (!limit || now - lastRender >= 1000 / limit - 1) {
      renderer.render(paused ? 0 : dt, ui.view);
      lastRender = now;
    }
    // audio: listener, adaptive music, ambience
    audio.listener = { x: game.player.x, y: game.player.y };
    audio.tick();
    moodT -= dt;
    if (moodT <= 0) {
      moodT = 0.5;
      const lvl = game.playerLevel();
      const pl = game.player;
      const boss = lvl.enemies.some((e) => e.def.boss && e.aggro && !e.dead);
      const fighting = lvl.enemies.some((e) => !e.dead && e.aggro && Math.hypot(e.x - pl.x, e.y - pl.y) < 14);
      let machines = 0;
      if (game.inOverworld()) for (const b of game.factory.buildings.values()) if (b.status === 'working' && Math.abs(b.x - pl.x) < 20 && Math.abs(b.y - pl.y) < 20) machines++;
      const mood = boss ? 'boss' : fighting ? 'combat' : game.threat.waveInProgress ? 'danger' : game.where === 'dungeon' ? 'dungeon' : machines > 4 ? 'factory' : 'explore';
      if (audio.getMood() !== mood) audio.setMood(mood);
      audio.ambience(machines, game.worldEvents.weather, game.where === 'dungeon');
    }
  } else {
    // title backdrop: slow ember drift
    const ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const gr = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.7, 0, canvas.width / 2, canvas.height * 0.7, canvas.width * 0.7);
    gr.addColorStop(0, '#3a1408'); gr.addColorStop(1, '#050303');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 80; i++) {
      const x = ((i * 137.5 + now * 0.01 * (1 + (i % 5))) % canvas.width), y = canvas.height - ((now * 0.02 * (1 + (i % 7) * 0.3) + i * 91) % (canvas.height + 50));
      ctx.fillStyle = `rgba(255,${120 + (i % 5) * 20},40,${0.3 + (i % 3) * 0.2})`;
      ctx.fillRect(x, y, 2 + (i % 3), 2 + (i % 3));
    }
  }
  input.endFrame();
}

root.appendChild(titleScreen(ui, settings));
requestAnimationFrame(frame);

// expose for debugging & automated play-testing
(window as unknown as { ef: unknown }).ef = {
  get game() { return game; }, ui, renderer, hooks,
  spawn: (id: string, x: number, y: number, level: number) => spawnEnemy(game!, game!.playerLevel(), id, x, y, { level }),
  makeItem: (o: Parameters<typeof generateEquip>[1]) => generateEquip(game!.lootRng, o),
};
