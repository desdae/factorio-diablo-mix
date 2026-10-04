import { h, tip } from '../dom';
import type { UI } from '../ui';
import { panelFrame, type PanelDef } from './frame';
import { RECIPES, SMELTING_BY_INPUT } from '../../data/recipes';
import { ITEM_MAP, ITEMS } from '../../data/items';
import { itemIcon, equipIcon } from '../../render/icons';
import { stackTooltip, equipTooltip } from '../tooltips';
import { invGrid, invSig } from './inventory';
import { BEACON_STAGES, VAULT_CAP, type Building } from '../../sim/factory';
import { CAPACITOR_MJ } from '../../sim/power';
import { fmt, fmtPower } from '../../core/math';
import type { Equip } from '../../game/items';
import { decodeBlueprint, encodeBlueprint, blueprintCost, type Blueprint } from '../../game/blueprint';
import { BUILDING_MAP } from '../../data/buildings';

const STATUS_TEXT: Record<string, [string, string]> = {
  working: ['Working', 'working'], idle: ['Idle', 'idle'], no_input: ['Waiting for input', 'problem'], no_fuel: ['No fuel', 'problem'],
  no_power: ['No power', 'problem'], output_full: ['Output full', 'problem'], no_recipe: ['No recipe set', 'problem'], depleted: ['Deposit depleted — deep vein (15%)', 'problem'], disabled: ['Disabled', 'idle'], no_ammo: ['No ammunition', 'problem'],
};

function slotRow(ui: UI, b: Building, map: Map<string, number>, from: 'input' | 'output', label: string) {
  const g = ui.game!;
  const entries = [...map.entries()].filter(([, v]) => v > 0);
  return h('div', null, h('div', { class: 'dim', style: { fontSize: '0.85em' } }, label),
    h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px', minHeight: '48px' } },
      ...(entries.length ? entries.map(([id, n]) => tip(h('div', { class: 'icell', onclick: (e: MouseEvent) => { g.takeFromBuilding(b, id, e.shiftKey ? n : Math.max(1, Math.ceil(n / 2)), from); ui.refreshPanel(); } }, h('img', { src: itemIcon(id, 46) }), h('div', { class: 'cnt' }, fmt(n))), () => stackTooltip(id, n) + '<div class="faint">Click: take half · Shift: take all</div>')) : [h('span', { class: 'faint', style: { fontSize: '0.85em' } }, 'empty')])));
}

