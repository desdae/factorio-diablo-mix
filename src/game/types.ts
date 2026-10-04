import type { EnemyDef, EliteModId } from '../data/enemies';
import type { Equip } from './items';

export type DmgType = 'physical' | 'fire' | 'frost' | 'lightning' | 'poison';
export const DMG_TYPES: DmgType[] = ['physical', 'fire', 'frost', 'lightning', 'poison'];
export const DMG_COLOR: Record<DmgType, string> = { physical: '#f2e6d0', fire: '#ff8a3a', frost: '#8ad8ff', lightning: '#d0c0ff', poison: '#a8ff3a' };

export interface DamagePacket {
  physical: number;
  fire: number;
  frost: number;
  lightning: number;
  poison: number;
  crit?: boolean;
  /** chance-based status application, 0..1 */
  bleed?: number;
  ignite?: number;
  chill?: number;
  shock?: number;
  stun?: number; // seconds
  knock?: number;
  source: 'player' | 'turret' | 'tesla' | 'enemy' | 'env' | 'minion';
  skill?: string;
  /** direction of attack origin (for shields and knockback) */
  fromX?: number;
  fromY?: number;
  noLeech?: boolean;
}

export function packet(source: DamagePacket['source'], d: Partial<DamagePacket> = {}): DamagePacket {
  return { physical: 0, fire: 0, frost: 0, lightning: 0, poison: 0, source, ...d };
}

export interface Statuses {
  burn: number; burnDps: number;
  bleed: number; bleedDps: number;
  poison: number; poisonDps: number;
  chill: number; // seconds remaining
  chillStacks: number; // 0..1
  frozen: number;
  shock: number;
  stun: number;
  mark: number;
  flee: number;
  taunt: number;
}

export const newStatuses = (): Statuses => ({ burn: 0, burnDps: 0, bleed: 0, bleedDps: 0, poison: 0, poisonDps: 0, chill: 0, chillStacks: 0, frozen: 0, shock: 0, stun: 0, mark: 0, flee: 0, taunt: 0 });

export interface Enemy {
  id: number;
  def: EnemyDef;
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  hp: number; maxHp: number;
  level: number;
  dmgMult: number;
  speedMult: number;
  armor: number;
  elite: EliteModId[];
  champion: boolean; // elite pack leader
  minion: boolean; // elite pack follower
  dead: boolean;
  deathT: number;
  st: Statuses;
  facing: number;
  // AI
  state: 'idle' | 'chase' | 'attack' | 'windup' | 'recover' | 'burrowed' | 'flee' | 'return' | 'special';
  stateT: number;
  atkCd: number;
  specialCd: number;
  special2Cd: number;
  aggro: boolean;
  homeX: number; homeY: number;
  wave: boolean;
  targetB: number; // building id
  hitFlash: number;
  shieldHp: number;
  phase: number;
  poi: number;
  summonedBy: number;
  anim: number;
  knockX: number; knockY: number;
  windAngle: number;
  windX: number; windY: number;
  name: string;
  dotAcc: number;
  special: string;
}

export interface Projectile {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  life: number;
  faction: 'player' | 'enemy';
  dmg: DamagePacket;
  kind: 'bile' | 'bolt' | 'fire' | 'hex' | 'charge' | 'spark' | 'acid' | 'slagball';
  pierce: number;
  hit: Set<number>;
  /** arcing projectiles explode at target */
  tx?: number; ty?: number; arc?: number; t0?: number;
  aoe?: number;
}

export interface GroundEffect {
  id: number;
  x: number; y: number;
  r: number;
  t: number;
  total: number;
  dps: number;
  type: 'fire' | 'acid' | 'slag' | 'frost' | 'lightning';
  faction: 'player' | 'enemy';
  /** line effect */
  x2?: number; y2?: number;
}

export interface Telegraph {
  id: number;
  shape: 'circle' | 'line' | 'cone' | 'ring';
  x: number; y: number;
  r: number;
  angle: number;
  len: number;
  width: number;
  t: number;
  total: number;
  color: string;
  faction: 'player' | 'enemy';
  /** ring: inner radius */
  inner?: number;
  onDone: () => void;
  owner?: number;
}

export interface LootDrop {
  id: number;
  x: number; y: number;
  item?: string;
  count?: number;
  equip?: Equip;
  embers?: number;
  t: number;
  vy: number; z: number;
}

export interface Npc {
  id: string;
  name: string;
  role: 'merchant' | 'smith' | 'elder' | 'engineer' | 'archivist' | 'healer';
  x: number; y: number;
  color: string;
  lines: string[];
}
