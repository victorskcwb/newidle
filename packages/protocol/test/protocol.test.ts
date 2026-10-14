import { resolveOffline, setQueue, step } from '@valdren/engine';
import { fixtureContent, fixtureState } from '@valdren/engine/testing';
import { describe, expect, it } from 'vitest';
import {
  clientMessageSchema,
  gameEventSchema,
  offlineSummarySchema,
  serverMessageSchema,
  slotStateSchema,
} from '../src/index.ts';

function busyState() {
  const q = setQueue(
    fixtureState([
      { itemId: 'ore', qty: 50 },
      { itemId: 'pick', qty: 1 },
    ]),
    [
      { actionId: 'mine_tin', stop: { kind: 'count', count: 40 } },
      { actionId: 'smelt', stop: { kind: 'materials' } },
      { actionId: 'mine_gems', stop: { kind: 'level', level: 30 } },
    ],
    fixtureContent,
  );
  if (!q.ok) throw new Error('queue rejected');
  return q.state;
}

describe('engine data round-trips through the schemas', () => {
  it('slot states and every event type of a long run', () => {
    const { state, events } = step(busyState(), 5_000, fixtureContent);
    expect(slotStateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state);
    const types = new Set<string>();
    for (const e of events) {
      expect(gameEventSchema.parse(e)).toEqual(e);
      types.add(e.type);
    }
    expect(types.size).toBeGreaterThanOrEqual(6);
  });

  it('offline summaries', () => {
    const { summary } = resolveOffline(busyState(), 50_000, fixtureContent);
    expect(offlineSummarySchema.parse(summary)).toEqual(summary);
  });
});

describe('message validation', () => {
  it('accepts valid intents', () => {
    expect(
      clientMessageSchema.parse({
        seq: 3,
        type: 'intent.startAction',
        slot: 'main',
        actionId: 'mine_copper',
        stop: { kind: 'count', count: 10 },
      }).type,
    ).toBe('intent.startAction');
    expect(
      clientMessageSchema.parse({ seq: 0, type: 'hello', clientVersion: '0.1', contentHash: 'x' })
        .type,
    ).toBe('hello');
  });

  it('rejects unknown types, extra fields and bad values', () => {
    const bad = [
      { seq: 1, type: 'intent.giveMeGold' },
      { seq: 1, type: 'intent.stop', slot: 'main', extra: true },
      { seq: 1, type: 'intent.stop', slot: 'third' },
      { seq: -1, type: 'intent.stop', slot: 'main' },
      {
        seq: 1,
        type: 'intent.startAction',
        slot: 'main',
        actionId: 'a',
        stop: { kind: 'count', count: 0 },
      },
      {
        seq: 1,
        type: 'intent.setQueue',
        slot: 'main',
        entries: Array(17).fill({ actionId: 'a', stop: { kind: 'materials' } }),
      },
    ];
    for (const msg of bad)
      expect(clientMessageSchema.safeParse(msg).success, JSON.stringify(msg)).toBe(false);
  });

  it('validates server messages', () => {
    const state = busyState();
    expect(
      serverMessageSchema.parse({
        seq: 1,
        type: 'slot.resync',
        slot: 'main',
        state,
        reason: 'external',
      }).type,
    ).toBe('slot.resync');
    expect(serverMessageSchema.safeParse({ seq: 1, type: 'error', code: 'x' }).success).toBe(false);
  });
});
