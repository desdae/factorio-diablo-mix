import { h, tip, tooltip, $ } from '../dom';
import type { UI } from '../ui';
import { panelFrame, type PanelDef } from './frame';
import { itemIcon, equipIcon, rarityColor } from '../../render/icons';
import { equipCompareTooltip, equipTooltip, stackTooltip, isUpgrade } from '../tooltips';
import { GEAR_SLOTS, type GearSlot } from '../../game/player';
import { isEquip, isStack, slotOf, type InvSlot } from '../../game/items';
import { ATTR_DESC, ATTR_KEYS } from '../../game/stats';
import { STATS } from '../../data/equipment';
import { ITEM_MAP } from '../../data/items';
import { fmt } from '../../core/math';

const SLOT_LABEL: Record<GearSlot, string> = { helmet: 'Head', amulet: 'Amulet', mainhand: 'Weapon', body: 'Body', offhand: 'Off-hand', gloves: 'Hands', belt: 'Belt', boots: 'Feet', ring1: 'Ring', ring2: 'Ring', relic: 'Relic' };
const ATTR_NAME: Record<string, string> = { str: 'Strength', dex: 'Dexterity', int: 'Intelligence', vit: 'Vitality', wil: 'Willpower', pre: 'Precision', eng: 'Engineering' };

export function invSig(ui: UI): string {
  const g = ui.game!;
  return g.player.inv.slots.map((s) => (s ? (isStack(s) ? `${s.item}${s.count}` : `${s.equip.uid}${s.equip.locked ? 'L' : ''}${s.equip.favorite ? 'F' : ''}`) : '-')).join(',') + Object.values(g.player.gear).map((e) => e?.uid ?? 0).join(',') + g.player.embers + g.player.attrPoints + (ui.heldInv ?? '');
}

/** Click-to-pick-up / click-to-place inventory with modifiers: right-click use/equip, shift-click quick transfer, ctrl lock, alt favorite. */
export function invGrid(ui: UI, opts: { onShift?: (i: number) => void; filter?: string; cat?: string } = {}): HTMLElement {
  const g = ui.game!;
  const inv = g.player.inv;
  const cb = g.settings.colorblind !== 'off';
  const grid = h('div', { class: 'invgrid' });
  inv.slots.forEach((s, i) => {
    const dim = (opts.filter || (opts.cat && opts.cat !== 'all')) && !inv.matches(s, opts.filter ?? '', opts.cat ?? 'all');
    const cell = h('div', { class: `icell ${dim ? 'dimmed' : ''} ${ui.heldInv === i ? 'held' : ''} ${isEquip(s) && isUpgrade(g, s.equip) ? 'upgrade' : ''}` });
    if (isStack(s)) {
      cell.append(h('img', { src: itemIcon(s.item, 46) }), h('div', { class: 'cnt' }, fmt(s.count)));
      tip(cell, () => stackTooltip(s.item, s.count, g) + '<div class="faint" style="font-size:0.8em;margin-top:4px">Right-click: use · Shift-click: transfer</div>');
    } else if (isEquip(s)) {
      const col = rarityColor(s.equip.rarity, cb);
      cell.style.borderColor = col;
      cell.style.boxShadow = s.equip.rarity >= 3 ? `inset 0 0 12px ${col}55` : '';
      cell.append(h('img', { src: equipIcon(s.equip, 46, cb) }));
      if (s.equip.locked) cell.append(h('div', { class: 'lock' }, '🔒'));
      if (s.equip.favorite) cell.append(h('div', { class: 'fav' }, '★'));
      tip(cell, () => equipCompareTooltip(g, s.equip) + '', true);
    }
    cell.addEventListener('mousedown', (e) => {
      e.preventDefault();
      tooltip.hide();
      if (e.button === 2) { useSlot(ui, i); return; }
      if (e.shiftKey && opts.onShift) { opts.onShift(i); return; }
      if (e.ctrlKey && isEquip(s)) { s.equip.locked = !s.equip.locked; ui.refreshPanel(); return; }
      if (e.altKey && isEquip(s)) { s.equip.favorite = !s.equip.favorite; ui.refreshPanel(); return; }
      pickOrPlace(ui, i);
    });
    grid.appendChild(cell);
  });
  return grid;
}

