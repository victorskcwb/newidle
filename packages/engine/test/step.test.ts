import { loadBundledContent } from '@valdren/content';
import { describe, expect, it } from 'vitest';
import {
  DEPOSIT_INTERVAL_TICKS,
  hashState,
  qtyOf,
  setQueue,
  skillLevel,
  skillXp,
  startAction,
  step,
  skipTo,
  stopSlot,
  xpForLevel,
  type GameEvent,
  type SlotState,
} from '../src/index.ts';
import { fixtureContent as content, fixtureState } from './fixture.ts';

function started(
  state: SlotState,
  actionId: string,
  stop: Parameters<typeof startAction>[2] = { kind: 'materials' },
) {
  const result = startAction(state, actionId, stop, content);
  if (!result.ok) throw new Error(`could not start: ${JSON.stringify(result.reason)}`);
  return result.state;
}

const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe('gathering', () => {
  it('mines one ore every 5 ticks (3,000 ms) with 2.5 XP', () => {
    const s0 = started(fixtureState(), 'mine_ore');
    const { state, events } = step(s0, 4, content);
    expect(events).toEqual([]);
    const r = step(state, 1, content);
    expect(r.events.map((e) => e.type)).toEqual(['ActionCompleted', 'ItemsGained', 'XpGained']);
    expect(r.events[0]).toMatchObject({ tick: s0.tick + 5, nextStartTick: s0.tick + 5 });
    expect(qtyOf(r.state.inventory, 'ore')).toBe(1);
    expect(skillXp(r.state, 'mining')).toBe(25);
  });

  it('levels up at the right execution', () => {
    const s0 = started(fixtureState(), 'mine_ore');
    const { events, state } = step(s0, 30 * 5, content); // 30 × 2.5 = 75 XP = level 2
    const ups = ofType(events, 'LevelUp');
    expect(ups).toEqual([{ type: 'LevelUp', tick: s0.tick + 150, skill: 'mining', level: 2 }]);
    expect(skillLevel(state, 'mining')).toBe(2);
  });

  it('requires a tool and the level', () => {
    const noTool = startAction(fixtureState([]), 'mine_ore', { kind: 'materials' }, content);
    expect(noTool).toEqual({ ok: false, reason: { code: 'missingTool', tool: 'pickaxe' } });
    const lowLevel = startAction(fixtureState(), 'mine_deep', { kind: 'materials' }, content);
    expect(lowLevel).toEqual({
      ok: false,
      reason: { code: 'levelTooLow', skill: 'mining', level: 15 },
    });
  });

  it('applies the best tool speed bonus (20% of 5 ticks rounds up to 4)', () => {
    const s0 = started(
      fixtureState([
        { itemId: 'pick', qty: 1 },
        { itemId: 'fast_pick', qty: 1 },
      ]),
      'mine_ore',
    );
    expect(s0.activity?.durationTicks).toBe(4);
  });

  it('deposits the action inventory into the bank every 500 ticks', () => {
    const s0 = started(fixtureState(), 'mine_ore');
    const { state, events } = step(s0, DEPOSIT_INTERVAL_TICKS, content);
    const deposits = ofType(events, 'InventoryDeposited');
    expect(deposits).toHaveLength(1);
    expect(deposits[0]!.items).toEqual([{ itemId: 'ore', qty: 100 }]);
    expect(state.inventory).toEqual([]);
    expect(qtyOf(state.bank, 'ore')).toBe(100);
  });
});

describe('production', () => {
  it('consumes inputs and stops when materials run out', () => {
    const bank = [
      { itemId: 'ore', qty: 3 },
      { itemId: 'tin', qty: 5 },
    ];
    const s0 = started(fixtureState(bank), 'smelt');
    expect(s0.activity?.durationTicks).toBe(4);
    const { state, events } = step(s0, 100, content);
    expect(ofType(events, 'ActionCompleted')).toHaveLength(3);
    expect(ofType(events, 'ActionCompleted').at(-1)?.nextStartTick).toBeNull();
    expect(ofType(events, 'SlotStopped')).toEqual([
      { type: 'SlotStopped', tick: s0.tick + 12, reason: 'outOfMaterials' },
    ]);
    expect(state.activity).toBeNull();
    expect(qtyOf(state.bank, 'bar')).toBe(3);
    expect(qtyOf(state.bank, 'ore')).toBe(0);
    expect(qtyOf(state.bank, 'tin')).toBe(2);
    expect(skillXp(state, 'smithing')).toBe(90);
  });

  it('refuses to start without materials and explains why', () => {
    const r = startAction(
      fixtureState([{ itemId: 'ore', qty: 1 }]),
      'smelt',
      { kind: 'materials' },
      content,
    );
    expect(r).toEqual({ ok: false, reason: { code: 'missingItem', itemId: 'tin' } });
  });
});

