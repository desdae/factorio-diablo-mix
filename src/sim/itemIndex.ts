import { ITEMS } from '../data/items';
import '../data/buildings'; // registers building kit items

/** Integer interning of item ids for hot logistics paths. */
export const ITEM_IDS: string[] = ITEMS.map((i) => i.id);
export const ITEM_INDEX = new Map<string, number>(ITEM_IDS.map((id, i) => [id, i]));
export function itemIdx(id: string): number {
  const i = ITEM_INDEX.get(id);
  if (i === undefined) throw new Error(`Unknown item ${id}`);
  return i;
}
