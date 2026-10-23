import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  SaveError,
  decodeSave,
  encodeSave,
  hashState,
  stepQuiet,
  type GameState,
} from '../src/index.ts';
import { content, hunting, newGame } from './fixture.ts';

function decodeError(text: string): SaveError {
  try {
    decodeSave(text, content);
  } catch (e) {
    if (e instanceof SaveError) return e;
    throw e;
  }
  throw new Error('expected a SaveError');
}

describe('save', () => {
  it('save then load gives an identical state, at any point of a run', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.integer({ min: 0, max: 40_000 }),
        (seed, ticks) => {
          const s = hunting(seed);
          stepQuiet(s, content, ticks);
          s.gold = 123_456_789_012_345_678_901n; // beyond 2^53: must survive as bigint
          const loaded = decodeSave(encodeSave(s, 1_700_000_000_000), content);
          expect(loaded.savedAt).toBe(1_700_000_000_000);
          expect(loaded.state).toEqual(s);
          expect(hashState(loaded.state)).toBe(hashState(s));
        },
      ),
      { numRuns: 25 },
    );
  });

  it('a loaded state keeps simulating exactly like the original', () => {
    const a = hunting(5);
    stepQuiet(a, content, 12_345);
    const b = decodeSave(encodeSave(a, 0), content).state;
    stepQuiet(a, content, 20_000);
    stepQuiet(b, content, 20_000);
    expect(hashState(b)).toBe(hashState(a));
  });

  it('a hero name that looks like a bigint stays a string', () => {
    const s = newGame();
    s.hero.name = '123';
    expect(decodeSave(encodeSave(s, 0), content).state.hero.name).toBe('123');
  });

  it('rejects garbage, other JSON, tampered and newer saves', () => {
    expect(decodeError('{not json').code).toBe('not_json');
    expect(decodeError('{"hello":1}').code).toBe('not_a_save');
    const s = newGame();
    const tampered = JSON.parse(encodeSave(s, 0));
    tampered.state.gold = { $bigint: '-5' };
    expect(decodeError(JSON.stringify(tampered)).code).toBe('invalid');
    const newer = JSON.parse(encodeSave(s, 0));
    newer.version = 99;
    expect(decodeError(JSON.stringify(newer)).code).toBe('newer_version');
  });

  it('rejects saves that refer to content that no longer exists', () => {
    const s = newGame();
    s.stash.push({
      uid: 50,
      baseId: 'removed_sword',
      ilvl: 1,
      rarity: 'common',
      affixes: [],
      refine: 0,
    });
    const e = decodeError(encodeSave(s, 0));
    expect(e.code).toBe('unknown_content');
    expect(e.problems).toContain('item base removed_sword');
  });

  it('migrates old versions step by step before validating', () => {
    // Pretend version 0 saves lacked lifetime.bossKills and named gold "coins".
    const current: GameState = newGame();
    current.gold = 42n;
    const v1 = JSON.parse(encodeSave(current, 7));
    const v0 = { ...v1, version: 0 };
    delete v0.state.lifetime.bossKills;
    v0.state.coins = v0.state.gold;
    delete v0.state.gold;
    const format = {
      version: 1,
      migrations: {
        0: (raw: Record<string, unknown>) => {
          const state = raw.state as Record<string, unknown> & {
            lifetime: Record<string, unknown>;
          };
          const { coins, ...rest } = state;
          return {
            ...raw,
            state: { ...rest, gold: coins, lifetime: { ...state.lifetime, bossKills: 0 } },
          };
        },
      },
    };
    const loaded = decodeSave(JSON.stringify(v0), content, format);
    expect(loaded.version).toBe(1);
    expect(loaded.state).toEqual(current);
    expect(() => decodeSave(JSON.stringify(v0), content)).toThrow(SaveError);
  });

  it('a v19 save (no skill rules, no hunt difficulty) loads as v20 with the defaults', () => {
    const s = hunting(19);
    stepQuiet(s, content, 2_000);
    const v19 = JSON.parse(encodeSave(s, 5));
    v19.version = 19;
    v19.state.version = 19;
    delete v19.state.settings.skillRules;
    delete v19.state.hunt.difficulty;
    const loaded = decodeSave(JSON.stringify(v19), content);
    expect(loaded.version).toBe(20);
    expect(loaded.state.settings.skillRules).toEqual({});
    expect(loaded.state.hunt?.difficulty).toBe('normal');
    expect(loaded.state).toEqual(s);
  });
});