function pickOrPlace(ui: UI, i: number) {
  const inv = ui.game!.player.inv;
  const cur = $('cursor-item') as HTMLImageElement;
  if (ui.heldInv === null) {
    if (!inv.slots[i]) return;
    ui.heldInv = i;
    const s = inv.slots[i]!;
    cur.src = isStack(s) ? itemIcon(s.item, 46) : equipIcon(s.equip, 46, false);
    cur.classList.remove('hidden');
  } else {
    const a = ui.heldInv;
    const sa = inv.slots[a], sb = inv.slots[i];
    if (a !== i) {
      // merge stacks of the same item
      if (isStack(sa) && isStack(sb) && sa.item === sb.item) {
        const max = ITEM_MAP.get(sa.item)!.stack;
        const move = Math.min(max - sb.count, sa.count);
        sb.count += move; sa.count -= move;
        if (sa.count <= 0) inv.slots[a] = null;
      } else { inv.slots[a] = sb; inv.slots[i] = sa; }
    }
    ui.heldInv = null;
    cur.classList.add('hidden');
  }
  ui.audio.play('click');
  ui.refreshPanel();
}

export function useSlot(ui: UI, i: number) {
  const g = ui.game!;
  const pl = g.player;
  const s = pl.inv.slots[i];
  if (!s) return;
  if (isEquip(s)) {
    pl.inv.slots[i] = null;
    const removed = pl.equip(s.equip);
    for (const r of removed) if (!pl.inv.addEquip(r)) g.addDrop(g.playerLevel(), pl.x, pl.y, { equip: r });
    ui.audio.play('pickup_equip');
  } else if (s.item === 'tonic') {
    pl.inv.remove('tonic', 1); pl.buffs.tonic = 2; ui.audio.play('drink');
  } else if (ITEM_MAP.get(s.item)?.building) {
    if (!ui.buildMode) ui.toggleBuild();
    ui.selectBuild(s.item);
    ui.closePanel();
    return;
  }
  ui.refreshPanel();
}

function paperDoll(ui: UI): HTMLElement {
  const g = ui.game!;
  const pl = g.player;
  const cb = g.settings.colorblind !== 'off';
  const doll = h('div', { class: 'paperdoll' });
  for (const slot of GEAR_SLOTS) {
    const e = pl.gear[slot];
    const el = h('div', { class: 'pslot' }, e ? h('img', { src: equipIcon(e, 54, cb) }) : null, h('div', { class: 'lbl' }, SLOT_LABEL[slot]));
    if (e) { el.style.borderColor = rarityColor(e.rarity, cb); tip(el, () => equipTooltip(e, cb, 'EQUIPPED') + '<div class="faint" style="font-size:0.8em">Click to unequip</div>'); }
    el.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      tooltip.hide();
      // placing a held inventory equip into a doll slot equips it
      if (ui.heldInv !== null) {
        const s = pl.inv.slots[ui.heldInv];
        if (isEquip(s)) {
          const want = slotOf(s.equip);
          if (want === slot || (want === 'ring' && (slot === 'ring1' || slot === 'ring2'))) {
            pl.inv.slots[ui.heldInv] = null;
            const prev = pl.gear[slot];
            if (want === 'ring') { pl.gear[slot] = s.equip; pl.recompute(); if (prev) pl.inv.addEquip(prev); }
            else for (const r of pl.equip(s.equip)) pl.inv.addEquip(r);
          } else ui.toast('Wrong slot', 'warn');
        }
        ui.heldInv = null; $('cursor-item').classList.add('hidden');
        ui.refreshPanel();
        return;
      }
      if (!e) return;
      if (pl.inv.freeSlots() === 0) { ui.toast('Inventory full', 'warn'); return; }
      pl.inv.addEquip(pl.unequip(slot)!);
      ui.audio.play('click');
      ui.refreshPanel();
    });
    doll.appendChild(el);
  }
  return doll;
}

