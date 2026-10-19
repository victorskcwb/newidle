import type { Achievement, ContentDb } from '@abismo/content';
import { bestiaryTier } from './bestiary.ts';
import { regionComplete } from './cards.ts';
import { rarityRank } from './items.ts';
import { IntentError } from './progression.ts';
import { professionLevel } from './professions.ts';
import { RARITY_ORDER } from './constants.ts';
import type { GameState } from './types.ts';

/**
 * Achievements (GDD 6.4): goals from easy to absurd, worth points and sometimes a title the
 * hero can show. Never power. Progress is read from the state; once reached, an achievement
 * stays unlocked (refines and items can be lost later, the achievement is not).
 */

/** Current value of what an achievement counts. */
export function achievementProgress(s: GameState, content: ContentDb, a: Achievement): number {
  switch (a.kind) {
    case 'level':
      // Resetting needs level 100, so a reset hero has been through every level.
      return s.hero.resets.count > 0 ? 100 : s.hero.level;
    case 'resets':
      return s.hero.resets.count;
    case 'kills':
      return Number(s.lifetime.kills);
    case 'boss_kills':
      return s.lifetime.bossKills;
    case 'deaths':
      return s.lifetime.deaths;
    case 'items': {
      const min = rarityRank(a.rarity ?? 'common');
      return RARITY_ORDER.filter((r) => rarityRank(r) >= min).reduce(
        (n, r) => n + s.lifetime.itemsByRarity[r],
        0,
      );
    }
    case 'cards':
      return Object.values(s.hero.cards).filter((n) => n > 0).length;
    case 'card_regions':
      return [...content.regions.values()].filter((r) => regionComplete(s.hero, content, r)).length;
    case 'refine': {
      let best = 0;
      for (const item of [...s.backpack, ...s.stash, ...Object.values(s.hero.equipment)]) {
        if (item && item.refine > best) best = item.refine;
      }
      return best;
    }
    case 'bestiary': {
      const tier = a.tier ?? 1;
      return [...content.monsters.keys()].filter((id) => bestiaryTier(s, content, id) >= tier)
        .length;
    }
    case 'login_days':
      return s.login.claimed;
    case 'gold_earned':
      return Number(s.lifetime.goldEarned);
    case 'profession':
      return Math.max(1, ...[...content.professions.keys()].map((id) => professionLevel(s, id)));
    case 'dungeon_floor':
      return s.dungeon.bestEver;
    case 'profession_total':
      return [...content.professions.keys()].reduce((n, id) => n + professionLevel(s, id), 0);
  }
}

/** Unlocks every achievement reached since the last check; returns the new ones. */
export function checkAchievements(s: GameState, content: ContentDb): string[] {
  const unlocked: string[] = [];
  for (const a of content.achievements.values()) {
    if (s.achievements.unlocked[a.id] !== undefined) continue;
    if (achievementProgress(s, content, a) >= a.target) {
      s.achievements.unlocked[a.id] = s.tick;
      unlocked.push(a.id);
    }
  }
  return unlocked;
}

export function achievementPoints(s: GameState, content: ContentDb): number {
  let points = 0;
  for (const id of Object.keys(s.achievements.unlocked)) {
    points += content.achievements.get(id)?.points ?? 0;
  }
  return points;
}

/** Shows the title of an unlocked achievement next to the hero's name (null hides it). */
export function setTitle(s: GameState, content: ContentDb, achievementId: string | null) {
  if (achievementId !== null) {
    const a = content.achievements.get(achievementId);
    if (!a?.titleKey) throw new IntentError('no_title');
    if (s.achievements.unlocked[a.id] === undefined) throw new IntentError('title_locked');
  }
  s.achievements.title = achievementId;
}
