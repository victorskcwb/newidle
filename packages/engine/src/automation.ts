import type { ContentDb, Hunt } from '@abismo/content';
import { equipBest } from './intents.ts';
import { IntentError } from './progression.ts';
import { performReset, resetBlock } from './resets.ts';
import { followSkillPlan } from './skills.ts';
import type { GameEvent, GameState } from './types.ts';

/**
 * Automations (GDD 4): unlocked by progress, then switched on by the player. They run when the
 * hero passes through town and at the end of the time away, never in rate sampling.
 */
export type AutomationId = 'equipBest' | 'bestHunt' | 'autoSkills' | 'autoReset';
export const AUTOMATIONS: readonly AutomationId[] = [
  'equipBest',
  'bestHunt',
  'autoSkills',
  'autoReset',
];

/** Hero level that unlocks auto-equip (reaching it once, or any reset, is enough). */
export const AUTO_EQUIP_LEVEL = 10;
/** Bosses defeated (ever) that unlock the move to the best hunt: the first region's three. */
export const AUTO_HUNT_BOSSES = 3;
/** Resets that unlock following the last build, and resetting by itself. */
export const AUTO_SKILLS_RESETS = 1;
export const AUTO_RESET_RESETS = 3;

export function automationUnlocked(s: GameState, id: AutomationId): boolean {
  if (id === 'equipBest') return s.hero.level >= AUTO_EQUIP_LEVEL || s.hero.resets.count > 0;
  if (id === 'autoSkills') return s.hero.resets.count >= AUTO_SKILLS_RESETS;
  if (id === 'autoReset') return s.hero.resets.count >= AUTO_RESET_RESETS;
  return s.defeatedBosses.length >= AUTO_HUNT_BOSSES;
}

export function automationOn(s: GameState, id: AutomationId): boolean {
  return s.settings.automation[id] && automationUnlocked(s, id);
}

export function setAutomation(s: GameState, id: AutomationId, on: boolean) {
  if (!AUTOMATIONS.includes(id)) throw new IntentError('unknown_automation');
  if (on && !automationUnlocked(s, id)) throw new IntentError('automation_locked');
  s.settings.automation[id] = on;
}

/** Highest unlocked hunt whose level range starts at or below the hero's level. */
export function bestHuntFor(s: GameState, content: ContentDb): Hunt | null {
  let best: Hunt | null = null;
  for (const h of content.hunts.values()) {
    if (s.unlockedHunts.includes(h.id) && h.levelRange[0] <= s.hero.level) best = h;
  }
  return best;
}

/** Runs the automations that are on. Returns true when the hero's setup changed. */
export function runAutomations(s: GameState, content: ContentDb, out: GameEvent[] | null): boolean {
  let changed = false;
  if (automationOn(s, 'autoReset') && !s.dungeon.active && resetBlock(s) === null) {
    const { points } = performReset(s, content);
    changed = true;
    out?.push({ type: 'AutoReset', tick: s.tick, resets: s.hero.resets.count, points });
    // Back to hunting, somewhere a level-1 hero can survive.
    const start = bestHuntFor(s, content);
    if (start) {
      s.hunt = { huntId: start.id, killsSinceBoss: 0, consecutiveDeaths: 0 };
      s.activity = { kind: 'to_hunt', untilTick: s.tick + 1 };
      out?.push({ type: 'HuntStarted', tick: s.tick, huntId: start.id });
    }
  }
  if (automationOn(s, 'autoSkills') && followSkillPlan(s, content) > 0) changed = true;
  if (automationOn(s, 'equipBest')) {
    const uids = equipBest(s, content);
    if (uids.length > 0) {
      changed = true;
      out?.push({ type: 'AutoEquipped', tick: s.tick, uids });
    }
  }
  if (automationOn(s, 'bestHunt') && s.hunt) {
    const best = bestHuntFor(s, content);
    if (best && best.id !== s.hunt.huntId) {
      s.hunt = { huntId: best.id, killsSinceBoss: 0, consecutiveDeaths: 0 };
      changed = true;
      out?.push({ type: 'HuntStarted', tick: s.tick, huntId: best.id });
    }
  }
  return changed;
}
