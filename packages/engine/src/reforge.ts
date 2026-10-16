import type { ContentDb, Rarity } from '@abismo/content';
import { REFORGE_GOLD_PER_ILVL_SQUARED, REFORGE_MATERIALS } from './constants.ts';
import { affixTier, eligibleAffixes, pickWeighted, rarityRank } from './items.ts';
import { IntentError } from './progression.ts';
import { findItem } from './refine.ts';
import { rngInt } from './rng.ts';
import type { GameState, ItemInstance, RolledAffix } from './types.ts';

/**
 * Reforge (milestone 2, section 7.5): spend gold and materials to reroll one chosen affix
 * of a rare or better item. The new affix can be any one the slot allows except the item's
 * other affixes (so an item never repeats an affix), at the item's level and rarity rules.
 */
export const REFORGE_MIN_RARITY: Rarity = 'rare';

export interface ReforgeCost {
  gold: bigint;
  materials: Record<string, number>;
}

export function reforgeCost(item: ItemInstance): ReforgeCost | null {
  const materials = REFORGE_MATERIALS[item.rarity];
  if (!materials) return null;
  return {
    gold: BigInt(REFORGE_GOLD_PER_ILVL_SQUARED * item.ilvl * item.ilvl),
    materials: { ...materials },
  };
}

export type ReforgeBlock = 'rarity' | 'no_affix' | 'gold' | 'materials';

export function reforgeBlock(s: GameState, item: ItemInstance, index: number): ReforgeBlock | null {
  if (rarityRank(item.rarity) < rarityRank(REFORGE_MIN_RARITY)) return 'rarity';
  if (!item.affixes[index]) return 'no_affix';
  const cost = reforgeCost(item)!;
  if (s.gold < cost.gold) return 'gold';
  for (const [id, qty] of Object.entries(cost.materials)) {
    if ((s.materials[id] ?? 0n) < BigInt(qty)) return 'materials';
  }
  return null;
}

/** Rerolls affix `index` of an item. RNG draws: affix pick, then its value. */
export function reforgeItem(
  s: GameState,
  content: ContentDb,
  uid: number,
  index: number,
): RolledAffix {
  const item = findItem(s, uid);
  if (!item) throw new IntentError('item_not_found');
  const block = reforgeBlock(s, item, index);
  if (block) throw new IntentError(`reforge_${block}`);
  const cost = reforgeCost(item)!;
  s.gold -= cost.gold;
  for (const [id, qty] of Object.entries(cost.materials)) {
    s.materials[id] = (s.materials[id] ?? 0n) - BigInt(qty);
  }
  const base = content.itemBases.get(item.baseId)!;
  const others = new Set(item.affixes.filter((_, i) => i !== index).map((a) => a.affixId));
  const pool = eligibleAffixes(content, base, item.ilvl).filter((a) => !others.has(a.id));
  const affix = pickWeighted(s.rng, pool, (a) => a.weight);
  const tier = affixTier(affix, item.ilvl);
  const t = affix.tiers[tier]!;
  const high = item.rarity === 'epic' || item.rarity === 'legendary';
  const lo = high ? Math.ceil((t.min + t.max) / 2) : t.min;
  const rolled: RolledAffix = { affixId: affix.id, tier, value: rngInt(s.rng, lo, t.max) };
  item.affixes[index] = rolled;
  return rolled;
}
