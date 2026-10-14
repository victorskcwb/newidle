import type { Action, ContentDb } from '@valdren/content';
import {
  ACTION_INVENTORY_SLOTS,
  DEPOSIT_INTERVAL_TICKS,
  MAX_LEVEL,
  MAX_SPEED_BONUS_PPM,
  PPM,
  TICK_MS,
} from './constants.ts';
import { addItem, cloneStacks, hasStack, mergeInto, qtyOf, removeItem } from './items.ts';
import { skillLevel, skillXp } from './state.ts';
import type {
  BlockReason,
  GameEvent,
  ItemStack,
  QueueEntry,
  SlotState,
  StopCondition,
  StopReason,
} from './types.ts';
import { xpForLevel } from './xp.ts';

/** Quantity available to actions: action inventory plus bank. */
export function available(state: SlotState, itemId: string): number {
  return qtyOf(state.inventory, itemId) + qtyOf(state.bank, itemId);
}

/** Best speed bonus among owned tools of the given type, or null if none is owned. */
export function toolBonusPpm(
  state: SlotState,
  toolType: string,
  content: ContentDb,
): number | null {
  let best: number | null = null;
  for (const list of [state.inventory, state.bank]) {
    for (const stack of list) {
      const tool = content.items.get(stack.itemId)?.tool;
      if (tool && tool.type === toolType && (best === null || tool.speedBonusPpm > best)) {
        best = tool.speedBonusPpm;
      }
    }
  }
  return best;
}

/** Duration in whole ticks after speed bonuses (summed, capped at 60%), rounded up. */
export function effectiveDurationTicks(durationMs: number, speedBonusPpm: number): number {
  const bonus = Math.min(MAX_SPEED_BONUS_PPM, Math.max(0, speedBonusPpm));
  return Math.max(1, Math.ceil((durationMs * (PPM - bonus)) / (TICK_MS * PPM)));
}

export function actionDurationTicks(state: SlotState, action: Action, content: ContentDb): number {
  const toolBonus = action.tool ? (toolBonusPpm(state, action.tool, content) ?? 0) : 0;
  return effectiveDurationTicks(action.durationMs, toolBonus);
}

/** Why an execution of the action cannot start right now, or null if it can. */
export function checkAction(
  state: SlotState,
  actionId: string,
  content: ContentDb,
): BlockReason | null {
  const action = content.actions.get(actionId);
  if (!action) return { code: 'unknownAction' };
  if (skillLevel(state, action.skill) < action.level) {
    return { code: 'levelTooLow', skill: action.skill, level: action.level };
  }
  if (action.tool && toolBonusPpm(state, action.tool, content) === null) {
    return { code: 'missingTool', tool: action.tool };
  }
  for (const input of action.inputs) {
    if (available(state, input.itemId) < input.qty) {
      return { code: 'missingItem', itemId: input.itemId };
    }
  }
  return null;
}

export function isValidStop(state: SlotState, action: Action, stop: StopCondition): boolean {
  switch (stop.kind) {
    case 'count':
      return Number.isInteger(stop.count) && stop.count >= 1;
    case 'materials':
      return true;
    case 'level':
      return (
        Number.isInteger(stop.level) &&
        stop.level <= MAX_LEVEL &&
        stop.level > skillLevel(state, action.skill)
      );
  }
}

export function blockToStopReason(block: BlockReason): StopReason {
  switch (block.code) {
    case 'levelTooLow':
      return 'levelTooLow';
    case 'missingTool':
      return 'missingTool';
    case 'missingItem':
      return 'outOfMaterials';
    default:
      return 'unknownAction';
  }
}

/** Executions left before the stop condition is met (Infinity for "materials"). */
export function executionsUntilStop(
  state: SlotState,
  action: Action,
  stop: StopCondition,
  completed: number,
): number {
  switch (stop.kind) {
    case 'count':
      return Math.max(0, stop.count - completed);
    case 'materials':
      return Infinity;
    case 'level': {
      const missing = xpForLevel(stop.level) - skillXp(state, action.skill);
      return missing <= 0 ? 0 : Math.ceil(missing / action.xpTenths);
    }
  }
}

/** Executions the current materials allow (Infinity for actions without inputs). */
export function executionsByMaterials(state: SlotState, action: Action): number {
  let max = Infinity;
  for (const input of action.inputs) {
    max = Math.min(max, Math.floor(available(state, input.itemId) / input.qty));
  }
  return max;
}

/** Removes inputs, inventory first, then bank. Callers have verified availability. */
export function consumeInputs(state: SlotState, action: Action, times: number): ItemStack[] {
  const consumed: ItemStack[] = [];
  for (const input of action.inputs) {
    const need = input.qty * times;
    const fromInv = removeItem(state.inventory, input.itemId, need);
    const fromBank = removeItem(state.bank, input.itemId, need - fromInv);
    addItem(consumed, input.itemId, fromInv + fromBank);
  }
  return consumed;
}

/** Moves the whole action inventory into the bank. */
export function depositInventory(state: SlotState, tick: number, events: GameEvent[] | null): void {
  if (state.inventory.length === 0) return;
  const items = cloneStacks(state.inventory);
  mergeInto(state.bank, items);
  state.inventory = [];
  events?.push({ type: 'InventoryDeposited', tick, items });
}

/** Adds items to the action inventory; when a new stack does not fit, deposits first. */
export function gainToInventory(
  state: SlotState,
  items: readonly ItemStack[],
  tick: number,
  events: GameEvent[] | null,
): void {
  for (const item of items) {
    if (
      !hasStack(state.inventory, item.itemId) &&
      state.inventory.length >= ACTION_INVENTORY_SLOTS
    ) {
      depositInventory(state, tick, events);
    }
    addItem(state.inventory, item.itemId, item.qty);
  }
}

/**
 * Starts the first runnable queue entry at state.tick. Entries that cannot start are skipped.
 * When nothing can start, the slot stops and the inventory is deposited.
 */
export function startNextFromQueue(
  state: SlotState,
  content: ContentDb,
  events: GameEvent[] | null,
  endReason: StopReason,
): StopReason | null {
  let reason = endReason;
  while (state.queue.length > 0) {
    const entry = state.queue.shift()!;
    const action = content.actions.get(entry.actionId);
    const block = checkAction(state, entry.actionId, content);
    if (!action || block) {
      reason = block ? blockToStopReason(block) : 'unknownAction';
      continue;
    }
    if (executionsUntilStop(state, action, entry.stop, 0) === 0) continue;
    beginActivity(state, entry, action, content);
    events?.push({
      type: 'QueueAdvanced',
      tick: state.tick,
      actionId: action.id,
      durationTicks: state.activity!.durationTicks,
    });
    return null;
  }
  state.activity = null;
  depositInventory(state, state.tick, events);
  events?.push({ type: 'SlotStopped', tick: state.tick, reason });
  return reason;
}

export function beginActivity(
  state: SlotState,
  entry: QueueEntry,
  action: Action,
  content: ContentDb,
): void {
  if (!state.activity) state.nextDepositTick = state.tick + DEPOSIT_INTERVAL_TICKS;
  state.activity = {
    kind: 'action',
    actionId: action.id,
    stop: { ...entry.stop },
    startedTick: state.tick,
    durationTicks: actionDurationTicks(state, action, content),
    completed: 0,
  };
}
