/**
 * Client–server WebSocket messages (section 7.4). Every message is JSON with `type` and `seq`
 * (increasing per connection and direction) and is validated with these schemas on receipt.
 * State and event schemas are typed against the engine's types, so they cannot drift apart.
 */
import { SKILL_IDS } from '@valdren/content';
import type { GameEvent, OfflineSummary, SlotState, StopCondition } from '@valdren/engine';
import { z } from 'zod';

export const PROTOCOL_VERSION = 1;
/** Close code sent when a client exceeds the intent rate limit. */
export const CLOSE_RATE_LIMITED = 4008;
/** Close code for a missing or invalid session. */
export const CLOSE_UNAUTHORIZED = 4001;

const seq = z.number().int().nonnegative();
const int = z.number().int();
const nonNeg = z.number().int().nonnegative();
const id = z.string().min(1).max(64);
const skill = z.enum(SKILL_IDS);

export const slotIdSchema = z.enum(['main', 'secondary']);

export const stopConditionSchema: z.ZodType<StopCondition> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('count'), count: z.number().int().min(1).max(1_000_000) }),
  z.strictObject({ kind: z.literal('materials') }),
  z.strictObject({ kind: z.literal('level'), level: z.number().int().min(2).max(99) }),
]);

const itemStack = z.strictObject({ itemId: id, qty: nonNeg });
const skillXp = z.strictObject({ skill, xpTenths: nonNeg });
const queueEntry = z.strictObject({ actionId: id, stop: stopConditionSchema });

export const slotStateSchema: z.ZodType<SlotState> = z.strictObject({
  v: z.literal(1),
  slot: slotIdSchema,
  tick: int,
  rng: z.tuple([int, int, int, int]),
  activity: z
    .strictObject({
      kind: z.literal('action'),
      actionId: id,
      stop: stopConditionSchema,
      startedTick: int,
      durationTicks: z.number().int().positive(),
      completed: nonNeg,
    })
    .nullable(),
  queue: z.array(queueEntry),
  skills: z.array(skillXp),
  bank: z.array(itemStack),
  inventory: z.array(itemStack),
  nextDepositTick: int,
});

const stopReason = z.enum([
  'queueEmpty',
  'outOfMaterials',
  'levelTooLow',
  'missingTool',
  'unknownAction',
  'manual',
]);

export const gameEventSchema: z.ZodType<GameEvent> = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('QueueAdvanced'), tick: int, actionId: id, durationTicks: int }),
  z.strictObject({
    type: z.literal('ActionCompleted'),
    tick: int,
    actionId: id,
    skill,
    completed: nonNeg,
    nextStartTick: int.nullable(),
  }),
  z.strictObject({ type: z.literal('ItemsConsumed'), tick: int, items: z.array(itemStack) }),
  z.strictObject({
    type: z.literal('ItemsGained'),
    tick: int,
    items: z.array(itemStack),
    source: z.literal('action'),
  }),
  z.strictObject({ type: z.literal('XpGained'), tick: int, skill, xpTenths: nonNeg }),
  z.strictObject({ type: z.literal('LevelUp'), tick: int, skill, level: int }),
  z.strictObject({ type: z.literal('InventoryDeposited'), tick: int, items: z.array(itemStack) }),
  z.strictObject({ type: z.literal('SlotStopped'), tick: int, reason: stopReason }),
]);

export const offlineSummarySchema: z.ZodType<OfflineSummary> = z.strictObject({
  fromTick: int,
  toTick: int,
  ticks: nonNeg,
  executions: z.array(z.strictObject({ actionId: id, count: nonNeg })),
  xp: z.array(skillXp),
  levels: z.array(z.strictObject({ skill, from: int, to: int })),
  gained: z.array(itemStack),
  consumed: z.array(itemStack),
  highlights: z.array(
    z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('levelUp'), skill, level: int }),
      z.strictObject({ kind: z.literal('rareItem'), itemId: id, qty: nonNeg }),
    ]),
  ),
  stopped: stopReason.nullable(),
});

