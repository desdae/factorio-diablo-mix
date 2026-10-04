import { Game } from '../game/game';
import { emptyInput } from '../game/playerControl';
import { spawnEnemy } from '../game/combat';
import { generateEquip, type Equip } from '../game/items';
import type { StatId } from '../data/equipment';
import { Rng } from '../core/rng';

export interface BuildSpec {
  name: string;
  level: number;
  attrs: Partial<Record<'str' | 'dex' | 'int' | 'vit' | 'wil' | 'pre' | 'eng', number>>;
  skills: Record<string, { rank: number; mods: string[] }>;
  bar: (string | null)[];
  passives: string[];
  weapon: { base: string; affixes: [StatId, number][]; legendary?: string };
  offhand?: { base: string; affixes: [StatId, number][]; legendary?: string };
  armor: [StatId, number][]; // rolled onto body armor
  turrets?: number;
}

export interface BuildResult { name: string; dps: number; ehp: number; mobility: number; sustain: number; turretDps: number }

function item(g: Game, base: string, affixes: [StatId, number][], legendary?: string): Equip {
  const e = generateEquip(new Rng(1), { ilvl: 20, rarity: 2, base });
  e.affixes = affixes.map(([stat, value]) => ({ id: stat, stat, value, tier: 1 }));
  if (legendary) e.legendary = legendary;
  void g;
  return e;
}

/** Simulates a build against a standard pack of training dummies and scores offense, defense, mobility and sustain. */
export function simulateBuild(spec: BuildSpec, seconds = 20): BuildResult {
  const g = new Game({ seed: 'buildsim' });
  const pl = g.player;
  const m = g.overworld;
  for (let y = Math.floor(pl.y) - 15; y < pl.y + 15; y++) for (let x = Math.floor(pl.x) - 15; x < pl.x + 15; x++) { const i = m.idx(x, y); m.terrain[i] = 0; m.tree[i] = 0; m.prop[i] = 0; }
  while (pl.level < spec.level) pl.addXp(100 * Math.pow(pl.level, 1.65));
  pl.attrPoints = 0;
  for (const [k, v] of Object.entries(spec.attrs)) pl.attrs[k as keyof typeof pl.attrs] = v!;
  for (const [id, s] of Object.entries(spec.skills)) { const st = pl.skills.get(id)!; st.rank = s.rank; st.mods = new Set(s.mods); }
  pl.bar = spec.bar.slice();
  pl.passives = new Set(spec.passives);
  pl.gear.mainhand = item(g, spec.weapon.base, spec.weapon.affixes, spec.weapon.legendary);
  pl.gear.offhand = spec.offhand ? item(g, spec.offhand.base, spec.offhand.affixes, spec.offhand.legendary) : null;
  pl.gear.body = item(g, 'plate', spec.armor);
  pl.recompute();
  pl.hp = pl.stats.maxLife;
  g.god = true;
  // training dummies: immobile, harmless, very durable
  const dummies = [] as ReturnType<typeof spawnEnemy>[];
  for (let i = 0; i < 6; i++) {
    const d = spawnEnemy(g, g.over, 'husk', pl.x + 2 + (i % 3) * 0.8, pl.y - 0.8 + Math.floor(i / 3) * 1.6, { level: spec.level });
    d.maxHp = d.hp = 1e9; d.speedMult = 0; d.dmgMult = 0; d.armor = 40 + spec.level * 4;
    dummies.push(d);
  }
  for (let i = 0; i < (spec.turrets ?? 0); i++) {
    const t = g.factory.place('bolt_thrower', Math.floor(pl.x) - 4, Math.floor(pl.y) - 4 + i * 2, 0, true)!;
    t.input.set('bolts', 20);
  }
  let player = 0, turret = 0;
  g.events.on('hit', (h) => { if (h.target !== 'enemy' || h.amount <= 0) return; if (h.src === 'turret' || h.src === 'tesla') turret += h.amount; else player += h.amount; });
  const anchors = dummies.map((d) => ({ x: d.x, y: d.y }));
  const inp = emptyInput();
  const cx = pl.x + 2.8, cy = pl.y;
  pl.resolve = pl.maxResolve;
  const ticks = seconds * 60;
  for (let i = 0; i < ticks; i++) {
    inp.aimX = cx; inp.aimY = cy;
    inp.skillHeld[0] = true;
    for (let s = 1; s < 6; s++) inp.skillPressed[s] = !!pl.bar[s] && i % 6 === s;
    g.update(1 / 60, inp);
    // keep the hero in place (rush moves us): return to anchor
    if (pl.dashT <= 0) { pl.x = cx - 2.8; pl.y = cy; }
    dummies.forEach((d, k) => { d.x = anchors[k].x; d.y = anchors[k].y; d.knockX = d.knockY = 0; });
  }
  const dps = player / seconds;
  const s = pl.stats;
  // effective HP vs a standard mix of 50% physical (40 dmg hits) and 50% elemental
  const physTaken = 1 - Math.min(0.85, s.armor / (s.armor + 8 * 40 + 60));
  const eleTaken = 1 - (s.res.fire + s.res.frost + s.res.lightning + s.res.poison) / 400;
  const avoid = 1 - (s.block / 100) * 0.5 - (s.dodge / 100) * 0.5;
  const ehp = s.maxLife / ((physTaken * 0.5 + eleTaken * 0.5) * avoid);
  const rushCd = (spec.bar.includes('rush') ? Math.max(1, 5 - (spec.skills.rush?.mods.includes('momentum') ? 2 : 0)) : 99);
  const mobility = 5.4 * (1 + s.moveSpeed / 100) + 6 / rushCd;
  const sustain = s.lifeRegen + (s.leech / 100) * dps + (s.keystones.has('bastion') ? s.maxLife * 0.03 * (s.block / 100) * 1 : 0);
  return { name: spec.name, dps, ehp, mobility, sustain, turretDps: turret / seconds };
}

