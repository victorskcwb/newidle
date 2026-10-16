import type { ContentDb } from '@abismo/content';
import {
  MAX_LEVEL,
  RESET_BASE_COST,
  RESET_BASE_POINTS,
  RESET_POINTS_PER_NEW_BOSS,
  RESETS_FOR_SHOP,
} from './constants.ts';
import { IntentError } from './progression.ts';
import { skillSlots } from './skills.ts';
import { heroStats } from './stats.ts';
import type { GameState, Hero } from './types.ts';
import { upgradeTotal } from './upgrades.ts';

/** Gold for the next reset: 100,000 × the reset's number. */
export function resetCost(hero: Hero): bigint {
  return BigInt(RESET_BASE_COST) * BigInt(hero.resets.count + 1);
}

/**
 * Reset points the current cycle is worth: 10 + bosses defeated for the first time × 2.
 * (The infinite dungeon adds floor(max floor ÷ 5) in milestone 3.)
 */
export function resetPointsEarned(hero: Hero): number {
  return RESET_BASE_POINTS + hero.resets.newBossesThisCycle * RESET_POINTS_PER_NEW_BOSS;
}

export type ResetBlock = 'level' | 'gold';

export function resetBlock(s: GameState): ResetBlock | null {
  if (s.hero.level < MAX_LEVEL) return 'level';
  if (s.gold < resetCost(s.hero)) return 'gold';
  return null;
}

/**
 * Section 8.1. Back to level 1 with no attributes or skills spent; keeps items, stash,
 * materials, hunts and statistics; earns reset points and a free skill redistribution.
 */
export function performReset(s: GameState, content: ContentDb): { points: number } {
  const block = resetBlock(s);
  if (block) throw new IntentError(`reset_${block}`);
  const hero = s.hero;
  const points = resetPointsEarned(hero);
  s.gold -= resetCost(hero);
  hero.resets.count++;
  hero.resets.points += points;
  hero.resets.newBossesThisCycle = 0;
  hero.level = 1;
  hero.xp = 0;
  hero.allocated = { strength: 0, dexterity: 0, vitality: 0, energy: 0 };
  hero.unspentAttributePoints = 0;
  hero.skillLevels = {};
  hero.unspentSkillPoints = upgradeTotal(hero, content, 'startingSkillPoints');
  hero.activeSkills = new Array<string | null>(skillSlots(hero)).fill(null);
  hero.freeRespec = true;
  s.combat.buffUntil = {};
  s.activity = { kind: 'idle_town' };
  if (s.hunt) s.hunt.consecutiveDeaths = 0;
  const stats = heroStats(hero, content);
  hero.hp = stats.maxHp;
  hero.mana = stats.maxMana;
  return { points };
}

export function shopUnlocked(hero: Hero): boolean {
  return hero.resets.count >= RESETS_FOR_SHOP;
}

/** Reset points for the next level of an upgrade: baseCost × that level. */
export function upgradeCost(content: ContentDb, hero: Hero, upgradeId: string): number | null {
  const up = content.resetUpgrades.get(upgradeId);
  if (!up) return null;
  const level = hero.resets.upgrades[upgradeId] ?? 0;
  if (level >= up.maxLevel) return null;
  return up.baseCost * (level + 1);
}

export function buyUpgrade(s: GameState, content: ContentDb, upgradeId: string) {
  const hero = s.hero;
  if (!shopUnlocked(hero)) throw new IntentError('shop_locked');
  const cost = upgradeCost(content, hero, upgradeId);
  if (cost === null) throw new IntentError('upgrade_maxed');
  if (hero.resets.points < cost) throw new IntentError('not_enough_reset_points');
  const before = upgradeTotal(hero, content, 'startingSkillPoints');
  hero.resets.points -= cost;
  hero.resets.upgrades[upgradeId] = (hero.resets.upgrades[upgradeId] ?? 0) + 1;
  // "Mestre" also pays out right away for the current cycle.
  hero.unspentSkillPoints += upgradeTotal(hero, content, 'startingSkillPoints') - before;
}

/** Content and features unlocked by the number of resets (section 8.3). */
export const RESET_MILESTONES = [
  { resets: 1, unlock: 'reset_shop' },
  { resets: 3, unlock: 'fifth_skill_slot' },
  { resets: 5, unlock: 'class_huntress' },
  { resets: 10, unlock: 'class_sorcerer' },
  { resets: 15, unlock: 'new_region' },
  { resets: 20, unlock: 'second_hero' },
] as const;
