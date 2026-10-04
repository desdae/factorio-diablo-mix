import { describe, it, expect } from 'vitest';
import { blankWorld } from './helpers';
import { captureBlueprint, rotateBlueprint, mirrorBlueprint, encodeBlueprint, decodeBlueprint } from '../src/game/blueprint';

describe('blueprints', () => {
  const setup = () => {
    const w = blankWorld();
    w.research.unlockedRecipes.add('fabricator');
    w.factory.place('cinder_engine', 10, 10, 1); // rotated 3x2
    w.factory.place('pylon', 13, 11, 0);
    w.factory.place('conveyor', 14, 10, 0);
    w.factory.place('conveyor', 15, 10, 1);
    const fab = w.factory.place('fabricator', 14, 12, 0)!;
    w.factory.setRecipe(fab, 'gear');
    return w;
  };
  it('captures structures with relative positions, recipes and rotation', () => {
    const { factory } = setup();
    const bp = captureBlueprint(factory, 10, 10, 20, 20)!;
    expect(bp.entries.length).toBe(5);
    expect(bp.entries.find((e) => e.d === 'fabricator')!.rc).toBe('gear');
    expect(bp.entries.find((e) => e.d === 'cinder_engine')!.r).toBe(1);
  });
  it('four rotations and two mirrors are identities; string encoding round-trips', () => {
    const { factory } = setup();
    const bp = captureBlueprint(factory, 10, 10, 20, 20)!;
    const norm = (b: typeof bp) => JSON.stringify({ ...b, entries: [...b.entries].sort((x, y) => x.x - y.x || x.y - y.y || x.d.localeCompare(y.d)) });
    expect(norm(rotateBlueprint(rotateBlueprint(rotateBlueprint(rotateBlueprint(bp)))))).toBe(norm(bp));
    expect(norm(mirrorBlueprint(mirrorBlueprint(bp)))).toBe(norm(bp));
    expect(decodeBlueprint(encodeBlueprint(bp))).toEqual(bp);
    expect(() => decodeBlueprint('nonsense')).toThrow();
  });
  it('rotated blueprints remain non-overlapping and placeable', () => {
    const { factory, map } = setup();
    let bp = captureBlueprint(factory, 10, 10, 20, 20)!;
    for (let r = 0; r < 4; r++) {
      bp = rotateBlueprint(bp);
      const occ = new Set<string>();
      for (const e of bp.entries) {
        const fp = factory.footprint(e.d, e.r);
        for (let y = e.y; y < e.y + fp.h; y++) for (let x = e.x; x < e.x + fp.w; x++) { const k = `${x},${y}`; expect(occ.has(k)).toBe(false); occ.add(k); expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0); }
      }
      for (const e of bp.entries) expect(factory.canPlace(e.d, 30 + e.x, 30 + e.y, e.r).ok).toBe(true);
    }
    void map;
  });
});