const MID = { str: 40, dex: 25, int: 15, vit: 40, wil: 20, pre: 25, eng: 15 };

export const REFERENCE_BUILDS: BuildSpec[] = [
  { name: 'Bleed Reaver', level: 20, attrs: { ...MID, str: 60, pre: 35 }, skills: { cleave: { rank: 5, mods: ['hemorrhage', 'widearc'] }, rush: { rank: 3, mods: ['momentum'] }, slam: { rank: 2, mods: [] } }, bar: ['cleave', 'rush', 'slam', null, null, null], passives: ['p_root', 'p_might1', 'p_bleed', 'p_aspd', 'p_crit1', 'p_critdmg', 'p_k_berserk'], weapon: { base: 'axe', affixes: [['bleedChance', 25], ['dmgPct', 50], ['atkSpeed', 12]], legendary: 'leg_vampire' }, armor: [['life', 80]] },
  { name: 'Ember Juggernaut', level: 20, attrs: { ...MID, int: 45 }, skills: { cleave: { rank: 4, mods: ['emberedge'] }, rush: { rank: 2, mods: [] }, slam: { rank: 3, mods: ['aftershock'] }, judgement: { rank: 4, mods: ['meltdown', 'tempered'] } }, bar: ['cleave', 'rush', 'slam', 'judgement', null, null], passives: ['p_root', 'p_might1', 'p_crit1'], weapon: { base: 'greataxe', affixes: [['flatFire', 18], ['firePct', 50], ['igniteChance', 20]] }, armor: [['resFire', 30], ['life', 60]] },
  { name: 'Bastion Wall', level: 20, attrs: { ...MID, vit: 80, str: 30 }, skills: { cleave: { rank: 3, mods: [] }, rush: { rank: 2, mods: ['guarded'] }, bulwark: { rank: 5, mods: ['retaliation', 'restoring'] } }, bar: ['cleave', 'rush', 'bulwark', null, null, null], passives: ['p_root', 'p_vit1', 'p_armor', 'p_res', 'p_block', 'p_regen', 'p_k_bastion'], weapon: { base: 'mace', affixes: [['dmgPct', 25]] }, offhand: { base: 'tower', affixes: [['block', 12], ['armor', 80]], legendary: 'leg_bulwark' }, armor: [['armor', 120], ['resAll', 12], ['life', 120]] },
  { name: 'Quake Lord', level: 20, attrs: { ...MID, str: 55 }, skills: { cleave: { rank: 3, mods: [] }, rush: { rank: 2, mods: ['shockwave'] }, slam: { rank: 5, mods: ['aftershock', 'tremor'] } }, bar: ['cleave', 'rush', 'slam', null, null, null], passives: ['p_root', 'p_might1', 'p_bleed', 'p_aspd'], weapon: { base: 'hammer', affixes: [['aoe', 25], ['dmgPct', 40], ['resolveGen', 25]], legendary: 'leg_doubleslam' }, armor: [['life', 80]] },
  { name: 'Foreman Engineer', level: 20, attrs: { ...MID, eng: 70, str: 25 }, skills: { cleave: { rank: 3, mods: [] }, rush: { rank: 2, mods: [] }, horn: { rank: 3, mods: ['overclock'] } }, bar: ['cleave', 'rush', 'horn', null, null, null], passives: ['p_root', 'p_eng1', 'p_turret', 'p_machine', 'p_mine', 'p_drones'], weapon: { base: 'hammer', affixes: [['turretDmg', 50]], legendary: 'leg_mark' }, offhand: undefined, armor: [['turretDmg', 40], ['life', 80]], turrets: 3 },
];

export function analyseBuilds(seconds = 20) {
  const res = REFERENCE_BUILDS.map((b) => simulateBuild(b, seconds));
  // turret damage counts at half weight: it is immobile and needs ammunition logistics
  const score = (r: BuildResult) => Math.sqrt((r.dps + r.turretDps * 0.5) * r.ehp);
  return res.map((r) => ({ ...r, score: score(r) }));
}
