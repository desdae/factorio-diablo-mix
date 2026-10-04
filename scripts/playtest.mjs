// Automated play-test: launches the built game, starts a world, plays, and captures screenshots.
import { chromium } from 'playwright';
import { createServer } from 'vite';

const out = process.argv[2] ?? 'shots';
const server = await createServer({ root: process.cwd(), server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.goto('http://localhost:5199/');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/01-title.png` });
await page.click('text=New World');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/02-newgame.png` });
await page.click('text=Begin');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/03-start.png` });
// walk around
await page.keyboard.down('KeyD'); await page.waitForTimeout(900); await page.keyboard.up('KeyD');
await page.mouse.move(1000, 450);
await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.up();
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/04-moved.png` });
await page.keyboard.press('KeyI'); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/05-inventory.png` });
await page.keyboard.press('Escape');
await page.keyboard.press('KeyB'); await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/06-build.png` });
const stats = await page.evaluate(() => { const g = window.ef.game; return { time: g.time, hp: g.player.hp, x: g.player.x, y: g.player.y, enemies: g.over.enemies.length, buildings: g.factory.buildings.size }; });
console.log(JSON.stringify(stats));
console.log(errors.slice(0, 20).join('\n'));
await browser.close();
await server.close();
