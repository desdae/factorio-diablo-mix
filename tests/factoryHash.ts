import type { Factory } from '../src/sim/factory';

/** Canonical fingerprint of the logical factory state (for determinism and save/load checks). */
export function factoryHash(f: Factory, includeDerived = true): string {
  const parts: string[] = [];
  for (const b of f.buildings.values()) {
    parts.push([b.def.id, b.x, b.y, b.dir, Math.round(b.hp), b.recipe?.id ?? '-', [...b.input].sort().join(';'), [...b.output].sort().join(';'), b.bItems.join('.'), b.bPos.map((p) => p.toFixed(2)).join('.'), b.progress.toFixed(3), b.held, Math.round(b.fuelEnergy), includeDerived ? b.status : ''].join('|'));
  }
  return parts.join('\n');
}
