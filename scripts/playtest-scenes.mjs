import { chromium } from 'playwright';
import { createServer } from 'vite';

const out = process.argv[2] ?? 'shots';
const server = await createServer({ root: process.cwd(), server: { port: 5196 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
await page.goto('http://localhost:5196/');
await page.waitForTimeout(400);
await page.click('text=New World');
await page.fill('input[type=text]', '31337');
await page.click('text=Begin');
await page.waitForTimeout(600);
const ev = (fn, arg) => page.evaluate(fn, arg);

// ── Scene A: assault on a fortified outpost
await ev(() => {
  const g = window.ef.game; const pl = g.player; const m = g.overworld; const c = window.ef.ui.console;
  c.run('research all');
  const bx = Math.floor(pl.x) - 6, by = Math.floor(pl.y) - 6;
  for (let y = by - 4; y < by + 16; y++) for (let x = bx - 4; x < bx + 18; x++) { const i = m.idx(x, y); m.terrain[i] = 0; m.tree[i] = 0; m.prop[i] = 0; m.res[i] = 0; }
  const P = (id, x, y, d = 0) => g.factory.place(id, x, y, d, true);
  const gen = P('cinder_engine', bx, by); gen.input.set('coal', 20);
  const gen2 = P('cinder_engine', bx + 2, by); gen2.input.set('coal', 20);
  P('pylon', bx + 5, by + 1); P('pylon', bx + 10, by + 1); P('pylon', bx + 5, by + 6);
  const f = P('fabricator', bx + 6, by + 2); g.factory.setRecipe(f, 'gear'); f.input.set('iron_plate', 10);
  P('arc_furnace', bx + 10, by + 3).input.set('iron_ore', 10);
  P('capacitor', bx + 12, by); 
  for (const [x, y] of [[bx + 2, by + 8], [bx + 9, by + 8]]) P('bolt_thrower', x, y).input.set('bolts', 20);
  P('arc_spire', bx + 6, by + 8);
  for (let x = bx - 2; x < bx + 15; x++) P('wall', x, by + 11);
  P('glowlamp', bx + 4, by + 9); P('glowlamp', bx + 11, by + 9);
  const lab = P('lectern', bx + 13, by + 4);
  pl.x = bx + 6; pl.y = by + 6;
  // launch an assault from just outside the walls
  const { spawnEnemy } = window.ef.combat ?? {};
  for (let i = 0; i < 22; i++) {
    const e = window.ef.spawn('husk spitter brute bloat moth tunneler'.split(' ')[i % 6], bx + 6 + (i % 8) * 1.2 - 4, by + 20 + Math.floor(i / 8), 4);
    e.wave = true; e.aggro = true;
  }
  g.time = g.settings.dayLength * 0.47; // dusk
});
await page.waitForTimeout(5500);
await page.screenshot({ path: `${out}/scene-a-assault.png` });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/scene-a-assault2.png` });
console.log('assault:', await ev(() => { const g = window.ef.game; return JSON.stringify({ alive: g.over.enemies.filter((e) => !e.dead && e.wave).length, damaged: [...g.factory.buildings.values()].filter((b) => b.hp < b.maxHp).length, ghosts: g.factory.ghosts.size }); }));

// ── Scene B: the Cinder Colossus, fought with real input
await ev(() => {
  const g = window.ef.game; const pl = g.player; const c = window.ef.ui.console;
  c.run('level 14');
  for (const s of ['cleave', 'rush', 'slam', 'bulwark', 'horn', 'judgement']) pl.skills.get(s).rank = 4;
  pl.skills.get('slam').mods.add('aftershock'); pl.skills.get('judgement').mods.add('meltdown');
  pl.bar = ['cleave', 'rush', 'slam', 'bulwark', 'horn', 'judgement'];
  pl.equip(window.ef.makeItem({ ilvl: 16, rarity: 4, base: 'greataxe' }));
  pl.inv.add('tonic', 10);
  pl.recompute(); pl.hp = pl.stats.maxLife;
  g.time = g.settings.dayLength * 0.1;
  g.enterDungeon();
  const b = g.dungeon.dungeon.boss;
  pl.x = b.x + 4; pl.y = b.y + b.h / 2;
  for (const e of g.dungeon.enemies) if (!e.def.boss && Math.hypot(e.x - pl.x, e.y - pl.y) < 30) e.dead = true;
});
window: {
  await page.evaluate(() => window.ef.ui.renderSkillBar());
}
const fightFor = async (ms) => {
  const t0 = Date.now();
  let k = 0;
  while (Date.now() - t0 < ms) {
    const t = await ev(() => { const g = window.ef.game; const lvl = g.playerLevel(); const b = lvl.enemies.find((e) => e.def.boss && !e.dead); if (!b) return null; const s = window.ef.renderer.worldToScreen(b.x, b.y - 1); return { ...s, d: Math.hypot(b.x - g.player.x, b.y - g.player.y), hp: g.player.hp / g.player.stats.maxLife }; });
    if (!t) break;
    await page.mouse.move(t.x, t.y);
    if (t.d > 3) { await page.keyboard.down('KeyD'); await page.waitForTimeout(100); await page.keyboard.up('KeyD'); }
    await page.mouse.down(); await page.waitForTimeout(250); await page.mouse.up();
    k++;
    if (k % 6 === 0) await page.keyboard.press('Digit1');
    if (k % 10 === 0) await page.keyboard.press('Digit2');
    if (k % 25 === 0) await page.keyboard.press('Digit4');
    if (t.hp < 0.4) await page.keyboard.press('KeyQ');
    if (k % 8 === 0) await page.keyboard.press('Space');
  }
};
await page.waitForTimeout(500);
await fightFor(6000);
await page.screenshot({ path: `${out}/scene-b-boss1.png` });
await fightFor(9000);
await page.screenshot({ path: `${out}/scene-b-boss2.png` });
console.log('boss:', await ev(() => { const g = window.ef.game; const b = g.dungeon?.enemies.find((e) => e.def.id === 'colossus'); return JSON.stringify({ bossHp: b ? (b.hp / b.maxHp).toFixed(2) : 'dead', phase: b?.phase, playerHp: g.player.hp.toFixed(0), deaths: g.stats.deaths, kills: g.stats.kills }); }));
console.log(errors.slice(0, 10).join('\n') || 'no errors');
await browser.close();
await server.close();