// ---------------------------------------------------------------- client → server

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    seq,
    type: z.literal('hello'),
    clientVersion: z.string().max(32),
    contentHash: z.string().max(64),
    /** Optional: browsers authenticate with the session cookie on upgrade; native apps send it here. */
    token: z.string().max(128).optional(),
  }),
  z.strictObject({ seq, type: z.literal('ping'), clientTime: z.number() }),
  z.strictObject({
    seq,
    type: z.literal('intent.startAction'),
    slot: slotIdSchema,
    actionId: id,
    stop: stopConditionSchema,
  }),
  z.strictObject({
    seq,
    type: z.literal('intent.startCombat'),
    areaId: id,
    style: z.enum(['melee', 'archery', 'arcana']),
    trainSkill: z.enum(['attack', 'strength', 'defence', 'shared', 'archery', 'arcana']),
    food: z.array(id).max(4),
    potions: z.array(id).max(4),
    eatBelowPercent: z.number().int().min(1).max(99),
  }),
  z.strictObject({
    seq,
    type: z.literal('intent.setQueue'),
    slot: slotIdSchema,
    entries: z.array(queueEntry).max(16),
  }),
  z.strictObject({ seq, type: z.literal('intent.stop'), slot: slotIdSchema }),
  z.strictObject({
    seq,
    type: z.literal('intent.equip'),
    equipSlot: id,
    itemId: id.nullable(),
  }),
  /**
   * `divergence`: the client's hash differed at a checkpoint (logged as a bug).
   * `stale`: the client fell far behind (e.g. a background tab) and wants the resolved state
   * instead of replaying the lost time (section 6.5).
   */
  z.strictObject({
    seq,
    type: z.literal('slot.requestResync'),
    slot: slotIdSchema,
    reason: z.enum(['divergence', 'stale']),
    tick: int,
    hash: z.string().max(32),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage['type'];
/** Client messages without seq (the socket adds it). */
export type ClientPayload = ClientMessage extends infer M
  ? M extends unknown
    ? Omit<M, 'seq'>
    : never
  : never;

// ---------------------------------------------------------------- server → client

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    seq,
    type: z.literal('welcome'),
    serverTime: z.number(),
    tick: int,
    characterId: z.string(),
    slots: z.array(z.strictObject({ slot: slotIdSchema, state: slotStateSchema })),
    offline: offlineSummarySchema.nullable(),
  }),
  z.strictObject({ seq, type: z.literal('pong'), clientTime: z.number(), serverTime: z.number() }),
  z.strictObject({
    seq,
    type: z.literal('slot.started'),
    slot: slotIdSchema,
    tick: int,
    state: slotStateSchema,
    /** Events produced by the intent itself (e.g. QueueAdvanced), for the scene. */
    events: z.array(gameEventSchema),
    replyTo: seq,
  }),
  z.strictObject({
    seq,
    type: z.literal('slot.checkpoint'),
    slot: slotIdSchema,
    tick: int,
    hash: z.string(),
    /** What was persisted at this tick. */
    skills: z.array(skillXp),
    bank: z.array(itemStack),
  }),
  z.strictObject({
    seq,
    type: z.literal('slot.resync'),
    slot: slotIdSchema,
    state: slotStateSchema,
    reason: z.enum(['divergence', 'external', 'requested']),
  }),
  z.strictObject({
    seq,
    type: z.literal('world.ghosts'),
    ghosts: z
      .array(
        z.strictObject({
          name: z.string(),
          appearance: z.record(z.string(), z.number()),
          targetMonsterId: id.nullable(),
        }),
      )
      .max(5),
  }),
  z.strictObject({
    seq,
    type: z.literal('notice'),
    messageKey: z.string(),
    params: z.record(z.string(), z.union([z.string(), z.number()])),
  }),
  z.strictObject({
    seq,
    type: z.literal('error'),
    code: z.string(),
    messageKey: z.string(),
    details: z.unknown().optional(),
    replyTo: seq.optional(),
  }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ServerPayload = ServerMessage extends infer M
  ? M extends unknown
    ? Omit<M, 'seq'>
    : never
  : never;