export const buildingPanel: PanelDef = {
  live: true,
  sig: (ui, arg) => {
    const b = ui.game!.factory.buildings.get(arg as number);
    if (!b) return 'gone';
    return `${b.status}|${[...b.input].join()}|${[...b.output].join()}|${b.recipe?.id}|${Math.floor(b.progress * 20)}|${b.filter}|${JSON.stringify(b.cond)}|${b.disabled}|${b.forged.length}|${Math.floor(b.energy / 100)}|${b.stage}|${Math.floor(b.hp)}|${b.ammoShots}|${Math.floor(b.fuelEnergy / 400)}|` + invSig(ui);
  },
  render(ui, arg) {
    const g = ui.game!;
    const b = g.factory.buildings.get(arg as number);
    if (!b) { setTimeout(() => ui.closePanel()); return h('div'); }
    ui.panelState.inventory ??= {};
    ui.panelState.inventory.transferTo = b.id;
    const st = STATUS_TEXT[b.status] ?? [b.status, 'idle'];
    const net = g.power.netOf(b);
    const parts: HTMLElement[] = [];
    parts.push(h('div', { class: 'row' }, h('span', { class: `bstatus ${st[1]}` }, st[0]), h('div', { class: 'grow' }),
      h('span', { class: 'dim' }, `HP ${Math.ceil(b.hp)}/${b.maxHp}`),
      b.kind !== 'wall' && b.kind !== 'pylon' && b.kind !== 'belt' ? h('button', { class: 'btn small', onclick: () => { b.disabled = !b.disabled; ui.refreshPanel(); } }, b.disabled ? 'Enable' : 'Disable') : null,
      h('button', { class: 'btn small danger', onclick: () => { g.deconstruct(b); ui.closePanel(); } }, 'Deconstruct')));
    parts.push(h('div', { class: 'dim', style: { fontSize: '0.88em', margin: '6px 0' } }, b.def.desc));
    if (b.def.power) parts.push(h('div', { style: { fontSize: '0.9em' } }, `⚡ ${fmtPower(b.def.power)} · `, net ? h('span', { class: net.satisfaction > 0.99 ? 'good' : net.satisfaction > 0 ? 'warn' : 'bad' }, `network ${(net.satisfaction * 100).toFixed(0)}% satisfied (${fmtPower(net.supplied)} / ${fmtPower(net.demand)})`) : h('span', { class: 'bad' }, 'not connected — place a Conductor Pylon within 3 tiles')));
    if (b.def.burner || b.kind === 'generator') parts.push(h('div', { style: { fontSize: '0.9em' } }, `🔥 Fuel buffer: ${(b.fuelEnergy / 1000).toFixed(1)} MJ`, b.kind === 'generator' && net ? h('span', { class: 'dim' }, ` · output ${fmtPower(b.def.produce! * b.progress)} of ${fmtPower(b.def.produce!)}`) : null));
    if (g.time < b.overclockUntil) parts.push(h('div', { class: 'gold' }, `⚙ Overclocked +75% for ${(b.overclockUntil - g.time).toFixed(0)}s`));
    // recipe selection
    if (b.kind === 'assembler' || b.kind === 'forge') {
      const cat = b.kind === 'forge' ? 'forge' : 'crafting';
      const opts = RECIPES.filter((r) => r.category === cat && g.research.isUnlocked(r.id) && (cat === 'forge' || !BUILDING_MAP.has(r.id) || BUILDING_MAP.get(r.id)!.kind !== 'beacon' || true));
      parts.push(h('h3', { class: 'title' }, 'Recipe'), h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, ...opts.map((r) => {
        const icon = r.forge ? (r.forge.kind === 'weapon' ? 'gear' : r.forge.kind === 'armor' ? 'steel' : 'rune_ember') : r.outputs[0].item;
        const el = h('div', { class: 'icell', style: { borderColor: b.recipe?.id === r.id ? '#ffe2a0' : undefined, boxShadow: b.recipe?.id === r.id ? '0 0 8px #ffd27a' : undefined }, onclick: () => { const refund = g.factory.setRecipe(b, r.id); for (const [k, v] of refund) g.player.inv.add(k, v); ui.refreshPanel(); } }, h('img', { src: itemIcon(icon, 46) }));
        return tip(el, () => `<b class="gold">${r.name}</b><div>${r.inputs.map((i) => `${i.count}× ${ITEM_MAP.get(i.item)!.name}`).join('<br>')}</div><div class="dim">${(r.time / (b.def.speed ?? 1)).toFixed(1)}s per craft${r.forge ? ` · min rarity ${['Common', 'Refined', 'Rare'][r.forge.minRarity]}` : ''}</div>`);
      })));
    }
    if (b.kind === 'furnace') parts.push(h('div', { class: 'dim', style: { fontSize: '0.85em' } }, `Smelts automatically: ${[...SMELTING_BY_INPUT.values()].filter((r) => g.research.isUnlocked(r.id)).map((r) => `${ITEM_MAP.get(r.inputs[0].item)!.name}→${r.name}`).join(', ')}`));
    if (b.recipe || b.kind === 'miner' || b.kind === 'lab') parts.push(h('div', { class: 'progressbar', style: { margin: '8px 0' } }, h('div', { style: { width: `${Math.min(1, Math.max(0, b.progress)) * 100}%` } })));
    if (b.kind === 'miner') {
      let ore = 0;
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) ore += g.overworld.amt[g.overworld.idx(x, y)];
      parts.push(h('div', { style: { fontSize: '0.9em' } }, `Ore remaining under drill: ${fmt(ore)} · ${((b.def.speed! * (1 + g.research.bonus.miningSpeed)) * 60).toFixed(0)}/min at full speed`));
    }
    if (b.kind === 'lab') parts.push(h('div', null, g.research.active ? `Researching ${g.research.active}` : h('span', { class: 'warn' }, 'No active research (T)')));
    if (b.kind === 'capacitor') parts.push(h('div', null, `Stored ${(b.energy / 1000).toFixed(2)} / ${CAPACITOR_MJ / 1000} MJ`), h('div', { class: 'progressbar' }, h('div', { style: { width: `${(b.energy / CAPACITOR_MJ) * 100}%`, background: '#6ad0ff' } })));
    if (b.kind === 'turret') parts.push(h('div', null, `Loaded shots: ${b.ammoShots} · Range ${b.def.range} tiles · ${b.def.speed} shots/s`));
    if (b.kind === 'vault') parts.push(h('div', null, `${fmt(g.factory.vaultTotal(b))} / ${VAULT_CAP} items`));
    if (b.kind === 'beacon') {
      const stage = BEACON_STAGES[b.stage];
      parts.push(h('h3', { class: 'title' }, stage ? `Stage ${b.stage + 1}/3 — ${stage.name}` : 'The Beacon blazes — megaproject complete'));
      if (stage) for (const [it, need] of Object.entries(stage.needs)) {
        const have = b.input.get(it) ?? 0;
        parts.push(h('div', { class: 'row' }, h('img', { src: itemIcon(it, 24) }), h('span', { class: 'grow' }, ITEM_MAP.get(it)!.name), h('span', null, `${fmt(have)} / ${fmt(need)}`), h('div', { class: 'progressbar', style: { width: '160px' } }, h('div', { style: { width: `${(have / need) * 100}%` } }))));
      }
    }
    // splitter filter
    if (b.kind === 'splitter') {
      const sel = h('select', null, h('option', { value: '' }, '— no filter —'), ...ITEMS.filter((i) => i.category !== 'building' || true).map((i) => h('option', { value: i.id, selected: b.filter === i.id }, i.name))) as HTMLSelectElement;
      sel.addEventListener('change', () => { b.filter = sel.value || null; ui.refreshPanel(); });
      parts.push(h('h3', { class: 'title' }, 'Filter'), h('div', { class: 'row' }, h('span', { class: 'dim' }, 'Route this item to the front output only:'), sel));
    }
    // arm condition (logic)
    if (b.kind === 'arm') {
      const sel = h('select', null, h('option', { value: '' }, '— always —'), ...ITEMS.map((i) => h('option', { value: i.id, selected: b.cond?.item === i.id }, i.name))) as HTMLSelectElement;
      const num = h('input', { type: 'number', value: b.cond?.lt ?? 20, min: 1, max: 2000, style: { width: '80px' } }) as HTMLInputElement;
      const apply = () => { b.cond = sel.value ? { item: sel.value, lt: Math.max(1, Number(num.value) || 1) } : null; ui.refreshPanel(); };
      sel.addEventListener('change', apply); num.addEventListener('change', apply);
      parts.push(h('h3', { class: 'title' }, 'Logic Condition'), h('div', { class: 'row' }, h('span', { class: 'dim' }, 'Only move'), sel, h('span', { class: 'dim' }, 'while target holds fewer than'), num),
        h('div', { class: 'faint', style: { fontSize: '0.8em' } }, 'Example: keep a turret topped up with exactly 10 Bolt Magazines; stop feeding when storage is stocked.'));
    }
    // buffers
    if (b.kind !== 'belt' && b.kind !== 'pylon' && b.kind !== 'wall' && b.kind !== 'lamp' && b.kind !== 'capacitor' && b.kind !== 'tesla') {
      parts.push(h('div', { class: 'row', style: { gap: '20px', alignItems: 'flex-start', marginTop: '6px' } },
        slotRow(ui, b, b.input, 'input', b.kind === 'vault' ? 'Contents' : 'Input / fuel'),
        b.kind !== 'vault' && b.kind !== 'generator' && b.kind !== 'turret' && b.kind !== 'lab' && b.kind !== 'beacon' ? slotRow(ui, b, b.output, 'output', 'Output') : null));
    }
    if (b.kind === 'forge' && b.forged.length) {
      parts.push(h('h3', { class: 'title' }, 'Forged equipment'), h('div', { class: 'row' }, ...(b.forged as Equip[]).map((e, i) => tip(h('div', { class: 'icell', onclick: () => { if (g.player.inv.addEquip(e)) { b.forged.splice(i, 1); ui.audio.play('pickup_equip'); ui.refreshPanel(); } else ui.toast('Inventory full', 'warn'); } }, h('img', { src: equipIcon(e, 46) })), () => equipTooltip(e) + '<div class="faint">Click to collect</div>'))));
    }
    // quick add buttons
    const quick: HTMLElement[] = [];
    const add = (item: string, n: number, label: string) => { if (g.player.inv.count(item)) quick.push(h('button', { class: 'btn small', onclick: () => { const m = g.giveToBuilding(b, item, n); ui.toast(m ? `Inserted ${m}` : 'Not accepted', m ? 'info' : 'warn'); ui.refreshPanel(); } }, label)); };
    if (b.def.burner || b.kind === 'generator') { add('coal', 10, '+10 Cinderstone'); add('wood', 10, '+10 Ashwood'); }
    if (b.kind === 'turret') add('bolts', 10, '+10 Bolt Magazines');
    if (b.kind === 'lab') for (const s of ['sigil_brass', 'sigil_iron', 'sigil_ember']) add(s, 10, `+10 ${ITEM_MAP.get(s)!.name}`);
    if (b.kind === 'furnace') for (const s of ['iron_ore', 'copper_ore', 'stone', 'iron_plate', 'emberite_ore']) if (g.factory.accepts(b, s)) add(s, 20, `+20 ${ITEM_MAP.get(s)!.name}`);
    if ((b.kind === 'assembler' || b.kind === 'forge' || b.kind === 'beacon') && (b.recipe || b.kind === 'beacon')) {
      const needs = b.kind === 'beacon' ? Object.keys(BEACON_STAGES[b.stage]?.needs ?? {}) : b.recipe!.inputs.map((i) => i.item);
      for (const s of needs) add(s, b.kind === 'beacon' ? 999 : 10, `+ ${ITEM_MAP.get(s)!.name}`);
    }
    if (quick.length) parts.push(h('div', { class: 'row', style: { flexWrap: 'wrap', marginTop: '6px' } }, ...quick));
    parts.push(h('div', { class: 'sep' }), h('div', { class: 'dim', style: { fontSize: '0.8em' } }, 'Your inventory — Shift-click to insert into this structure'), invGrid(ui, {
      onShift: (i) => { const s = g.player.inv.slots[i]; if (s && 'item' in s) { const n = g.giveToBuilding(b, s.item, s.count); ui.toast(n ? `Inserted ${n} ${ITEM_MAP.get(s.item)!.name}` : 'Not accepted here', n ? 'info' : 'warn'); ui.refreshPanel(); } },
    }));
    return panelFrame(ui, b.def.name, parts, { width: 520, cls: 'side-right' });
  },
};

