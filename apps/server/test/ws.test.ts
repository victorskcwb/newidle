import { loadBundledContent } from '@valdren/content';
import { hashState, step, tickAt } from '@valdren/engine';
import { serverMessageSchema, type ClientPayload, type ServerMessage } from '@valdren/protocol';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { SESSION_COOKIE, type Services } from '../src/app.ts';
import { eventLog } from '../src/db/schema.ts';
import { findLedgerMismatches } from '../src/services/inventory.ts';
import { testApp, testDb, uniqueUser } from './helpers.ts';

const content = loadBundledContent();
const clock = { t: Date.UTC(2026, 9, 14, 12, 0, 0) };
let app: FastifyInstance;
let services: Services;
let url: string;

beforeAll(async () => {
  ({ app, services } = await testApp({ now: () => clock.t, hub: { autoCheckpoint: false } }));
  await app.listen({ port: 0, host: '127.0.0.1' });
  url = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws`;
});

afterAll(async () => {
  await app.close();
  await testDb().close();
});

async function player() {
  const u = uniqueUser();
  const reg = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: u.email, password: u.password },
  });
  const cookie = `${SESSION_COOKIE}=${reg.cookies.find((c) => c.name === SESSION_COOKIE)!.value}`;
  const res = await app.inject({
    method: 'POST',
    url: '/characters',
    headers: { cookie },
    payload: { name: u.name, appearance: { skin: 1, hair: 2, outfit: 3 } },
  });
  return { cookie, characterId: res.json<{ id: string }>().id };
}

/** Minimal test client: validates every server message and lets tests await by type. */
class Client {
  readonly ws: WebSocket;
  private seq = 0;
  private readonly inbox: ServerMessage[] = [];
  private waiters: (() => void)[] = [];
  closed: Promise<number>;

  constructor(cookie?: string) {
    this.ws = new WebSocket(url, cookie ? { headers: { cookie } } : {});
    this.ws.on('message', (data) => {
      this.inbox.push(serverMessageSchema.parse(JSON.parse(data.toString())));
      this.waiters.forEach((w) => w());
    });
    this.closed = new Promise((resolve) => this.ws.on('close', (code) => resolve(code)));
  }

  async open(): Promise<this> {
    if (this.ws.readyState !== WebSocket.OPEN) await new Promise((r) => this.ws.once('open', r));
    return this;
  }

  send(payload: ClientPayload): number {
    const seq = this.seq++;
    this.ws.send(JSON.stringify({ ...payload, seq }));
    return seq;
  }

  async next<T extends ServerMessage['type']>(
    type: T,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    for (;;) {
      const i = this.inbox.findIndex((m) => m.type === type);
      if (i >= 0) return this.inbox.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), 10_000);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
      this.waiters = [];
    }
  }

  async hello() {
    await this.open();
    this.send({ type: 'hello', clientVersion: 'test', contentHash: 'test' });
    return this.next('welcome');
  }

  close() {
    this.ws.close();
  }
}

describe('websocket session', () => {
  it('refuses connections without a session', async () => {
    const c = await new Client().open();
    c.send({ type: 'hello', clientVersion: 'test', contentHash: 'test' });
    expect(await c.closed).toBe(4001);
  });

  it('welcomes with the resolved slot state', async () => {
    const { cookie } = await player();
    const c = new Client(cookie);
    const welcome = await c.hello();
    expect(welcome.tick).toBe(tickAt(clock.t));
    expect(welcome.offline).toBeNull();
    const main = welcome.slots[0]!;
    expect(main.slot).toBe('main');
    expect(main.state.activity).toBeNull();
    expect(main.state.bank).toEqual([
      { itemId: 'hammer', qty: 1 },
      { itemId: 'pickaxe_bronze', qty: 1 },
    ]);
    expect(main.state.skills).toHaveLength(21);
    c.close();
  });

  it('runs an intent, and the server checkpoint matches the client simulation exactly', async () => {
    const { cookie, characterId } = await player();
    const c = new Client(cookie);
    await c.hello();
    const seq = c.send({
      type: 'intent.startAction',
      slot: 'main',
      actionId: 'mine_copper',
      stop: { kind: 'materials' },
    });
    const started = await c.next('slot.started');
    expect(started.replyTo).toBe(seq);
    expect(started.events[0]).toMatchObject({
      type: 'QueueAdvanced',
      actionId: 'mine_copper',
      durationTicks: 5,
    });

    // 30 s later the server checkpoints; the client steps its own copy of the state.
    clock.t += 30_000;
    await services.hub.checkpointDue();
    const cp = await c.next('slot.checkpoint');
    expect(cp.tick).toBe(started.tick + 50);
    const client = step(started.state, cp.tick - started.tick, content).state;
    expect(cp.hash).toBe(hashState(client));
    expect(cp.skills.find((s) => s.skill === 'mining')?.xpTenths).toBe(10 * 25);
    expect(await findLedgerMismatches(testDb().db, characterId)).toEqual([]);
    c.close();
  });

  it('stays in sync for a 1-hour session: 120 checkpoints, no divergence', async () => {
    const { cookie, characterId } = await player();
    const c = new Client(cookie);
    await c.hello();
    c.send({
      type: 'intent.setQueue',
      slot: 'main',
      entries: [
        { actionId: 'mine_tin', stop: { kind: 'count', count: 300 } },
        { actionId: 'smelt_bronze', stop: { kind: 'materials' } },
      ],
    });
    await c.next('slot.started');
    c.send({
      type: 'intent.startAction',
      slot: 'main',
      actionId: 'mine_copper',
      stop: { kind: 'count', count: 250 },
    });
    let client = (await c.next('slot.started')).state;
    for (let i = 0; i < 120; i++) {
      clock.t += 30_000;
      await services.hub.checkpointDue();
      const cp = await c.next('slot.checkpoint');
      client = step(client, cp.tick - client.tick, content).state;
      expect(cp.hash, `checkpoint ${i}`).toBe(hashState(client));
    }
    // Mining, deposits, queue advance and smelting all happened within the hour.
    expect(client.bank).toContainEqual({ itemId: 'bar_bronze', qty: 250 });
    expect(await findLedgerMismatches(testDb().db, characterId)).toEqual([]);
    c.close();
  });

  it('explains blocked intents', async () => {
    const { cookie } = await player();
    const c = new Client(cookie);
    await c.hello();
    const seq = c.send({
      type: 'intent.startAction',
      slot: 'main',
      actionId: 'smelt_bronze',
      stop: { kind: 'materials' },
    });
    const err = await c.next('error');
    expect(err).toMatchObject({
      code: 'actionBlocked',
      messageKey: 'error.actionBlocked',
      replyTo: seq,
      details: { code: 'missingItem', itemId: 'ore_copper' },
    });
    c.close();
  });

  it('resolves time away on reconnect and returns the offline summary', async () => {
    const { cookie, characterId } = await player();
    const first = new Client(cookie);
    await first.hello();
    first.send({
      type: 'intent.startAction',
      slot: 'main',
      actionId: 'mine_tin',
      stop: { kind: 'materials' },
    });
    const started = await first.next('slot.started');
    first.close();
    await first.closed;

    clock.t += 2 * 3_600_000;
    const second = new Client(cookie);
    const welcome = await second.hello();
    const ticks = welcome.tick - started.tick;
    expect(ticks).toBe(12_000);
    expect(welcome.offline).toMatchObject({
      ticks,
      executions: [{ actionId: 'mine_tin', count: 2_400 }],
      gained: [{ itemId: 'ore_tin', qty: 2_400 }],
      stopped: null,
    });
    expect(welcome.slots[0]!.state.bank).toContainEqual({ itemId: 'ore_tin', qty: 2_400 });
    const bank = await app.inject({ method: 'GET', url: '/bank', headers: { cookie } });
    expect(bank.json().items).toContainEqual({ itemId: 'ore_tin', qty: 2_400 });
    expect(await findLedgerMismatches(testDb().db, characterId)).toEqual([]);
    second.close();
  });

  it('caps offline progress at 12 hours', async () => {
    const { cookie } = await player();
    const first = new Client(cookie);
    await first.hello();
    first.send({
      type: 'intent.startAction',
      slot: 'main',
      actionId: 'mine_copper',
      stop: { kind: 'materials' },
    });
    await first.next('slot.started');
    first.close();
    await first.closed;
    clock.t += 30 * 3_600_000;
    const welcome = await new Client(cookie).hello();
    expect(welcome.offline?.ticks).toBe(72_000);
    expect(welcome.offline?.gained).toEqual([{ itemId: 'ore_copper', qty: 14_400 }]);
  });

  it('pushes a resync when the bank changes outside the slot', async () => {
    const { cookie } = await player();
    const c = new Client(cookie);
    await c.hello();
    await app.inject({
      method: 'POST',
      url: '/bank/sell-to-shop',
      headers: { cookie },
      payload: { itemId: 'hammer', qty: 1 },
    });
    const resync = await c.next('slot.resync');
    expect(resync.reason).toBe('external');
    expect(resync.state.bank).toEqual([{ itemId: 'pickaxe_bronze', qty: 1 }]);
    c.close();
  });

  it('logs divergences and resyncs', async () => {
    const { cookie, characterId } = await player();
    const c = new Client(cookie);
    const welcome = await c.hello();
    c.send({
      type: 'slot.requestResync',
      slot: 'main',
      reason: 'stale',
      tick: welcome.tick,
      hash: '',
    });
    expect((await c.next('slot.resync')).reason).toBe('requested');
    c.send({
      type: 'slot.requestResync',
      slot: 'main',
      reason: 'divergence',
      tick: welcome.tick,
      hash: 'deadbeef',
    });
    expect((await c.next('slot.resync')).reason).toBe('divergence');
    const logged = await testDb()
      .db.select()
      .from(eventLog)
      .where(eq(eventLog.characterId, characterId));
    expect(logged.map((e) => e.type)).toContain('slot.divergence');
    c.close();
  });

  it('disconnects clients that send more than 10 intents per second', async () => {
    const { cookie } = await player();
    const c = new Client(cookie);
    await c.hello();
    for (let i = 0; i < 12; i++) c.send({ type: 'intent.stop', slot: 'main' });
    expect(await c.closed).toBe(4008);
  });

  it('rejects malformed messages without dropping the connection', async () => {
    const { cookie } = await player();
    const c = new Client(cookie);
    await c.hello();
    c.ws.send('{"type":"intent.giveMeGold","seq":5}');
    expect((await c.next('error')).code).toBe('validation');
    c.send({ type: 'ping', clientTime: 1 });
    expect((await c.next('pong')).serverTime).toBe(clock.t);
    c.close();
  });
});
