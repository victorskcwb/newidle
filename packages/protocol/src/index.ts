import { CONTENT_FILES } from '@abismo/content';
import { canonicalJson, fnv1a64, intentSchema, type OfflineReport } from '@abismo/engine';
import { z } from 'zod';

/**
 * Messages between the client and the server over one WebSocket (decision 173; the
 * reference is docs/protocolo.md). JSON text frames; bigints travel as `{ "$bigint": "…" }`,
 * like in the save. The game state itself always travels as save text (`encodeSave`), so the
 * client validates and migrates it with `decodeSave` exactly like a local save.
 */

/** Bumped on any incompatible change to these messages. */
export const PROTOCOL_VERSION = 1;

/** The client runs this many ticks ahead of the server's clock (500 ms of slack for latency). */
export const CLIENT_LEAD_TICKS = 5;
/** Intents scheduled further ahead than this are refused (`too_early`). */
export const MAX_LEAD_TICKS = 50;
/** Ticks between two state hashes from the server (30 s). */
export const CHECKPOINT_TICKS = 300;

/** Fingerprint of the bundled content: the client caches content by it. */
export const CONTENT_VERSION = fnv1a64(canonicalJson(CONTENT_FILES));

const tick = z.number().int().min(0);
const seq = z.number().int().min(1);
const ms = z.number().finite().min(0);

// --- Client → server -------------------------------------------------------------------------

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('hello'),
    protocol: z.literal(PROTOCOL_VERSION),
    /** Engine and content build; a mismatch makes the server ask for a reload. */
    buildId: z.string().min(1).max(64),
    token: z.string().min(1).max(256),
  }),
  z.strictObject({ type: z.literal('intent'), seq, atTick: tick, intent: intentSchema }),
  z.strictObject({ type: z.literal('resync') }),
  z.strictObject({ type: z.literal('ping'), t: ms }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// --- Server → client -------------------------------------------------------------------------

/** The server's clock: `tick` started at `atMs` (server wall time); one tick per 100 ms. */
const clock = z.strictObject({ tick, atMs: ms });

export const KICK_REASONS = ['other_session', 'reload', 'auth', 'maintenance', 'protocol'] as const;

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('welcome'),
    serverNow: ms,
    clock,
    /** Save text of the authoritative state (tick = clock.tick). */
    save: z.string(),
    /** Highest intent seq already applied: the client resends only those after it. */
    lastSeq: z.number().int().min(0),
    /** The time away just resolved, if it was long enough for a summary. */
    offlineReport: z.custom<OfflineReport>((v) => v === null || typeof v === 'object').nullable(),
    contentVersion: z.string(),
  }),
  z.strictObject({ type: z.literal('ack'), seq, appliedAt: tick }),
  z.strictObject({ type: z.literal('reject'), seq, code: z.string() }),
  z.strictObject({ type: z.literal('checkpoint'), tick, hash: z.string() }),
  z.strictObject({
    type: z.literal('state'),
    clock,
    save: z.string(),
    lastSeq: z.number().int().min(0),
  }),
  z.strictObject({ type: z.literal('kicked'), reason: z.enum(KICK_REASONS) }),
  z.strictObject({ type: z.literal('pong'), t: ms, serverNow: ms }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

// --- Codec -----------------------------------------------------------------------------------

/** One message as a text frame. */
export function encodeMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message, (_key, value: unknown) =>
    typeof value === 'bigint' ? { $bigint: value.toString() } : value,
  );
}

function reviveBigints(_key: string, value: unknown): unknown {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { $bigint?: unknown }).$bigint === 'string' &&
    /^-?\d+$/.test((value as { $bigint: string }).$bigint)
  ) {
    return BigInt((value as { $bigint: string }).$bigint);
  }
  return value;
}

/** Largest frame either side accepts (a full state with a big stash is ~50–100 KB). */
export const MAX_FRAME_BYTES = 1_000_000;

/** Parses and validates a text frame; null when it is not a valid message of that side. */
function decodeWith<T>(schema: z.ZodType<T>, text: string): T | null {
  if (text.length > MAX_FRAME_BYTES) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text, reviveBigints);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const decodeClientMessage = (text: string) => decodeWith(clientMessageSchema, text);
export const decodeServerMessage = (text: string) => decodeWith(serverMessageSchema, text);

/** The server tick at wall time `nowMs`, from a clock reading. */
export function tickAt(c: { tick: number; atMs: number }, nowMs: number, tickMs = 100): number {
  return c.tick + Math.max(0, Math.floor((nowMs - c.atMs) / tickMs));
}

export { Replica } from './replica.ts';
