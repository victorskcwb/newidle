import { DUNGEON_FLOORS_PER_RESET_POINT, endDungeonRun } from './dungeon.ts';
import type { ContentDb } from '@abismo/content';
import {
  MAX_LEVEL,
  RESET_BASE_COST,
  RESET_BASE_POINTS,
  RESET_POINTS_PER_NEW_BOSS,
  RESET_POINTS_PER_PAST_RESET,
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
 * Reset points the current cycle is worth: 10 + 2 × resets already done + bosses defeated
 * for the first time × 2, plus floor(deepest dungeon floor of the cycle ÷ 5). The growing
 * term makes every cycle faster than the last (section 12.2).
 */
export function resetPointsEarned(hero: Hero, dungeonBest = 0): number {
  return (
    RESET_BASE_POINTS +
    hero.resets.count * RESET_POINTS_PER_PAST_RESET +
    hero.resets.newBossesThisCycle * RESET_POINTS_PER_NEW_BOSS +
    Math.floor(dungeonBest / DUNGEON_FLOORS_PER_RESET_POINT)
  );
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
  const points = resetPointsEarned(hero, s.dungeon.best);
  endDungeonRun(s, s.tick, null);
  s.dungeon.best = 0;
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

/** Reset points for the next level n of an upgrade: baseCost + costPerLevel × (n − 1). */
export function upgradeCost(content: ContentDb, hero: Hero, upgradeId: string): number | null {
  const up = content.resetUpgrades.get(upgradeId);
  if (!up) return null;
  const level = hero.resets.upgrades[upgradeId] ?? 0;
  if (level >= up.maxLevel) return null;
  return up.baseCost + (up.costPerLevel ?? up.baseCost) * level;
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
