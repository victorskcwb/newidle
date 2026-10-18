import type { ContentDb } from '@abismo/content';
import {
  MAX_REFINE,
  PPM,
  REFINE_CORES_PER_LEVEL,
  REFINE_CRYSTALS_PER_LEVEL,
  REFINE_GOLD_FACTOR,
  REFINE_LOSES_LEVEL_FROM,
  REFINE_MIN_ILVL,
  REFINE_SUCCESS_PPM,
} from './constants.ts';
import { IntentError } from './progression.ts';
import { questProgress } from './quests.ts';
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
 * Cost of an attempt to reach `target` on an item of level `ilvl` (decision 152): gold grows
 * with the square of the refine level and with the item level; fragments always, essences
 * from +6, crystals and cores from +11.
 */
export function refineCost(target: number, ilvl = REFINE_MIN_ILVL): RefineCost {
  const materials: Record<string, number> = { fragment: 3 * target };
  if (target >= 6) materials.essence = target - 5;
  if (target >= 11) materials.crystal = REFINE_CRYSTALS_PER_LEVEL * (target - 10);
  if (target >= 11) materials.core = REFINE_CORES_PER_LEVEL * (target - 10);
  const gold = REFINE_GOLD_FACTOR * target * target * Math.max(REFINE_MIN_ILVL, ilvl);
  return { gold: BigInt(gold), materials };
}

/** The item with this uid wherever the hero keeps it (equipped, backpack or stash). */
export function findItem(s: GameState, uid: number): ItemInstance | undefined {
  return (
    s.backpack.find((i) => i.uid === uid) ??
    s.stash.find((i) => i.uid === uid) ??
    Object.values(s.hero.equipment).find((i) => i?.uid === uid)
  );
}

export type RefineBlock = 'max' | 'gold' | 'materials' | 'no_protection' | 'no_tempering';

/** A tempering stone adds this many points (ppm) to one attempt's success chance. */
export const TEMPERING_BONUS_PPM = 100_000;

export function consumableOfKind(content: ContentDb, kind: string): string {
  return [...content.consumables.values()].find((c) => c.kind === kind)?.id ?? '';
}

export function refineBlock(
  s: GameState,
  item: ItemInstance,
  useProtection: boolean,
  protectionId: string,
  useTempering = false,
  temperingId = '',
): RefineBlock | null {
  if (item.refine >= MAX_REFINE) return 'max';
  const cost = refineCost(item.refine + 1, item.ilvl);
  if (s.gold < cost.gold) return 'gold';
  for (const [id, qty] of Object.entries(cost.materials)) {
    if ((s.materials[id] ?? 0n) < BigInt(qty)) return 'materials';
  }
  if (useProtection && (s.consumables[protectionId] ?? 0) <= 0) return 'no_protection';
  if (useTempering && (s.consumables[temperingId] ?? 0) <= 0) return 'no_tempering';
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
  useTempering = false,
): RefineResult {
  const item = findItem(s, uid);
  if (!item) throw new IntentError('item_not_found');
  const protectionId = consumableOfKind(content, 'refine_protection');
  const temperingId = consumableOfKind(content, 'refine_tempering');
  const block = refineBlock(s, item, useProtection, protectionId, useTempering, temperingId);
  if (block) throw new IntentError(`refine_${block}`);
  const target = item.refine + 1;
  const cost = refineCost(target, item.ilvl);
  s.gold -= cost.gold;
  for (const [id, qty] of Object.entries(cost.materials)) {
    s.materials[id] = (s.materials[id] ?? 0n) - BigInt(qty);
  }
  const from = item.refine;
  questProgress(s, 'refine', 1);
  let chance = refineChancePpm(target);
  if (useTempering) {
    s.consumables[temperingId] = (s.consumables[temperingId] ?? 0) - 1;
    chance = Math.min(PPM, chance + TEMPERING_BONUS_PPM);
  }
  if (rngChance(s.rng, chance)) {
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
