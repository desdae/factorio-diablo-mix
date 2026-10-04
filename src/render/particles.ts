import type { FxEvent } from '../game/gameEvents';

export interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number; grow: number;
  color: string;
  kind: 0 | 1 | 2 | 3 | 4 | 5; // 0 spark(line) 1 glow(add) 2 smoke 3 debris 4 ring 5 slash arc
  add: boolean;
  drag: number;
  grav: number;
  angle?: number;
  arc?: number;
}

export interface Bolt { pts: { x: number; y: number }[]; life: number; max: number; color: string; width: number }
export interface Decal { x: number; y: number; r: number; color: string; life: number; max: number; rot: number; kind: 0 | 1 | 2 }

/** Pooled particle system driven by simulation fx events. Presentation only — never affects simulation. */
export class Particles {
  list: Particle[] = [];
  bolts: Bolt[] = [];
  decals: Decal[] = [];
  flash = 0;
  density = 1;
  max = 5000;
  private pool: Particle[] = [];

  spawn(p: Partial<Particle> & { x: number; y: number }) {
    if (this.list.length >= this.max * this.density) return;
    const q = this.pool.pop() ?? ({} as Particle);
    q.x = p.x; q.y = p.y; q.z = p.z ?? 0;
    q.vx = p.vx ?? 0; q.vy = p.vy ?? 0; q.vz = p.vz ?? 0;
    q.life = 0; q.max = p.max ?? 0.6;
    q.size = p.size ?? 0.1; q.grow = p.grow ?? 0;
    q.color = p.color ?? '#ffffff'; q.kind = p.kind ?? 1; q.add = p.add ?? true;
    q.drag = p.drag ?? 2; q.grav = p.grav ?? 0; q.angle = p.angle; q.arc = p.arc;
    this.list.push(q);
  }

