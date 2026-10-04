import type { Enemy, LootDrop, DmgType } from './types';
import type { TechDef } from '../data/techs';

export type FxKind =
  | 'slash' | 'slam' | 'explosion' | 'lightning' | 'blood' | 'sparks' | 'heal' | 'teleport' | 'meteor'
  | 'build' | 'dust' | 'muzzle' | 'shatter' | 'fire' | 'horn' | 'dash' | 'hammer' | 'levelup' | 'death' | 'gather' | 'acid' | 'shield' | 'summon' | 'beam' | 'portal' | 'frost';

export interface FxEvent {
  kind: FxKind;
  x: number; y: number;
  angle?: number; r?: number; color?: string;
  pts?: { x: number; y: number }[];
  x2?: number; y2?: number;
  map: 'overworld' | 'dungeon';
}

export interface GameEvents {
  hit: { x: number; y: number; amount: number; crit: boolean; type: DmgType; target: 'enemy' | 'player' | 'building'; map: string; text?: string; src?: string };
  kill: { enemy: Enemy };
  fx: FxEvent;
  sfx: { name: string; x?: number; y?: number; vol?: number };
  shake: { amount: number };
  hitstop: { t: number };
  toast: { text: string; kind: 'info' | 'warn' | 'good' | 'legend' | 'bad' };
  banner: { title: string; sub: string; color?: string };
  loot: { drop: LootDrop };
  levelUp: { level: number };
  quest: { id: string; done: boolean };
  research: { tech: TechDef };
  mapChange: { kind: 'overworld' | 'dungeon' };
  death: Record<string, never>;
  music: { mood: 'explore' | 'factory' | 'danger' | 'combat' | 'boss' | 'dungeon' };
  victory: Record<string, never>;
  dialog: { npc: string; text: string };
}
