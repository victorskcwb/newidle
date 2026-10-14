import { loadBundledContent, type ContentDb } from '@valdren/content';
import {
  GAME_EPOCH_MS,
  STEP_RESOLVE_MAX_TICKS,
  TICK_MS,
  canonicalJson,
  fnv1a64,
  hashState,
  step,
  tickAt,
  type BlockReason,
  type GameEvent,
  type SlotState,
  type StopCondition,
} from '@valdren/engine';
import type { ServerMessage } from '@valdren/protocol';
import { GameSocket, type SocketStatus } from '../net/socket.ts';
import { RENDER_DELAY_MS } from './localSim.ts';
import type { Sim, SimHandlers } from './sim.ts';

const HISTORY = 64;
export const CLIENT_VERSION = '0.1.0';

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;

/**
 * Mirrors the server's simulation of the main slot. The server is the authority: intents go
 * to it, its replies replace the local state, and at each checkpoint the local hash for that
 * tick must equal the server's — otherwise the client asks for a resync (section 7.4).
 */
export class ServerSim implements Sim {
  readonly content: ContentDb = loadBundledContent();
  state: SlotState;
  private readonly socket: GameSocket;
  private readonly handlers = new Set<SimHandlers>();
  private readonly statusListeners = new Set<(s: SocketStatus) => void>();
  /** Recent states by tick, to hash the state at a checkpoint tick we already passed. */
  private history: SlotState[] = [];
  private pending = new Map<number, (reason: BlockReason | null) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private awaitingResync = false;
  status: SocketStatus = 'connecting';
  divergences = 0;

  private constructor(welcome: Welcome, socket: GameSocket) {
    this.socket = socket;
    this.state = mainSlot(welcome);
  }

  /** Opens the socket and resolves on the first welcome (with its offline summary, if any). */
  static connect(): Promise<{ sim: ServerSim; welcome: Welcome }> {
    return new Promise((resolve, reject) => {
      let sim: ServerSim | null = null;
      const contentHash = fnv1a64(canonicalJson(loadBundledContent().raw));
      const socket = new GameSocket({
        onOpen: () => socket.send({ type: 'hello', clientVersion: CLIENT_VERSION, contentHash }),
        onStatus: (status) => {
          if (sim) sim.setStatus(status);
          else if (status === 'unauthorized') reject(new Error('unauthorized'));
        },
        onMessage: (msg) => {
          if (msg.type === 'welcome' && !sim) {
            socket.seedClock(msg.serverTime);
            sim = new ServerSim(msg, socket);
            sim.setStatus('online');
            resolve({ sim, welcome: msg });
            return;
          }
          sim?.onMessage(msg);
        },
      });
      socket.connect();
    });
  }

  subscribe(h: SimHandlers): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  onStatus(listener: (s: SocketStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  nowTick(): number {
    return tickAt(Date.now() + this.socket.clockOffset);
  }

  tickToMs(tick: number): number {
    return GAME_EPOCH_MS + tick * TICK_MS - this.socket.clockOffset + RENDER_DELAY_MS;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.advance(), 100);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  dispose(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.socket.close();
  }

  startAction(
    actionId: string,
    stop: StopCondition = { kind: 'materials' },
  ): Promise<BlockReason | null> {
    return this.intent({ type: 'intent.startAction', slot: 'main', actionId, stop });
  }

  stop(): void {
    void this.intent({ type: 'intent.stop', slot: 'main' });
  }

  private intent(
    payload:
      | { type: 'intent.startAction'; slot: 'main'; actionId: string; stop: StopCondition }
      | { type: 'intent.stop'; slot: 'main' },
  ): Promise<BlockReason | null> {
    const seq = this.socket.send(payload);
    if (seq === null) return Promise.resolve({ code: 'unknownAction' });
    return new Promise((resolve) => this.pending.set(seq, resolve));
  }

  /** Steps the local copy up to the estimated server tick. */
  private advance(): void {
    if (this.awaitingResync) return;
    const gap = this.nowTick() - this.state.tick;
    if (gap <= 0) return;
    if (gap > STEP_RESOLVE_MAX_TICKS) {
      // Far behind (background tab): ask for the resolved state instead of replaying (6.5).
      this.requestResync('stale');
      return;
    }
    const { state, events } = step(this.state, gap, this.content);
    this.setState(state);
    if (events.length > 0) this.emit(events);
  }

  private onMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'welcome':
        // Reconnected: the server resolved the gap; adopt its state.
        this.socket.seedClock(msg.serverTime);
        this.replace(mainSlot(msg));
        if (msg.offline) this.handlers.forEach((h) => h.onSummary?.(msg.offline!));
        return;
      case 'slot.started': {
        if (msg.slot !== 'main') return;
        this.replace(msg.state, msg.events);
        this.pending.get(msg.replyTo)?.(null);
        this.pending.delete(msg.replyTo);
        return;
      }
      case 'slot.checkpoint':
        if (msg.slot === 'main') this.checkpoint(msg.tick, msg.hash);
        return;
      case 'slot.resync':
        if (msg.slot !== 'main') return;
        this.awaitingResync = false;
        this.replace(msg.state);
        return;
      case 'error':
        if (msg.replyTo !== undefined && this.pending.has(msg.replyTo)) {
          const reason = (msg.details as BlockReason | undefined) ?? { code: 'unknownAction' };
          this.pending.get(msg.replyTo)?.(reason);
          this.pending.delete(msg.replyTo);
        } else {
          console.warn('server error', msg.code);
        }
        return;
      default:
        return;
    }
  }

  private checkpoint(tick: number, serverHash: string): void {
    if (this.awaitingResync) return;
    let local: SlotState | undefined;
    if (this.state.tick <= tick) {
      // Our clock is a little behind the server's: catch up to the checkpoint tick.
      const r = step(this.state, tick - this.state.tick, this.content);
      this.setState(r.state);
      if (r.events.length > 0) this.emit(r.events);
      local = r.state;
    } else {
      const base = [...this.history].reverse().find((s) => s.tick <= tick);
      if (!base) return; // Too old to compare; the next checkpoint will.
      local = step(base, tick - base.tick, this.content).state;
    }
    if (hashState(local) !== serverHash) {
      this.divergences += 1;
      this.requestResync('divergence', tick, hashState(local));
    }
  }

  private requestResync(reason: 'divergence' | 'stale', tick = this.state.tick, hash = ''): void {
    if (this.awaitingResync) return;
    if (
      this.socket.send({ type: 'slot.requestResync', slot: 'main', reason, tick, hash }) !== null
    ) {
      this.awaitingResync = true;
    }
  }

  /** Adopts an authoritative state, then catches up to now so the scene stays live. */
  private replace(state: SlotState, events: GameEvent[] = []): void {
    this.history = [];
    this.setState(state);
    if (events.length > 0) this.emit(events);
    else this.handlers.forEach((h) => h.onReset?.(state));
    this.advance();
  }

  private setState(state: SlotState): void {
    this.state = state;
    this.history.push(state);
    if (this.history.length > HISTORY) this.history.shift();
  }

  private emit(events: GameEvent[]): void {
    this.handlers.forEach((h) => h.onEvents?.(events, this.state));
  }

  private setStatus(status: SocketStatus): void {
    this.status = status;
    this.statusListeners.forEach((l) => l(status));
  }

  private onVisibility = () => {
    if (document.visibilityState === 'visible') this.advance();
  };
}

function mainSlot(welcome: Welcome): SlotState {
  const main = welcome.slots.find((s) => s.slot === 'main');
  if (!main) throw new Error('welcome without main slot');
  return main.state;
}
