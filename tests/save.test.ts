import { describe, it, expect } from 'vitest';
import { Game } from '../src/game/game';
import { emptyInput } from '../src/game/playerControl';
import { serializeGame, restoreGame, snapshotPristine, encodeSave, decodeSave, writeSlot, readSlot, memoryStorage, migrate, SAVE_VERSION } from '../src/save/save';
import { generateEquip } from '../src/game/items';
import { factoryHash } from './factoryHash';
import { TECH_MAP } from '../src/data/techs';

function buildBase(g: Game) {
  const m = g.overworld;
  const pl = g.player;
  g.god = true;
  // find a 2x2 iron spot near spawn
  let spot: { x: number; y: number } | null = null;
  for (let r = 3; r < 30 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
    const x = Math.floor(pl.x) + dx, y = Math.floor(pl.y) + dy;
    let ok = true;
    for (let k = 0; k < 4; k++) if (m.res[m.idx(x + (k % 2), y + (k >> 1))] !== 1) ok = false;
    if (ok && g.factory.canPlace('ember_drill', x, y, 0).ok && [2, 3, 4, 5, 6, 7, 8].every((o) => g.factory.canPlace('conveyor', x + o, y, 0).ok)) spot = { x, y };
  }
  if (!spot) throw new Error('no build spot');
  pl.x = spot.x + 3; pl.y = spot.y + 3;
  for (const [id, n] of [['ember_drill', 1], ['conveyor', 10], ['kiln', 1], ['vault', 1], ['coal', 50]] as const) pl.inv.add(id, n);
  const d = g.placeBuilding('ember_drill', spot.x, spot.y, 0).b!;
  for (let x = spot.x + 2; x < spot.x + 6; x++) g.placeBuilding('conveyor', x, spot.y, 0);
  const k = g.placeBuilding('kiln', spot.x + 6, spot.y, 0).b!;
  g.placeBuilding('vault', spot.x + 8, spot.y, 0);
  g.giveToBuilding(d, 'coal', 10); g.giveToBuilding(k, 'coal', 10);
  return spot;
}

const step = (g: Game, n: number) => { const inp = emptyInput(); for (let i = 0; i < n; i++) g.update(1 / 60, inp); };

describe('save / load', () => {
  it('round-trips player, inventory, research, quests and the factory exactly', async () => {
    const g = new Game({ seed: 'roundtrip' });
    const pristine = snapshotPristine(g.overworld);
    buildBase(g);
    g.player.inv.addEquip(generateEquip(g.lootRng, { ilvl: 9, rarity: 4 }));
    g.player.embers = 1234;
    g.player.addXp(500);
    g.research.complete(TECH_MAP.get('automation')!);
    step(g, 60 * 20);
    const data = serializeGame(g, pristine);
    const text = await encodeSave(data);
    const back = await decodeSave(text);
    const { game: h } = restoreGame(back);
    expect(factoryHash(h.factory, false)).toBe(factoryHash(g.factory, false));
    expect(h.player.level).toBe(g.player.level);
    expect(h.player.embers).toBe(1234);
    expect(JSON.stringify(h.player.inv.slots)).toBe(JSON.stringify(g.player.inv.slots));
    expect([...h.research.done]).toEqual([...g.research.done]);
    expect(h.research.isUnlocked('fabricator')).toBe(true);
    expect(h.quests.active).toBe(g.quests.active);
    // world modifications (mined ore) persist via deltas
    expect(Buffer.from(h.overworld.amt.buffer)).toEqual(Buffer.from(g.overworld.amt.buffer));
    expect(Buffer.from(h.overworld.explored)).toEqual(Buffer.from(g.overworld.explored));
    // determinism: both continue identically
    step(g, 600); step(h, 600);
    expect(factoryHash(h.factory)).toBe(factoryHash(g.factory));
  });

  it('falls back to the backup when the primary save is corrupted', async () => {
    const store = memoryStorage();
    const g = new Game({ seed: 5 });
    const pristine = snapshotPristine(g.overworld);
    g.player.embers = 10;
    await writeSlot(store, 'slot1', serializeGame(g, pristine));
    g.player.embers = 20;
    await writeSlot(store, 'slot1', serializeGame(g, pristine));
    // corrupt primary
    const raw = store.get('ef.save.slot1')!;
    store.set('ef.save.slot1', raw.slice(0, raw.length - 40) + 'garbage"}');
    const r = await readSlot(store, 'slot1');
    expect(r.fromBackup).toBe(true);
    expect((r.data.player as { embers: number }).embers).toBe(10);
  });

  it('detects checksum mismatches', async () => {
    const g = new Game({ seed: 6 });
    const text = await encodeSave(serializeGame(g, snapshotPristine(g.overworld)));
    const env = JSON.parse(text);
    env.sum = (env.sum + 1) >>> 0;
    await expect(decodeSave(JSON.stringify(env))).rejects.toThrow(/checksum/);
  });

  it('migrates a version 1 save forward', () => {
    const g = new Game({ seed: 8 });
    const d = serializeGame(g, snapshotPristine(g.overworld)) as unknown as Record<string, unknown>;
    d.version = 1;
    delete d.market;
    delete (d.player as Record<string, unknown>).bar;
    (d.buildings as unknown[][]).push(['conveyor', 1, 1, 0, 60, null, [], [], ['iron_ore', 'coal'], [0.5, 0.2], {}]);
    delete d.totalProduced;
    const m = migrate(d);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.market).toBeTruthy();
    expect((m.buildings.at(-1)![8] as number[]).every((x) => typeof x === 'number')).toBe(true);
  });

  it('save stress: a large factory saves and restores repeatedly with identical state', async () => {
    const g = new Game({ seed: 'savestress' });
    const pristine = snapshotPristine(g.overworld);
    const m = g.overworld;
    // carpet a cleared region with ~3000 belts carrying items
    let placed = 0;
    for (let y = 20; y < 80; y++) for (let x = 20; x < 80; x++) {
      const i = m.idx(x, y); m.terrain[i] = 0; m.tree[i] = 0; m.prop[i] = 0; m.res[i] = 0;
      const b = g.factory.place('conveyor', x, y, y % 2 ? 0 : 2, true);
      if (b) { b.bItems = [2, 3]; b.bPos = [0.8, 0.3]; placed++; }
    }
    expect(placed).toBe(3600);
    step(g, 30);
    let text = '';
    for (let k = 0; k < 3; k++) {
      text = await encodeSave(serializeGame(g, pristine));
      const { game: h } = restoreGame(await decodeSave(text));
      expect(factoryHash(h.factory, false)).toBe(factoryHash(g.factory, false));
    }
    expect(text.length).toBeLessThan(400_000);
  });
});
