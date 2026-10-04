import { h, tip } from '../dom';
import type { UI } from '../ui';
import { panelFrame, type PanelDef } from './frame';
import { ITEM_MAP } from '../../data/items';
import { BASE_MAP, RARITIES } from '../../data/equipment';
import { itemIcon, equipIcon } from '../../render/icons';
import { equipTooltip, stackTooltip } from '../tooltips';
import { invSig } from './inventory';
import { equipValue, isEquip, isStack, rollAffixes, type Equip } from '../../game/items';
import { fmt } from '../../core/math';
import { QUEST_MAP } from '../../data/quests';

function questBlock(ui: UI, npcName: string): HTMLElement | null {
  const q = ui.game!.quests.def();
  if (!q || q.giver !== npcName) return null;
  return h('div', { class: 'frame', style: { padding: '10px', margin: '8px 0' } }, h('div', { class: 'gold title' }, `Quest: ${q.name}`), h('div', { style: { fontStyle: 'italic', margin: '4px 0' } }, `“${q.text}”`), h('div', { class: 'dim' }, q.hint));
}

export const npcPanel: PanelDef = {
  live: true,
  sig: (ui) => invSig(ui) + (ui.panelState.npc.tab ?? '') + (ui.panelState.npc.sel ?? ''),
  render(ui, arg) {
    const g = ui.game!;
    const npc = g.npcs.find((n) => n.id === arg)!;
    const st = ui.panelState.npc;
    const parts: HTMLElement[] = [h('div', { style: { fontStyle: 'italic' }, class: 'dim' }, `“${npc.lines[Math.floor(g.time / 20) % npc.lines.length]}”`)];
    const qb = questBlock(ui, npc.name);
    if (qb) parts.push(qb);
    if (npc.role === 'merchant') parts.push(...merchant(ui));
    if (npc.role === 'smith') parts.push(...smith(ui));
    if (npc.role === 'archivist') parts.push(...lore(ui));
    if (npc.role === 'engineer') parts.push(h('div', { class: 'col', style: { marginTop: '8px' } },
      h('h3', { class: 'title' }, 'Engineering Notes'),
      ...['Belts pointing INTO a machine feed it; belts leading AWAY collect its output. Drills also feed adjacent kilns directly.',
        'Machines emit rift-bleed while working. More industry draws bigger assaults — build Bolt Throwers and walls before expanding.',
        'Electric machines need a Conductor Pylon within 3 tiles; pylons link to each other within 7.5 tiles.',
        'Grapple Arms move items between buildings and can be given conditions — e.g. stop when a turret holds 10 magazines.',
        'Rally Horn\'s Overclock mod and the Foreman passives make machines near you work faster. Lightning damage charges capacitors.',
        'The Production panel (P) shows rates, history graphs and bottlenecks. Click Mark to locate a stalled machine on the map.'].map((t) => h('div', { style: { fontSize: '0.9em' } }, `• ${t}`))));
    if (npc.role === 'elder') parts.push(h('div', { class: 'col', style: { marginTop: '8px' } }, h('h3', { class: 'title' }, 'Chronicle'), ...[...g.quests.completed].map((id) => h('div', { class: 'good', style: { fontSize: '0.9em' } }, `✓ ${QUEST_MAP.get(id)?.name}`))));
    void st;
    return panelFrame(ui, npc.name, parts, { width: npc.role === 'merchant' || npc.role === 'smith' ? 760 : 560 });
  },
};