  update(dt: number) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life += dt;
      if (p.life >= p.max) { this.pool.push(p); continue; }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d; p.vz -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.z < 0 && p.grav > 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
      p.size += p.grow * dt;
      L[w++] = p;
    }
    L.length = w;
    this.bolts = this.bolts.filter((b) => (b.life += dt) < b.max);
    for (const d of this.decals) d.life += dt;
    if (this.decals.length > 220 || (this.decals.length && this.decals[0].life > this.decals[0].max)) this.decals = this.decals.filter((d) => d.life < d.max).slice(-220);
    if (this.flash > 0) this.flash -= dt * 3;
  }

  burst(x: number, y: number, n: number, o: { speed?: number; color: string | string[]; size?: number; max?: number; kind?: Particle['kind']; add?: boolean; grav?: number; vz?: number; drag?: number; grow?: number; z?: number; spread?: number; angle?: number }) {
    const cnt = Math.ceil(n * this.density);
    for (let i = 0; i < cnt; i++) {
      const a = o.angle !== undefined ? o.angle + (Math.random() - 0.5) * (o.spread ?? 1) : Math.random() * Math.PI * 2;
      const s = (o.speed ?? 3) * (0.3 + Math.random() * 0.9);
      const col = Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color;
      this.spawn({ x, y, z: o.z ?? 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: o.vz !== undefined ? o.vz * (0.5 + Math.random()) : 0, color: col, size: (o.size ?? 0.08) * (0.6 + Math.random() * 0.8), max: (o.max ?? 0.5) * (0.6 + Math.random() * 0.8), kind: o.kind ?? 1, add: o.add ?? true, grav: o.grav ?? 0, drag: o.drag ?? 3, grow: o.grow ?? 0 });
    }
  }

  lightning(pts: { x: number; y: number }[], color = '#cfe0ff', width = 0.08, max = 0.25) {
    // jagged subdivision for each segment
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const segs = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) * 1.5));
      for (let k = 0; k < segs; k++) {
        const t = k / segs;
        const j = k === 0 ? 0 : 0.35;
        out.push({ x: a.x + (b.x - a.x) * t + (Math.random() - 0.5) * j, y: a.y + (b.y - a.y) * t + (Math.random() - 0.5) * j });
      }
    }
    out.push(pts[pts.length - 1]);
    this.bolts.push({ pts: out, life: 0, max, color, width });
  }

  decal(x: number, y: number, r: number, color: string, max = 30, kind: Decal['kind'] = 0) {
    this.decals.push({ x, y, r, color, life: 0, max, rot: Math.random() * 6.28, kind });
  }

  /** Translates simulation fx events into visuals. */
  onFx(e: FxEvent, reduceFlash: boolean) {
    const { x, y } = e;
    switch (e.kind) {
      case 'slash': {
        const arc = e.x2 ?? 2;
        this.spawn({ x, y, z: 0.5, kind: 5, angle: e.angle, arc, size: e.r ?? 2, max: 0.18, color: e.color ?? '#f2e6d0', drag: 0 });
        break;
      }
      case 'slam': {
        if (e.x2 !== undefined && e.y2 !== undefined) {
          const n = 14;
          for (let i = 0; i <= n; i++) {
            const px = x + (e.x2 - x) * (i / n), py = y + (e.y2 - y) * (i / n);
            this.burst(px, py, 4, { color: ['#8a7a6a', '#ffb04a'], speed: 3, size: 0.12, max: 0.6, kind: 3, add: false, grav: 12, vz: 5 });
            this.decal(px, py, 0.6, '#1a1410', 12, 1);
          }
          break;
        }
        const r = e.r ?? 2;
        this.spawn({ x, y, kind: 4, size: 0.2, grow: r * 5, max: 0.3, color: e.color ?? '#ffb04a' });
        this.burst(x, y, 24, { color: ['#7a6a5a', '#5a4a3a', '#ffb04a'], speed: r * 3, size: 0.13, max: 0.8, kind: 3, add: false, grav: 14, vz: 6 });
        this.burst(x, y, 8, { color: '#6a5a4a', speed: r * 1.8, size: 0.25, max: 0.9, kind: 2, add: false, grow: 0.5, drag: 2.5 });
        this.decal(x, y, r * 0.8, '#1a1410', 20, 1);
        break;
      }
      case 'hammer': {
        const r = e.r ?? 3;
        this.spawn({ x, y, kind: 4, size: 0.3, grow: r * 6, max: 0.35, color: '#ffd27a' });
        this.burst(x, y, 50, { color: ['#ff6a2a', '#ffb04a', '#ffe0a0'], speed: r * 4, size: 0.12, max: 0.9, kind: 0, grav: 10, vz: 8 });
        this.burst(x, y, 16, { color: '#4a4040', speed: r * 1.2, size: 0.5, max: 1.8, kind: 2, add: false, grow: 1, drag: 1.5 });
        this.burst(x, y, 12, { color: '#ff8a3a', speed: 1, size: r * 0.4, max: 0.4, kind: 1 });
        this.decal(x, y, r, '#2a0e04', 25, 2);
        if (!reduceFlash) this.flash = Math.max(this.flash, 0.55);
        break;
      }
      case 'explosion': {
        const r = e.r ?? 2;
        const c = e.color ?? '#ff8a3a';
        this.spawn({ x, y, kind: 4, size: 0.2, grow: r * 6, max: 0.3, color: c });
        this.burst(x, y, 30, { color: [c, '#ffe0a0', '#ff4a1a'], speed: r * 4, size: 0.1, max: 0.6, kind: 0, grav: 8, vz: 6 });
        this.burst(x, y, 10, { color: c, speed: r, size: r * 0.35, max: 0.35, kind: 1 });
        this.burst(x, y, 10, { color: '#3a3430', speed: r * 1.2, size: 0.45, max: 1.4, kind: 2, add: false, grow: 1.2, drag: 2 });
        this.decal(x, y, r * 0.7, '#140c08', 25, 2);
        if (!reduceFlash) this.flash = Math.max(this.flash, 0.25);
        break;
      }
      case 'lightning': {
        const pts = e.pts ?? [{ x, y }, { x: e.x2 ?? x, y: e.y2 ?? y }];
        this.lightning(pts, '#d8e8ff', 0.09, 0.22);
        this.lightning(pts, '#8ab8ff', 0.04, 0.3);
        for (const p of pts.slice(1)) this.burst(p.x, p.y, 6, { color: ['#d8e8ff', '#8ad8ff'], speed: 4, size: 0.06, max: 0.25, kind: 0 });
        if (!reduceFlash && !e.pts) this.flash = Math.max(this.flash, 0.3);
        break;
      }
      case 'blood': this.burst(x, y, 8, { color: ['#6a1a1a', '#8a2a2a'], speed: 3, size: 0.08, max: 0.5, kind: 3, add: false, grav: 10, vz: 3 }); break;
      case 'sparks': this.burst(x, y, 8, { color: [e.color ?? '#ffd27a', '#ffffff'], speed: 5, size: 0.05, max: 0.3, kind: 0, grav: 6, vz: 3 }); break;
      case 'heal': this.burst(x, y, 16, { color: [e.color ?? '#5aff8a', '#ffffff'], speed: (e.r ?? 1) * 1.2, size: 0.1, max: 0.9, kind: 1, vz: 1.5, drag: 2 }); break;
      case 'teleport': this.burst(x, y, 20, { color: [e.color ?? '#c060ff', '#ffffff'], speed: 3, size: 0.09, max: 0.5, kind: 1, vz: 2 }); break;
      case 'meteor':
        this.onFx({ ...e, kind: 'explosion', color: '#ff6a2a' }, reduceFlash);
        this.burst(x, y, 20, { color: ['#ff6a2a', '#ffb04a'], speed: 2, size: 0.1, max: 2.2, kind: 1, vz: 2, drag: 1 });
        break;
      case 'build':
        this.burst(x, y, 18, { color: ['#7ae0c0', '#ffd27a'], speed: (e.r ?? 1) * 3, size: 0.07, max: 0.5, kind: 0 });
        this.burst(x, y, 6, { color: '#8a7a6a', speed: 1.5, size: 0.3, max: 0.8, kind: 2, add: false, grow: 0.5 });
        break;
      case 'dust': this.burst(x, y, 10, { color: e.color ?? '#8a7a6a', speed: (e.r ?? 1) * 2, size: 0.3, max: 0.9, kind: 2, add: false, grow: 0.6, drag: 2.5 }); break;
      case 'muzzle': this.burst(x, y, 4, { color: ['#ffe0a0', '#ff8a3a'], speed: 6, size: 0.06, max: 0.12, kind: 0, angle: e.angle, spread: 0.6 }); break;
      case 'shatter':
        this.burst(x, y, 30, { color: ['#bfe8ff', '#8ad8ff', '#ffffff'], speed: (e.r ?? 2) * 3, size: 0.1, max: 0.6, kind: 3, add: true, grav: 10, vz: 4 });
        this.spawn({ x, y, kind: 4, size: 0.2, grow: (e.r ?? 2) * 5, max: 0.25, color: '#8ad8ff' });
        break;
      case 'frost': this.burst(x, y, 14, { color: ['#bfe8ff', '#8ad8ff'], speed: (e.r ?? 1) * 2, size: 0.08, max: 0.6, kind: 1 }); if (e.r && e.r > 2) this.spawn({ x, y, kind: 4, size: 0.2, grow: e.r * 4, max: 0.3, color: '#8ad8ff' }); break;
      case 'fire': this.burst(x, y, 20 + (e.r ?? 1) * 6, { color: ['#ff6a2a', '#ffb04a', '#ff3a1a'], speed: (e.r ?? 1) * 2.2, size: 0.14, max: 0.7, kind: 1, vz: 2 }); break;
      case 'horn': this.spawn({ x, y, kind: 4, size: 0.3, grow: (e.r ?? 8) * 3, max: 0.5, color: e.color ?? '#ffd27a' }); this.spawn({ x, y, kind: 4, size: 0.2, grow: (e.r ?? 8) * 2.2, max: 0.6, color: '#ffffff' }); break;
      case 'dash': this.burst(x, y, 12, { color: '#8a7a6a', speed: 2, size: 0.25, max: 0.6, kind: 2, add: false, grow: 0.5, angle: (e.angle ?? 0) + Math.PI, spread: 1.4 }); break;
      case 'levelup':
        this.spawn({ x, y, kind: 4, size: 0.3, grow: 10, max: 0.6, color: '#ffd27a' });
        this.burst(x, y, 40, { color: ['#ffd27a', '#ffffff', '#ffb04a'], speed: 3, size: 0.09, max: 1.4, kind: 1, vz: 4, drag: 1.5 });
        break;
      case 'death':
        this.burst(x, y, 10, { color: [e.color ?? '#ff7a3a', '#3a3430'], speed: 2.5, size: 0.08, max: 0.7, kind: 0, grav: 8, vz: 3 });
        this.burst(x, y, 4, { color: '#2a2420', speed: 0.8, size: 0.35, max: 1.1, kind: 2, add: false, grow: 0.4 });
        this.decal(x, y, (e.r ?? 0.5) * 1.1, '#1a0e0a', 30, 0);
        break;
      case 'gather': this.burst(x, y, 5, { color: [e.color ?? '#ffd27a', '#8a7a6a'], speed: 2, size: 0.07, max: 0.4, kind: 3, add: false, grav: 10, vz: 3 }); break;
      case 'acid': this.burst(x, y, 10, { color: ['#a8ff3a', '#5a8a2a'], speed: 2, size: 0.08, max: 0.5, kind: 3, add: true, grav: 8, vz: 2 }); this.decal(x, y, e.r ?? 0.6, '#2a3a10', 10, 0); break;
      case 'shield': this.spawn({ x, y, z: 0.6, kind: 4, size: 0.4, grow: 3, max: 0.35, color: e.color ?? '#6ab0ff' }); break;
      case 'summon': this.burst(x, y, 24, { color: [e.color ?? '#c060ff', '#2a1a3a'], speed: 3, size: 0.12, max: 0.8, kind: 1, vz: 1 }); break;
      case 'beam': this.lightning([{ x, y }, { x: e.x2 ?? x, y: e.y2 ?? y }], e.color ?? '#5affb0', 0.06, 0.35); break;
      case 'portal': this.spawn({ x, y, kind: 4, size: 0.3, grow: 4, max: 0.8, color: '#b56cff' }); this.burst(x, y, 30, { color: ['#b56cff', '#7ad7ff'], speed: 3, size: 0.1, max: 1, kind: 1 }); break;
    }
  }
}
