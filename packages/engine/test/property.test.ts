import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  equipItem,
  resolveOffline,
  computeRates,
  returnToTown,
  salvageItem,
  startHunt,
  step,
  totalXpToReach,
  type GameState,
} from '../src/index.ts';
import { HUNT, content, hunting, ownedItemUids } from './fixture.ts';

type Action =
  | { kind: 'step'; ticks: number }
  | { kind: 'equip'; pick: number }
  | { kind: 'salvage'; pick: number }
  | { kind: 'town' }
  | { kind: 'hunt' }
  | { kind: 'offline'; ticks: number };

const action: fc.Arbitrary<Action> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant('step' as const),
      ticks: fc.integer({ min: 1, max: 3000 }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('equip' as const), pick: fc.nat() }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('salvage' as const), pick: fc.nat() }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('town' as const) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('hunt' as const) }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('offline' as const),
      ticks: fc.integer({ min: 0, max: 20_000 }),
    }),
  },
);

function totalXp(s: GameState): number {
  return totalXpToReach(s.hero.level) + s.hero.xp;
}

function assertNonNegative(s: GameState) {
  expect(s.gold >= 0n).toBe(true);
  for (const v of Object.values(s.materials)) expect(v >= 0n).toBe(true);
  for (const v of Object.values(s.consumables)) expect(v).toBeGreaterThanOrEqual(0);
  expect(s.hero.xp).toBeGreaterThanOrEqual(0);
  expect(s.hero.unspentAttributePoints).toBeGreaterThanOrEqual(0);
  expect(s.backpack.length).toBeLessThanOrEqual(40);
}

describe('properties', () => {
  it('quantities never go negative; XP only drops by death; items only leave by salvage', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.array(action, { maxLength: 25 }),
        (seed, actions) => {
          const s = hunting(seed);
          for (const a of actions) {
            const xpBefore = totalXp(s);
            const itemsBefore = ownedItemUids(s);
            let deaths = 0;
            let salvaged: number | null = null;
            let gained = new Set<number>();
            switch (a.kind) {
              case 'step': {
                const events = step(s, content, a.ticks);
                deaths = events.filter((e) => e.type === 'HeroDied').length;
                gained = new Set(
                  events.flatMap((e) => (e.type === 'ItemDropped' && e.kept ? [e.item.uid] : [])),
                );
                break;
              }
              case 'equip': {
                const pool = [...s.backpack, ...s.stash];
                if (pool.length > 0) equipItem(s, content, pool[a.pick % pool.length]!.uid);
                break;
              }
              case 'salvage': {
                const pool = [...s.backpack, ...s.stash];
                if (pool.length > 0) {
                  salvaged = pool[a.pick % pool.length]!.uid;
                  salvageItem(s, content, salvaged);
                }
                break;
              }
              case 'town':
                returnToTown(s, content);
                break;
              case 'hunt':
                startHunt(s, content, HUNT);
                break;
              case 'offline': {
                const rates = s.hunt ? computeRates(s, content, s.hunt.huntId, 3000) : null;
                const r = resolveOffline(s, content, rates, a.ticks);
                deaths = r.deaths;
                gained = new Set(r.items.map((i) => i.uid));
                break;
              }
            }
            assertNonNegative(s);
            if (deaths === 0) expect(totalXp(s)).toBeGreaterThanOrEqual(xpBefore);
            const after = new Set(ownedItemUids(s));
            for (const uid of itemsBefore) {
              if (uid !== salvaged) expect(after.has(uid), `item ${uid} disappeared`).toBe(true);
            }
            for (const uid of after) {
              expect(itemsBefore.includes(uid) || gained.has(uid), `item ${uid} appeared`).toBe(
                true,
              );
            }
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
