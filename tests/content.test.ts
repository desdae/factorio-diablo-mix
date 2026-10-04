import { describe, it, expect } from 'vitest';
import { validateContent } from '../src/data/validate';
import { RECIPES } from '../src/data/recipes';
import { TECHS } from '../src/data/techs';

describe('content validation', () => {
  it('has no broken references', () => {
    expect(validateContent()).toEqual([]);
  });
  it('every technology is reachable from the starting state', () => {
    const done = new Set<string>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const t of TECHS) if (!done.has(t.id) && t.prereqs.every((p) => done.has(p))) { done.add(t.id); progress = true; }
    }
    expect(done.size).toBe(TECHS.length);
  });
  it('every sigil can be produced once its unlocking tech is researched', () => {
    const unlocked = new Set(RECIPES.filter((r) => r.unlocked).map((r) => r.id));
    for (const t of TECHS) for (const u of t.unlocks) unlocked.add(u);
    for (const sig of ['sigil_brass', 'sigil_iron', 'sigil_ember']) expect(RECIPES.some((r) => unlocked.has(r.id) && r.outputs.some((o) => o.item === sig))).toBe(true);
  });
});
