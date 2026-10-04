import { GameMap, Res } from '../src/world/map';
import { Factory, type FactoryContext } from '../src/sim/factory';
import { PowerGrid } from '../src/sim/power';
import { Research } from '../src/sim/research';

export function blankWorld(size = 64) {
  const map = new GameMap(size, size, 'overworld', 1);
  const factory = new Factory(map);
  const power = new PowerGrid(factory);
  const research = new Research();
  factory.recipeUnlocked = (id) => research.isUnlocked(id);
  const ctx: FactoryContext = {
    time: 0, isNight: false, miningBonus: 0, turretBonus: 0, research,
    machineBonus: () => 1, turretFire: () => false, teslaFire: () => false, forgeComplete: () => {},
  };
  const step = (seconds: number) => {
    const dt = 1 / 60;
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      ctx.time += dt;
      factory.update(dt, ctx);
      power.update(dt);
    }
  };
  return { map, factory, power, research, ctx, step };
}

export function oreField(map: GameMap, x: number, y: number, w: number, h: number, res: Res, amt: number) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { map.res[map.idx(xx, yy)] = res; map.amt[map.idx(xx, yy)] = amt; }
}

export function countItem(f: Factory, item: string): number {
  let n = 0;
  for (const b of f.buildings.values()) {
    n += (b.input.get(item) ?? 0) + (b.output.get(item) ?? 0);
    for (const it of b.bItems) if (ITEM_ID(it) === item) n++;
    if (b.held >= 0 && ITEM_ID(b.held) === item) n++;
  }
  return n;
}
import { ITEM_IDS } from '../src/sim/itemIndex';
const ITEM_ID = (i: number) => ITEM_IDS[i];
