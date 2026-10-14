import { describe, expect, it } from 'vitest';
import { DETERMINISM_GOLDEN_100K, runDeterminism } from '../src/testing.ts';

describe('determinism', () => {
  it('same state, seed and ticks give the same events and hash after 100,000 ticks', () => {
    expect(runDeterminism(100_000)).toEqual(runDeterminism(100_000));
  });

  it('is independent of how ticks are batched', () => {
    expect(runDeterminism(20_000, 37)).toEqual(runDeterminism(20_000));
  });

  it('matches the golden values (same check runs in the browser)', () => {
    expect(runDeterminism(100_000)).toEqual(DETERMINISM_GOLDEN_100K);
  });
});