export const productionPanel: PanelDef = {
  live: true,
  sig: (ui) => `${ui.game!.factory.history.length}|${ui.panelState.production.sel}|${ui.panelState.production.win}|${ui.panelState.production.sort}`,
  render(ui) {
    const g = ui.game!;
    const f = g.factory;
    const st = ui.panelState.production;
    const win = (st.win as number) ?? 60;
    const sort = (st.sort as string) ?? 'prod';
    const items = new Set<string>();
    for (const hst of f.history.slice(-win)) { for (const k of hst.produced.keys()) items.add(k); for (const k of hst.consumed.keys()) items.add(k); }
    const rows = [...items].map((id) => ({ id, p: f.rate(id, win, 'produced'), c: f.rate(id, win, 'consumed') }));
    rows.sort((a, b) => sort === 'prod' ? b.p - a.p : sort === 'cons' ? b.c - a.c : (b.p - b.c) - (a.p - a.c));
    const sel = (st.sel as string) ?? rows[0]?.id;
    const table = h('table', { class: 'prod' },
      h('tr', null, h('th', null, 'Item'), h('th', { onclick: () => { st.sort = 'prod'; ui.refreshPanel(); } }, 'Produced/min'), h('th', { onclick: () => { st.sort = 'cons'; ui.refreshPanel(); } }, 'Consumed/min'), h('th', { onclick: () => { st.sort = 'net'; ui.refreshPanel(); } }, 'Net'), h('th', null, 'Stored')),
      ...rows.map((r) => {
        let stored = 0;
        for (const b of f.buildings.values()) if (b.kind === 'vault') stored += b.input.get(r.id) ?? 0;
        const net = r.p - r.c;
        return h('tr', { class: sel === r.id ? 'sel' : '', onclick: () => { st.sel = r.id; ui.refreshPanel(); } },
          h('td', null, h('img', { src: itemIcon(r.id, 20) }), ITEM_MAP.get(r.id)!.name), h('td', { class: 'good' }, fmt(r.p)), h('td', { class: 'warn' }, fmt(r.c)), h('td', { class: net >= 0 ? 'good' : 'bad' }, (net >= 0 ? '+' : '') + fmt(net)), h('td', { class: 'dim' }, fmt(stored)));
      }));
    // graph
    const cv = h('canvas', { width: 560, height: 180, style: { width: '560px', height: '180px', background: '#0a0807', border: '1px solid #2a2420' } }) as HTMLCanvasElement;
    requestAnimationFrame(() => drawGraph(cv, g, sel, win));
    // bottlenecks
    const counts: Record<string, Building[]> = {};
    for (const b of f.buildings.values()) if (['no_input', 'no_fuel', 'no_power', 'output_full', 'no_recipe', 'no_ammo', 'depleted'].includes(b.status) && b.kind !== 'lab') (counts[b.status] ??= []).push(b);
    const bottl = h('div', { class: 'col' }, ...Object.entries(counts).map(([s, bs]) => h('div', { class: 'row' }, h('span', { class: `bstatus ${STATUS_TEXT[s]?.[1] ?? 'idle'}` }, STATUS_TEXT[s]?.[0] ?? s), h('span', null, `${bs.length} structure${bs.length > 1 ? 's' : ''}: ${summ(bs)}`), h('div', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => { const b = bs[0]; g.markers.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, label: `${b.def.name}: ${STATUS_TEXT[s]?.[0]}` }); ui.toast('Marker placed on the map', 'info'); } }, 'Mark'))));
    if (!Object.keys(counts).length) bottl.append(h('div', { class: 'good' }, 'No bottlenecks detected.'));
    let use = 0, cap = 0, stored = 0, storeCap = 0;
    for (const n of g.power.nets) { use += n.supplied; cap += n.supplyCap; stored += n.stored; storeCap += n.storeCap; }
    const power = h('div', null, h('h3', { class: 'title' }, 'Power'), h('div', null, `Consumption ${fmtPower(use)} · Capacity ${fmtPower(cap)} · Stored ${(stored / 1000).toFixed(1)}/${(storeCap / 1000).toFixed(0)} MJ · ${g.power.nets.length} networks`),
      ...g.power.nets.slice(0, 6).map((n) => h('div', { class: 'row', style: { fontSize: '0.85em' } }, h('span', { class: 'dim' }, `Net #${n.id + 1}`), h('div', { class: 'progressbar grow' }, h('div', { style: { width: `${Math.min(100, (n.demand / Math.max(1, n.supplyCap)) * 100)}%`, background: n.satisfaction < 1 ? '#ff5a4a' : undefined } })), h('span', null, `${fmtPower(n.demand)} / ${fmtPower(n.supplyCap)}`))));
    const winBtns = h('div', { class: 'row' }, ...[[60, '1 min'], [300, '5 min'], [600, '10 min']].map(([w, l]) => h('button', { class: `btn small tab ${win === w ? 'active' : ''}`, onclick: () => { st.win = w; ui.refreshPanel(); } }, String(l))));
    const threat = h('div', { class: 'dim', style: { fontSize: '0.88em' } }, `Rift-bleed emission ${fmt(g.threat.rate)}/min · next assault at ${fmt(g.threat.pool)}/${fmt(g.threat.nextCost)} · evolution ${(g.threat.evolution(g) * 100).toFixed(0)}%`);
    return panelFrame(ui, 'Production & Logistics', h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '16px' } },
      h('div', { style: { width: '460px', maxHeight: '64vh' }, class: 'scroll' }, winBtns, table),
      h('div', { class: 'col', style: { width: '580px' } }, h('h3', { class: 'title' }, `History — ${sel ? ITEM_MAP.get(sel)?.name : '—'}`), cv, h('div', { class: 'row', style: { fontSize: '0.8em' } }, h('span', { class: 'good' }, '■ produced'), h('span', { class: 'warn' }, '■ consumed'), h('span', { style: { color: '#7ad7ff' } }, '■ power use (scaled)')), power, h('h3', { class: 'title' }, 'Bottlenecks'), bottl, threat)), { width: 1100 });
  },
};

