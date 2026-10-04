import { h } from '../dom';
import type { UI } from '../ui';
import { panelFrame, type PanelDef } from './frame';
import { DEFAULT_KEYS, DIFFICULTIES, saveSettings, type Settings } from '../../game/settings';
import { keyLabel } from '../../input/input';
import { listSlots, deleteSlot, browserStorage, SLOT_NAMES } from '../../save/save';

export const pausePanel: PanelDef = {
  modal: true,
  render(ui) {
    const g = ui.game!;
    const b = (label: string, fn: () => void, cls = '') => h('button', { class: `btn ${cls}`, style: { width: '260px', padding: '10px' }, onclick: fn }, label);
    return panelFrame(ui, 'Paused', h('div', { class: 'col', style: { alignItems: 'center' } },
      h('div', { class: 'dim' }, `Seed ${g.seedText} · ${g.diff.name} · ${formatTime(g.time)} played`),
      b('Resume', () => ui.closePanel(), 'primary'),
      b('Save / Load', () => ui.openPanel('saves')),
      b('Settings', () => ui.openPanel('settings')),
      b('Blueprint Library', () => ui.openPanel('blueprints')),
      b('Controls Help', () => ui.openPanel('help')),
      b('Quit to Title', () => { ui.closePanel(); ui.hooks.quitToTitle(); }, 'danger'),
      h('div', { class: 'faint', style: { fontSize: '0.85em', marginTop: '6px' } }, `Kills ${g.stats.kills} · Deaths ${g.stats.deaths} · Bosses ${g.stats.bosses} · Structures built ${g.stats.built}`),
    ), { width: 380 });
  },
};

export function formatTime(t: number) {
  const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60);
  return `${hh}h ${String(mm).padStart(2, '0')}m`;
}

