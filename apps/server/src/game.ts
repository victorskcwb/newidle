import { randomBytes, randomUUID } from 'node:crypto';
import type { ContentDb } from '@abismo/content';
import {
  IntentError,
  OFFLINE_AFTER_TICKS,
  SAVE_VERSION,
  TICK_MS,
  advanceAway,
  applyIntent,
  createGame,
  decodeSave,
  encodeSave,
  hashState,
  rarityRank,
  step,
  type GameEvent,
  type GameState,
  type Intent,
  type OfflineReport,
  type RateSheet,
} from '@abismo/engine';
import {
  CHECKPOINT_TICKS,
  CONTENT_VERSION,
  MAX_LEAD_TICKS,
  PROTOCOL_VERSION,
  decodeClientMessage,
  encodeMessage,
  tickAt,
  type ClientMessage,
  type NewHeroChoice,
  type ServerMessage,
} from '@abismo/protocol';
import type { HeroRecord, HeroStore } from './store.ts';

/** One open WebSocket, as the game server sees it. */
export interface Connection {
  send(text: string): void;
  close(): void;
}

export interface GameServerDeps {
  content: ContentDb;
  store: HeroStore;
  /** The account a session token belongs to, or null. */
  authenticate(token: string): Promise<string | null>;
  /** A rate sheet off the main thread (computing one takes ~1.5 s). */
  rates(state: GameState, huntId: string): Promise<RateSheet>;
  /** Server wall clock in ms. */
  now(): number;
  /** The day number intents that depend on the day must carry (decision 176). */
  dayOf(ms: number): number;
  /** Engine and content build; clients with another one are asked to reload. */
  buildId: string;
  log?(event: string, data?: Record<string, unknown>): void;
}

/** What the store keeps of a state whose tick ran at `atMs`. */
function heroRecord(state: GameState, atMs: number): HeroRecord {
  return {
    save: encodeSave(state, atMs),
    savedAtMs: atMs,
    name: state.hero.name,
    tick: state.tick,
    saveVersion: SAVE_VERSION,
  };
}

/** Save after an intent once things settle, and at least this often while playing. */
const SAVE_DEBOUNCE_MS = 1_000;
const SAVE_EVERY_MS = 60_000;
/** Intents per second a connection may send, and the burst it may save up. */
const RATE_PER_SECOND = 20;
const RATE_BURST = 40;
/** Invalid frames in a row before the connection is dropped. */
const MAX_BAD_FRAMES = 3;
/** How many applied seqs are remembered to answer resent intents. */
const APPLIED_MEMORY = 200;
const DAY_INTENTS = new Set<Intent['type']>(['claim_login', 'refresh_quests']);

interface Scheduled {
  seq: number;
  atTick: number;
  intent: Intent;
}

/** Whether an event is worth saving the hero right away (level, rare drop, reset…). */
function important(e: GameEvent): boolean {
  if (e.type === 'LevelUp' || e.type === 'AutoReset' || e.type === 'PetFound') return true;
  if (e.type === 'ItemDropped') return rarityRank(e.item.rarity) >= rarityRank('epic');
  return false;
}

/** A hero in play: its authoritative state, its clock and the intents waiting for their tick. */
class Session {
  conn: Connection;
  clock: { tick: number; atMs: number };
  queue: Scheduled[] = [];
  lastSeq = 0;
  applied = new Map<number, number>();
  dirtySinceMs: number | null = null;
  lastSaveMs: number;
  tokens = RATE_BURST;
  tokensAtMs: number;

  constructor(
    readonly accountId: string,
    /** Owner id in the store: a newer session elsewhere makes this one's saves fail. */
    readonly sessionId: string,
    public state: GameState,
    conn: Connection,
    nowMs: number,
  ) {
    this.conn = conn;
    this.clock = { tick: state.tick, atMs: nowMs };
    this.lastSaveMs = nowMs;
    this.tokensAtMs = nowMs;
  }

  /** Server wall time at which the state's current tick runs. */
  stateTimeMs(): number {
    return this.clock.atMs + (this.state.tick - this.clock.tick) * TICK_MS;
  }

