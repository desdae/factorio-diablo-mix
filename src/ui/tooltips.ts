import { ITEM_MAP } from '../data/items';
import { BASE_MAP, RARITIES, STATS, LEGENDARY_MAP, type StatId } from '../data/equipment';
import { BUILDING_MAP } from '../data/buildings';
import { RECIPE_MAP } from '../data/recipes';
import { describeEquip, equipStats, equipValue, runeSetNames, type Equip } from '../game/items';
import type { Game } from '../game/game';
import { computeStats } from '../game/stats';
import { esc } from './dom';
import { rarityColor } from '../render/icons';
import { fmtPower } from '../core/math';

export function stackTooltip(id: string, count?: number, g?: Game): string {
  const d = ITEM_MAP.get(id);
  if (!d) return id;
  let s = `<div class="tname gold">${esc(d.name)}</div><div class="tsub">${d.category}${count ? ` · ${count}` : ''}</div><div>${esc(d.desc)}</div>`;
  if (d.fuel) s += `<div class="dim">Fuel value: ${d.fuel / 1000} MJ</div>`;
  const b = d.building ? BUILDING_MAP.get(d.building) : null;
  if (b) {
    s += `<div class="dim">Size ${b.w}×${b.h}${b.power ? ` · ${fmtPower(b.power)}` : ''}${b.produce ? ` · produces ${fmtPower(b.produce)}` : ''}${b.burner ? ' · burns fuel' : ''}</div>`;
    if (b.threat) s += `<div class="warn" style="font-size:0.85em">Rift-bleed: ${b.threat}/min while working</div>`;
  }
  const r = RECIPE_MAP.get(id);
  if (r && g) s += `<div class="sep"></div><div class="dim" style="font-size:0.85em">Recipe: ${r.inputs.map((i) => `${i.count}× ${ITEM_MAP.get(i.item)?.name}`).join(', ')}${g.research.isUnlocked(id) ? '' : ' <span class="bad">(locked)</span>'}</div>`;
  s += `<div class="faint" style="font-size:0.8em">Value ${d.value}</div>`;
  return s;
}

function statLines(e: Equip): string {
  let s = '';
  for (const a of e.affixes) s += `<div class="aff">${STATS[a.stat].fmt(a.value)} ${STATS[a.stat].name} <span class="tiers">T${a.tier}</span></div>`;
  return s;
}

export function equipTooltip(e: Equip, colorblind = false, title?: string): string {
  const base = BASE_MAP.get(e.base)!;
  const col = rarityColor(e.rarity, colorblind);
  let s = '';
  if (title) s += `<div class="faint" style="font-size:0.8em;margin-bottom:4px">${title}</div>`;
  s += `<div class="tname" style="color:${col}">${esc(e.name)}</div>`;
  s += `<div class="tsub">${RARITIES[e.rarity].name} ${base.slot}${base.twoHanded ? ' (2H)' : ''} · item level ${e.ilvl}${e.quality ? ` · quality +${e.quality}%` : ''}</div>`;
  for (const l of describeEquip(e)) s += `<div class="imp">${l}</div>`;
  s += statLines(e);
  if (e.sockets) {
    s += `<div style="margin-top:4px">Sockets: ${Array.from({ length: e.sockets }, (_, i) => e.runes[i] ? `<span style="color:${ITEM_MAP.get(e.runes[i])!.color}">◆ ${ITEM_MAP.get(e.runes[i])!.name}</span>` : '<span class="faint">◇ empty</span>').join(' ')}</div>`;
    for (const r of runeSetNames(e)) s += `<div class="good" style="font-size:0.9em">Runeword — ${r}</div>`;
  }
  const leg = e.legendary ? LEGENDARY_MAP.get(e.legendary) : null;
  if (leg) s += `<div class="leg">✦ ${esc(leg.name)}: ${esc(leg.desc)}</div>`;
  if (e.artifact) s += `<div class="faint" style="font-style:italic">Artifact — unique boss relic</div>`;
  s += `<div class="faint" style="font-size:0.8em;margin-top:4px">Sells for ~${equipValue(e)} embers${e.locked ? ' · 🔒 locked' : ''}</div>`;
  return s;
}

