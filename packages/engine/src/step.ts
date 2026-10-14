import type { ContentDb } from '@valdren/content';
import {
  blockToStopReason,
  checkAction,
  consumeInputs,
  depositInventory,
  executionsByMaterials,
  executionsUntilStop,
  gainToInventory,
  startNextFromQueue,
} from './actions.ts';
import { DEPOSIT_INTERVAL_TICKS } from './constants.ts';
import { addItem } from './items.ts';
import { rngChance } from './rng.ts';
import { cloneState, setSkillXp, skillXp } from './state.ts';
import type { GameEvent, ItemStack, SlotState, StopReason } from './types.ts';
import { addXp, levelForXp } from './xp.ts';

/**
 * Advances a slot by `ticks` ticks, producing every event in order. Pure: the input is not mutated.
 * step(s, a + b) is equivalent to step(step(s, a).state, b).
 */
export function step(
  input: SlotState,
  ticks: number,
  content: ContentDb,
): { state: SlotState; events: GameEvent[] } {
  if (!Number.isInteger(ticks) || ticks < 0) throw new RangeError(`step: invalid ticks ${ticks}`);
  const state = cloneState(input);
  const events: GameEvent[] = [];
  const target = state.tick + ticks;

  if (!state.activity && state.queue.length > 0) {
    startNextFromQueue(state, content, events, 'queueEmpty');
  }
  while (state.activity) {
    const completeAt = state.activity.startedTick + state.activity.durationTicks;
    const next = Math.min(completeAt, state.nextDepositTick);
    if (next > target) break;
    state.tick = next;
    if (next === completeAt) completeExecution(state, content, events);
    if (state.activity && state.tick === state.nextDepositTick) {
      depositInventory(state, state.tick, events);
      state.nextDepositTick += DEPOSIT_INTERVAL_TICKS;
    }
  }
  state.tick = target;
  return { state, events };
}

function completeExecution(state: SlotState, content: ContentDb, events: GameEvent[]): void {
  const activity = state.activity!;
  const tick = state.tick;
  const action = content.actions.get(activity.actionId);
  if (!action) {
    state.activity = null;
    startNextFromQueue(state, content, events, 'unknownAction');
    return;
  }
  // Inputs are checked when an execution starts; re-check in case something outside the slot took them.
  if (executionsByMaterials(state, action) < 1) {
    state.activity = null;
    startNextFromQueue(state, content, events, 'outOfMaterials');
    return;
  }

  const consumed = consumeInputs(state, action, 1);
  const gained: ItemStack[] = [];
  for (const output of action.outputs) {
    if (rngChance(state.rng, output.chancePpm)) addItem(gained, output.itemId, output.qty);
  }
  const xpBefore = skillXp(state, action.skill);
  const xpAfter = addXp(xpBefore, action.xpTenths);
  setSkillXp(state, action.skill, xpAfter);
  activity.completed += 1;

  const remaining = executionsUntilStop(state, action, activity.stop, activity.completed);
  const block = remaining > 0 ? checkAction(state, action.id, content) : null;
  const continues = remaining > 0 && block === null;

  events.push({
    type: 'ActionCompleted',
    tick,
    actionId: action.id,
    skill: action.skill,
    completed: activity.completed,
    nextStartTick: continues ? tick : null,
  });
  if (consumed.length > 0) events.push({ type: 'ItemsConsumed', tick, items: consumed });
  if (gained.length > 0) {
    gainToInventory(state, gained, tick, events);
    events.push({ type: 'ItemsGained', tick, items: gained, source: 'action' });
  }
  if (xpAfter > xpBefore) {
    events.push({ type: 'XpGained', tick, skill: action.skill, xpTenths: xpAfter - xpBefore });
  }
  for (let level = levelForXp(xpBefore) + 1; level <= levelForXp(xpAfter); level++) {
    events.push({ type: 'LevelUp', tick, skill: action.skill, level });
  }

  if (continues) {
    activity.startedTick = tick;
    return;
  }
  const endReason: StopReason = block ? blockToStopReason(block) : 'queueEmpty';
  state.activity = null;
  startNextFromQueue(state, content, events, endReason);
}
