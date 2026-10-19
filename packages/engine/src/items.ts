import type { Affix, ContentDb, ItemBase, LootTable, Rarity } from '@abismo/content';
import {
  AFFIX_COUNT,
  ILVL_SPREAD,
  LEGENDARY_MIN_HUNT_ILVL,
  MAX_LEVEL,
  PPM,
  RARITY_BASE_PPM,
  RARITY_ORDER,
} from './constants.ts';
import { rngInt, type RngState } from './rng.ts';
import type { ItemInstance, LootFilter, RolledAffix } from './types.ts';

export function rarityRank(r: Rarity): number {
  return RARITY_ORDER.indexOf(r);
}

export function legendaryAllowed(huntIlvl: number): boolean {
  return huntIlvl >= LEGENDARY_MIN_HUNT_ILVL;
}

/** Picks an index by integer weights. Consumes exactly one RNG draw. */
export function pickWeighted<T>(rng: RngState, items: readonly T[], weight: (t: T) => number): T {
  let total = 0;
  for (const it of items) total += weight(it);
  if (items.length === 0 || total <= 0) throw new Error('pickWeighted: nothing to pick');
  let roll = rngInt(rng, 0, total - 1);
  for (const it of items) {
    roll -= weight(it);
    if (roll < 0) return it;
  }
  return items[items.length - 1]!;
}

/**
 * Magic find with diminishing returns: effective = mf × 100 ÷ (mf + 100).
 * 100% MF → +50%, 300% → +75%; it never reaches +100%.
 */
export function effectiveMagicFindPct(magicFindPct: number): number {
  if (magicFindPct <= 0) return 0;
  return (magicFindPct * 100) / (magicFindPct + 100);
}

/**
 * Chance of each rarity (ppm, summing to 1,000,000) for a drop. Magic find scales every
 * non-common rarity up by the effective bonus; common takes what is left. `minRarity` folds
 * the lower rarities into it.
 */
export function rarityTable(
  magicFindPct: number,
  minRarity?: Rarity,
  /** False in early hunts: the legendary share becomes epic. */
  legendaryAllowed = true,
): Record<Rarity, number> {
  const eff = effectiveMagicFindPct(magicFindPct);
  const out = { common: 0, magic: 0, rare: 0, epic: 0, legendary: 0 } as Record<Rarity, number>;
  let rest = PPM;
  for (const r of RARITY_ORDER) {
    if (r === 'common') continue;
    out[r] = Math.floor((RARITY_BASE_PPM[r] * (100 + eff)) / 100);
    rest -= out[r];
  }
  out.common = rest;
  if (!legendaryAllowed) {
    out.epic += out.legendary;
    out.legendary = 0;
  }
  if (minRarity) {
    const minRank = rarityRank(minRarity);
    for (const r of RARITY_ORDER) {
      if (rarityRank(r) < minRank) {
        out[minRarity] += out[r];
        out[r] = 0;
      }
    }
  }
  return out;
}

export function rollRarity(rng: RngState, table: Record<Rarity, number>): Rarity {
  let roll = rngInt(rng, 0, PPM - 1);
  for (const r of RARITY_ORDER) {
    roll -= table[r];
    if (roll < 0) return r;
  }
  return 'common';
}

/** Highest tier of an affix allowed at an item level. */
export function affixTier(affix: Affix, ilvl: number): number {
  let tier = 0;
  affix.tiers.forEach((t, i) => {
    if (t.minIlvl <= ilvl) tier = i;
  });
  return tier;
}

export function eligibleAffixes(content: ContentDb, base: ItemBase, ilvl: number): Affix[] {
  const out: Affix[] = [];
  for (const a of content.affixes.values()) {
    if (a.minIlvl <= ilvl && a.slots.includes(base.slot)) out.push(a);
  }
  return out;
}

/**
 * Rolls affixes without repetition. The count is capped by how many affixes the slot allows.
 * Epic and legendary items roll in the upper half of each tier's range.
 */
