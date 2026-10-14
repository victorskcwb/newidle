import type { ContentDb } from '@valdren/content';
import {
  hashState,
  setQueue,
  startAction,
  stopSlot,
  type BlockReason,
  type GameEvent,
  type SlotId,
  type SlotState,
} from '@valdren/engine';
import {
  CLOSE_RATE_LIMITED,
  CLOSE_UNAUTHORIZED,
  clientMessageSchema,
  type ClientMessage,
  type ServerPayload,
} from '@valdren/protocol';
import type { FastifyBaseLogger } from 'fastify';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { Db } from '../db/client.ts';
import { eventLog } from '../db/schema.ts';
import { AppError, errors } from '../errors.ts';
import { newId } from '../ids.ts';
import type { AuthService, SessionInfo } from '../services/auth.ts';
import type { CharacterService } from '../services/characters.ts';
import type { SlotService } from '../services/slots.ts';

export const WS_PATH = '/ws';
const MAX_INTENTS_PER_SECOND = 10;

export interface HubDeps {
  db: Db;
  content: ContentDb;
  auth: AuthService;
  characters: CharacterService;
  slots: SlotService;
  log: FastifyBaseLogger;
  now: () => number;
  parseCookie: (header: string) => Record<string, string | undefined>;
  sessionCookie: string;
  /** Ticks between checkpoints (section 7.4: 50 ticks = 30 s). */
  checkpointTicks?: number;
  /** Disable the 1 s checkpoint timer (tests drive checkpoints by hand). */
  autoCheckpoint?: boolean;
}

/**
 * WebSocket endpoint. Browsers authenticate with the session cookie on upgrade; a `hello`
 * token is accepted as an alternative. Each connection handles its messages strictly in order.
 */
export class GameHub {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
  private readonly connections = new Set<Connection>();
  private timer: ReturnType<typeof setInterval> | undefined;
  readonly checkpointTicks: number;

  constructor(readonly deps: HubDeps) {
    this.checkpointTicks = deps.checkpointTicks ?? 50;
  }

  attach(server: Server): void {
    server.on('upgrade', (req, socket, head) => this.onUpgrade(req, socket, head));
    if (this.deps.autoCheckpoint !== false) {
      this.timer = setInterval(() => void this.checkpointDue(), 1000);
      this.timer.unref();
    }
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    for (const c of this.connections) c.socket.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }

  /** Sends checkpoints to every connection whose next checkpoint tick has come. */
  async checkpointDue(force = false): Promise<void> {
    const nowTick = this.deps.slots.nowTick();
    await Promise.all(
      [...this.connections].map((c) =>
        force || nowTick >= c.nextCheckpointTick ? c.enqueueCheckpoint() : null,
      ),
    );
  }

  /** Something outside the slot changed the character (e.g. a shop sale): resync its clients. */
  async externalChange(characterId: string): Promise<void> {
    await Promise.all(
      [...this.connections]
        .filter((c) => c.characterId === characterId)
        .map((c) => c.enqueueResync('external')),
    );
  }

  connectionCount(): number {
    return this.connections.size;
  }

  private onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH) {
      socket.destroy();
      return;
    }
    const token = req.headers.cookie
      ? this.deps.parseCookie(req.headers.cookie)[this.deps.sessionCookie]
      : undefined;
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      const conn = new Connection(this, ws, token ?? null);
      this.connections.add(conn);
      ws.on('close', () => this.connections.delete(conn));
    });
  }
}

class Connection {
  characterId: string | null = null;
  nextCheckpointTick = Number.POSITIVE_INFINITY;
  private seqOut = 0;
  private lastSeqIn = -1;
  private intentTimes: number[] = [];
  private chain: Promise<void> = Promise.resolve();
  private slotIds: SlotId[] = [];

  constructor(
    private readonly hub: GameHub,
    readonly socket: WebSocket,
    private readonly cookieToken: string | null,
  ) {
    socket.on('message', (data) => this.onRaw(data.toString()));
    socket.on('error', () => socket.terminate());
  }

  private get deps() {
    return this.hub.deps;
  }

