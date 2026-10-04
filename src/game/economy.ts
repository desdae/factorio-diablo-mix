import { ITEM_MAP } from '../data/items';

/**
 * Settlement trade with demand saturation: repeatedly selling the same good lowers its price, which
 * recovers over time. Prevents infinite money from automated production.
 */
export class Market {
  sold = new Map<string, number>();
  bought = new Map<string, number>();
  stock: { item: string; base: number }[] = [
    { item: 'tonic', base: 20 }, { item: 'coal', base: 3 }, { item: 'iron_plate', base: 5 }, { item: 'copper_plate', base: 5 },
    { item: 'gear', base: 10 }, { item: 'circuit', base: 22 }, { item: 'bloodcap', base: 6 }, { item: 'rift_shard', base: 90 },
    { item: 'steel', base: 30 }, { item: 'bolts', base: 8 },
  ];

  sellPrice(item: string): number {
    const v = ITEM_MAP.get(item)?.value ?? 1;
    const s = this.sold.get(item) ?? 0;
    return Math.max(0.1, v * 0.5 / (1 + s / 60));
  }
  buyPrice(item: string): number {
    const base = this.stock.find((s) => s.item === item)?.base ?? (ITEM_MAP.get(item)?.value ?? 1) * 2.5;
    const b = this.bought.get(item) ?? 0;
    return Math.ceil(base * (1 + b / 80));
  }
  recordSale(item: string, n: number) { this.sold.set(item, (this.sold.get(item) ?? 0) + n); }
  recordBuy(item: string, n: number) { this.bought.set(item, (this.bought.get(item) ?? 0) + n); }
  /** Demand recovers ~3% per minute. */
  update(dt: number) {
    const k = Math.pow(0.97, dt / 60);
    for (const m of [this.sold, this.bought]) for (const [id, v] of m) { const n = v * k; if (n < 0.5) m.delete(id); else m.set(id, n); }
  }
  serialize() { return { sold: [...this.sold], bought: [...this.bought] }; }
  load(d: ReturnType<Market['serialize']>) { this.sold = new Map(d.sold); this.bought = new Map(d.bought); }
}
