import { chromium } from 'playwright';
import { createServer } from 'vite';

const out = process.argv[2] ?? 'shots';
const server = await createServer({ root: process.cwd(), server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('CERT')) errors.push(m.type() + ': ' + m.text()); });
await page.goto('http://localhost:5198/');
await page.waitForTimeout(500);
await page.click('text=New World');
await page.fill('input[type=text]', '424242');
await page.click('text=Begin');
await page.waitForTimeout(800);
const shot = async (n) => page.screenshot({ path: `${out}/${n}.png` });
const ev = (fn, arg) => page.evaluate(fn, arg);

// Build a mining line near spawn
const res = await ev(() => {
  const g = window.ef.game;
  const m = g.overworld;
  const pl = g.player;
  let spot = null;
  for (let r = 3; r < 30 && !spot; r++)
    for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
      const x = Math.floor(pl.x) + dx, y = Math.floor(pl.y) + dy;
      let ok = true;
      for (let k = 0; k < 4; k++) { const i = m.idx(x + (k % 2), y + (k >> 1)); if (m.res[i] !== 1) ok = false; }
      if (ok && g.factory.canPlace('ember_drill', x, y, 0).ok) spot = { x, y };
    }
  if (!spot) return 'no spot';
  pl.x = spot.x + 3; pl.y = spot.y + 3;
  const inv = pl.inv;
  for (const [id, n] of [['ember_drill', 2], ['conveyor', 30], ['kiln', 2], ['vault', 2], ['coal', 60], ['cinder_engine', 1], ['pylon', 5], ['lectern', 1], ['sigil_brass', 20], ['bolt_thrower', 2], ['bolts', 20], ['wall', 20], ['glowlamp', 3]]) inv.add(id, n);
  const log = [];
  const place = (id, x, y, d) => { const r = g.placeBuilding(id, x, y, d); log.push(id + ':' + r.ok + (r.reason ?? '')); return r.b; };
  const drill = place('ember_drill', spot.x, spot.y, 0);
  for (let x = spot.x + 2; x < spot.x + 6; x++) place('conveyor', x, spot.y, 0);
  const kiln = place('kiln', spot.x + 6, spot.y, 0);
  place('vault', spot.x + 8, spot.y, 0);
  if (drill) g.giveToBuilding(drill, 'coal', 10);
  if (kiln) g.giveToBuilding(kiln, 'coal', 10);
  // power + research
  place('cinder_engine', spot.x, spot.y + 4, 0);
  place('pylon', spot.x + 3, spot.y + 5, 0);
  place('lectern', spot.x + 4, spot.y + 4, 0);
  place('glowlamp', spot.x + 7, spot.y + 4, 0);
  const gen = g.factory.at(spot.x, spot.y + 4); if (gen) g.giveToBuilding(gen, 'coal', 20);
  const lab = g.factory.at(spot.x + 4, spot.y + 4); if (lab) g.giveToBuilding(lab, 'sigil_brass', 20);
  g.research.start('ballistics');
  return { spot, log };
});
console.log('build:', JSON.stringify(res));
// fast-forward 60 sim seconds
await ev(() => { const g = window.ef.game; const inp = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, skillPressed: [0,0,0,0,0,0], skillHeld: [0,0,0,0,0,0], dodge: false, interact: false, gather: false, tonic: false, charge: false, blockCombat: false }; for (let i = 0; i < 3600; i++) g.update(1 / 60, inp); });
await page.waitForTimeout(600);
await shot('10-factory');
const st = await ev(() => { const g = window.ef.game; return { plates: g.factory.totalProduced.get('iron_plate') ?? 0, ore: g.factory.totalProduced.get('iron_ore') ?? 0, research: [...g.research.progress], quest: g.quests.active, q: g.quests.progress, statuses: [...g.factory.buildings.values()].map((b) => b.def.id + ':' + b.status) }; });
console.log('factory:', JSON.stringify(st));
// build mode view
await page.keyboard.press('KeyB');
await page.waitForTimeout(200);
await page.keyboard.press('Digit1');
await page.mouse.move(900, 300);
await page.waitForTimeout(300);
await shot('11-buildmode');
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
// combat: spawn a pack nearby and fight
await ev(() => { const g = window.ef.game; const c = window.ef; c.ui.console.run('spawn husk 6'); c.ui.console.run('spawn spitter 2'); c.ui.console.run('spawn brute 1 flaming'); });
await page.mouse.move(1000, 470);
for (let i = 0; i < 8; i++) { await page.mouse.down(); await page.waitForTimeout(220); await page.mouse.up(); }
await shot('12-combat');
await page.mouse.click(1000, 470, { button: 'right' });
await page.waitForTimeout(150);
await page.keyboard.press('Digit1');
await shot('13-combat2');
// night
await ev(() => { const g = window.ef.game; g.time = g.settings.dayLength * 0.5; });
await page.waitForTimeout(400);
await shot('14-night');
// panels
for (const [k, n] of [['KeyT', '15-research'], ['KeyP', '16-production'], ['KeyK', '17-skills'], ['KeyM', '18-map'], ['KeyH', '19-craft']]) { await page.keyboard.press(k); await page.waitForTimeout(400); await shot(n); await page.keyboard.press('Escape'); await page.waitForTimeout(100); }
// building panel
await ev(() => { const g = window.ef.game; const b = [...g.factory.buildings.values()].find((x) => x.kind === 'furnace'); window.ef.ui.openPanel('building', b.id); });
await page.waitForTimeout(400);
await shot('20-building');
await page.keyboard.press('Escape');
// dungeon
await ev(() => { const g = window.ef.game; g.time = g.settings.dayLength * 0.1; g.enterDungeon(); });
await page.waitForTimeout(800);
await shot('21-dungeon');
await ev(() => { const g = window.ef.game; const b = g.dungeon.dungeon.boss; g.player.x = b.x + 3; g.player.y = b.y + b.h / 2; g.god = true; const inp = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, skillPressed: [0,0,0,0,0,0], skillHeld: [0,0,0,0,0,0], dodge: false, interact: false, gather: false, tonic: false, charge: false, blockCombat: false }; for (let i = 0; i < 150; i++) g.update(1 / 60, inp); });
await page.waitForTimeout(700);
await shot('22-boss');
console.log(errors.slice(0, 20).join('\n') || 'no errors');
await browser.close();
await server.close();
