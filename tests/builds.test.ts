import { describe, it, expect } from 'vitest';
import { analyseBuilds } from '../src/tools/buildSim';

describe('build diversity validation', () => {
  it('no reference build dominates the others by an extreme margin, and each excels somewhere', () => {
    const res = analyseBuilds(15);
    console.table(res.map((r) => ({ build: r.name, dps: r.dps.toFixed(0), turretDps: r.turretDps.toFixed(0), ehp: r.ehp.toFixed(0), mobility: r.mobility.toFixed(1), sustain: r.sustain.toFixed(1), score: r.score.toFixed(0) })));
    const scores = res.map((r) => r.score).sort((a, b) => a - b);
    const median = scores[Math.floor(scores.length / 2)];
    for (const r of res) {
      expect(r.score / median, `${r.name} vs median`).toBeLessThan(2.5);
      expect(r.score / median, `${r.name} vs median`).toBeGreaterThan(0.4);
    }
    // each build is the best (or near-best) in at least one dimension
    const best = (k: 'dps' | 'ehp' | 'mobility' | 'sustain' | 'turretDps') => Math.max(...res.map((r) => r[k]));
    for (const r of res) {
      const niche = (['dps', 'ehp', 'mobility', 'sustain', 'turretDps'] as const).some((k) => r[k] >= best(k) * 0.85);
      expect(niche, `${r.name} has a niche`).toBe(true);
    }
  });
});
