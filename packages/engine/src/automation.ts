import type { ContentDb, Hunt } from '@abismo/content';
import { equipBest } from './intents.ts';
import { IntentError } from './progression.ts';
import type { GameEvent, GameState } from './types.ts';

/**
 * Automations (GDD 4): unlocked by progress, then switched on by the player. They run when the
 * hero passes through town and at the end of the time away, never in rate sampling.
 */
export type AutomationId = 'equipBest' | 'bestHunt';
export const AUTOMATIONS: readonly AutomationId[] = ['equipBest', 'bestHunt'];

/** Hero level that unlocks auto-equip (reaching it once, or any reset, is enough). */
export const AUTO_EQUIP_LEVEL = 10;
/** Bosses defeated (ever) that unlock the move to the best hunt: the first region's three. */
export const AUTO_HUNT_BOSSES = 3;

export function automationUnlocked(s: GameState, id: AutomationId): boolean {
  if (id === 'equipBest') return s.hero.level >= AUTO_EQUIP_LEVEL || s.hero.resets.count > 0;
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