describe('queue and stop conditions', () => {
  it('runs entries in order: count, then materials', () => {
    let s = fixtureState();
    const q = setQueue(
      s,
      [
        { actionId: 'mine_ore', stop: { kind: 'count', count: 4 } },
        { actionId: 'mine_tin', stop: { kind: 'count', count: 2 } },
        { actionId: 'smelt', stop: { kind: 'materials' } },
      ],
      content,
    );
    if (!q.ok) throw new Error('queue rejected');
    s = q.state;
    const { state, events } = step(s, 1000, content);
    const advanced = ofType(events, 'QueueAdvanced').map((e) => [e.actionId, e.tick - s.tick]);
    expect(advanced).toEqual([
      ['mine_ore', 0],
      ['mine_tin', 20],
      ['smelt', 30],
    ]);
    expect(qtyOf(state.bank, 'bar')).toBe(2);
    expect(qtyOf(state.bank, 'ore')).toBe(2);
    expect(ofType(events, 'SlotStopped').at(-1)).toMatchObject({
      reason: 'outOfMaterials',
      tick: s.tick + 38,
    });
  });

  it('stops at a target level', () => {
    const s0 = started(fixtureState(), 'mine_ore', { kind: 'level', level: 5 });
    const { state, events } = step(s0, 100_000, content);
    expect(skillLevel(state, 'mining')).toBe(5);
    expect(skillXp(state, 'mining')).toBeLessThan(xpForLevel(5) + 25);
    expect(ofType(events, 'SlotStopped').at(-1)?.reason).toBe('queueEmpty');
  });

  it('enforces the queue length', () => {
    const entries = Array.from({ length: 4 }, () => ({
      actionId: 'mine_ore',
      stop: { kind: 'materials' } as const,
    }));
    expect(setQueue(fixtureState(), entries, content)).toEqual({
      ok: false,
      reason: { code: 'queueFull', max: 3 },
    });
  });

  it('stopSlot deposits and clears everything', () => {
    const s0 = started(fixtureState(), 'mine_ore');
    const mid = step(s0, 52, content).state;
    expect(qtyOf(mid.inventory, 'ore')).toBe(10);
    const { state, events } = stopSlot(mid);
    expect(state.activity).toBeNull();
    expect(qtyOf(state.bank, 'ore')).toBe(10);
    expect(events.at(-1)).toMatchObject({ type: 'SlotStopped', reason: 'manual' });
  });
});

describe('purity and chunking', () => {
  it('does not mutate its input', () => {
    const s0 = started(fixtureState(), 'mine_gems');
    const before = hashState(s0);
    step(s0, 5000, content);
    expect(hashState(s0)).toBe(before);
  });

  it('step(n) equals n × step(1)', () => {
    const s0 = started(fixtureState([{ itemId: 'pick', qty: 1 }]), 'mine_gems');
    const big = step(s0, 3000, content);
    let s = s0;
    const events: GameEvent[] = [];
    for (let i = 0; i < 3000; i++) {
      const r = step(s, 1, content);
      s = r.state;
      events.push(...r.events);
    }
    expect(events).toEqual(big.events);
    expect(hashState(s)).toBe(hashState(big.state));
  });
});

describe('bundled content', () => {
  it('mines copper, smelts bronze and smiths a dagger', () => {
    const real = loadBundledContent();
    let s = fixtureState([
      { itemId: 'hammer', qty: 1 },
      { itemId: 'pickaxe_bronze', qty: 1 },
    ]);
    const q = setQueue(
      s,
      [
        { actionId: 'mine_copper', stop: { kind: 'count', count: 2 } },
        { actionId: 'mine_tin', stop: { kind: 'count', count: 2 } },
        { actionId: 'smelt_bronze', stop: { kind: 'materials' } },
      ],
      real,
    );
    if (!q.ok) throw new Error('queue rejected');
    s = step(q.state, 100, real).state;
    const dagger = startAction(s, 'smith_dagger_bronze', { kind: 'count', count: 1 }, real);
    if (!dagger.ok) throw new Error('dagger rejected');
    s = step(dagger.state, 5, real).state;
    expect(qtyOf(s.bank, 'dagger_bronze')).toBe(1);
    expect(qtyOf(s.bank, 'bar_bronze')).toBe(1);
  });
});

describe('skipTo', () => {
  it('shifts the clock without progress, keeping partial progress', () => {
    const s0 = started(fixtureState(), 'mine_ore');
    const partial = step(s0, 3, content).state;
    const skipped = skipTo(partial, partial.tick + 100_000);
    expect(skipped.tick).toBe(partial.tick + 100_000);
    expect(skipped.inventory).toEqual(partial.inventory);
    const next = step(skipped, 2, content);
    expect(next.events[0]).toMatchObject({ type: 'ActionCompleted', tick: skipped.tick + 2 });
  });
});
