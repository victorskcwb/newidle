import type { ContentDb } from '@valdren/content';
import { actionDurationTicks, executionsByMaterials, executionsUntilStop } from './actions.ts';
import { MAX_LEVEL, PPM, TICK_MS } from './constants.ts';
import { skillXp } from './state.ts';
import type { ItemStack, SlotState } from './types.ts';
import { levelForXp, xpForLevel } from './xp.ts';

const TICKS_PER_HOUR = 3_600_000 / TICK_MS;

export interface ActionRates {
  durationTicks: number;
  executionsPerHour: number;
  xpTenthsPerHour: number;
  /** Expected outputs per hour (chance included); display only. */
  outputsPerHour: ItemStack[];
  inputsPerHour: ItemStack[];
}

/** Rates shown in the UI. Floating point is fine here: nothing feeds back into state. */
export function actionRates(
  state: SlotState,
  actionId: string,
  content: ContentDb,
): ActionRates | null {
  const action = content.actions.get(actionId);
  if (!action) return null;
  const durationTicks = actionDurationTicks(state, action, content);
  const executionsPerHour = TICKS_PER_HOUR / durationTicks;
  return {
    durationTicks,
    executionsPerHour,
    xpTenthsPerHour: executionsPerHour * action.xpTenths,
    outputsPerHour: action.outputs.map((o) => ({
      itemId: o.itemId,
      qty: (executionsPerHour * o.qty * o.chancePpm) / PPM,
    })),
    inputsPerHour: action.inputs.map((i) => ({ itemId: i.itemId, qty: executionsPerHour * i.qty })),
  };
}

/** Ticks until the action's skill levels up if the current activity keeps running, or null. */
export function ticksToNextLevel(state: SlotState, content: ContentDb): number | null {
  const activity = state.activity;
  const action = activity ? content.actions.get(activity.actionId) : undefined;
  if (!activity || !action) return null;
  const xp = skillXp(state, action.skill);
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return null;
  const needed = Math.ceil((xpForLevel(level + 1) - xp) / action.xpTenths);
  const possible = Math.min(
    executionsByMaterials(state, action),
    executionsUntilStop(state, action, activity.stop, activity.completed),
  );
  if (needed > possible) return null;
  const firstDone = activity.startedTick + activity.durationTicks - state.tick;
  return firstDone + (needed - 1) * activity.durationTicks;
}

/** Ticks until the current activity ends (stop condition or materials), or null if it never does. */
export function ticksUntilActivityEnds(state: SlotState, content: ContentDb): number | null {
  const activity = state.activity;
  const action = activity ? content.actions.get(activity.actionId) : undefined;
  if (!activity || !action) return null;
  const left = Math.min(
    executionsByMaterials(state, action),
    executionsUntilStop(state, action, activity.stop, activity.completed),
  );
  if (!Number.isFinite(left)) return null;
  const firstDone = activity.startedTick + activity.durationTicks - state.tick;
  return Math.max(0, firstDone + (left - 1) * activity.durationTicks);
}
