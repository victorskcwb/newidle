import type { Card, ContentDb, Region } from '@abismo/content';
import { CARD_ELITE_KILL_PCT, CARD_PITY_FACTOR, PPM } from './constants.ts';
import type { StatMods } from './stats.ts';
import type { GameState, Hero } from './types.ts';

/**
 * Cards (section 8.4): each monster has one; copies stack up to maxCopies, each adding a
 * small permanent bonus; owning every card of a region adds the region's set bonus.
 */

/** Kills after which the pity rule doubles a card's chance: 3 × the expected kills. */
export function pityThreshold(card: Card): number {
  return Math.ceil((CARD_PITY_FACTOR * PPM) / Math.max(1, card.chancePpm));
}

/**
 * Chance (ppm) of a card from one kill: the card's base chance, ×4 for elites (1/2,000 →
 * 1/500), doubled while the pity rule is active. Bosses use their own card's chance.
 */
export function cardChancePpm(card: Card, elite: boolean, pity: boolean): number {
  const pct = elite ? CARD_ELITE_KILL_PCT : 100;
  return Math.min(PPM, Math.floor((card.chancePpm * pct * (pity ? 2 : 1)) / 100));
}

/** Monsters of a region (spawns and bosses of its hunts). */
export function regionMonsters(content: ContentDb, region: Region): string[] {
  const ids = new Set<string>();
  for (const h of content.hunts.values()) {
    if (h.regionId !== region.id) continue;
    for (const s of h.spawns) ids.add(s.monsterId);
    if (h.boss) ids.add(h.boss.monsterId);
  }
  return [...ids];
}

export function regionCards(content: ContentDb, region: Region): Card[] {
  return regionMonsters(content, region)
    .map((id) => content.monsters.get(id)?.cardId)
    .filter((id): id is string => !!id)
    .map((id) => content.cards.get(id)!)
    .filter(Boolean);
}

export function regionComplete(hero: Hero, content: ContentDb, region: Region): boolean {
  const cards = regionCards(content, region);
  return cards.length > 0 && cards.every((c) => (hero.cards[c.id] ?? 0) > 0);
}

/** Every stat bonus from cards and completed regions. */
export function cardMods(hero: Hero, content: ContentDb): StatMods {
  const mods: StatMods = {};
  const add = (stat: keyof StatMods, value: number) => (mods[stat] = (mods[stat] ?? 0) + value);
  for (const [id, copies] of Object.entries(hero.cards)) {
    const card = content.cards.get(id);
    if (card && copies > 0) add(card.bonusPerCopy.stat, card.bonusPerCopy.value * copies);
  }
  for (const region of content.regions.values()) {
    if (region.cardSetBonus && regionComplete(hero, content, region)) {
      add(region.cardSetBonus.stat, region.cardSetBonus.value);
    }
  }
  return mods;
}

export interface CardRoll {
  cardId: string;
  copies: number;
}

/**
 * One kill's card roll (one RNG draw when the card can still drop). Returns the new copy
 * count when a card drops. Pity counts kills of that card's monster since its last copy.
 */
export function rollCard(
  s: GameState,
  content: ContentDb,
  monsterId: string,
  elite: boolean,
  draw: (ppm: number) => boolean,
): CardRoll | null {
  const cardId = content.monsters.get(monsterId)?.cardId;
  const card = cardId ? content.cards.get(cardId) : undefined;
  if (!card) return null;
  const copies = s.hero.cards[card.id] ?? 0;
  if (copies >= card.maxCopies) return null;
  const since = s.cardPity[card.id] ?? 0;
  if (draw(cardChancePpm(card, elite, since >= pityThreshold(card)))) {
    s.hero.cards[card.id] = copies + 1;
    s.cardPity[card.id] = 0;
    return { cardId: card.id, copies: copies + 1 };
  }
  s.cardPity[card.id] = since + 1;
  return null;
}
