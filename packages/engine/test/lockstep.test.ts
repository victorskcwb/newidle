import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  IntentError,
  TICKS_PER_HOUR,
  applyIntent,
  cloneState,
  decodeSave,
  encodeSave,
  hashState,
  stepQuiet,
  type GameState,
  type Intent,
} from '../src/index.ts';
import { content, hunting } from './fixture.ts';

/** An intent the client sent for a tick (decision 173: applied before that tick runs). */
interface Scheduled {
  atTick: number;
  intent: Intent;
}

/** Applies an intent the way the server and the client both do: a refusal changes nothing else. */
function apply(s: GameState, intent: Intent) {
  try {
    applyIntent(s, content, intent);
  } catch (e) {
    if (!(e instanceof IntentError)) throw e;
  }
}

/**
 * Runs `s` up to `endTick`, applying each scheduled intent when the state reaches its tick
 * (in schedule order for the same tick). `chunked` steps between intents in one call, like the
 * server catching up; otherwise one tick at a time, like the client's real-time loop.
 */
function run(s: GameState, schedule: readonly Scheduled[], endTick: number, chunked: boolean) {
  const queue = [...schedule].sort((a, b) => a.atTick - b.atTick);
  let next = 0;
  while (s.tick < endTick) {
    while (next < queue.length && queue[next]!.atTick <= s.tick) apply(s, queue[next++]!.intent);
    const until = Math.min(endTick, queue[next]?.atTick ?? endTick);
    if (chunked) stepQuiet(s, content, until - s.tick);
    else while (s.tick < until) stepQuiet(s, content, 1);
  }
}

const uid = fc.integer({ min: 1, max: 300 });
const intentArb: fc.Arbitrary<Intent> = fc.oneof(
  fc.constant<Intent>({ type: 'return_to_town' }),
  fc.constant<Intent>({ type: 'start_hunt', huntId: 'forgotten_cemetery' }),
  fc.constantFrom<Intent>(
    { type: 'start_hunt', huntId: 'forgotten_cemetery', difficulty: 'easy' },
    { type: 'start_hunt', huntId: 'pale_woods' },
    { type: 'equip_best' },
    { type: 'deposit_all' },
    { type: 'buy', consumableId: 'potion_hp_small', qty: 20 },
    { type: 'salvage_up_to', rarity: 'magic' },
    { type: 'learn_skill', skillId: 'heavy_strike' },
    { type: 'set_auto_allocate', profile: 'vitality' },
    { type: 'set_hunt_behaviour', targetPriority: 'weakest', autoSellUpTo: 'common' },
    {
      type: 'set_skill_rule',
      skillId: 'heavy_strike',
      rule: { logic: 'any', conditions: [{ kind: 'enemies', op: 'at_least', count: 2 }] },
    },
  ),
  uid.map((u): Intent => ({ type: 'equip', uid: u })),
  uid.map((u): Intent => ({ type: 'salvage', uid: u })),
  uid.map((u): Intent => ({ type: 'refine', uid: u, useProtection: false, useTempering: false })),
  uid.map((u): Intent => ({ type: 'sell', uids: [u, u + 1] })),
);

function scheduleArb(endTick: number) {
  return fc.array(
    fc.record({ atTick: fc.integer({ min: 0, max: endTick - 1 }), intent: intentArb }),
    { maxLength: 40 },
  );
}

describe('lockstep (decision 173)', () => {
  it('the same intents at the same ticks give the same state, stepped any way', () => {
    const end = 20_000;
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e6 }), scheduleArb(end), (seed, schedule) => {
        const server = hunting(seed);
        const client = cloneState(server);
        run(server, schedule, end, true);
        run(client, schedule, end, false);
        expect(hashState(client)).toBe(hashState(server));
      }),
      { numRuns: 15 },
    );
  });

  it('a client that joins from the saved state (welcome) stays in step for 24 hours', () => {
    const end = 24 * TICKS_PER_HOUR;
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e6 }), scheduleArb(end), (seed, schedule) => {
        const server = hunting(seed);
        stepQuiet(server, content, 5_000);
        // What the client receives: the state through the save codec (bigints and all).
        const client = decodeSave(encodeSave(server, 0), content).state;
        const later = schedule.map((x) => ({ ...x, atTick: Math.max(x.atTick, server.tick) }));
        run(server, later, end, true);
        run(client, later, end, false);
        expect(hashState(client)).toBe(hashState(server));
      }),
      { numRuns: 2 },
    );
  }, 120_000);
});