function merchant(ui: UI): HTMLElement[] {
  const g = ui.game!;
  const pl = g.player;
  const m = g.market;
  const buy = h('div', { class: 'col' }, h('h3', { class: 'title' }, 'Wares'), ...m.stock.map((s) => {
    const price = m.buyPrice(s.item);
    return h('div', { class: 'row' }, h('img', { src: itemIcon(s.item, 28) }), h('span', { class: 'grow' }, ITEM_MAP.get(s.item)!.name), h('span', { class: 'gold' }, `◈ ${price}`),
      h('button', { class: 'btn small', disabled: pl.embers < price, onclick: (e: MouseEvent) => { const n = e.shiftKey ? 10 : 1; let k = 0; for (; k < n && pl.embers >= m.buyPrice(s.item) && pl.inv.canAdd(s.item, 1); k++) { pl.embers -= m.buyPrice(s.item); pl.inv.add(s.item, 1); m.recordBuy(s.item, 1); } if (k) ui.audio.play('coin'); ui.refreshPanel(); } }, 'Buy'));
  }), h('div', { class: 'faint', style: { fontSize: '0.8em' } }, 'Shift-click buys 10. Prices rise as you buy and recover over time.'));
  const sellList = h('div', { class: 'col scroll', style: { maxHeight: '52vh' } }, h('h3', { class: 'title' }, 'Sell'));
  pl.inv.slots.forEach((s, i) => {
    if (!s) return;
    if (isStack(s)) {
      const p = m.sellPrice(s.item);
      sellList.append(tip(h('div', { class: 'row' }, h('img', { src: itemIcon(s.item, 24) }), h('span', { class: 'grow' }, `${ITEM_MAP.get(s.item)!.name} ×${s.count}`), h('span', { class: 'gold' }, `◈ ${p.toFixed(1)} ea`),
        h('button', { class: 'btn small', onclick: (e: MouseEvent) => { const n = e.shiftKey ? s.count : Math.min(s.count, 10); let total = 0; for (let k = 0; k < n; k++) { total += m.sellPrice(s.item); m.recordSale(s.item, 1); } pl.inv.remove(s.item, n); pl.embers += Math.floor(total); ui.audio.play('coin'); ui.refreshPanel(); } }, 'Sell 10')), () => stackTooltip(s.item, s.count)));
    } else if (isEquip(s) && !s.equip.locked) {
      const v = Math.round(equipValue(s.equip) * 0.4);
      sellList.append(tip(h('div', { class: 'row' }, h('img', { src: equipIcon(s.equip, 24) }), h('span', { class: 'grow', style: { color: RARITIES[s.equip.rarity].color } }, s.equip.name), h('span', { class: 'gold' }, `◈ ${v}`),
        h('button', { class: 'btn small', onclick: () => { pl.inv.slots[i] = null; pl.embers += v; ui.audio.play('coin'); ui.refreshPanel(); } }, 'Sell')), () => equipTooltip(s.equip)));
    }
  });
  return [h('div', { class: 'gold' }, `◈ ${fmt(pl.embers)} embers`), h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '20px' } }, h('div', { style: { width: '320px' } }, buy), h('div', { class: 'grow' }, sellList))];
}

function smith(ui: UI): HTMLElement[] {
  const g = ui.game!;
  const pl = g.player;
  const st = ui.panelState.npc;
  const all: { e: Equip; where: string; idx: number | string }[] = [];
  pl.inv.slots.forEach((s, i) => { if (isEquip(s)) all.push({ e: s.equip, where: 'inv', idx: i }); });
  for (const [k, e] of Object.entries(pl.gear)) if (e) all.push({ e, where: 'gear', idx: k });
  const sel = all.find((x) => x.e.uid === st.sel);
  const list = h('div', { class: 'col scroll', style: { maxHeight: '56vh', width: '300px' } }, ...all.map((x) => tip(h('div', { class: 'row', style: { cursor: 'pointer', padding: '3px', border: sel?.e === x.e ? '1px solid #ffe2a0' : '1px solid transparent' }, onclick: () => { st.sel = x.e.uid; ui.refreshPanel(); } },
    h('img', { src: equipIcon(x.e, 28) }), h('span', { style: { color: RARITIES[x.e.rarity].color } }, x.e.name), x.where === 'gear' ? h('span', { class: 'faint' }, '(equipped)') : null), () => equipTooltip(x.e))));
  const ops = h('div', { class: 'col grow' });
  if (!sel) ops.append(h('div', { class: 'dim' }, 'Select an item to work on.'));
  else {
    const e = sel.e;
    const base = BASE_MAP.get(e.base)!;
    const shards = pl.inv.count('rift_shard');
    const cost = (n: number) => `${n} Rift Shard${n > 1 ? 's' : ''}`;
    const fixed = e.rarity === 6;
    ops.append(h('div', { class: 'frame', style: { padding: '10px' }, html: equipTooltip(e) }));
    const reforgeCost = 2 + e.rarity;
    ops.append(h('div', { class: 'row' }, h('button', { class: 'btn', disabled: fixed || shards < reforgeCost, onclick: () => { pl.inv.remove('rift_shard', reforgeCost); const n = e.affixes.length; e.affixes = []; rollAffixes(g.lootRng, e, base, n); pl.recompute(); ui.audio.play('rare_drop'); ui.refreshPanel(); } }, 'Reforge'), h('span', { class: 'dim' }, `Reroll all affixes — ${cost(reforgeCost)}`)));
    const encCost = 1;
    ops.append(h('div', { class: 'row' }, h('button', { class: 'btn', disabled: fixed || shards < encCost || !e.affixes.length, onclick: () => { pl.inv.remove('rift_shard', encCost); const i = g.lootRng.int(0, e.affixes.length - 1); e.affixes.splice(i, 1); rollAffixes(g.lootRng, e, base, 1); pl.recompute(); ui.audio.play('craft'); ui.refreshPanel(); } }, 'Enchant'), h('span', { class: 'dim' }, `Reroll one random affix — ${cost(encCost)}`)));
    const upCost = 3;
    ops.append(h('div', { class: 'row' }, h('button', { class: 'btn', disabled: fixed || shards < upCost || e.rarity >= 3 || pl.inv.count('steel') < 5, onclick: () => { pl.inv.remove('rift_shard', upCost); pl.inv.remove('steel', 5); e.rarity++; rollAffixes(g.lootRng, e, base, 1); pl.recompute(); ui.audio.play('legendary'); ui.refreshPanel(); } }, 'Temper'), h('span', { class: 'dim' }, `Raise rarity (max Exalted) and add an affix — ${cost(upCost)} + 5 Tempered Steel`)));
    const sockCost = 2;
    ops.append(h('div', { class: 'row' }, h('button', { class: 'btn', disabled: shards < sockCost || e.sockets >= 3, onclick: () => { pl.inv.remove('rift_shard', sockCost); e.sockets++; ui.refreshPanel(); } }, 'Add Socket'), h('span', { class: 'dim' }, `${e.sockets}/3 sockets — ${cost(sockCost)}`)));
    const runes = ['rune_ember', 'rune_ward', 'rune_cog', 'rune_blood'].filter((r) => pl.inv.count(r) > 0);
    if (e.sockets > e.runes.length && runes.length) ops.append(h('div', { class: 'row' }, h('span', { class: 'dim' }, 'Socket rune:'), ...runes.map((r) => tip(h('button', { class: 'btn small', onclick: () => { pl.inv.remove(r, 1); e.runes.push(r); pl.recompute(); ui.audio.play('craft'); ui.refreshPanel(); } }, h('img', { src: itemIcon(r, 18) }), ` ${ITEM_MAP.get(r)!.name}`), () => stackTooltip(r)))));
    if (e.runes.length) ops.append(h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => { e.runes = []; pl.recompute(); ui.refreshPanel(); } }, 'Clear runes'), h('span', { class: 'faint' }, 'Runes are destroyed')));
    if (sel.where === 'inv' && !e.locked) {
      const shardsBack = e.rarity >= 3 ? e.rarity - 1 : 0;
      ops.append(h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: () => { pl.inv.slots[sel.idx as number] = null; pl.embers += Math.round(equipValue(e) * 0.25); if (shardsBack) pl.inv.add('rift_shard', shardsBack); pl.inv.add('steel', 1 + e.rarity); st.sel = undefined; ui.audio.play('deconstruct'); ui.refreshPanel(); } }, 'Salvage'), h('span', { class: 'dim' }, `Destroy for ${Math.round(equipValue(e) * 0.25)} embers, ${1 + e.rarity} steel${shardsBack ? `, ${shardsBack} shards` : ''}`)));
    }
  }
  return [h('div', { class: 'row' }, h('span', { class: 'gold' }, `◈ ${fmt(pl.embers)}`), h('span', null, `· ${pl.inv.count('rift_shard')} Rift Shards · ${pl.inv.count('steel')} Tempered Steel`)), h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '16px' } }, list, ops)];
}

