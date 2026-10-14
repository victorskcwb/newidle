import type { ItemStack } from './types.ts';

/** Helpers for sorted ItemStack lists. All mutate in place; callers work on cloned state. */

function findIndex(list: ItemStack[], itemId: string): { found: boolean; index: number } {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const id = list[mid]!.itemId;
    if (id === itemId) return { found: true, index: mid };
    if (id < itemId) lo = mid + 1;
    else hi = mid;
  }
  return { found: false, index: lo };
}

export function qtyOf(list: readonly ItemStack[], itemId: string): number {
  const { found, index } = findIndex(list as ItemStack[], itemId);
  return found ? list[index]!.qty : 0;
}

export function hasStack(list: readonly ItemStack[], itemId: string): boolean {
  return findIndex(list as ItemStack[], itemId).found;
}

export function addItem(list: ItemStack[], itemId: string, qty: number): void {
  if (qty <= 0) return;
  const { found, index } = findIndex(list, itemId);
  if (found) list[index]!.qty += qty;
  else list.splice(index, 0, { itemId, qty });
}

/** Removes up to `qty` and returns how many were removed. */
export function removeItem(list: ItemStack[], itemId: string, qty: number): number {
  const { found, index } = findIndex(list, itemId);
  if (!found || qty <= 0) return 0;
  const stack = list[index]!;
  const removed = Math.min(stack.qty, qty);
  stack.qty -= removed;
  if (stack.qty === 0) list.splice(index, 1);
  return removed;
}

export function mergeInto(target: ItemStack[], source: readonly ItemStack[]): void {
  for (const s of source) addItem(target, s.itemId, s.qty);
}

export function cloneStacks(list: readonly ItemStack[]): ItemStack[] {
  return list.map((s) => ({ itemId: s.itemId, qty: s.qty }));
}
