import { describe, it, expect } from 'vitest';
import { Game } from '../src/game/game';
import { emptyInput } from '../src/game/playerControl';

describe('game smoke', () => {
  it('creates a world and runs simulation ticks without errors', () => {
    const g = new Game({ seed: 12345 });
    const inp = emptyInput();
    for (let i = 0; i < 600; i++) g.update(1 / 60, inp);
    expect(g.time).toBeGreaterThan(9);
    expect(g.player.hp).toBeGreaterThan(0);
  });
  it('player can fight: cleave kills a husk', () => {
    const g = new Game({ seed: 7 });
    const lvl = g.over;
    const pl = g.player;
    // spawn a husk adjacent to the player
    import('../src/game/combat').then(() => {});
    const inp = emptyInput();
    return import('../src/game/combat').then(({ spawnEnemy }) => {
      const e = spawnEnemy(g, lvl, 'husk', pl.x + 1.2, pl.y, { level: 1 });
      inp.aimX = e.x; inp.aimY = e.y;
      for (let i = 0; i < 600 && !e.dead; i++) {
        inp.skillHeld[0] = true;
        inp.aimX = e.x; inp.aimY = e.y;
        g.update(1 / 60, inp);
      }
      expect(e.dead).toBe(true);
      expect(g.quests.progress).toBe(1);
    });
  });
});
