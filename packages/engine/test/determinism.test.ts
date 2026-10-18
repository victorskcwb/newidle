import { describe, expect, it } from 'vitest';
import { canonicalJson, hashState, step, stepQuiet } from '../src/index.ts';
import { content, hunting } from './fixture.ts';

describe('determinism', () => {
  it('same seed and state give the same events and state after 100,000 ticks', () => {
    const a = hunting(42);
    const b = hunting(42);
    const ea = step(a, content, 100_000);
    const eb = step(b, content, 100_000);
    expect(canonicalJson(ea)).toBe(canonicalJson(eb));
    expect(hashState(a)).toBe(hashState(b));
  });

  it('matches the golden hash (changes only when rules or content change on purpose)', () => {
    const s = hunting(42);
    stepQuiet(s, content, 100_000);
    expect(hashState(s)).toMatchInlineSnapshot(`"8b4edccca73a3433"`);
  });

  it('step(n) equals n × step(1) and does not depend on collecting events', () => {
    const a = hunting(9);
    const b = hunting(9);
    const c = hunting(9);
    step(a, content, 5_000);
    for (let i = 0; i < 5_000; i++) step(b, content, 1);
    stepQuiet(c, content, 5_000);
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(a)).toBe(hashState(c));
  });

  it('different seeds diverge', () => {
    const a = hunting(1);
    const b = hunting(2);
    stepQuiet(a, content, 5_000);
    stepQuiet(b, content, 5_000);
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('a state cloned mid-run continues identically (save/load in memory)', () => {
    const a = hunting(11);
    stepQuiet(a, content, 3_333);
    const b = structuredClone(a);
    stepQuiet(a, content, 7_000);
    stepQuiet(b, content, 7_000);
    expect(hashState(a)).toBe(hashState(b));
  });
});