  takeToken(nowMs: number): boolean {
    this.tokens = Math.min(
      RATE_BURST,
      this.tokens + ((nowMs - this.tokensAtMs) / 1000) * RATE_PER_SECOND,
    );
    this.tokensAtMs = nowMs;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Per connection: waiting for its hello, or bound to an account's session. */
interface Link {
  conn: Connection;
  accountId: string | null;
  badFrames: number;
  closed: boolean;
}

/**
 * The authoritative game (decision 173): one session per account, stepped by the server's
 * clock; intents applied at the tick the client chose (or now, if late); a state hash every
 * 30 s; the time away resolved at login. Transport-free, so tests drive it with a fake clock.
 */
export class GameServer {
  private sessions = new Map<string, Session>();
  /** Logins in progress per account, so two hellos for one account never interleave. */
  private opening = new Map<string, Promise<void>>();

  constructor(private readonly deps: GameServerDeps) {}

  /** Number of heroes in play (for the load test and health checks). */
  get online(): number {
    return this.sessions.size;
  }

  /** The live state of an account's hero (tests and admin tools). */
  stateOf(accountId: string): GameState | undefined {
    return this.sessions.get(accountId)?.state;
  }

  /** Binds a new connection; feed it the frames it receives and tell it when it closes. */
  connect(conn: Connection) {
    const link: Link = { conn, accountId: null, badFrames: 0, closed: false };
    return {
      receive: (text: string) => this.receive(link, text),
      closed: () => this.disconnect(link),
    };
  }

  /** Advances every session to the server clock (called every 100 ms). */
  async tick() {
    const now = this.deps.now();
    const saves: Promise<void>[] = [];
    for (const s of this.sessions.values()) {
      if (this.advance(s, now)) saves.push(this.save(s, now));
      else if (
        (s.dirtySinceMs !== null && now - s.dirtySinceMs >= SAVE_DEBOUNCE_MS) ||
        now - s.lastSaveMs >= SAVE_EVERY_MS
      ) {
        saves.push(this.save(s, now));
      }
    }
    await Promise.all(saves);
  }

  /** Saves everyone (shutdown). */
  async saveAll() {
    const now = this.deps.now();
    await Promise.all(
      [...this.sessions.values()].map((s) => {
        this.advance(s, now);
        return this.save(s, now);
      }),
    );
  }

  /** Stores a hero as the account's (tests, imports); false when the account has one. */
  async createHero(
    accountId: string,
    state: GameState,
    origin: 'new' | 'imported' = 'new',
  ): Promise<boolean> {
    return this.deps.store.create(accountId, heroRecord(state, this.deps.now()), origin);
  }

  /**
   * A brand-new hero for an account that has none: level 1, a seed from the server's
   * randomness, already on the way to the first hunt (like the local game's creation).
   */
  async newHero(accountId: string, choice: NewHeroChoice): Promise<'created' | 'exists'> {
    const words = new Uint32Array(randomBytes(16).buffer.slice(0, 16));
    const state = createGame(this.deps.content, {
      ...choice,
      seed: [words[0]!, words[1]!, words[2]!, words[3]!],
    });
    const first = [...this.deps.content.hunts.values()].find((h) => h.startUnlocked);
    if (first) applyIntent(state, this.deps.content, { type: 'start_hunt', huntId: first.id });
    if (!(await this.createHero(accountId, state))) return 'exists';
    this.deps.log?.('hero_created', { accountId });
    return 'created';
  }

  // --- Messages --------------------------------------------------------------------------------

  private send(conn: Connection, message: ServerMessage) {
    conn.send(encodeMessage(message));
  }

  private kick(conn: Connection, reason: Extract<ServerMessage, { type: 'kicked' }>['reason']) {
    this.send(conn, { type: 'kicked', reason });
    conn.close();
  }

  private receive(link: Link, text: string) {
    if (link.closed) return;
    const message = decodeClientMessage(text);
    if (!message) {
      link.badFrames++;
      this.deps.log?.('bad_frame', { accountId: link.accountId });
      if (link.badFrames >= MAX_BAD_FRAMES) this.kick(link.conn, 'protocol');
      return;
    }
    link.badFrames = 0;
    if (message.type === 'ping') {
      this.send(link.conn, { type: 'pong', t: message.t, serverNow: this.deps.now() });
      return;
    }
    if (message.type === 'hello') {
      if (link.accountId !== null) return;
      void this.hello(link, message);
      return;
    }
    const session = link.accountId ? this.sessions.get(link.accountId) : undefined;
    if (!session || session.conn !== link.conn) return;
    if (message.type === 'resync') this.sendState(session);
    else this.intent(session, message);
  }

  private async hello(link: Link, m: Extract<ClientMessage, { type: 'hello' }>) {
    if (m.protocol !== PROTOCOL_VERSION) return this.kick(link.conn, 'protocol');
    if (m.buildId !== this.deps.buildId) return this.kick(link.conn, 'reload');
    const accountId = await this.deps.authenticate(m.token);
    if (link.closed) return;
    if (!accountId) return this.kick(link.conn, 'auth');
    link.accountId = accountId;
    const previous = this.opening.get(accountId) ?? Promise.resolve();
    const opening = previous.then(() => this.open(link, accountId));
    this.opening.set(accountId, opening);
    try {
      await opening;
    } finally {
      if (this.opening.get(accountId) === opening) this.opening.delete(accountId);
    }
  }

  /** Takes over the account's session, or loads the hero and resolves its time away. */
  private async open(link: Link, accountId: string) {
    if (link.closed) return;
    const now = this.deps.now();
    const live = this.sessions.get(accountId);
    if (live) {
      // A second device: the first one leaves, the hero carries on from where it is.
      this.advance(live, now);
      await this.save(live, now);
      const old = live.conn;
      live.conn = link.conn;
      live.queue = [];
      this.kick(old, 'other_session');
      this.deps.log?.('session_taken_over', { accountId });
      this.welcome(live, null);
      return;
    }
    const sessionId = randomUUID();
    const stored = await this.deps.store.claim(accountId, sessionId);
    if (!stored) return this.kick(link.conn, 'no_hero');
    if (link.closed) return this.deps.store.release(accountId, sessionId);
    const state = decodeSave(stored.save, this.deps.content).state;
    const away = Math.max(0, Math.floor((now - stored.savedAtMs) / TICK_MS));
    let rates: RateSheet | null = null;
    if (away >= OFFLINE_AFTER_TICKS && state.hunt && state.activity.kind !== 'idle_town') {
      rates = await this.deps.rates(state, state.hunt.huntId);
    }
    if (link.closed) return this.deps.store.release(accountId, sessionId);
    const report = advanceAway(state, this.deps.content, away, rates);
    const session = new Session(accountId, sessionId, state, link.conn, this.deps.now());
    this.sessions.set(accountId, session);
    await this.save(session, session.clock.atMs);
    this.deps.log?.('session_opened', { accountId, awayTicks: away });
    this.welcome(session, report);
  }

  private welcome(s: Session, report: OfflineReport | null) {
    this.send(s.conn, {
      type: 'welcome',
      serverNow: this.deps.now(),
      clock: { tick: s.state.tick, atMs: s.stateTimeMs() },
      save: encodeSave(s.state, s.stateTimeMs()),
      lastSeq: s.lastSeq,
      offlineReport: report,
      contentVersion: CONTENT_VERSION,
    });
  }

  private sendState(s: Session) {
    this.send(s.conn, {
      type: 'state',
      clock: { tick: s.state.tick, atMs: s.stateTimeMs() },
      save: encodeSave(s.state, s.stateTimeMs()),
      lastSeq: s.lastSeq,
    });
  }

  private intent(s: Session, m: Extract<ClientMessage, { type: 'intent' }>) {
    const now = this.deps.now();
    if (m.seq <= s.lastSeq || s.queue.some((q) => q.seq === m.seq)) {
      // Resent after a reconnection: answer again, never apply twice.
      const appliedAt = s.applied.get(m.seq);
      if (appliedAt !== undefined) this.send(s.conn, { type: 'ack', seq: m.seq, appliedAt });
      return;
    }
    const reject = (code: string) => {
      s.lastSeq = Math.max(s.lastSeq, m.seq);
      this.send(s.conn, { type: 'reject', seq: m.seq, code });
      this.deps.log?.('intent_rejected', { accountId: s.accountId, type: m.intent.type, code });
    };
    if (!s.takeToken(now)) return reject('rate_limited');
    const serverTick = tickAt(s.clock, now);
    if (m.atTick > serverTick + MAX_LEAD_TICKS) return reject('too_early');
    if (DAY_INTENTS.has(m.intent.type) && 'day' in m.intent) {
      if (m.intent.day !== this.deps.dayOf(now)) return reject('bad_day');
    }
    const atTick = Math.max(m.atTick, s.state.tick);
    s.queue.push({ seq: m.seq, atTick, intent: m.intent });
    s.queue.sort((a, b) => a.atTick - b.atTick || a.seq - b.seq);
  }

  /** Applies the intents due at the state's current tick, in order. */
  private applyDue(s: Session) {
    while (s.queue.length > 0 && s.queue[0]!.atTick <= s.state.tick) {
      const q = s.queue.shift()!;
      s.lastSeq = Math.max(s.lastSeq, q.seq);
      try {
        applyIntent(s.state, this.deps.content, q.intent);
        s.applied.set(q.seq, s.state.tick);
        if (s.applied.size > APPLIED_MEMORY) s.applied.delete(s.applied.keys().next().value!);
        this.send(s.conn, { type: 'ack', seq: q.seq, appliedAt: s.state.tick });
      } catch (e) {
        const code = e instanceof IntentError ? e.code : 'internal';
        if (!(e instanceof IntentError)) this.deps.log?.('intent_crashed', { error: String(e) });
        this.send(s.conn, { type: 'reject', seq: q.seq, code });
      }
      s.dirtySinceMs ??= this.deps.now();
    }
  }

  /**
   * Steps a session up to the server clock. Intents of a tick are applied before that tick
   * runs, and the checkpoint hash of a tick is taken after its intents. Returns true when an
   * important event asks for an immediate save.
   */
  private advance(s: Session, nowMs: number): boolean {
    const target = tickAt(s.clock, nowMs);
    let saveNow = false;
    while (s.state.tick < target) {
      this.applyDue(s);
      if (s.state.tick % CHECKPOINT_TICKS === 0) {
        this.send(s.conn, { type: 'checkpoint', tick: s.state.tick, hash: hashState(s.state) });
      }
      const nextCheckpoint = (Math.floor(s.state.tick / CHECKPOINT_TICKS) + 1) * CHECKPOINT_TICKS;
      const nextIntent = s.queue[0]?.atTick ?? Infinity;
      const stop = Math.min(target, nextCheckpoint, Math.max(s.state.tick + 1, nextIntent));
      for (const e of step(s.state, this.deps.content, stop - s.state.tick)) {
        if (important(e)) saveNow = true;
      }
    }
    return saveNow;
  }

  /** Saves a session; if another session (another process) took the hero over, this one ends. */
  private async save(s: Session, nowMs: number) {
    s.dirtySinceMs = null;
    s.lastSaveMs = nowMs;
    const saved = await this.deps.store.save(
      s.accountId,
      s.sessionId,
      heroRecord(s.state, s.stateTimeMs()),
    );
    if (saved || this.sessions.get(s.accountId) !== s) return;
    this.sessions.delete(s.accountId);
    this.kick(s.conn, 'other_session');
    this.deps.log?.('session_lost', { accountId: s.accountId });
  }

  private async disconnect(link: Link) {
    if (link.closed) return;
    link.closed = true;
    const s = link.accountId ? this.sessions.get(link.accountId) : undefined;
    if (!s || s.conn !== link.conn) return;
    this.advance(s, this.deps.now());
    await this.save(s, this.deps.now());
    this.sessions.delete(s.accountId);
    await this.deps.store.release(s.accountId, s.sessionId);
    this.deps.log?.('session_closed', { accountId: s.accountId });
  }
}
