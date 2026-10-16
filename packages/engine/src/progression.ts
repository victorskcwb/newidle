import type { ContentDb } from '@abismo/content';
import { ATTRIBUTE_POINTS_PER_LEVEL, MAX_LEVEL, SKILL_POINT_EVERY_LEVELS } from './constants.ts';
import { heroStats } from './stats.ts';
import type { Attribute, AutoAllocateProfile, GameEvent, GameState, Hero } from './types.ts';
import { xpToNext } from './xp.ts';

/** How each automatic profile spends a level's 5 points. */
const PROFILES: Record<Exclude<AutoAllocateProfile, 'off'>, Partial<Record<Attribute, number>>> = {
  balanced: { strength: 2, dexterity: 1, vitality: 2 },
  strength: { strength: 3, dexterity: 1, vitality: 1 },
  vitality: { strength: 1, vitality: 4 },
};

/** Spends unspent attribute points in whole blocks of 5 following the hero's profile. */
export function autoAllocate(hero: Hero) {
  if (hero.autoAllocate === 'off') return;
  const profile = PROFILES[hero.autoAllocate];
  while (hero.unspentAttributePoints >= ATTRIBUTE_POINTS_PER_LEVEL) {
    for (const [attr, n] of Object.entries(profile) as [Attribute, number][]) {
      hero.allocated[attr] += n;
    }
    hero.unspentAttributePoints -= ATTRIBUTE_POINTS_PER_LEVEL;
  }
}

/**
 * Adds XP and applies every level gained (5 attribute points each, a skill point on even
 * levels, full heal). At the level cap the XP is still counted in lifetime totals but the
 * in-level XP stays 0.
 */
export function addXp(
  s: GameState,
  content: ContentDb,
  amount: number,
  t: number,
  out: GameEvent[] | null,
): number {
  if (amount <= 0) return 0;
  const hero = s.hero;
  s.lifetime.xpEarned += BigInt(amount);
  let gained = 0;
  hero.xp += amount;
  while (hero.level < MAX_LEVEL && hero.xp >= xpToNext(hero.level)) {
    hero.xp -= xpToNext(hero.level);
    hero.level++;
    gained++;
    hero.unspentAttributePoints += ATTRIBUTE_POINTS_PER_LEVEL;
    if (hero.level % SKILL_POINT_EVERY_LEVELS === 0) hero.unspentSkillPoints++;
    autoAllocate(hero);
    out?.push({ type: 'LevelUp', tick: t, level: hero.level });
  }
  if (hero.level >= MAX_LEVEL) hero.xp = 0;
  if (gained > 0) {
    const stats = heroStats(hero, content);
    hero.hp = stats.maxHp;
    hero.mana = stats.maxMana;
  }
  return gained;
}

export class IntentError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** Spends attribute points by hand. */
export function allocateAttribute(s: GameState, attribute: Attribute, points: number) {
  if (!Number.isInteger(points) || points <= 0) throw new IntentError('invalid_points');
  if (points > s.hero.unspentAttributePoints) throw new IntentError('not_enough_points');
  s.hero.allocated[attribute] += points;
  s.hero.unspentAttributePoints -= points;
}
