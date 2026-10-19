import type { ContentDb, Rarity } from '@abismo/content';
import { rarityRank } from './items.ts';
import type { StatMods } from './stats.ts';
import type { Hero, ItemInstance } from './types.ts';

/**
 * Item collection (GDD 3.4): registering an item gives up the item and records its base at
 * that rarity. Every base is worth 1 point (common) to 5 (legendary), the best rarity
 * registered; the points give small permanent bonuses. Old items keep a use.
 */

/** Collection points per percent of damage, and per percent of magic find. */
export const COLLECTION_POINTS_PER_DAMAGE_PCT = 10;
export const COLLECTION_POINTS_PER_MAGIC_FIND_PCT = 4;

export function collectionPoints(hero: Hero): number {
  let points = 0;
  for (const r of Object.values(hero.collection)) points += rarityRank(r) + 1;
  return points;
}

/** Most points the content allows: every base at legendary. */
export function collectionMaxPoints(content: ContentDb): number {
  return content.itemBases.size * (rarityRank('legendary') + 1);
}

export function collectionMods(hero: Hero): StatMods {
  const points = collectionPoints(hero);
  return {
    damagePct: Math.floor(points / COLLECTION_POINTS_PER_DAMAGE_PCT),
    magicFindPct: Math.floor(points / COLLECTION_POINTS_PER_MAGIC_FIND_PCT),
  };
}

/** True when registering the item would raise its base's entry. */
export function improvesCollection(hero: Hero, item: ItemInstance): boolean {
  const have: Rarity | undefined = hero.collection[item.baseId];
  return have === undefined || rarityRank(item.rarity) > rarityRank(have);
}
