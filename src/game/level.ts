import type { GameMap } from '../world/map';
import type { DungeonInfo } from '../world/dungeon';
import { FlowField, SpatialHash } from './nav';
import type { Enemy, GroundEffect, LootDrop, Projectile, Telegraph } from './types';

/** All transient actors living on one map. The overworld keeps simulating while the player is in a dungeon. */
export class Level {
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  ground: GroundEffect[] = [];
  telegraphs: Telegraph[] = [];
  loot: LootDrop[] = [];
  spatial = new SpatialHash<Enemy>(4);
  navPlayer: FlowField;
  navBase: FlowField | null;
  navPlayerTile = -1;
  navBaseVer = -1;
  navBaseTopo = -1;
  navPlayerT = 0;
  dungeon: DungeonInfo | null;
  /** chests / caches opened */
  opened = new Set<number>();
  constructor(public map: GameMap, dungeon: DungeonInfo | null = null) {
    this.navPlayer = new FlowField(map);
    this.navBase = map.kind === 'overworld' ? new FlowField(map) : null;
    this.dungeon = dungeon;
  }
}
