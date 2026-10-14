import type { ContentDb } from '@valdren/content';
import { beginActivity, checkAction, depositInventory, isValidStop } from './actions.ts';
import { cloneState, maxQueueLength, totalLevel } from './state.ts';
import type { BlockReason, GameEvent, QueueEntry, SlotState, StopCondition } from './types.ts';

export type IntentResult =
  { ok: true; state: SlotState; events: GameEvent[] } | { ok: false; reason: BlockReason };

/**
 * Replaces the current activity with `actionId`, starting at state.tick. The queue is kept.
 * The caller must first bring the state up to the current tick with `step`.
 */
export function startAction(
  input: SlotState,
  actionId: string,
  stop: StopCondition,
  content: ContentDb,
): IntentResult {
  const block = checkAction(input, actionId, content);
  if (block) return { ok: false, reason: block };
  const action = content.actions.get(actionId)!;
  if (!isValidStop(input, action, stop)) return { ok: false, reason: { code: 'invalidStop' } };
  const state = cloneState(input);
  state.activity = null;
  beginActivity(state, { actionId, stop }, action, content);
  return {
    ok: true,
    state,
    events: [
      {
        type: 'QueueAdvanced',
        tick: state.tick,
        actionId,
        durationTicks: state.activity!.durationTicks,
      },
    ],
  };
}

/** Replaces the queue. Entries are validated for existence, stop condition and queue length only;
 * materials and levels are checked when each entry starts. */
export function setQueue(
  input: SlotState,
  entries: readonly QueueEntry[],
  content: ContentDb,
  subscriber = false,
): IntentResult {
  const max = maxQueueLength(totalLevel(input.skills), subscriber);
  if (entries.length > max) return { ok: false, reason: { code: 'queueFull', max } };
  for (const entry of entries) {
    const action = content.actions.get(entry.actionId);
    if (!action) return { ok: false, reason: { code: 'unknownAction' } };
    if (
      entry.stop.kind === 'count' &&
      !(Number.isInteger(entry.stop.count) && entry.stop.count >= 1)
    ) {
      return { ok: false, reason: { code: 'invalidStop' } };
    }
  }
  const state = cloneState(input);
  state.queue = entries.map((e) => ({ actionId: e.actionId, stop: { ...e.stop } }));
  return { ok: true, state, events: [] };
}

/** Stops the slot, clears the queue and deposits the action inventory. */
export function stopSlot(input: SlotState): { state: SlotState; events: GameEvent[] } {
  const state = cloneState(input);
  const events: GameEvent[] = [];
  const wasActive = state.activity !== null;
  state.activity = null;
  state.queue = [];
  depositInventory(state, state.tick, events);
  if (wasActive) events.push({ type: 'SlotStopped', tick: state.tick, reason: 'manual' });
  return { state, events };
}