function summ(bs: Building[]) {
  const m = new Map<string, number>();
  for (const b of bs) m.set(b.def.name, (m.get(b.def.name) ?? 0) + 1);
  return [...m].map(([k, v]) => `${v}× ${k}`).join(', ');
}

function drawGraph(cv: HTMLCanvasElement, g: import('../../game/game').Game, item: string | undefined, win: number) {
  const ctx = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  ctx.fillStyle = '#0a0807'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1e1a17';
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, (H * i) / 4); ctx.lineTo(W, (H * i) / 4); ctx.stroke(); }
  const hist = g.factory.history.slice(-win);
  if (hist.length < 2) { ctx.fillStyle = '#6e6258'; ctx.fillText('Collecting data…', 10, 20); return; }
  // smooth into buckets
  const buckets = Math.min(80, hist.length);
  const per = hist.length / buckets;
  // rolling average (≥10 s window) so discrete item events read as rates, not spikes
  const win2 = Math.max(10, Math.ceil(per));
  const series = (fn: (h: (typeof hist)[number]) => number) => Array.from({ length: buckets }, (_, i) => { const end = Math.min(hist.length, Math.floor((i + 1) * per)); const a = Math.max(0, end - win2); let s = 0; for (let k = a; k < end; k++) s += fn(hist[k]); return (s / Math.max(1, end - a)) * 60; });
  const p = item ? series((x) => x.produced.get(item) ?? 0) : [];
  const c = item ? series((x) => x.consumed.get(item) ?? 0) : [];
  const pw = series((x) => x.power / 60);
  const max = Math.max(1, ...p, ...c);
  const pmax = Math.max(1, ...pw);
  const line = (vals: number[], col: string, m: number) => { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); vals.forEach((v, i) => { const x = (i / (vals.length - 1)) * W, y = H - 8 - (v / m) * (H - 20); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); };
  line(pw, 'rgba(122,215,255,0.5)', pmax);
  line(c, '#ffb04a', max);
  line(p, '#7ae0a0', max);
  ctx.fillStyle = '#a8998a'; ctx.font = '11px Inter, sans-serif'; ctx.fillText(`${fmt(max)}/min`, 4, 12);
}