function statsBlock(ui: UI): HTMLElement {
  const g = ui.game!;
  const pl = g.player;
  const s = pl.stats;
  const dps = ((s.wMin + s.wMax) / 2 + s.flat.physical + s.flat.fire + s.flat.frost + s.flat.lightning) * (1 + s.inc.all / 100) * s.aps * (1 + s.atkSpeed / 100) * (1 + (s.critChance / 100) * (s.critDmg / 100));
  const kv = (k: string, v: string, cls = '') => h('div', { class: 'kv' }, h('span', { class: 'dim' }, k), h('span', { class: cls }, v));
  const attrs = h('div', null, h('h3', { class: 'title' }, `Attributes ${pl.attrPoints ? `· ${pl.attrPoints} points` : ''}`),
    ...ATTR_KEYS.map((k) => {
      const row = h('div', { class: 'attr' }, h('span', null, ATTR_NAME[k]), h('span', { class: 'row' }, h('b', null, String(s.attrs[k])), pl.attrPoints ? h('button', { class: 'btn small', onclick: () => { pl.spendAttr(k); ui.refreshPanel(); } }, '+') : null));
      return tip(row, () => `<b>${ATTR_NAME[k]}</b><div class="dim">${ATTR_DESC[k]}</div>`);
    }));
  return h('div', { class: 'stats' },
    attrs,
    h('h3', { class: 'title' }, 'Offense'),
    kv('Weapon damage', `${s.wMin}–${s.wMax}`), kv('Approx. DPS (Cleave)', fmt(dps), 'gold'), kv('Attacks/sec', (s.aps * (1 + s.atkSpeed / 100)).toFixed(2)),
    kv('Critical chance', `${s.critChance.toFixed(1)}%`), kv('Critical damage', `+${s.critDmg.toFixed(0)}%`), kv('Increased damage', `${s.inc.all.toFixed(0)}%`),
    kv('Bleed / Ignite / Chill / Shock', `${s.bleed}/${s.ignite}/${s.chill}/${s.shock}%`), kv('Area of effect', `+${s.aoe}%`), kv('Cooldown reduction', `${s.cdr.toFixed(0)}%`),
    h('h3', { class: 'title' }, 'Defense'),
    kv('Life', `${Math.ceil(pl.hp)} / ${s.maxLife}`), kv('Life regen', `${s.lifeRegen.toFixed(1)}/s`), kv('Armor', String(s.armor)),
    kv('Resist F/C/L/P', `${s.res.fire.toFixed(0)}/${s.res.frost.toFixed(0)}/${s.res.lightning.toFixed(0)}/${s.res.poison.toFixed(0)}%`), kv('Block / Evasion', `${s.block}% / ${s.dodge.toFixed(1)}%`), kv('Thorns', String(s.thorns)), kv('Move speed', `${s.moveSpeed >= 0 ? '+' : ''}${s.moveSpeed}%`),
    h('h3', { class: 'title' }, 'Industry'),
    kv('Turret damage', `+${s.turretDmg.toFixed(0)}%`), kv('Machine speed (near you)', `+${s.machineSpeed.toFixed(0)}%`), kv('Construction wisps', String(s.drones)), kv('Manual mining', `+${s.mineSpeed.toFixed(0)}%`), kv('Item rarity', `+${s.findRarity}%`),
    s.legendaries.size ? h('div', { class: 'gold', style: { marginTop: '6px', fontSize: '0.85em' } }, `✦ ${s.legendaries.size} legendary power(s) active`) : null,
  );
  void STATS;
}

export const inventoryPanel: PanelDef = {
  live: true,
  sig: (ui) => invSig(ui),
  render(ui) {
    const g = ui.game!;
    const pl = g.player;
    const st = ui.panelState.inventory;
    const filter = (st.filter as string) ?? '';
    const cat = (st.cat as string) ?? 'all';
    const search = h('input', { type: 'text', id: 'inv-search', placeholder: 'Search…', value: filter, style: { width: '160px' } }) as HTMLInputElement;
    search.addEventListener('input', () => { st.filter = search.value; ui.refreshPanel(); });
    const catSel = h('select', null, ...['all', 'equipment', 'materials'].map((c) => h('option', { value: c, selected: c === cat }, c))) as HTMLSelectElement;
    catSel.addEventListener('change', () => { st.cat = catSel.value; ui.refreshPanel(); });
    const target = ui.panelState.inventory.transferTo as number | undefined;
    const onShift = (i: number) => {
      const b = target ? g.factory.buildings.get(target) : null;
      const s = pl.inv.slots[i];
      if (b && isStack(s)) { const n = g.giveToBuilding(b, s.item, s.count); ui.toast(n ? `Moved ${n} ${ITEM_MAP.get(s.item)!.name}` : 'Building does not accept that', n ? 'info' : 'warn'); ui.refreshPanel(); }
      else useSlot(ui, i);
    };
    const left = h('div', { style: { width: '230px' } }, paperDoll(ui), h('div', { class: 'sep' }), h('div', { class: 'scroll', style: { maxHeight: '48vh' } }, statsBlock(ui)));
    const right = h('div', { class: 'col' },
      h('div', { class: 'row' }, search, catSel, h('button', { class: 'btn small', onclick: () => { pl.inv.sort(); ui.refreshPanel(); } }, 'Sort'), h('div', { class: 'grow' }), h('span', { class: 'gold' }, `◈ ${fmt(pl.embers)} embers`)),
      invGrid(ui, { onShift, filter, cat }),
      h('div', { class: 'faint', style: { fontSize: '0.8em' } }, 'Click to pick up/place · Right-click equip/use · Ctrl-click lock · Alt-click favorite · ▲ marks upgrades'),
    );
    return panelFrame(ui, 'Kindled Vanguard', h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '16px' } }, left, right), { width: 780 });
  },
};
