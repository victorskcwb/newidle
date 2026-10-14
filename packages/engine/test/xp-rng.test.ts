import { describe, expect, it } from 'vitest';
import {
  MASTERY_XP_TABLE,
  createRng,
  levelForXp,
  masteryLevelForXp,
  rngBinomial,
  rngChance,
  rngInt,
  rngNext,
  xpForLevel,
  addXp,
  MAX_XP_TENTHS,
} from '../src/index.ts';

describe('xp curve', () => {
  it('matches known totals (XP × 10)', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(750);
    expect(xpForLevel(10)).toBe(10_130);
    expect(xpForLevel(50)).toBe(792_610);
    expect(xpForLevel(92)).toBe(43_824_460);
    expect(xpForLevel(99)).toBe(85_409_000);
  });

  it('levelForXp is the inverse at boundaries', () => {
    for (let level = 1; level <= 99; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      if (level > 1) expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
  });

  it('caps at 99 and keeps counting XP up to 2^31 − 1', () => {
    expect(levelForXp(xpForLevel(99) * 10)).toBe(99);
    expect(addXp(MAX_XP_TENTHS - 5, 100)).toBe(MAX_XP_TENTHS);
  });

  it('mastery curve uses base 10 and caps at 50', () => {
    expect(MASTERY_XP_TABLE[2]).toBe(10);
    expect(MASTERY_XP_TABLE[25]).toBe(874);
    expect(MASTERY_XP_TABLE[50]).toBe(10_550);
    expect(masteryLevelForXp(1_000_000)).toBe(50);
  });
});

describe('rng', () => {
  it('is reproducible from a seed', () => {
    const a = createRng([1, 2, 3, 4]);
    const b = createRng([1, 2, 3, 4]);
    const seqA = Array.from({ length: 50 }, () => rngNext(a));
    const seqB = Array.from({ length: 50 }, () => rngNext(b));
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBe(50);
    expect(seqA.every((x) => Number.isInteger(x) && x >= 0 && x < 2 ** 32)).toBe(true);
  });

  it('known sequence (guards against accidental algorithm changes)', () => {
    const r = createRng([0xdeadbeef, 0x12345678, 0x9abcdef0, 0x0badf00d]);
    expect([rngNext(r), rngNext(r), rngNext(r)]).toMatchInlineSnapshot(`
      [
        4220214746,
        958471406,
        3038573085,
      ]
    `);
  });

  it('rngInt stays in range and covers it', () => {
    const r = createRng([5, 6, 7, 8]);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rngInt(r, 3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
  });

  it('rngChance hits close to the expected rate', () => {
    const r = createRng([9, 9, 9, 9]);
    let hits = 0;
    for (let i = 0; i < 100_000; i++) if (rngChance(r, 250_000)) hits++;
    expect(hits / 100_000).toBeCloseTo(0.25, 2);
  });

  it('certain chances do not consume the rng', () => {
    const r = createRng([1, 1, 1, 1]);
    const before = [...r];
    expect(rngChance(r, 0)).toBe(false);
    expect(rngChance(r, 1_000_000)).toBe(true);
    expect(rngBinomial(r, 100, 1_000_000)).toBe(100);
    expect([...r]).toEqual(before);
  });

  it('binomial mean is right on both the exact and the approximate path', () => {
    const r = createRng([3, 1, 4, 1]);
    const mean = (n: number, ppm: number, runs: number) => {
      let sum = 0;
      for (let i = 0; i < runs; i++) {
        const v = rngBinomial(r, n, ppm);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(n);
        sum += v;
      }
      return sum / runs;
    };
    expect(mean(500, 10_000, 4000) / 5).toBeCloseTo(1, 1); // exact path (variance ≈ 5)
    expect(mean(20_000, 300_000, 4000) / 6000).toBeCloseTo(1, 2); // normal path (variance 4200)
  });
});