  send(payload: ServerPayload): void {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ ...payload, seq: this.seqOut++ }));
  }

  enqueueCheckpoint(): Promise<void> {
    return this.enqueue(() => this.checkpoint());
  }

  enqueueResync(reason: 'external' | 'divergence' | 'requested'): Promise<void> {
    return this.enqueue(async () => {
      for (const slot of this.slotIds) await this.resync(slot, reason);
    });
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(task).catch((err: unknown) => this.fail(err));
    return this.chain;
  }

  private onRaw(raw: string): void {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.send({ type: 'error', code: 'validation', messageKey: 'error.validation' });
      return;
    }
    const parsed = clientMessageSchema.safeParse(json);
    if (!parsed.success) {
      this.send({ type: 'error', code: 'validation', messageKey: 'error.validation' });
      return;
    }
    const msg = parsed.data;
    if (msg.type.startsWith('intent.') || msg.type === 'slot.requestResync') {
      const now = this.deps.now();
      this.intentTimes = this.intentTimes.filter((t) => now - t < 1000);
      this.intentTimes.push(now);
      if (this.intentTimes.length > MAX_INTENTS_PER_SECOND) {
        this.socket.close(CLOSE_RATE_LIMITED, 'rate limited');
        return;
      }
    }
    void this.enqueue(() => this.handle(msg));
  }

  private async handle(msg: ClientMessage): Promise<void> {
    if (msg.seq <= this.lastSeqIn) throw errors.badSequence();
    this.lastSeqIn = msg.seq;
    if (msg.type === 'ping') {
      this.send({ type: 'pong', clientTime: msg.clientTime, serverTime: this.deps.now() });
      return;
    }
    if (msg.type === 'hello') return this.hello(msg.token ?? null);
    if (!this.characterId) {
      this.socket.close(CLOSE_UNAUTHORIZED, 'hello first');
      return;
    }
    try {
      await this.intent(msg);
    } catch (err) {
      if (err instanceof AppError) {
        this.send({
          type: 'error',
          code: err.code,
          messageKey: err.messageKey,
          details: err.details,
          replyTo: msg.seq,
        });
        return;
      }
      throw err;
    }
  }

  private async hello(helloToken: string | null): Promise<void> {
    if (this.characterId) throw errors.badSequence();
    const token = this.cookieToken ?? helloToken;
    const session: SessionInfo | null = token ? await this.deps.auth.session(token) : null;
    if (!session) {
      this.socket.close(CLOSE_UNAUTHORIZED, 'unauthorized');
      return;
    }
    const character = await this.deps.characters.byAccount(session.accountId);
    if (!character) {
      this.send({ type: 'error', code: 'noCharacter', messageKey: 'error.noCharacter' });
      this.socket.close(CLOSE_UNAUTHORIZED, 'no character');
      return;
    }
    this.characterId = character.id;
    this.slotIds = await this.deps.slots.slotIds(character.id);
    const slots: { slot: SlotId; state: SlotState }[] = [];
    let offline = null;
    for (const slot of this.slotIds) {
      const r = await this.deps.slots.resolve(character.id, slot);
      slots.push({ slot, state: r.finalState });
      if (slot === 'main') offline = r.summary;
    }
    const tick = slots[0]?.state.tick ?? this.deps.slots.nowTick();
    this.nextCheckpointTick = tick + this.hub.checkpointTicks;
    this.send({
      type: 'welcome',
      serverTime: this.deps.now(),
      tick,
      characterId: character.id,
      slots,
      offline,
    });
  }

  private async intent(msg: Exclude<ClientMessage, { type: 'hello' | 'ping' }>): Promise<void> {
    const characterId = this.characterId!;
    const { content, slots } = this.deps;
    switch (msg.type) {
      case 'intent.startAction':
      case 'intent.setQueue':
      case 'intent.stop': {
        this.requireSlot(msg.slot);
        const r = await slots.withSlot(characterId, msg.slot, ({ state }) => {
          let result: { state: SlotState; events: GameEvent[] };
          if (msg.type === 'intent.startAction') {
            const res = startAction(state, msg.actionId, msg.stop, content);
            if (!res.ok) throw actionBlocked(res.reason);
            result = res;
          } else if (msg.type === 'intent.setQueue') {
            const res = setQueue(state, msg.entries, content);
            if (!res.ok) throw actionBlocked(res.reason);
            result = res;
          } else {
            result = stopSlot(state);
          }
          return { state: result.state, result: result.events };
        });
        this.send({
          type: 'slot.started',
          slot: msg.slot,
          tick: r.state.tick,
          state: r.state,
          events: r.result,
          replyTo: msg.seq,
        });
        return;
      }
      case 'slot.requestResync': {
        this.requireSlot(msg.slot);
        if (msg.reason === 'stale') {
          await this.resync(msg.slot, 'requested');
          return;
        }
        await this.deps.db.insert(eventLog).values({
          id: newId(),
          characterId,
          type: 'slot.divergence',
          data: { slot: msg.slot, tick: msg.tick, clientHash: msg.hash },
        });
        this.deps.log.warn(
          { characterId, slot: msg.slot, tick: msg.tick },
          'client state diverged',
        );
        await this.resync(msg.slot, 'divergence');
        return;
      }
      case 'intent.startCombat':
      case 'intent.equip':
        throw errors.notImplemented();
    }
  }

  private requireSlot(slot: SlotId): void {
    if (!this.slotIds.includes(slot)) throw errors.notFound();
  }

  private async checkpoint(): Promise<void> {
    if (!this.characterId) return;
    for (const slot of this.slotIds) {
      const r = await this.deps.slots.resolve(this.characterId, slot);
      const state = r.finalState;
      this.nextCheckpointTick = state.tick + this.hub.checkpointTicks;
      this.send({
        type: 'slot.checkpoint',
        slot,
        tick: state.tick,
        hash: hashState(state),
        skills: state.skills,
        bank: state.bank,
      });
    }
  }

  private async resync(
    slot: SlotId,
    reason: 'external' | 'divergence' | 'requested',
  ): Promise<void> {
    if (!this.characterId) return;
    const r = await this.deps.slots.resolve(this.characterId, slot);
    this.send({ type: 'slot.resync', slot, state: r.finalState, reason });
  }

  private fail(err: unknown): void {
    if (err instanceof AppError) {
      this.send({
        type: 'error',
        code: err.code,
        messageKey: err.messageKey,
        details: err.details,
      });
      return;
    }
    this.deps.log.error(err, 'websocket handler failed');
    this.send({ type: 'error', code: 'internal', messageKey: 'error.internal' });
  }
}

const actionBlocked = (reason: BlockReason): AppError => errors.actionBlocked(reason);
