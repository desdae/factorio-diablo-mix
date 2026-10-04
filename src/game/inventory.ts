import { ITEM_MAP } from '../data/items';
import { type Equip, type InvSlot, isEquip, isStack, stackSize, slotOf } from './items';
import { RARITIES } from '../data/equipment';

/** Slot-based inventory: stacks merge automatically, equipment occupies a slot each. */
export class Inventory {
  slots: InvSlot[];
  constructor(size: number) {
    this.slots = new Array(size).fill(null);
  }

  count(id: string): number {
    let n = 0;
    for (const s of this.slots) if (isStack(s) && s.item === id) n += s.count;
    return n;
  }

  /** Adds up to `count`; returns the amount that did not fit. */
  add(id: string, count: number): number {
    const max = stackSize(id);
    for (const s of this.slots) {
      if (count <= 0) break;
      if (isStack(s) && s.item === id && s.count < max) {
        const take = Math.min(max - s.count, count);
        s.count += take; count -= take;
      }
    }
    for (let i = 0; i < this.slots.length && count > 0; i++) {
      if (this.slots[i] === null) {
        const take = Math.min(max, count);
        this.slots[i] = { item: id, count: take };
        count -= take;
      }
    }
    return count;
  }

  canAdd(id: string, count: number): boolean {
    const max = stackSize(id);
    let room = 0;
    for (const s of this.slots) {
      if (s === null) room += max;
      else if (isStack(s) && s.item === id) room += max - s.count;
      if (room >= count) return true;
    }
    return room >= count;
  }

  remove(id: string, count: number): boolean {
    if (this.count(id) < count) return false;
    for (let i = this.slots.length - 1; i >= 0 && count > 0; i--) {
      const s = this.slots[i];
      if (isStack(s) && s.item === id) {
        const take = Math.min(s.count, count);
        s.count -= take; count -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return true;
  }

  addEquip(e: Equip): boolean {
    const i = this.slots.indexOf(null);
    if (i < 0) return false;
    this.slots[i] = { equip: e };
    return true;
  }

  freeSlots(): number {
    return this.slots.filter((s) => s === null).length;
  }

  /** Sort: equipment by slot & rarity, then stacks by category & name. Locked items keep their positions. */
  sort(): void {
    const locked = new Map<number, InvSlot>();
    const rest: InvSlot[] = [];
    this.slots.forEach((s, i) => {
      if (isEquip(s) && s.equip.locked) locked.set(i, s);
      else if (s) rest.push(s);
    });
    // merge stacks
    const merged = new Map<string, number>();
    const equips: Equip[] = [];
    for (const s of rest) {
      if (isStack(s)) merged.set(s.item, (merged.get(s.item) ?? 0) + s.count);
      else if (isEquip(s)) equips.push(s.equip);
    }
    equips.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || slotOf(a).localeCompare(slotOf(b)) || b.rarity - a.rarity || b.ilvl - a.ilvl);
    const stacks = [...merged.entries()].sort((a, b) => {
      const da = ITEM_MAP.get(a[0])!, db = ITEM_MAP.get(b[0])!;
      return da.category.localeCompare(db.category) || da.name.localeCompare(db.name);
    });
    const out: InvSlot[] = [];
    for (const e of equips) out.push({ equip: e });
    for (const [id, n] of stacks) {
      let left = n;
      const max = stackSize(id);
      while (left > 0) { const t = Math.min(max, left); out.push({ item: id, count: t }); left -= t; }
    }
    this.slots.fill(null);
    for (const [i, s] of locked) this.slots[i] = s;
    let k = 0;
    for (let i = 0; i < this.slots.length && k < out.length; i++) if (!this.slots[i]) this.slots[i] = out[k++];
  }

  matches(s: InvSlot, filter: string, category: string): boolean {
    if (!s) return false;
    const q = filter.trim().toLowerCase();
    if (isStack(s)) {
      const d = ITEM_MAP.get(s.item)!;
      if (category !== 'all' && category !== 'materials') return false;
      return !q || d.name.toLowerCase().includes(q) || d.category.includes(q);
    }
    const e = s.equip;
    if (category !== 'all' && category !== 'equipment') return false;
    return !q || e.name.toLowerCase().includes(q) || RARITIES[e.rarity].name.toLowerCase().includes(q) || slotOf(e).includes(q);
  }

  serialize() {
    return this.slots;
  }
}
