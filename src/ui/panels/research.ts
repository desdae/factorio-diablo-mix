import { h, tip } from '../dom';
import type { UI } from '../ui';
import { panelFrame, type PanelDef } from './frame';
import { TECHS } from '../../data/techs';
import { RECIPE_MAP } from '../../data/recipes';
import { ITEM_MAP } from '../../data/items';
import { itemIcon } from '../../render/icons';

export const researchPanel: PanelDef = {
  live: true,
  sig: (ui) => { const r = ui.game!.research; return `${r.active}|${r.done.size}|${Math.floor((r.progress.get(r.active ?? '') ?? 0))}|${[...r.relicsDelivered].join()}|${ui.game!.player.inv.count('colossus_heart')}${ui.game!.player.inv.count('matriarch_gland')}`; },
  render(ui) {
    const g = ui.game!;
    const R = g.research;
    const labs = [...g.factory.buildings.values()].filter((b) => b.kind === 'lab');
    const working = labs.filter((b) => b.status === 'working').length;
    const tiers = [1, 2, 3, 4];
    const cols = tiers.map((t) => h('div', { class: 'col' }, h('h3', { class: 'title' }, ['', 'Mechanization', 'Industrialization', 'Arcane Industry', 'World Engine'][t]),
      ...TECHS.filter((x) => x.tier === t).map((tech) => {
        const done = R.done.has(tech.id);
        const avail = R.available(tech);
        const active = R.active === tech.id;
        const prog = (R.progress.get(tech.id) ?? 0) / tech.units;
        const relicOk = !tech.relic || R.relicsDelivered.has(tech.relic);
        const el = h('div', { class: `tech ${done ? 'done' : active ? 'active' : avail ? 'avail' : 'locked'}`, onclick: () => {
          if (done || !avail) return;
          if (tech.relic && !relicOk) {
            if (g.deliverRelic(tech.id)) ui.refreshPanel();
            else ui.toast(`Requires ${ITEM_MAP.get(tech.relic)!.name} — slay its guardian`, 'warn');
            return;
          }
          const r = R.start(tech.id);
          if (!r.ok) ui.toast(r.reason!, 'warn'); else ui.audio.play('click');
          ui.refreshPanel();
        } },
          h('div', { class: 'tname' }, tech.name, done ? ' ✓' : ''),
          h('div', { class: 'dim', style: { fontSize: '0.85em' } }, tech.desc),
          h('div', { style: { marginTop: '4px', fontSize: '0.85em' } }, ...tech.cost.map((c) => h('span', { class: 'cost' }, h('img', { src: itemIcon(c.item, 18) }), `×${c.count}`)), h('span', { class: 'dim' }, ` × ${Math.round(tech.units * g.diff.research)} units`)),
          tech.relic ? h('div', { class: relicOk ? 'good' : 'warn', style: { fontSize: '0.82em' } }, relicOk ? `${ITEM_MAP.get(tech.relic)!.name} offered` : `Requires ${ITEM_MAP.get(tech.relic)!.name}${g.player.inv.count(tech.relic) ? ' — click to offer' : ''}`) : null,
          h('div', { class: 'unl' }, ...tech.unlocks.map((u) => { const out = RECIPE_MAP.get(u)?.outputs[0]?.item ?? u; const img = h('img', { src: itemIcon(ITEM_MAP.has(out) ? out : 'gear', 24) }); return tip(img, () => `<b>${RECIPE_MAP.get(u)?.name ?? u}</b>`); })),
          !done && prog > 0 ? h('div', { class: 'prog' }, h('div', { style: { width: `${prog * 100}%` } })) : null,
          tech.prereqs.length && !done ? h('div', { class: 'faint', style: { fontSize: '0.75em', marginTop: '3px' } }, `Needs: ${tech.prereqs.map((p) => TECHS.find((x) => x.id === p)!.name).join(', ')}`) : null,
        );
        return el;
      })));
    const status = h('div', { class: 'row', style: { marginBottom: '10px' } },
      h('span', null, R.active ? `Researching: ` : 'No active research — select a technology.'), R.active ? h('b', { class: 'arcane' }, TECHS.find((t) => t.id === R.active)!.name) : null,
      h('div', { class: 'grow' }), h('span', { class: labs.length ? 'dim' : 'bad' }, labs.length ? `${working}/${labs.length} lecterns working` : 'Build a Sigil Lectern and power it'));
    return panelFrame(ui, 'Research', [status, h('div', { class: 'techgrid' }, ...cols)], { width: 1100 });
  },
};
