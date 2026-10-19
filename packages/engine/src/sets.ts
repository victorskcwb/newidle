import type { ContentDb } from '@abismo/content';
import { rarityRank } from './items.ts';
import { rngChance, type RngState } from './rng.ts';
import type { StatMods } from './stats.ts';
import type { Hero, ItemInstance } from './types.ts';

/** Item sets (GDD 3.3): pieces drop in their region; equipped pieces unlock bonuses. */

/**
 * Makes a freshly dropped item a set piece, by chance: rare or better, of a set slot, in the
 * set's region. One RNG draw per set that could apply.
 */
export function rollSetPiece(
  rng: RngState,
  content: ContentDb,
  item: ItemInstance,
  regionId: string,
) {
  if (rarityRank(item.rarity) < rarityRank('rare')) return;
  const slot = content.itemBases.get(item.baseId)?.slot;
  for (const set of content.itemSets.values()) {
    if (set.regionId !== regionId || !slot || !set.slots.includes(slot)) continue;
    if (rngChance(rng, set.chancePpm)) {
      item.setId = set.id;
      return;
    }
  }
}

/** Equipped pieces of each set. */
export function equippedSetPieces(hero: Hero): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of Object.values(hero.equipment)) {
    if (item?.setId) out[item.setId] = (out[item.setId] ?? 0) + 1;
  }
  return out;
}

export function setMods(hero: Hero, content: ContentDb): StatMods {
  const mods: StatMods = {};
  for (const [id, n] of Object.entries(equippedSetPieces(hero))) {
    for (const b of content.itemSets.get(id)?.bonuses ?? []) {
      if (n >= b.pieces) mods[b.stat] = (mods[b.stat] ?? 0) + b.value;
    }
  }
  return mods;
}
