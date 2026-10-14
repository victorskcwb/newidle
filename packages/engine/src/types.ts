import type { SkillId } from '@valdren/content';
import type { RngState } from './rng.ts';

export type SlotId = 'main' | 'secondary';

/** Item quantity. Lists of stacks are always sorted by itemId and never hold qty <= 0. */
export interface ItemStack {
  itemId: string;
  qty: number;
}

/** Skill XP in tenths. Lists are kept in SKILL_IDS order. */
export interface SkillXp {
  skill: SkillId;
  xpTenths: number;
}

export type StopCondition =
  /** Stop after this many executions. */
  | { kind: 'count'; count: number }
  /** Run until the inputs run out (forever for actions without inputs). */
  | { kind: 'materials' }
  /** Stop once the action's skill reaches this level. */
  | { kind: 'level'; level: number };

export interface QueueEntry {
  actionId: string;
  stop: StopCondition;
}

export interface ActionActivity {
  kind: 'action';
  actionId: string;
  stop: StopCondition;
  /** Tick at which the current execution began; it completes at startedTick + durationTicks. */
  startedTick: number;
  durationTicks: number;
  /** Executions finished for this queue entry. */
  completed: number;
}

export type Activity = ActionActivity;

export interface SlotState {
  v: 1;
  slot: SlotId;
  /** Last resolved global tick. */
  tick: number;
  rng: RngState;
  activity: Activity | null;
  queue: QueueEntry[];
  /** Snapshot of the character data this slot reads and writes. */
  skills: SkillXp[];
  bank: ItemStack[];
  /** Action inventory (28 stacks), deposited into the bank every DEPOSIT_INTERVAL_TICKS. */
  inventory: ItemStack[];
  nextDepositTick: number;
}

export type StopReason =
  'queueEmpty' | 'outOfMaterials' | 'levelTooLow' | 'missingTool' | 'unknownAction' | 'manual';

export type GameEvent =
  | { type: 'QueueAdvanced'; tick: number; actionId: string; durationTicks: number }
  | {
      type: 'ActionCompleted';
      tick: number;
      actionId: string;
      skill: SkillId;
      completed: number;
      /** Tick at which the next execution starts, or null when the action ends here. */
      nextStartTick: number | null;
    }
  | { type: 'ItemsConsumed'; tick: number; items: ItemStack[] }
  | { type: 'ItemsGained'; tick: number; items: ItemStack[]; source: 'action' }
  | { type: 'XpGained'; tick: number; skill: SkillId; xpTenths: number }
  | { type: 'LevelUp'; tick: number; skill: SkillId; level: number }
  | { type: 'InventoryDeposited'; tick: number; items: ItemStack[] }
  | { type: 'SlotStopped'; tick: number; reason: StopReason };

export type GameEventType = GameEvent['type'];

export interface LevelChange {
  skill: SkillId;
  from: number;
  to: number;
}

export type Highlight =
  | { kind: 'levelUp'; skill: SkillId; level: number }
  | { kind: 'rareItem'; itemId: string; qty: number };

export interface OfflineSummary {
  fromTick: number;
  toTick: number;
  ticks: number;
  executions: { actionId: string; count: number }[];
  xp: SkillXp[];
  levels: LevelChange[];
  gained: ItemStack[];
  consumed: ItemStack[];
  highlights: Highlight[];
  /** Why the slot stopped during the period, or null if it was still running at the end. */
  stopped: StopReason | null;
}

export type BlockReason =
  | { code: 'unknownAction' }
  | { code: 'levelTooLow'; skill: SkillId; level: number }
  | { code: 'missingTool'; tool: string }
  | { code: 'missingItem'; itemId: string }
  | { code: 'invalidStop' }
  | { code: 'queueFull'; max: number };
