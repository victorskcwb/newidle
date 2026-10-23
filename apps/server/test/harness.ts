import { loadContent } from '@abismo/content';
import { IntentError, computeRates, createGame, type Intent } from '@abismo/engine';
import {
  PROTOCOL_VERSION,
  Replica,
  brasiliaDay,
  decodeServerMessage,
  encodeMessage,
  type ClientMessage,
  type ServerMessage,
} from '@abismo/protocol';
import { GameServer } from '../src/game.ts';
import { MemoryStore, type HeroStore } from '../src/store.ts';

export const content = loadContent();

/**
 * A server, a fake clock and a fake network with a fixed one-way latency. `run(ms)` moves
 * time in 50 ms steps: messages land when due, the server ticks every 100 ms and every client
 * replica follows the clock, like the browser's 50 ms pump.
 */
export class World {
  now = 1_700_000_000_000;
  readonly logs: { event: string; data?: Record<string, unknown> }[] = [];
  readonly server: GameServer;
  private inFlight: { at: number; deliver: () => void }[] = [];
  private lastTick = this.now;
  readonly clients: Client[] = [];

  constructor(readonly store: HeroStore = new MemoryStore()) {
    this.server = new GameServer({
      content,
      store: this.store,
      authenticate: async (token) => (token.startsWith('dev:') ? token.slice(4) : null),
      rates: async (state, huntId) => computeRates(state, content, huntId),
      now: () => this.now,
      dayOf: brasiliaDay,
      buildId: 'test',
      log: (event, data) => this.logs.push({ event, data }),
    });
  }

  async newHero(accountId: string, seed = 7) {
    await this.server.createHero(
      accountId,
      createGame(content, { name: accountId, seed: [seed, 1, 2, 3] }),
    );
  }

  later(ms: number, deliver: () => void) {
    this.inFlight.push({ at: this.now + ms, deliver });
  }

  async run(ms: number) {
    const end = this.now + ms;
    while (this.now < end) {
      this.now += 50;
      const due = this.inFlight.filter((m) => m.at <= this.now);
      this.inFlight = this.inFlight.filter((m) => m.at > this.now);
      for (const m of due) m.deliver();
      // Let async handlers (hello, saves) finish.
      await new Promise((r) => setImmediate(r));
      if (this.now - this.lastTick >= 100) {
        this.lastTick = this.now;
        await this.server.tick();
      }
      for (const c of this.clients) c.follow(this.now);
    }
  }

  connect(accountId: string, latencyMs = 40, buildId = 'test', token = `dev:${accountId}`) {
    const c = new Client(this, accountId, latencyMs, buildId, token);
    this.clients.push(c);
    return c;
  }
}

/** A browser stand-in: a WebSocket with latency and a Replica once welcomed. */
export class Client {
  replica: Replica | null = null;
  received: ServerMessage[] = [];
  closed = false;
  private link;

  constructor(
    private readonly world: World,
    readonly accountId: string,
    private readonly latencyMs: number,
    buildId: string,
    token: string,
  ) {
    this.link = world.server.connect({
      send: (text) => world.later(latencyMs, () => this.onFrame(text)),
      close: () => {
        this.closed = true;
        world.later(latencyMs, () => this.link.closed());
      },
    });
    this.sendRaw(
      encodeMessage({
        type: 'hello',
        protocol: PROTOCOL_VERSION,
        buildId,
        token,
      }),
    );
  }

  sendRaw(text: string) {
    if (this.closed) return;
    this.world.later(this.latencyMs, () => this.link.receive(text));
  }

  private sendMessage = (m: ClientMessage) => this.sendRaw(encodeMessage(m));

  private onFrame(text: string) {
    if (this.closed && !text.includes('"kicked"')) return;
    const m = decodeServerMessage(text);
    if (!m) throw new Error(`bad server frame: ${text.slice(0, 100)}`);
    this.received.push(m);
    if (m.type === 'welcome' && !this.replica) {
      this.replica = new Replica(content, m, this.world.now, this.sendMessage);
      return;
    }
    this.replica?.receive(m, this.world.now);
  }

  follow(now: number) {
    if (!this.closed) this.replica?.advance(now);
  }

  /** Acts like the UI: refused intents are swallowed (the UI shows the error). */
  act(intent: Intent): boolean {
    if (!this.replica) throw new Error('not welcomed yet');
    try {
      this.replica.act(intent);
      return true;
    } catch (e) {
      if (e instanceof IntentError) return false;
      throw e;
    }
  }

  disconnect() {
    this.closed = true;
    this.world.later(this.latencyMs, () => this.link.closed());
  }

  of<T extends ServerMessage['type']>(type: T) {
    return this.received.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  }
}
