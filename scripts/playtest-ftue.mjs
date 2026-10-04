// Plays the opening quests through the real UI: keyboard + mouse only (state is only *read*).
import { chromium } from 'playwright';
import { createServer } from 'vite';

const out = process.argv[2] ?? 'shots';
const server = await createServer({ root: process.cwd(), server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if ((m.type() === 'error') && !m.text().includes('CERT') && !m.text().includes('Failed to load resource')) errors.push(m.text()); });
await page.goto('http://localhost:5197/');
await page.waitForTimeout(400);
await page.click('text=New World');
await page.fill('input[type=text]', '777');
await page.click('text=Begin');
await page.waitForTimeout(600);
const read = (fn, arg) => page.evaluate(fn, arg);
const S = async () => read(() => { const g = window.ef.game; return { x: g.player.x, y: g.player.y, hp: g.player.hp, q: g.quests.active, p: g.quests.progress, lvl: g.player.level }; });
const toScreen = (wx, wy) => read(([x, y]) => window.ef.renderer.worldToScreen(x, y), [wx, wy]);
async function walkTo(tx, ty, tol = 1.2, maxMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = await S();
    const dx = tx - s.x, dy = ty - s.y;
    if (Math.hypot(dx, dy) < tol) break;
    const keys = [];
    if (dx > 0.4) keys.push('KeyD'); if (dx < -0.4) keys.push('KeyA'); if (dy > 0.4) keys.push('KeyS'); if (dy < -0.4) keys.push('KeyW');
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(120);
    for (const k of keys) await page.keyboard.up(k);
  }
}
// ── Quest 1: fight the husks
for (let round = 0; round < 40; round++) {
  const t = await read(() => { const g = window.ef.game; const pl = g.player; const es = g.over.enemies.filter((e) => !e.dead && e.def.id === 'husk').sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y)); return es[0] ? { x: es[0].x, y: es[0].y, d: Math.hypot(es[0].x - pl.x, es[0].y - pl.y) } : null; });
  const s = await S();
  if (s.q !== 'q1' || !t) break;
  if (t.d > 1.6) await walkTo(t.x, t.y, 1.4, 3000);
  const sc = await toScreen(t.x, t.y);
  await page.mouse.move(sc.x, sc.y);
  await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  if (round === 2) await page.screenshot({ path: `${out}/ftue-1-fight.png` });
}
console.log('after q1:', JSON.stringify(await S()));
// ── Quest 2: gather ferrite ore by holding F
const ore = await read(() => { const g = window.ef.game; const m = g.overworld; const pl = g.player; let best = null, bd = 1e9; for (let y = Math.floor(pl.y) - 25; y < pl.y + 25; y++) for (let x = Math.floor(pl.x) - 25; x < pl.x + 25; x++) { const i = m.idx(x, y); if (m.res[i] === 1 && m.amt[i] > 50) { const d = Math.hypot(x - pl.x, y - pl.y); if (d < bd) { bd = d; best = { x, y }; } } } return best; });
await walkTo(ore.x + 0.5, ore.y + 0.5, 1.0);
await page.keyboard.down('KeyF'); await page.waitForTimeout(9000); await page.keyboard.up('KeyF');
await page.screenshot({ path: `${out}/ftue-2-gather.png` });
console.log('after q2:', JSON.stringify(await S()));
// ── Quest 3: build an ember drill over ore via the build bar
await page.keyboard.press('KeyB');
await page.waitForTimeout(200);
await page.click('#buildbar button:has-text("Production")');
await page.waitForTimeout(150);
const spot = await read(() => { const g = window.ef.game; const m = g.overworld; const pl = g.player; for (let r = 2; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = Math.floor(pl.x) + dx, y = Math.floor(pl.y) + dy; let ok = true; for (let k = 0; k < 4; k++) if (m.res[m.idx(x + (k % 2), y + (k >> 1))] !== 1) ok = false; if (ok && g.factory.canPlace('ember_drill', x, y, 0).ok && [2,3,4,5,6,7,8,9].every((o) => g.factory.canPlace('conveyor', x + o, y, 0).ok) && g.factory.canPlace('kiln', x + 6, y, 0).ok && g.factory.canPlace('vault', x + 8, y, 0).ok) return { x, y }; } return null; });
console.log('spot', JSON.stringify(spot));
await page.keyboard.press('Digit1'); // ember drill is first in Production
let sc = await toScreen(spot.x + 0.5, spot.y + 0.5);
await page.mouse.move(sc.x, sc.y); await page.waitForTimeout(100);
await page.screenshot({ path: `${out}/ftue-3-place.png` });
await page.mouse.click(sc.x, sc.y);
await page.waitForTimeout(200);
console.log('after drill:', JSON.stringify(await S()), await read(() => [...window.ef.game.factory.buildings.values()].map((b) => b.def.id)));
// ── Quest 4: belts (drag), kiln, vault, fuel
await page.click('#buildbar button:has-text("Logistics")');
await page.keyboard.press('Digit1');
const a = await toScreen(spot.x + 2.5, spot.y + 0.5), b = await toScreen(spot.x + 5.5, spot.y + 0.5);
await page.mouse.move(a.x, a.y); await page.mouse.down();
for (let i = 1; i <= 6; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 6, a.y); await page.waitForTimeout(40); }
await page.mouse.up();
await page.keyboard.press('Digit5'); // strongbox
sc = await toScreen(spot.x + 8.5, spot.y + 0.5); await page.mouse.click(sc.x, sc.y);
await page.click('#buildbar button:has-text("Production")');
await page.keyboard.press('Digit3'); // kiln
sc = await toScreen(spot.x + 6.5, spot.y + 0.5); await page.mouse.move(sc.x, sc.y); await page.waitForTimeout(80); await page.mouse.click(sc.x, sc.y);
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
console.log('placed:', await read(() => [...window.ef.game.factory.buildings.values()].map((b) => `${b.def.id}@${b.x},${b.y}d${b.dir}`).join(' ')));
// fuel the drill and kiln via the building panel quick-add buttons
for (const [dx, dy] of [[0.5, 0.5], [6.5, 0.5]]) {
  sc = await toScreen(spot.x + dx, spot.y + dy); await page.mouse.click(sc.x, sc.y);
  await page.waitForTimeout(250);
  const btn = page.locator('button:has-text("+10 Cinderstone")');
  if (await btn.count()) await btn.first().click(); else console.log('no fuel button');
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/ftue-4-panel-${dx}.png` });
  await page.keyboard.press('Escape');
}
await page.keyboard.press('Escape');
await page.waitForTimeout(25000);
await page.screenshot({ path: `${out}/ftue-5-line.png` });
console.log('after automation:', JSON.stringify(await S()), await read(() => JSON.stringify({ plates: window.ef.game.factory.totalProduced.get('iron_plate') ?? 0, st: [...window.ef.game.factory.buildings.values()].map((b) => b.def.id + ':' + b.status) })));
console.log(errors.slice(0, 10).join('\n') || 'no errors');
await browser.close();
await server.close();