/** Comparison: shows the stat delta of equipping `e` vs the currently equipped item. */
export function equipCompareTooltip(g: Game, e: Equip): string {
  const pl = g.player;
  const slot = pl.compareSlot(e);
  const cur = pl.gear[slot];
  const cb = g.settings.colorblind !== 'off';
  const before = pl.stats;
  const gear = { ...pl.gear, [slot]: e };
  const base = BASE_MAP.get(e.base)!;
  if (slot === 'mainhand' && base.twoHanded) gear.offhand = null;
  const after = computeStats(pl.level, pl.attrs, gear, pl.passives, { dmg: pl.buffs.horn > 0 ? 25 : 0, aspd: pl.buffs.horn > 0 ? 15 : 0 }, pl.techDrones);
  const dps = (st: typeof before) => ((st.wMin + st.wMax) / 2 + st.flat.physical + st.flat.fire + st.flat.frost + st.flat.lightning) * (1 + st.inc.all / 100) * st.aps * (1 + st.atkSpeed / 100) * (1 + (st.critChance / 100) * (st.critDmg / 100));
  const rows: [string, number, number, boolean?][] = [
    ['Damage per second', dps(before), dps(after)],
    ['Maximum Life', before.maxLife, after.maxLife],
    ['Armor', before.armor, after.armor],
    ['All Resist (avg)', (before.res.fire + before.res.frost + before.res.lightning + before.res.poison) / 4, (after.res.fire + after.res.frost + after.res.lightning + after.res.poison) / 4],
    ['Crit Chance', before.critChance, after.critChance],
    ['Attack Speed %', before.atkSpeed, after.atkSpeed],
    ['Move Speed %', before.moveSpeed, after.moveSpeed],
    ['Block %', before.block, after.block],
    ['Turret Damage %', before.turretDmg, after.turretDmg],
    ['Machine Speed %', before.machineSpeed, after.machineSpeed],
  ];
  let cmp = '<div class="sep"></div><div class="dim" style="font-size:0.85em">If equipped:</div>';
  for (const [n, a, b] of rows) {
    const d = b - a;
    if (Math.abs(d) < 0.05) continue;
    cmp += `<div class="${d > 0 ? 'cmp-up' : 'cmp-down'}">${d > 0 ? '▲' : '▼'} ${n}: ${d > 0 ? '+' : ''}${Math.abs(d) < 10 ? d.toFixed(1) : Math.round(d)}</div>`;
  }
  const lost = cur?.legendary && cur.legendary !== e.legendary ? LEGENDARY_MAP.get(cur.legendary) : null;
  if (lost) cmp += `<div class="cmp-down">✦ Lose: ${esc(lost.name)}</div>`;
  const left = `<div class="tbox frame">${equipTooltip(e, cb)}${cmp}</div>`;
  if (!cur) return left;
  return left + `<div class="tbox frame">${equipTooltip(cur, cb, 'EQUIPPED')}</div>`;
}

export function isUpgrade(g: Game, e: Equip): boolean {
  const pl = g.player;
  const cur = pl.gear[pl.compareSlot(e)];
  if (!cur) return true;
  const score = (x: Equip) => equipStats(x).reduce((s, v) => s + (STAT_WEIGHT[v.stat] ?? 1) * v.value, 0) + (x.armor ?? 0) * 0.3 + (x.dmg ? (x.dmg[0] + x.dmg[1]) * 1.5 : 0) + (x.legendary ? 30 : 0);
  return score(e) > score(cur) * 1.08;
}

const STAT_WEIGHT: Partial<Record<StatId, number>> = { life: 0.4, armor: 0.25, dmgPct: 1.2, critChance: 3, critDmg: 0.6, atkSpeed: 2, moveSpeed: 1.5, allSkills: 25, flatPhys: 2, flatFire: 1.5 };
