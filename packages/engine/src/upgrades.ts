import type { ContentDb } from '@abismo/content';
import type { RESET_EFFECTS } from '@abismo/content';
import {
  BACKPACK_SIZE,
  OFFLINE_CAP_TICKS,
  OFFLINE_MAX_TICKS,
  TICKS_PER_HOUR,
} from './constants.ts';
import type { Hero } from './types.ts';

export type ResetEffect = (typeof RESET_EFFECTS)[number];

/** Sum of one reset-shop effect over every upgrade level the hero owns. */
export function upgradeTotal(hero: Hero, content: ContentDb, effect: ResetEffect): number {
  let total = 0;
  for (const [id, level] of Object.entries(hero.resets.upgrades)) {
    const up = content.resetUpgrades.get(id);
    if (!up || level <= 0) continue;
    for (const e of up.effects) if (e.effect === effect) total += e.perLevel * level;
  }
  return total;
}

/** Backpack slots: 40 plus "Bolsa funda". */
export function backpackSize(hero: Hero, content: ContentDb): number {
  return BACKPACK_SIZE + upgradeTotal(hero, content, 'backpackSlots');
}

/** Offline cap: 12 h plus "Paciência", at most 24 h. */
export function offlineCapTicks(hero: Hero, content: ContentDb): number {
  const extra = upgradeTotal(hero, content, 'offlineHours') * TICKS_PER_HOUR;
  return Math.min(OFFLINE_MAX_TICKS, OFFLINE_CAP_TICKS + extra);
}
