import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addItem,
  qtyOf,
  resolveOffline,
  setQueue,
  startAction,
  step,
  stopSlot,
  type ItemStack,
  type SlotState,
  type StopCondition,
} from '../src/index.ts';
import { fixtureContent as content, fixtureState } from './fixture.ts';

const actionIds = ['mine_ore', 'mine_tin', 'mine_gems', 'mine_deep', 'smelt'] as const;

const stopArb: fc.Arbitrary<StopCondition> = fc.oneof(
  fc.record({ kind: fc.constant('count' as const), count: fc.integer({ min: 1, max: 50 }) }),
  fc.constant({ kind: 'materials' as const }),
  fc.record({ kind: fc.constant('level' as const), level: fc.integer({ min: 2, max: 12 }) }),
);

const commandArb = fc.oneof(
  fc.record({
    kind: fc.constant('start' as const),
    actionId: fc.constantFrom(...actionIds),
    stop: stopArb,
  }),
  fc.record({
    kind: fc.constant('queue' as const),
    entries: fc.array(fc.record({ actionId: fc.constantFrom(...actionIds), stop: stopArb }), {
      maxLength: 3,
    }),
  }),
  fc.record({ kind: fc.constant('step' as const), ticks: fc.integer({ min: 0, max: 400 }) }),
  fc.record({ kind: fc.constant('offline' as const), ticks: fc.integer({ min: 0, max: 5000 }) }),
  fc.constant({ kind: 'stop' as const }),
);

const bankArb = fc.record({
  ore: fc.integer({ min: 0, max: 60 }),
  tin: fc.integer({ min: 0, max: 60 }),
  pick: fc.integer({ min: 0, max: 1 }),
});

function totalsOf(state: SlotState): ItemStack[] {
  const all: ItemStack[] = [];
  for (const s of [...state.bank, ...state.inventory]) addItem(all, s.itemId, s.qty);
  return all;
}

function checkInvariants(state: SlotState) {
  for (const list of [state.bank, state.inventory]) {
    for (let i = 0; i < list.length; i++) {
      expect(list[i]!.qty).toBeGreaterThan(0);
      expect(Number.isInteger(list[i]!.qty)).toBe(true);
      if (i > 0) expect(list[i - 1]!.itemId < list[i]!.itemId).toBe(true);
    }
  }
  expect(state.inventory.length).toBeLessThanOrEqual(28);
}

describe('properties', () => {
  it('quantities never go negative, XP never decreases, items are conserved', () => {
    fc.assert(
      fc.property(bankArb, fc.array(commandArb, { maxLength: 25 }), (bank, commands) => {
        const initial: ItemStack[] = [];
        if (bank.ore) initial.push({ itemId: 'ore', qty: bank.ore });
        if (bank.pick) initial.push({ itemId: 'pick', qty: 1 });
        if (bank.tin) initial.push({ itemId: 'tin', qty: bank.tin });
        let state = fixtureState(initial);
        for (const cmd of commands) {
          const before = state;
          const beforeTotals = totalsOf(before);
          let gained: ItemStack[] = [];
          let consumed: ItemStack[] = [];
          if (cmd.kind === 'start') {
            const r = startAction(state, cmd.actionId, cmd.stop, content);
            if (r.ok) state = r.state;
          } else if (cmd.kind === 'queue') {
            const r = setQueue(state, cmd.entries, content);
            if (r.ok) state = r.state;
          } else if (cmd.kind === 'stop') {
            state = stopSlot(state).state;
          } else if (cmd.kind === 'step') {
            const r = step(state, cmd.ticks, content);
            state = r.state;
            for (const e of r.events) {
              if (e.type === 'ItemsGained') gained = [...gained, ...e.items];
              if (e.type === 'ItemsConsumed') consumed = [...consumed, ...e.items];
            }
          } else {
            const r = resolveOffline(state, cmd.ticks, content);
            state = r.state;
            gained = r.summary.gained;
            consumed = r.summary.consumed;
          }
          checkInvariants(state);
          // XP never decreases.
          state.skills.forEach((s, i) =>
            expect(s.xpTenths).toBeGreaterThanOrEqual(before.skills[i]!.xpTenths),
          );
          // Conservation: before + gained − consumed = after, and consumed ≤ available.
          const after = totalsOf(state);
          for (const id of ['ore', 'tin', 'bar', 'gem', 'star', 'pick']) {
            const g = gained.filter((x) => x.itemId === id).reduce((a, x) => a + x.qty, 0);
            const c = consumed.filter((x) => x.itemId === id).reduce((a, x) => a + x.qty, 0);
            expect(c).toBeLessThanOrEqual(qtyOf(beforeTotals, id) + g);
            expect(qtyOf(after, id)).toBe(qtyOf(beforeTotals, id) + g - c);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});
