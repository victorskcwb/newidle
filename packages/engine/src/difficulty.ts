import type { Hunt } from '@abismo/content';
import { HUNT_DIFFICULTY_RULES, MAX_GROUP_SIZE } from './constants.ts';
import type { GameState, HuntDifficulty } from './types.ts';

/**
 * Hunt difficulty (decision 168). Normal is the hunt as its content describes it; easy sends
 * smaller groups and fewer elites for less loot; hard sends bigger groups and more elites
 * for more gold and better items. Hard opens after the hunt's boss is beaten once.
 */
export const HUNT_DIFFICULTIES: readonly HuntDifficulty[] = ['easy', 'normal', 'hard'];

export interface DifficultyRule {
  /** Added to both ends of the hunt's group size (clamped to 1..MAX_GROUP_SIZE). */
  groupSizeDelta: number;
  /** Elite chance as a percent of the hunt's (100 = unchanged). */
  eliteChancePct: number;
  /** Added to the hero's gold bonus and magic find in this hunt (percentage points). */
  goldPct: number;
  magicFindPct: number;
}

export function difficultyRule(d: HuntDifficulty): DifficultyRule {
  return HUNT_DIFFICULTY_RULES[d];
}

/** Difficulty in force: the assigned hunt's, but the dungeon has none of its own. */
export function currentDifficulty(s: GameState): HuntDifficulty {
  return s.dungeon.active ? 'normal' : (s.hunt?.difficulty ?? 'normal');
}

/** Whether the hero may pick a difficulty in a hunt (hard needs the hunt's boss beaten). */
export function difficultyUnlocked(s: GameState, hunt: Hunt, d: HuntDifficulty): boolean {
  if (d !== 'hard') return true;
  return !hunt.boss || s.defeatedBosses.includes(hunt.boss.monsterId);
}

const adjusted = new WeakMap<Hunt, Map<HuntDifficulty, Hunt>>();

/**
 * The hunt with a difficulty applied to its group size and elite chance. Normal returns the
 * content object itself, so the default game is exactly the game without difficulties.
 */
export function huntAt(hunt: Hunt, d: HuntDifficulty): Hunt {
  if (d === 'normal') return hunt;
  let byDifficulty = adjusted.get(hunt);
  if (!byDifficulty) adjusted.set(hunt, (byDifficulty = new Map()));
  let h = byDifficulty.get(d);
  if (!h) {
    const r = difficultyRule(d);
    const clamp = (n: number) => Math.min(MAX_GROUP_SIZE, Math.max(1, n + r.groupSizeDelta));
    h = {
      ...hunt,
      groupSize: { min: clamp(hunt.groupSize.min), max: clamp(hunt.groupSize.max) },
      eliteChancePpm: Math.floor((hunt.eliteChancePpm * r.eliteChancePct) / 100),
    };
    byDifficulty.set(d, h);
  }
  return h;
}
