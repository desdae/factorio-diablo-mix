import { h, tip } from '../dom';
import type { UI } from '../ui';
import { panelFrame, type PanelDef } from './frame';
import { RECIPES } from '../../data/recipes';
import { ITEM_MAP } from '../../data/items';
import { itemIcon } from '../../render/icons';
import { stackTooltip } from '../tooltips';
import { invSig } from './inventory';

export const craftPanel: PanelDef = {
  live: true,
  sig: (ui) => invSig(ui) + ui.game!.craftQueue.length + (ui.panelState.craft.q ?? ''),
  render(ui) {
    const g = ui.game!;
    const st = ui.panelState.craft;
    const q = (st.q as string) ?? '';
    const search = h('input', { type: 'text', id: 'craft-search', placeholder: 'Search recipes…', value: q }) as HTMLInputElement;
    search.addEventListener('input', () => { st.q = search.value; ui.refreshPanel(); });
    const list = RECIPES.filter((r) => r.handcraft && g.research.isUnlocked(r.id) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));
    const groups: Record<string, typeof list> = {};
    for (const r of list) { const cat = ITEM_MAP.get(r.outputs[0].item)!.category; (groups[cat] ??= []).push(r); }
    const body = h('div', null);
    for (const [cat, rs] of Object.entries(groups)) {
      body.append(h('h3', { class: 'title' }, cat === 'building' ? 'Structures' : cat[0].toUpperCase() + cat.slice(1)));
      body.append(h('div', { class: 'recipes' }, ...rs.map((r) => {
        const can = g.canHandcraft(r);
        const el = h('div', { class: `recipe ${can ? '' : 'cant'}`, onclick: (e: MouseEvent) => { const n = g.handcraft(r.id, e.shiftKey ? 5 : 1); if (!n) { ui.toast('Missing materials', 'warn'); ui.audio.play('error'); } else ui.audio.play('craft'); ui.refreshPanel(); } },
          h('img', { class: 'out', src: itemIcon(r.outputs[0].item, 36) }),
          h('div', null, h('div', null, r.name, r.outputs[0].count > 1 ? h('span', { class: 'dim' }, ` ×${r.outputs[0].count}`) : null),
            h('div', { style: { fontSize: '0.8em' } }, ...r.inputs.map((i) => h('span', { class: `cost ${g.player.inv.count(i.item) >= i.count ? '' : 'bad'}` }, h('img', { src: itemIcon(i.item, 18) }), `${i.count}`)))));
        return tip(el, () => stackTooltip(r.outputs[0].item, g.player.inv.count(r.outputs[0].item), g) + '<div class="faint">Click: craft 1 · Shift-click: craft 5</div>');
      })));
    }
    const queue = h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px', minHeight: '40px' } }, ...g.craftQueue.slice(0, 20).map((j, i) => {
      const r = RECIPES.find((x) => x.id === j.recipe)!;
      return tip(h('div', { class: 'slot small', style: { cursor: 'pointer' }, onclick: () => { g.cancelCraft(i); ui.refreshPanel(); } }, h('img', { src: itemIcon(r.outputs[0].item, 42) }), i === 0 ? h('div', { class: 'cd', style: { '--p': `${(1 - j.t / j.total) * 100}%` } as never }) : null), () => `${r.name} — click to cancel`);
    }), g.craftQueue.length > 20 ? h('span', { class: 'dim' }, `+${g.craftQueue.length - 20}`) : null);
    return panelFrame(ui, 'Handcrafting', [h('div', { class: 'row' }, search, h('div', { class: 'grow' }), h('span', { class: 'dim' }, 'Machines craft far faster — automate!')), h('h3', { class: 'title' }, `Queue (${g.craftQueue.length})`), queue, body], { width: 820 });
  },
};