export const blueprintsPanel: PanelDef = {
  render(ui) {
    const g = ui.game!;
    let lib: Record<string, string> = {};
    try { lib = JSON.parse(localStorage.getItem('ef.blueprints') ?? '{}'); } catch { lib = {}; }
    const save = () => localStorage.setItem('ef.blueprints', JSON.stringify(lib));
    const last = ui.panelState.blueprints?.last as Blueprint | undefined;
    const name = h('input', { type: 'text', placeholder: 'Blueprint name', id: 'bp-name' }) as HTMLInputElement;
    const imp = h('textarea', { rows: 3, style: { width: '100%' }, placeholder: 'Paste an EFBP1: string to import' }) as HTMLTextAreaElement;
    const list = h('div', { class: 'col' }, ...Object.entries(lib).map(([n, s]) => {
      let bp: Blueprint | null = null;
      try { bp = decodeBlueprint(s); } catch { /* broken entry */ }
      return h('div', { class: 'slotcard' }, h('div', null, h('b', null, n), h('div', { class: 'dim', style: { fontSize: '0.85em' } }, bp ? `${bp.entries.length} structures · ${bp.w}×${bp.h} · ${[...blueprintCost(bp)].slice(0, 5).map(([k, v]) => `${v}× ${BUILDING_MAP.get(k)!.name}`).join(', ')}` : 'corrupted')),
        h('div', { class: 'row' },
          h('button', { class: 'btn small primary', disabled: !bp, onclick: () => { ui.paste = bp; ui.tool = 'paste'; if (!ui.buildMode) ui.toggleBuild(); ui.tool = 'paste'; ui.paste = bp; ui.closePanel(); } }, 'Paste'),
          h('button', { class: 'btn small', onclick: () => { navigator.clipboard?.writeText(s); ui.toast('Blueprint string copied', 'good'); } }, 'Export'),
          h('button', { class: 'btn small danger', onclick: () => { delete lib[n]; save(); ui.refreshPanel(); } }, '✕')));
    }));
    return panelFrame(ui, 'Blueprint Library', [
      h('div', { class: 'dim' }, 'Capture layouts with the Blueprint tool (V in construction mode). Pasted blueprints become ghosts that your construction wisps build from your inventory.'),
      h('h3', { class: 'title' }, 'Save last capture'),
      h('div', { class: 'row' }, name, h('button', { class: 'btn small primary', disabled: !last, onclick: () => { if (!last) return; lib[name.value || `Blueprint ${Object.keys(lib).length + 1}`] = encodeBlueprint(last); save(); ui.refreshPanel(); } }, 'Save'), last ? h('span', { class: 'dim' }, `${last.entries.length} structures`) : h('span', { class: 'faint' }, 'nothing captured yet')),
      h('h3', { class: 'title' }, 'Import'),
      imp, h('button', { class: 'btn small', onclick: () => { try { const bp = decodeBlueprint(imp.value); lib[bp.name + ' (imported)'] = encodeBlueprint(bp); save(); ui.refreshPanel(); } catch (e) { ui.toast((e as Error).message, 'bad'); } } }, 'Import'),
      h('h3', { class: 'title' }, 'Library'), list,
    ], { width: 640 });
    void g;
  },
};
