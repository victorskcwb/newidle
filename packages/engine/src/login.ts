import type { ContentDb } from '@abismo/content';
import { IntentError } from './progression.ts';
import type { GameState } from './types.ts';

/**
 * Login calendar (GDD 6.1). Days are counted, not streaked: missing a day never resets
 * anything, the next claim just takes the next entry. Like the goals, the engine has no
 * clock; the client passes the local day number.
 */

/** True when today's reward has not been claimed (a clock turned back never pays twice). */
export function loginDue(s: GameState, day: number): boolean {
  return day > s.login.lastDay;
}

/** Index in the calendar of the next reward. */
export function loginSlot(s: GameState, content: ContentDb): number {
  return s.login.claimed % Math.max(1, content.loginRewards.length);
}

/** Gives a reward of materials and consumables. */
export function grantReward(s: GameState, content: ContentDb, reward: Record<string, number>) {
  for (const [id, qty] of Object.entries(reward)) {
    if (content.consumables.has(id)) s.consumables[id] = (s.consumables[id] ?? 0) + qty;
    else s.materials[id] = (s.materials[id] ?? 0n) + BigInt(qty);
  }
}

/** Claims today's calendar reward. */
export function claimLogin(s: GameState, content: ContentDb, day: number): Record<string, number> {
  if (!loginDue(s, day)) throw new IntentError('login_claimed');
  const entry = content.loginRewards[loginSlot(s, content)];
  if (!entry) throw new IntentError('login_claimed');
  grantReward(s, content, entry.reward);
  s.login.claimed++;
  s.login.lastDay = day;
  return entry.reward;
}
