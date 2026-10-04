import { ITEM_MAP } from '../data/items';
import type { Building, Factory } from './factory';

export const PYLON_SUPPLY = 3; // tiles from pylon center in each direction
export const CAPACITOR_MJ = 5000; // kJ
export const CAPACITOR_RATE = 300; // kW

export interface PowerNet {
  id: number;
  pylons: Building[];
  members: Building[];
  generators: Building[];
  capacitors: Building[];
  demand: number;
  supplyCap: number;
  supplied: number;
  satisfaction: number;
  stored: number;
  storeCap: number;
}

/**
 * Electric grid solver. Networks are rebuilt only when topology changes (union-find over pylons),
 * then solved every tick with aggregate supply/demand — no per-unit energy simulation.
 */
export class PowerGrid {
  nets: PowerNet[] = [];
  private ver = -1;
  private byBuilding = new Map<number, PowerNet>();

  constructor(private factory: Factory) {
    factory.netSat = (b) => this.satisfaction(b);
  }

  satisfaction(b: Building): number {
    const n = this.byBuilding.get(b.id);
    return n ? n.satisfaction : 0;
  }

  netOf(b: Building): PowerNet | undefined {
    return this.byBuilding.get(b.id);
  }

  rebuild(): void {
    const f = this.factory;
    this.ver = f.topoVer;
    this.byBuilding.clear();
    const pylons = [...f.buildings.values()].filter((b) => b.kind === 'pylon');
    const parent = pylons.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    // spatial bucketing for pylon pairs
    const cell = 8;
    const buckets = new Map<number, number[]>();
    pylons.forEach((p, i) => {
      const k = ((p.x / cell) | 0) * 4096 + ((p.y / cell) | 0);
      (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(i);
    });
    pylons.forEach((p, i) => {
      const r = p.def.range!;
      const cx = (p.x / cell) | 0, cy = (p.y / cell) | 0;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const arr = buckets.get((cx + ox) * 4096 + cy + oy);
          if (!arr) continue;
          for (const j of arr) {
            if (j <= i) continue;
            const q = pylons[j];
            if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= r * r) parent[find(i)] = find(j);
          }
        }
    });
    const netByRoot = new Map<number, PowerNet>();
    this.nets = [];
    pylons.forEach((p, i) => {
      const root = find(i);
      let net = netByRoot.get(root);
      if (!net) {
        net = { id: this.nets.length, pylons: [], members: [], generators: [], capacitors: [], demand: 0, supplyCap: 0, supplied: 0, satisfaction: 0, stored: 0, storeCap: 0 };
        netByRoot.set(root, net);
        this.nets.push(net);
      }
      net.pylons.push(p);
      p.net = net.id;
    });
    // attach consumers/producers: any footprint tile within a pylon's supply square
    for (const b of f.buildings.values()) {
      b.net = b.kind === 'pylon' ? b.net : -1;
      if (b.kind === 'pylon') { this.byBuilding.set(b.id, this.nets[b.net]); continue; }
      const electric = !!b.def.power || b.kind === 'generator' || b.kind === 'capacitor';
      if (!electric) continue;
      let found: PowerNet | undefined;
      for (let yy = b.y - PYLON_SUPPLY; yy < b.y + b.h + PYLON_SUPPLY && !found; yy++)
        for (let xx = b.x - PYLON_SUPPLY; xx < b.x + b.w + PYLON_SUPPLY && !found; xx++) {
          const n = f.at(xx, yy);
          if (n && n.kind === 'pylon') found = this.nets[n.net];
        }
      if (!found) continue;
      b.net = found.id;
      this.byBuilding.set(b.id, found);
      if (b.kind === 'generator') found.generators.push(b);
      else if (b.kind === 'capacitor') found.capacitors.push(b);
      else found.members.push(b);
    }
  }

  /** Solve after the factory recorded wantPower in the previous step. */
  update(dt: number): void {
    const f = this.factory;
    if (this.ver !== f.topoVer) this.rebuild();
    let totUse = 0, totCap = 0;
    for (const net of this.nets) {
      let demand = 0;
      for (const m of net.members) demand += m.wantPower;
      let cap = 0;
      for (const g of net.generators) {
        if (g.disabled) { g.working = false; g.status = 'disabled'; continue; }
        if (g.fuelEnergy <= 0 && !this.refuel(g)) { g.working = false; g.status = 'no_fuel'; continue; }
        g.status = 'idle';
        cap += g.def.produce!;
      }
      let stored = 0, storeCap = 0, dischargeCap = 0;
      for (const c of net.capacitors) { stored += c.energy; storeCap += CAPACITOR_MJ; dischargeCap += Math.min(CAPACITOR_RATE, c.energy / dt); }
      let supplied = Math.min(demand, cap);
      const deficit = demand - supplied;
      if (deficit > 0 && dischargeCap > 0) {
        const fromCaps = Math.min(deficit, dischargeCap);
        supplied += fromCaps;
        let left = fromCaps * dt;
        for (const c of net.capacitors) { const take = Math.min(c.energy, left); c.energy -= take; left -= take; }
      }
      const genLoad = Math.min(cap, demand);
      let surplus = cap - genLoad;
      // charge capacitors from surplus
      let charging = 0;
      for (const c of net.capacitors) {
        if (surplus <= 0) break;
        const room = CAPACITOR_MJ - c.energy;
        const r = Math.min(CAPACITOR_RATE, surplus, room / dt);
        c.energy += r * dt; surplus -= r; charging += r;
      }
      const load = cap > 0 ? (genLoad + charging) / cap : 0;
      for (const g of net.generators) {
        if (g.status === 'no_fuel' || g.disabled) continue;
        g.working = load > 0;
        g.status = load > 0 ? 'working' : 'idle';
        g.fuelEnergy -= g.def.produce! * load * dt;
        g.progress = load; // used for visuals
      }
      net.demand = demand;
      net.supplyCap = cap;
      net.supplied = supplied;
      net.stored = stored;
      net.storeCap = storeCap;
      net.satisfaction = demand <= 0 ? (cap > 0 || stored > 0 ? 1 : 0) : Math.min(1, supplied / demand);
      totUse += supplied; totCap += cap;
    }
    f.powerSample.use = totUse;
    f.powerSample.cap = totCap;
  }

  private refuel(g: Building): boolean {
    for (const [k, v] of g.input) {
      const fd = ITEM_MAP.get(k);
      if (v > 0 && fd?.fuel) {
        if (v === 1) g.input.delete(k); else g.input.set(k, v - 1);
        this.factory.consumed(k, 1);
        g.fuelEnergy += fd.fuel;
        return true;
      }
    }
    return false;
  }

  /** Inject energy into capacitors near a point (lightning skills, storms, Thermal Discharge). */
  chargeNear(x: number, y: number, radius: number, kj: number): number {
    let given = 0;
    for (const net of this.nets)
      for (const c of net.capacitors) {
        if ((c.x + 1 - x) ** 2 + (c.y + 1 - y) ** 2 > radius * radius) continue;
        const add = Math.min(CAPACITOR_MJ - c.energy, kj);
        c.energy += add; given += add;
      }
    return given;
  }
}
