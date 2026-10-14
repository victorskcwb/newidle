import { SKILL_IDS, type SkillId } from '@valdren/content';
import {
  DEPOSIT_INTERVAL_TICKS,
  QUEUE_BASE_LENGTH,
  QUEUE_SUBSCRIBER_BONUS,
  QUEUE_TOTAL_LEVEL_STEP,
  VITALITY_START_LEVEL,
} from './constants.ts';
import { cloneStacks } from './items.ts';
import { createRng, type RngState } from './rng.ts';
import type { ItemStack, SkillXp, SlotId, SlotState, StopCondition } from './types.ts';
import { levelForXp, xpForLevel } from './xp.ts';

/** Skills of a new character: everything at level 1 except Vitality, which starts at 10. */
export function newCharacterSkills(): SkillXp[] {
  return SKILL_IDS.map((skill) => ({
    skill,
    xpTenths: skill === 'vitality' ? xpForLevel(VITALITY_START_LEVEL) : 0,
  }));
}

export interface NewSlotOptions {
  slot: SlotId;
  tick: number;
  seed: readonly [number, number, number, number];
  skills: readonly SkillXp[];
  bank: readonly ItemStack[];
}

export function newSlotState(opts: NewSlotOptions): SlotState {
  return {
    v: 1,
    slot: opts.slot,
    tick: opts.tick,
    rng: createRng(opts.seed),
    activity: null,
    queue: [],
    skills: normalizeSkills(opts.skills),
    bank: [...cloneStacks(opts.bank)].sort((a, b) => (a.itemId < b.itemId ? -1 : 1)),
    inventory: [],
    nextDepositTick: opts.tick + DEPOSIT_INTERVAL_TICKS,
  };
}

/** Returns a full skill list in SKILL_IDS order, filling missing skills with 0 XP. */
export function normalizeSkills(skills: readonly SkillXp[]): SkillXp[] {
  return SKILL_IDS.map((skill) => ({
    skill,
    xpTenths: skills.find((s) => s.skill === skill)?.xpTenths ?? 0,
  }));
}

function cloneStop(stop: StopCondition): StopCondition {
  return { ...stop };
}

/** Deep copy. Engine entry points never mutate their input. */
export function cloneState(s: SlotState): SlotState {
  return {
    v: s.v,
    slot: s.slot,
    tick: s.tick,
    rng: [s.rng[0], s.rng[1], s.rng[2], s.rng[3]] as RngState,
    activity: s.activity ? { ...s.activity, stop: cloneStop(s.activity.stop) } : null,
    queue: s.queue.map((q) => ({ actionId: q.actionId, stop: cloneStop(q.stop) })),
    skills: s.skills.map((x) => ({ skill: x.skill, xpTenths: x.xpTenths })),
    bank: cloneStacks(s.bank),
    inventory: cloneStacks(s.inventory),
    nextDepositTick: s.nextDepositTick,
  };
}

export function skillXp(state: SlotState, skill: SkillId): number {
  return state.skills.find((s) => s.skill === skill)?.xpTenths ?? 0;
}

export function skillLevel(state: SlotState, skill: SkillId): number {
  return levelForXp(skillXp(state, skill));
}

export function setSkillXp(state: SlotState, skill: SkillId, xpTenths: number): void {
  const entry = state.skills.find((s) => s.skill === skill);
  if (entry) entry.xpTenths = xpTenths;
}

export function totalLevel(skills: readonly SkillXp[]): number {
  return skills.reduce((sum, s) => sum + levelForXp(s.xpTenths), 0);
}

export function maxQueueLength(totalLvl: number, subscriber = false): number {
  return (
    QUEUE_BASE_LENGTH +
    Math.floor(totalLvl / QUEUE_TOTAL_LEVEL_STEP) +
    (subscriber ? QUEUE_SUBSCRIBER_BONUS : 0)
  );
}