export const savesPanel: PanelDef = {
  modal: true,
  render(ui) {
    const store = browserStorage();
    const metas = listSlots(store);
    const rows = SLOT_NAMES.map((s) => {
      const m = metas.find((x) => x.slot === s);
      return h('div', { class: 'slotcard' },
        h('div', null, h('b', { class: 'gold' }, s === 'auto' ? 'Autosave' : `Slot ${s.slice(4)}`),
          h('div', { class: 'dim', style: { fontSize: '0.85em' } }, m ? `Level ${m.level} · ${formatTime(m.time)} · seed ${m.seed} · ${new Date(m.savedAt).toLocaleString()}${m.quest ? ` · ${m.quest}` : ''}` : 'Empty')),
        h('div', { class: 'row' },
          ui.game && s !== 'auto' ? h('button', { class: 'btn small primary', onclick: async () => { await ui.hooks.saveSlot(s); ui.toast('Game saved', 'good'); ui.refreshPanel(); } }, 'Save') : null,
          m ? h('button', { class: 'btn small', onclick: async () => { try { await ui.hooks.loadSlot(s); } catch (e) { ui.toast(`Load failed: ${(e as Error).message}`, 'bad'); } } }, 'Load') : null,
          m ? h('button', { class: 'btn small danger', onclick: () => { if (confirm('Delete this save?')) { deleteSlot(store, s); ui.refreshPanel(); } } }, '✕') : null));
    });
    const imp = h('textarea', { rows: 3, style: { width: '100%' }, placeholder: 'Paste exported save text here to import' }) as HTMLTextAreaElement;
    return panelFrame(ui, 'Save & Load', [
      h('div', { class: 'col' }, ...rows),
      h('div', { class: 'faint', style: { fontSize: '0.82em', margin: '6px 0' } }, 'Saves are versioned, checksummed and compressed. Each save keeps a backup of the previous one, used automatically if the primary is corrupted. Autosave runs every 5 minutes.'),
      h('div', { class: 'sep' }),
      h('div', { class: 'row' },
        ui.game ? h('button', { class: 'btn small', onclick: async () => { const txt = await ui.hooks.exportSave(); const blob = new Blob([txt], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `emberforge-${ui.game!.seedText}.efsave`; a.click(); } }, 'Export to file') : null,
        h('button', { class: 'btn small', onclick: async () => { try { await ui.hooks.importSave(imp.value); } catch (e) { ui.toast(`Import failed: ${(e as Error).message}`, 'bad'); } } }, 'Import from text'),
        h('label', { class: 'btn small' }, 'Import file', (() => { const f = h('input', { type: 'file', accept: '.efsave,.json', style: { display: 'none' } }) as HTMLInputElement; f.addEventListener('change', async () => { const file = f.files?.[0]; if (!file) return; try { await ui.hooks.importSave(await file.text()); } catch (e) { ui.toast(`Import failed: ${(e as Error).message}`, 'bad'); } }); return f; })())),
      imp,
    ], { width: 640 });
  },
};

export const settingsPanel: PanelDef = {
  modal: true,
  render(ui) {
    const s: Settings = ui.game?.settings ?? (ui as unknown as { settings: Settings }).settings;
    const st = ui.panelState.settings;
    const tab = (st.tab as string) ?? 'graphics';
    const apply = () => { saveSettings(s); ui.hooks.applySettings(); };
    const range = (label: string, key: keyof Settings, min: number, max: number, step: number, fmtv = (v: number) => v.toFixed(2)) => {
      const val = s[key] as number;
      const out = h('span', { class: 'dim', style: { width: '50px' } }, fmtv(val));
      const inp = h('input', { type: 'range', min, max, step, value: val, class: 'grow' }) as HTMLInputElement;
      inp.addEventListener('input', () => { (s[key] as number) = Number(inp.value); out.textContent = fmtv(Number(inp.value)); apply(); });
      return h('div', { class: 'setrow' }, h('span', null, label), h('div', { class: 'row' }, inp, out));
    };
    const check = (label: string, key: keyof Settings) => {
      const inp = h('input', { type: 'checkbox', checked: !!s[key] }) as HTMLInputElement;
      inp.addEventListener('change', () => { (s[key] as boolean) = inp.checked; apply(); });
      return h('div', { class: 'setrow' }, h('span', null, label), inp);
    };
    const select = (label: string, key: keyof Settings, opts: [string | number, string][]) => {
      const sel = h('select', null, ...opts.map(([v, l]) => h('option', { value: String(v), selected: String(s[key]) === String(v) }, l))) as HTMLSelectElement;
      sel.addEventListener('change', () => { const v = opts.find((o) => String(o[0]) === sel.value)![0]; (s as unknown as Record<string, unknown>)[key] = v; apply(); });
      return h('div', { class: 'setrow' }, h('span', null, label), sel);
    };
    const tabs = h('div', { class: 'row' }, ...['graphics', 'audio', 'accessibility', 'gameplay', 'controls'].map((t) => h('button', { class: `btn small tab ${t === tab ? 'active' : ''}`, onclick: () => { st.tab = t; ui.refreshPanel(); } }, t[0].toUpperCase() + t.slice(1))));
    let body: HTMLElement;
    if (tab === 'graphics') body = h('div', null,
      range('Render scale', 'renderScale', 0.5, 1.5, 0.05, (v) => `${Math.round(v * 100)}%`),
      range('Particle density', 'particles', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`),
      check('Dynamic lighting (day/night, lamps)', 'lighting'),
      check('Weather effects', 'weatherFx'),
      select('Frame-rate limit', 'fpsLimit', [[0, 'Display refresh (VSync)'], [30, '30'], [60, '60'], [120, '120']]),
      check('Show FPS / profiler (F3)', 'showFps'),
      h('div', { class: 'faint', style: { fontSize: '0.82em' } }, 'Browsers always present frames in sync with the display; the limit throttles rendering below it.'));
    else if (tab === 'audio') body = h('div', null, range('Master volume', 'master', 0, 1, 0.05), range('Music volume', 'music', 0, 1, 0.05), range('Effects volume', 'sfx', 0, 1, 0.05));
    else if (tab === 'accessibility') body = h('div', null,
      range('Screen shake', 'screenShake', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`),
      select('Damage numbers', 'damageNumbers', [['all', 'All'], ['crits', 'Critical hits only'], ['off', 'Off']]),
      check('Reduce flashing effects', 'reduceFlashing'),
      select('Colorblind rarity palette', 'colorblind', [['off', 'Off'], ['deutan', 'Deuteranopia'], ['protan', 'Protanopia'], ['tritan', 'Tritanopia']]),
      range('UI scale', 'uiScale', 0.75, 1.5, 0.05, (v) => `${Math.round(v * 100)}%`),
      check('Hold to gather (off = toggle)', 'holdToGather'),
      check('Subtitles for dialogue', 'subtitles'));
    else if (tab === 'gameplay') body = h('div', null,
      range('Day length (seconds)', 'dayLength', 120, 1440, 30, (v) => `${v}s`),
      select('Loot filter: hide below', 'lootFilter' as keyof Settings, [[0, 'Show everything']]),
      (() => { const sel = h('select', null, ...['Show all', 'Hide Common', 'Hide below Rare', 'Hide below Exalted'].map((l, i) => h('option', { value: i, selected: s.lootFilter.minRarity === i }, l))) as HTMLSelectElement; sel.addEventListener('change', () => { s.lootFilter.minRarity = Number(sel.value); apply(); }); const cb = h('input', { type: 'checkbox', checked: s.lootFilter.autoSalvage }) as HTMLInputElement; cb.addEventListener('change', () => { s.lootFilter.autoSalvage = cb.checked; apply(); }); return h('div', null, h('div', { class: 'setrow' }, h('span', null, 'Loot filter'), sel), h('div', { class: 'setrow' }, h('span', null, 'Auto-salvage filtered items into embers'), cb)); })(),
      ui.game ? h('div', { class: 'dim' }, `Difficulty: ${ui.game.diff.name} (set when creating a world)`) : null);
    else {
      const ACTIONS: [string, string][] = [['up', 'Move up'], ['down', 'Move down'], ['left', 'Move left'], ['right', 'Move right'], ['dodge', 'Dodge roll'], ['skill3', 'Skill slot 3'], ['skill4', 'Skill slot 4'], ['skill5', 'Skill slot 5'], ['skill6', 'Skill slot 6'], ['interact', 'Interact / gather'], ['tonic', 'Mending Tonic'], ['charge', 'Blast Charge'], ['build', 'Construction mode'], ['rotate', 'Rotate'], ['pipette', 'Pipette'], ['deconstruct', 'Deconstruct tool'], ['blueprint', 'Blueprint tool'], ['inventory', 'Inventory'], ['character', 'Character'], ['skills', 'Skills'], ['research', 'Research'], ['craft', 'Crafting'], ['production', 'Production'], ['map', 'Map'], ['quests', 'Chronicle']];
      body = h('div', null, h('div', { class: 'dim', style: { fontSize: '0.85em' } }, 'Click a binding, then press a key. Mouse: LMB/RMB skill slots 1–2, wheel zoom. Controller: left stick move, right stick aim, A/RT primary, X secondary, LB/RB/LT skills 3–5, B dodge, Y interact, D-pad tonic/charge, Start pause.'),
        h('div', { style: { columns: 2 } }, ...ACTIONS.map(([k, label]) => h('div', { class: 'keyrow' }, h('span', null, label), h('button', { class: 'btn small', onclick: (e: MouseEvent) => { const btn = e.currentTarget as HTMLButtonElement; btn.textContent = 'Press a key…'; ui.input.capture = (code) => { if (code !== 'Escape') { s.keys[k] = code; apply(); } ui.refreshPanel(); ui.game && ui.renderSkillBar(); }; } }, keyLabel(s.keys[k]))))),
        h('button', { class: 'btn small', onclick: () => { s.keys = { ...DEFAULT_KEYS }; apply(); ui.refreshPanel(); } }, 'Reset to defaults'));
    }
    return panelFrame(ui, 'Settings', [tabs, h('div', { class: 'sep' }), body], { width: 680 });
  },
};

export const helpPanel: PanelDef = {
  modal: true,
  render(ui) {
    const lines: [string, string][] = [
      ['WASD', 'Move'], ['Left click (hold)', 'Rending Cleave'], ['Right click', 'Shield Rush'], ['1–4', 'Skills 3–6'], ['Space', 'Dodge roll (cancels an attack before it lands)'],
      ['F (tap)', 'Interact with NPCs, caches, doors; inspect hovered structures'], ['F (hold)', 'Gather: trees, ore, rocks, fungus'], ['Q / G', 'Mending Tonic / Blast Charge'],
      ['B', 'Construction mode: click to place, drag belts, R rotate, right-click remove, E pipette, X deconstruct area, V blueprint'],
      ['I / C', 'Inventory & character'], ['K', 'Skills & passives'], ['T', 'Research'], ['H', 'Handcrafting'], ['P', 'Production statistics'], ['M', 'World map'], ['J', 'Chronicle'],
      ['F3 / F4', 'Profiler overlay / power coverage'], ['`', 'Developer console'], ['Wheel', 'Zoom'],
    ];
    return panelFrame(ui, 'Controls', h('div', { class: 'col' }, ...lines.map(([k, v]) => h('div', { class: 'row' }, h('kbd', { style: { minWidth: '140px', textAlign: 'center' } }, k), h('span', null, v)))), { width: 640 });
  },
};

export const victoryPanel: PanelDef = {
  modal: true,
  render(ui) {
    const g = ui.game!;
    return panelFrame(ui, 'The Lattice Rekindles', h('div', { class: 'col', style: { alignItems: 'center', textAlign: 'center' } },
      h('div', { style: { fontSize: '1.1em', maxWidth: '520px' } }, 'From a lone Kindled in the ash you rose to command an engine that lights the world. The Beacon blazes — yet in the deep, the Foundry stirs, and older wardens wake.'),
      h('div', { class: 'dim' }, `${formatTime(g.time)} · Level ${g.player.level} · ${g.stats.kills} Ashborn slain · ${g.factory.buildings.size} structures`),
      h('div', { class: 'gold' }, 'Endgame: the Sunken Foundry now descends without end. Each depth adds modifiers and stronger relics.'),
      h('button', { class: 'btn primary', onclick: () => ui.closePanel() }, 'Continue')), { width: 620 });
  },
};

export function titleScreen(ui: UI, settings: Settings): HTMLElement {
  const store = browserStorage();
  const metas = listSlots(store);
  const latest = metas.sort((a, b) => b.savedAt - a.savedAt)[0];
  const el = h('div', { id: 'title' });
  const main = h('div', null,
    h('div', { class: 'logo' }, 'EMBERFORGE'),
    h('div', { class: 'sub' }, 'ASHES OF THE LATTICE'),
    h('div', { class: 'menu' },
      latest ? h('button', { class: 'btn primary', onclick: () => ui.hooks.continueGame() }, `Continue — Lv ${latest.level}`) : null,
      h('button', { class: 'btn', onclick: () => { main.replaceWith(newGameForm(ui, () => el.append(main))); } }, 'New World'),
      h('button', { class: 'btn', onclick: () => ui.openPanel('saves') }, 'Load'),
      h('button', { class: 'btn', onclick: () => { (ui as unknown as { settings: Settings }).settings = settings; ui.openPanel('settings'); } }, 'Settings'),
      h('button', { class: 'btn', onclick: () => ui.openPanel('help') }, 'Controls'),
    ));
  el.append(main, h('div', { class: 'foot' }, 'An original industrial action-RPG · procedural art & audio · v0.1 vertical slice'));
  return el;
}

function newGameForm(ui: UI, back: () => void): HTMLElement {
  const seed = h('input', { type: 'text', value: String(Math.floor(Math.random() * 1e9)), style: { width: '200px' } }) as HTMLInputElement;
  const diff = h('select', null, ...DIFFICULTIES.map((d) => h('option', { value: d.id, selected: d.id === 'standard' }, d.name))) as HTMLSelectElement;
  const mods: Record<string, HTMLInputElement> = {};
  const modRow = (k: string, label: string) => { mods[k] = h('input', { type: 'checkbox' }) as HTMLInputElement; return h('label', { class: 'row' }, mods[k], label); };
  const form = h('div', { class: 'frame', style: { padding: '24px', width: '520px' } },
    h('h2', { class: 'title' }, 'Forge a New World'),
    h('div', { class: 'sep' }),
    h('div', { class: 'setrow' }, h('span', null, 'Archetype'), h('div', null, h('b', { class: 'gold' }, 'Kindled Vanguard'), h('div', { class: 'dim', style: { fontSize: '0.85em' } }, 'Heavy melee defender: cleaves, shield rushes, quakes, and rallies the machines.'))),
    h('div', { class: 'setrow' }, h('span', null, 'World seed'), h('div', { class: 'row' }, seed, h('button', { class: 'btn small', onclick: () => { seed.value = String(Math.floor(Math.random() * 1e9)); } }, '🎲'))),
    h('div', { class: 'setrow' }, h('span', null, 'Difficulty'), diff),
    h('div', { class: 'setrow' }, h('span', null, 'World modifiers'), h('div', { class: 'col' }, modRow('scarce', 'Scarce resources (½ deposits)'), modRow('aggressive', 'Aggressive Ashborn (+HP, +damage)'), modRow('endless', 'Endless invasions (threat never sleeps)'))),
    h('div', { class: 'row', style: { marginTop: '16px', justifyContent: 'flex-end' } },
      h('button', { class: 'btn', onclick: () => { form.remove(); back(); } }, 'Back'),
      h('button', { class: 'btn primary', onclick: () => ui.hooks.newGame({ seed: seed.value.trim() || '1', difficulty: diff.value, mods: Object.fromEntries(Object.entries(mods).map(([k, v]) => [k, v.checked])) }) }, 'Begin')));
  return form;
}
