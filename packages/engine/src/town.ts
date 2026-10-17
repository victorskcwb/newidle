import type { ContentDb, EquipmentSlot, Rarity } from '@abismo/content';
import { CRAFT_RECIPES, SELL_RARITY_MULT, type CraftRarity } from './constants.ts';
import { pickWeighted, rollAffixes } from './items.ts';
import { IntentError } from './progression.ts';
import type { GameState, ItemInstance } from './types.ts';
import { backpackSize } from './upgrades.ts';

/**
 * Town services, only while the hero is in town: the merchant buys items and sells
 * consumables, and the smith forges new items from materials. All deterministic (the forge
 * draws from the game's RNG like a drop does).
 */

/**
 * In town, or on the way there: the scene shows the town as soon as the hero reaches the
 * map's exit, a moment before the engine marks the arrival.
 */
export function inTown(s: GameState): boolean {
  const k = s.activity.kind;
  return k === 'idle_town' || k === 'in_town' || k === 'to_town';
}

function requireTown(s: GameState) {
  if (!inTown(s)) throw new IntentError('not_in_town');
}

/** Gold the merchant pays for an item: grows with the item level squared and the rarity. */
export function sellPrice(item: ItemInstance): number {
  const byLevel = 5 + Math.floor((item.ilvl * item.ilvl) / 4);
  return (byLevel + item.refine * 10) * SELL_RARITY_MULT[item.rarity];
}

/** Sells items from the backpack or stash (never equipped ones). Returns the gold earned. */
export function sellItems(s: GameState, uids: readonly number[]): { count: number; gold: number } {
  requireTown(s);
  const wanted = new Set(uids);
  let gold = 0;
  let count = 0;
  for (const list of ['backpack', 'stash'] as const) {
    s[list] = s[list].filter((item) => {
      if (!wanted.has(item.uid)) return true;
      gold += sellPrice(item);
      count++;
      return false;
    });
  }
  if (count !== wanted.size) throw new IntentError('item_not_found');
  s.gold += BigInt(gold);
  s.lifetime.goldEarned += BigInt(gold);
  return { count, gold };
}

/** Buys consumables from the merchant. */
export function buyConsumable(s: GameState, content: ContentDb, consumableId: string, qty: number) {
  requireTown(s);
  const c = content.consumables.get(consumableId);
  if (!c?.price) throw new IntentError('not_for_sale');
  if (!Number.isInteger(qty) || qty < 1 || qty > 1000) throw new IntentError('invalid_quantity');
  const cost = BigInt(c.price) * BigInt(qty);
  if (s.gold < cost) throw new IntentError('not_enough_gold');
  s.gold -= cost;
  s.consumables[consumableId] = (s.consumables[consumableId] ?? 0) + qty;
  return { cost: Number(cost) };
}

/** Item level of forged items: the best hunt the hero has unlocked. */
export function forgeIlvl(s: GameState, content: ContentDb): number {
  let best = 1;
  for (const id of s.unlockedHunts) best = Math.max(best, content.hunts.get(id)?.ilvl ?? 1);
  return best;
}

/** What forging an item of a rarity costs now (gold scales with the item level). */
export function forgeCost(s: GameState, content: ContentDb, rarity: CraftRarity) {
  const recipe = CRAFT_RECIPES[rarity];
  return {
    gold: recipe.goldPerIlvl * forgeIlvl(s, content),
    materials: recipe.materials,
  };
}

/**
 * Forges a new item of a slot and rarity: a random base of that slot the item level allows,
 * with rolled affixes. It goes to the backpack, or the stash when the backpack is full.
 * RNG draws, in order: base, affix count, then per affix pick + value.
 */
export function forgeItem(
  s: GameState,
  content: ContentDb,
  slot: EquipmentSlot,
  rarity: CraftRarity,
): ItemInstance {
  requireTown(s);
  const ilvl = forgeIlvl(s, content);
  const bases = [...content.itemBases.values()].filter((b) => b.slot === slot && b.ilvl <= ilvl);
  if (bases.length === 0) throw new IntentError('cannot_forge');
  const cost = forgeCost(s, content, rarity);
  if (s.gold < BigInt(cost.gold)) throw new IntentError('not_enough_gold');
  for (const [id, qty] of Object.entries(cost.materials)) {
    if ((s.materials[id] ?? 0n) < BigInt(qty)) throw new IntentError('not_enough_materials');
  }
  s.gold -= BigInt(cost.gold);
  for (const [id, qty] of Object.entries(cost.materials)) s.materials[id]! -= BigInt(qty);
  const base = pickWeighted(s.rng, bases, () => 1);
  const item: ItemInstance = {
    uid: s.nextUid++,
    baseId: base.id,
    ilvl,
    rarity: rarity as Rarity,
    affixes: rollAffixes(s.rng, content, base, ilvl, rarity),
    refine: 0,
  };
  if (s.backpack.length < backpackSize(s.hero, content)) s.backpack.push(item);
  else s.stash.push(item);
  return item;
}

/** The storehouse keeper takes everything in the backpack into the stash. */
export function depositAll(s: GameState): number {
  requireTown(s);
  const n = s.backpack.length;
  s.stash.push(...s.backpack);
  s.backpack = [];
  return n;
}