function lore(ui: UI): HTMLElement[] {
  const g = ui.game!;
  const entries = [
    ['The Lattice', 'Before the Sundering, the Wrights bound the world in a lattice of arcane conduits — a planetary engine that turned rift-fire into light, warmth and motion.', true],
    ['The Sundering', 'When the Heart Furnaces were pushed past their wards, reality cracked. Rift-bleed seeped into every living thing. The Ashborn are what it made of us.', true],
    ['The Wardens', 'The Colossi were built to guard the Furnaces. Their cores still burn with Lattice fire — and with whatever leaked in.', g.flags.has('colossus_dead')],
    ['The Choice', 'The Beacon can rekindle the Lattice. Whether it heals the world or burns it hotter… the Wrights left that question unanswered.', g.research.done.has('arcane_industry')],
  ] as const;
  return [h('h3', { class: 'title' }, 'Archives'), ...entries.map(([t, txt, open]) => h('div', { style: { marginBottom: '8px' } }, h('b', { class: open ? 'arcane' : 'faint' }, t), h('div', { class: open ? '' : 'faint', style: { fontSize: '0.9em' } }, open ? txt : '— sealed. Progress further to learn more. —')))];
}

export const questsPanel: PanelDef = {
  render(ui) {
    const g = ui.game!;
    const q = g.quests;
    return panelFrame(ui, 'Chronicle', q.all().map((d) => {
      const done = q.completed.has(d.id), active = q.active === d.id;
      return h('div', { style: { padding: '6px 0', borderBottom: '1px solid #2a2420', opacity: done || active ? '1' : '0.45' } },
        h('div', { class: done ? 'good' : active ? 'gold' : 'faint' }, `${done ? '✓' : active ? '▶' : '·'} ${d.name}`, h('span', { class: 'faint' }, ` — ${d.giver}`)),
        done || active ? h('div', { class: 'dim', style: { fontSize: '0.88em' } }, active ? d.hint : d.text) : null);
    }), { width: 560 });
  },
};
