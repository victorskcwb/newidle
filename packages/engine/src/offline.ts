import { SKILL_IDS, type ContentDb, type SkillId } from '@valdren/content';
import {
  blockToStopReason,
  checkAction,
  consumeInputs,
  depositInventory,
  executionsByMaterials,
  executionsUntilStop,
  startNextFromQueue,
} from './actions.ts';
import { DEPOSIT_INTERVAL_TICKS, MAX_LEVEL } from './constants.ts';
import { addItem, mergeInto } from './items.ts';
import { rngBinomial } from './rng.ts';
import { cloneState, setSkillXp, skillLevel, skillXp } from './state.ts';
import type { Highlight, ItemStack, OfflineSummary, SlotState, StopReason } from './types.ts';
import { addXp, levelForXp, xpForLevel } from './xp.ts';

const RARE_RARITIES = new Set(['rare', 'epic', 'legendary']);

/**
 * Resolves a long gap in bulk: executions are computed from elapsed time and materials,
 * chance outputs use one binomial draw per batch. Batches are split at level-ups and at
 * queue/stop boundaries, so XP, levels, inputs and guaranteed outputs match `step` exactly;
 * chance outputs match in distribution. Everything gained goes straight to the bank.
 */
export function resolveOffline(
  input: SlotState,
  ticks: number,
  content: ContentDb,
): { state: SlotState; summary: OfflineSummary } {
  if (!Number.isInteger(ticks) || ticks < 0) {
    throw new RangeError(`resolveOffline: invalid ticks ${ticks}`);
  }
  const state = cloneState(input);
  const fromTick = state.tick;
  const target = fromTick + ticks;
  const levelsBefore = new Map<SkillId, number>(SKILL_IDS.map((s) => [s, skillLevel(state, s)]));
  const xpBefore = new Map<SkillId, number>(SKILL_IDS.map((s) => [s, skillXp(state, s)]));
  const executions = new Map<string, number>();
  const gained: ItemStack[] = [];
  const consumedTotal: ItemStack[] = [];
  const rareItems: ItemStack[] = [];
  let stopped: StopReason | null = null;

  depositInventory(state, state.tick, null);
  if (!state.activity && state.queue.length > 0) {
    stopped = startNextFromQueue(state, content, null, 'queueEmpty');
  }

  while (state.activity) {
    const activity = state.activity;
    const action = content.actions.get(activity.actionId);
    const firstDone = activity.startedTick + activity.durationTicks;
    if (firstDone > target) break;
    if (!action || executionsByMaterials(state, action) < 1) {
      state.tick = firstDone;
      state.activity = null;
      stopped = startNextFromQueue(
        state,
        content,
        null,
        action ? 'outOfMaterials' : 'unknownAction',
      );
      continue;
    }

    const xp = skillXp(state, action.skill);
    const level = levelForXp(xp);
    const byTime = 1 + Math.floor((target - firstDone) / activity.durationTicks);
    const byLevel =
      level < MAX_LEVEL ? Math.ceil((xpForLevel(level + 1) - xp) / action.xpTenths) : Infinity;
    const n = Math.min(
      byTime,
      byLevel,
      executionsByMaterials(state, action),
      executionsUntilStop(state, action, activity.stop, activity.completed),
    );

    state.tick = activity.startedTick + n * activity.durationTicks;
    mergeInto(consumedTotal, consumeInputs(state, action, n));
    for (const output of action.outputs) {
      const qty = rngBinomial(state.rng, n, output.chancePpm) * output.qty;
      if (qty === 0) continue;
      addItem(state.bank, output.itemId, qty);
      addItem(gained, output.itemId, qty);
      const rarity = content.items.get(output.itemId)?.rarity;
      if (rarity && RARE_RARITIES.has(rarity)) addItem(rareItems, output.itemId, qty);
    }
    setSkillXp(state, action.skill, addXp(xp, n * action.xpTenths));
    activity.completed += n;
    executions.set(action.id, (executions.get(action.id) ?? 0) + n);

    const remaining = executionsUntilStop(state, action, activity.stop, activity.completed);
    const block = remaining > 0 ? checkAction(state, action.id, content) : null;
    if (remaining > 0 && block === null) {
      activity.startedTick = state.tick;
      continue;
    }
    state.activity = null;
    stopped = startNextFromQueue(
      state,
      content,
      null,
      block ? blockToStopReason(block) : 'queueEmpty',
    );
  }

  state.tick = target;
  if (state.activity) state.nextDepositTick = target + DEPOSIT_INTERVAL_TICKS;

  const xpGained = SKILL_IDS.flatMap((skill) => {
    const diff = skillXp(state, skill) - (xpBefore.get(skill) ?? 0);
    return diff > 0 ? [{ skill, xpTenths: diff }] : [];
  });
  const levels = SKILL_IDS.flatMap((skill) => {
    const from = levelsBefore.get(skill) ?? 1;
    const to = skillLevel(state, skill);
    return to > from ? [{ skill, from, to }] : [];
  });
  const highlights: Highlight[] = [
    ...levels.map((l): Highlight => ({ kind: 'levelUp', skill: l.skill, level: l.to })),
    ...rareItems.map((r): Highlight => ({ kind: 'rareItem', itemId: r.itemId, qty: r.qty })),
  ];

  return {
    state,
    summary: {
      fromTick,
      toTick: target,
      ticks,
      executions: [...executions.entries()]
        .map(([actionId, count]) => ({ actionId, count }))
        .sort((a, b) => (a.actionId < b.actionId ? -1 : 1)),
      xp: xpGained,
      levels,
      gained,
      consumed: consumedTotal,
      highlights,
      stopped: state.activity ? null : stopped,
    },
  };
}
