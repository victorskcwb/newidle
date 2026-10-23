import { TICKS_PER_HOUR, hashState, stepQuiet, type Intent } from '@abismo/engine';
import { CHECKPOINT_TICKS, PROTOCOL_VERSION, encodeMessage } from '@abismo/protocol';
import { describe, expect, it } from 'vitest';
import { brasiliaDay } from '@abismo/protocol';
import type { MemoryStore } from '../src/store.ts';
import { World, content } from './harness.ts';

const HUNT: Intent = { type: 'start_hunt', huntId: 'forgotten_cemetery' };

describe('game server', () => {
  it('a client replica stays in step with the server through intents and checkpoints', async () => {
    const w = new World();
    await w.newHero('ana');
    const c = w.connect('ana');
    await w.run(500);
    expect(c.of('welcome')).toHaveLength(1);
    expect(c.act(HUNT)).toBe(true);
    // Ten minutes of hunting with the player fiddling with settings now and then.
    const fiddles: Intent[] = [
      { type: 'set_hunt_behaviour', targetPriority: 'weakest', autoSellUpTo: null },
      { type: 'set_auto_allocate', profile: 'vitality' },
      { type: 'learn_skill', skillId: 'heavy_strike' },
      { type: 'equip_best' },
      { type: 'set_hunt_behaviour', targetPriority: 'first', autoSellUpTo: 'common' },
    ];
    for (let minute = 0; minute < 10; minute++) {
      c.act(fiddles[minute % fiddles.length]!);
      await w.run(60_000);
    }
    // One checkpoint every 2 minutes, on this hero's phase.
    expect(c.of('checkpoint').length).toBeGreaterThanOrEqual(4);
    expect(c.replica!.stats).toMatchObject({ resyncs: 0, lateIntents: 0, checkpointMismatches: 0 });
    // Every checkpoint after the first was compared, not skipped.
    expect(c.replica!.stats.checkpointsVerified).toBeGreaterThanOrEqual(
      c.of('checkpoint').length - 1,
    );
    expect(c.of('reject')).toEqual([]);
    expect(w.server.stateOf('ana')!.lifetime.kills).toBeGreaterThan(0n);
  });

  it('an intent that arrives late is applied now and the client resyncs to the server', async () => {
    const w = new World();
    await w.newHero('bia');
    // 800 ms one way: more than the 500 ms lead, so every intent lands after its tick.
    const c = w.connect('bia', 800);
    await w.run(2_000);
    c.act(HUNT);
    await w.run(5_000);
    expect(c.replica!.stats.lateIntents).toBe(1);
    expect(c.of('state')).toHaveLength(1);
    await w.run(CHECKPOINT_TICKS * 100 * 2);
    // After the resync the replica agrees with the server again.
    expect(c.replica!.stats.checkpointMismatches).toBe(0);
    expect(c.replica!.state.hunt?.huntId).toBe('forgotten_cemetery');
  });

  it('a second device takes over: the first is kicked and nothing is lost', async () => {
    const w = new World();
    await w.newHero('caio');
    const phone = w.connect('caio');
    await w.run(500);
    phone.act(HUNT);
    await w.run(120_000);
    const kills = w.server.stateOf('caio')!.lifetime.kills;
    const pc = w.connect('caio');
    await w.run(1_000);
    expect(phone.of('kicked')).toEqual([{ type: 'kicked', reason: 'other_session' }]);
    expect(pc.of('welcome')).toHaveLength(1);
    expect(pc.replica!.state.lifetime.kills).toBeGreaterThanOrEqual(kills);
    expect(pc.replica!.state.hunt?.huntId).toBe('forgotten_cemetery');
    await w.run(60_000);
    expect(pc.replica!.stats.checkpointMismatches).toBe(0);
    expect(w.server.online).toBe(1);
  });

  it('closing the game saves; two hours later the time away is resolved by the server clock', async () => {
    const w = new World();
    await w.newHero('davi');
    const c = w.connect('davi');
    await w.run(500);
    c.act(HUNT);
    await w.run(30_000);
    c.disconnect();
    await w.run(500);
    expect(w.server.online).toBe(0);
    const saved = (w.store as MemoryStore).heroes.get('davi')!;
    w.now += 2 * 60 * 60 * 1000;
    const back = w.connect('davi');
    await w.run(3_000);
    const welcome = back.of('welcome')[0]!;
    expect(welcome.offlineReport).not.toBeNull();
    expect(welcome.offlineReport!.kills).toBeGreaterThan(0);
    expect(welcome.clock.tick).toBeGreaterThanOrEqual(2 * TICKS_PER_HOUR);
    expect(welcome.clock.atMs - saved.savedAtMs).toBeGreaterThanOrEqual(2 * 60 * 60 * 1000);
  });

  it('a resent intent is applied once', async () => {
    const w = new World();
    await w.newHero('eva');
    const c = w.connect('eva');
    await w.run(500);
    const gold = w.server.stateOf('eva')!.gold;
    w.server.stateOf('eva')!.gold = gold + 1_000n;
    await w.run(200);
    const frame = encodeMessage({
      type: 'intent',
      seq: 1,
      atTick: c.replica!.state.tick,
      intent: { type: 'buy', consumableId: 'potion_hp_small', qty: 10 },
    });
    c.sendRaw(frame);
    c.sendRaw(frame);
    await w.run(1_000);
    expect(w.server.stateOf('eva')!.consumables['potion_hp_small']).toBe(20);
    expect(c.of('ack').filter((a) => a.seq === 1).length).toBeGreaterThanOrEqual(1);
  });

  it('refuses intents too far ahead, for another day, or too many at once', async () => {
    const w = new World();
    await w.newHero('fabio');
    const c = w.connect('fabio');
    await w.run(500);
    const tick = c.replica!.state.tick;
    let seq = 100;
    const send = (atTick: number, intent: Intent) =>
      c.sendRaw(encodeMessage({ type: 'intent', seq: seq++, atTick, intent }));
    send(tick + 10_000, HUNT);
    send(tick, { type: 'claim_login', day: brasiliaDay(w.now) - 1 });
    for (let i = 0; i < 60; i++) send(tick + 3, { type: 'set_flag', flag: `f${i}` });
    await w.run(1_000);
    const codes = c.of('reject').map((r) => r.code);
    expect(codes).toContain('too_early');
    expect(codes).toContain('bad_day');
    expect(codes).toContain('rate_limited');
    expect(w.server.stateOf('fabio')!.flags.length).toBeLessThanOrEqual(40);
  });

  it('garbage, a wrong build or a bad token close the connection', async () => {
    const w = new World();
    await w.newHero('gil');
    const noisy = w.connect('gil');
    await w.run(500);
    for (const junk of ['nope', '{"type":"hello"}', '{"type":"resync","state":{}}']) {
      noisy.sendRaw(junk);
    }
    await w.run(500);
    expect(noisy.of('kicked')).toEqual([{ type: 'kicked', reason: 'protocol' }]);

    const old = w.connect('gil', 40, 'an-old-build');
    const stranger = w.connect('nobody', 40, 'test', 'not-a-token');
    const heroless = w.connect('nobody');
    await w.run(500);
    expect(old.of('kicked')).toEqual([{ type: 'kicked', reason: 'reload' }]);
    expect(stranger.of('kicked')).toEqual([{ type: 'kicked', reason: 'auth' }]);
    expect(heroless.of('kicked')).toEqual([{ type: 'kicked', reason: 'no_hero' }]);
    expect(
      encodeMessage({ type: 'hello', protocol: PROTOCOL_VERSION, buildId: 'test', token: 'x' }),
    ).toContain('hello');
  });

  it('server and replica reach the same state hash after an hour of play', async () => {
    const w = new World();
    await w.newHero('hugo', 99);
    const c = w.connect('hugo');
    await w.run(500);
    c.act(HUNT);
    await w.run(60 * 60 * 1000);
    const server = w.server.stateOf('hugo')!;
    expect(c.replica!.stats.checkpointMismatches).toBe(0);
    expect(c.replica!.stats.resyncs).toBe(0);
    expect(c.replica!.stats.checkpointsVerified).toBeGreaterThanOrEqual(29);
    // The replica runs CLIENT_LEAD_TICKS ahead; stepping a copy of the server there matches it.
    const ahead = structuredClone(server);
    stepQuiet(ahead, content, c.replica!.state.tick - ahead.tick);
    expect(hashState(c.replica!.state)).toBe(hashState(ahead));
  }, 120_000);

  it('a new hero gets a server seed and starts on the way to the first hunt', async () => {
    const w = new World();
    const choice = { name: 'Lia', appearance: { hair: 1, outfit: 2 } };
    expect(await w.server.newHero('ivo', choice)).toBe('created');
    expect(await w.server.newHero('ivo', choice)).toBe('exists');
    expect(await w.server.newHero('jade', choice)).toBe('created');
    const c = w.connect('ivo');
    await w.run(500);
    const state = c.replica!.state;
    expect(state.hero.name).toBe('Lia');
    expect(state.hunt?.huntId).toBe('forgotten_cemetery');
    const seeds = ['ivo', 'jade'].map(
      (id) => (w.store as MemoryStore).heroes.get(id)!.save.match(/"rng":\[[^\]]*\]/)![0],
    );
    expect(seeds[0]).not.toBe(seeds[1]);
  });

  it('closes sockets that never say hello', async () => {
    const w = new World();
    const silent: string[] = [];
    let closed = false;
    w.server.connect({ send: (t) => silent.push(t), close: () => (closed = true) });
    await w.run(9_000);
    expect(closed).toBe(false);
    await w.run(2_000);
    expect(closed).toBe(true);
    expect(silent.join()).toContain('"protocol"');
  });
});
