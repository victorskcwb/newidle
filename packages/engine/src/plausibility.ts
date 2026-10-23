import type { ContentDb } from '@abismo/content';
import { ILVL_SPREAD, MAX_LEVEL } from './constants.ts';
import { floorHunt } from './dungeon.ts';
import type { GameState } from './types.ts';
import { totalXpToReach } from './xp.ts';

/**
 * Checks a save brought from a device against what play can produce (decision 177). A local
 * save is easy to edit, so before it becomes an account's hero these totals must agree with
 * each other. Returns the broken rules (empty when the save is plausible). It cannot prove a
 * save honest; it only catches edits that leave the counters inconsistent.
 */
export function implausibilities(s: GameState, content: ContentDb): string[] {
  const problems: string[] = [];
  const hero = s.hero;

  // Every level and the XP inside it were earned, and lifetime XP only grows.
  if (BigInt(totalXpToReach(hero.level) + hero.xp) > s.lifetime.xpEarned) problems.push('level');

  // Gold comes in only through kills and sales, which also add to lifetime gold.
  if (s.gold > s.lifetime.goldEarned) problems.push('gold');

  // Items come from the hunts the hero opened, the Abyss floors it reached and the smith.
  let ilvl = 1;
  for (const id of s.unlockedHunts) ilvl = Math.max(ilvl, content.hunts.get(id)?.ilvl ?? 1);
  const deepest = Math.max(s.dungeon.bestEver, s.dungeon.active ? s.dungeon.floor : 0);
  if (deepest > 0) ilvl = Math.max(ilvl, floorHunt(content, deepest + 1).ilvl);
  const maxIlvl = Math.min(MAX_LEVEL, ilvl + ILVL_SPREAD);
  const items = [...s.backpack, ...s.stash, ...Object.values(hero.equipment)];
  if (items.some((it) => it && it.ilvl > maxIlvl)) problems.push('item_level');

  // Affix values stay within the rolls of their tier.
  for (const it of items) {
    if (!it) continue;
    for (const a of it.affixes) {
      const tier = content.affixes.get(a.affixId)?.tiers[a.tier];
      if (!tier || a.value < tier.min || a.value > tier.max) {
        problems.push('affix_value');
        break;
      }
    }
    if (problems.includes('affix_value')) break;
  }

  // Kills, deaths and the clock: at most one group of four dies per tick.
  if (s.lifetime.kills > BigInt(s.tick) * 4n) problems.push('kills');

  return problems;
}
