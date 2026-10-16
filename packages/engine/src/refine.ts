import type { ContentDb } from '@abismo/content';
import { MAX_REFINE, REFINE_LOSES_LEVEL_FROM, REFINE_SUCCESS_PPM } from './constants.ts';
import { IntentError } from './progression.ts';
import { rngChance } from './rng.ts';
import type { GameState, ItemInstance } from './types.ts';

export interface RefineCost {
  gold: bigint;
  materials: Record<string, number>;
}

/** Chance (ppm) to reach `target` (1..15) from target − 1. Section 7.5. */
export function refineChancePpm(target: number): number {
  return REFINE_SUCCESS_PPM[target] ?? 0;
}

/**
 * Cost of an attempt to reach `target`: gold grows with the square of the level; fragments
 * always, essences from +6 and crystals from +11.
 */
export function refineCost(target: number): RefineCost {
  const materials: Record<string, number> = { fragment: 3 * target };
  if (target >= 6) materials.essence = target - 5;
  if (target >= 11) materials.crystal = target - 10;
  return { gold: BigInt(50 * target * target), materials };
}

/** The item with this uid wherever the hero keeps it (equipped, backpack or stash). */
export function findItem(s: GameState, uid: number): ItemInstance | undefined {
  return (
    s.backpack.find((i) => i.uid === uid) ??
    s.stash.find((i) => i.uid === uid) ??
    Object.values(s.hero.equipment).find((i) => i?.uid === uid)
  );
}

export type RefineBlock = 'max' | 'gold' | 'materials' | 'no_protection';

export function refineBlock(
  s: GameState,
  item: ItemInstance,
  useProtection: boolean,
  protectionId: string,
): RefineBlock | null {
  if (item.refine >= MAX_REFINE) return 'max';
  const cost = refineCost(item.refine + 1);
  if (s.gold < cost.gold) return 'gold';
  for (const [id, qty] of Object.entries(cost.materials)) {
    if ((s.materials[id] ?? 0n) < BigInt(qty)) return 'materials';
  }
  if (useProtection && (s.consumables[protectionId] ?? 0) <= 0) return 'no_protection';
  return null;
}

export interface RefineResult {
  success: boolean;
  from: number;
  to: number;
  protectionUsed: boolean;
}

/**
 * One refine attempt. The cost is always paid. On failure the item stays (below +10) or
 * drops one level (attempts for +10 and above), unless a protection charm is used.
 * The item is never destroyed.
 */
export function refineItem(
  s: GameState,
  content: ContentDb,
  uid: number,
  useProtection = false,
): RefineResult {
  const item = findItem(s, uid);
  if (!item) throw new IntentError('item_not_found');
  const protectionId =
    [...content.consumables.values()].find((c) => c.kind === 'refine_protection')?.id ?? '';
  const block = refineBlock(s, item, useProtection, protectionId);
  if (block) throw new IntentError(`refine_${block}`);
  const target = item.refine + 1;
  const cost = refineCost(target);
  s.gold -= cost.gold;
  for (const [id, qty] of Object.entries(cost.materials)) {
    s.materials[id] = (s.materials[id] ?? 0n) - BigInt(qty);
  }
  const from = item.refine;
  if (rngChance(s.rng, refineChancePpm(target))) {
    item.refine = target;
    return { success: true, from, to: target, protectionUsed: false };
  }
  const losesLevel = target >= REFINE_LOSES_LEVEL_FROM;
  if (losesLevel && useProtection) {
    s.consumables[protectionId] = (s.consumables[protectionId] ?? 0) - 1;
    return { success: false, from, to: from, protectionUsed: true };
  }
  if (losesLevel) item.refine = Math.max(0, from - 1);
  return { success: false, from, to: item.refine, protectionUsed: false };
}