export function rollAffixes(
  rng: RngState,
  content: ContentDb,
  base: ItemBase,
  ilvl: number,
  rarity: Rarity,
): RolledAffix[] {
  const [min, max] = AFFIX_COUNT[rarity];
  if (max === 0) return [];
  const pool = eligibleAffixes(content, base, ilvl);
  const count = Math.min(pool.length, rngInt(rng, min, max));
  const high = rarity === 'epic' || rarity === 'legendary';
  const out: RolledAffix[] = [];
  for (let i = 0; i < count; i++) {
    const affix = pickWeighted(rng, pool, (a) => a.weight);
    pool.splice(pool.indexOf(affix), 1);
    const tier = affixTier(affix, ilvl);
    const t = affix.tiers[tier]!;
    const lo = high ? Math.ceil((t.min + t.max) / 2) : t.min;
    out.push({ affixId: affix.id, tier, value: rngInt(rng, lo, t.max) });
  }
  return out;
}

export function rollDropIlvl(rng: RngState, huntIlvl: number): number {
  const ilvl = huntIlvl + rngInt(rng, -ILVL_SPREAD, ILVL_SPREAD);
  return Math.min(MAX_LEVEL, Math.max(1, ilvl));
}

/**
 * Item bases of a loot table that can drop at an item level (all of them if none fit), and
 * only the weapons of the hero's class.
 */
export function eligibleBases(
  content: ContentDb,
  table: LootTable,
  ilvl: number,
  classId?: string,
) {
  const forClass = table.bases.filter((b) => {
    const c = content.itemBases.get(b.itemBaseId)?.classId;
    return !classId || !c || c === classId;
  });
  const fitting = forClass.filter((b) => (content.itemBases.get(b.itemBaseId)?.ilvl ?? 0) <= ilvl);
  return fitting.length > 0 ? fitting : forClass;
}

/**
 * Generates one equipment item: ilvl, base, rarity (unless forced), affixes.
 * RNG draws, in order: ilvl, base, rarity (if not forced), affix count, then per affix pick + value.
 */
export function generateItem(
  rng: RngState,
  content: ContentDb,
  table: LootTable,
  huntIlvl: number,
  uid: number,
  rarity: Rarity | { magicFindPct: number },
  /** The hero's class: weapons of other classes never drop. */
  classId?: string,
): ItemInstance {
  const ilvl = rollDropIlvl(rng, huntIlvl);
  const pick = pickWeighted(rng, eligibleBases(content, table, ilvl, classId), (b) => b.weight);
  const base = content.itemBases.get(pick.itemBaseId)!;
  const finalRarity =
    typeof rarity === 'string'
      ? rarity
      : rollRarity(
          rng,
          rarityTable(rarity.magicFindPct, table.minRarity, legendaryAllowed(huntIlvl)),
        );
  const item: ItemInstance = {
    uid,
    baseId: base.id,
    ilvl,
    rarity: finalRarity,
    affixes: rollAffixes(rng, content, base, ilvl, finalRarity),
    refine: 0,
  };
  if (finalRarity === 'legendary') {
    // A legendary of a slot with unique effects gets one of them (one more RNG draw).
    const uniques = [...content.uniqueItems.values()].filter(
      (u) => u.slot === base.slot && u.minIlvl <= ilvl,
    );
    if (uniques.length > 0) item.uniqueId = pickWeighted(rng, uniques, (u) => u.weight).id;
  }
  return item;
}

/** True when the loot filter keeps the item; false means it is salvaged on the spot. */
export function filterKeeps(filter: LootFilter, item: ItemInstance): boolean {
  if (rarityRank(item.rarity) >= rarityRank(filter.keepFromRarity)) return true;
  return item.affixes.some((a) => filter.alwaysKeepAffixes.includes(a.affixId));
}

/** Material and quantity from salvaging one item of a rarity. Consumes one RNG draw. */
export function rollSalvage(
  rng: RngState,
  content: ContentDb,
  rarity: Rarity,
): { materialId: string; qty: number } {
  const m = content.salvageMaterial[rarity];
  return { materialId: m.id, qty: rngInt(rng, m.salvageQty[0], m.salvageQty[1]) };
}
