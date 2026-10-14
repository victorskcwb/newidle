import { z } from 'zod';

/**
 * Client–server messages (section 7.4). Draft: only the envelope and the action intents
 * needed by the first milestone exist so far; the rest arrives with the server work.
 */
export const PROTOCOL_VERSION = 1;

const envelope = { seq: z.number().int().nonnegative() };

const stopCondition = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('count'), count: z.number().int().min(1).max(1_000_000) }),
  z.strictObject({ kind: z.literal('materials') }),
  z.strictObject({ kind: z.literal('level'), level: z.number().int().min(2).max(99) }),
]);

const slotId = z.enum(['main', 'secondary']);

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...envelope,
    type: z.literal('hello'),
    token: z.string().min(1),
    clientVersion: z.string(),
    contentHash: z.string(),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('intent.startAction'),
    slot: slotId,
    actionId: z.string().min(1),
    stop: stopCondition,
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('intent.setQueue'),
    slot: slotId,
    entries: z.array(z.strictObject({ actionId: z.string().min(1), stop: stopCondition })).max(16),
  }),
  z.strictObject({ ...envelope, type: z.literal('intent.stop'), slot: slotId }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const errorMessageSchema = z.strictObject({
  ...envelope,
  type: z.literal('error'),
  code: z.string(),
  messageKey: z.string(),
});
