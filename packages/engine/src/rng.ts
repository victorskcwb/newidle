/**
 * Deterministic 32-bit PRNG (sfc32). The state is four int32 values and is part of SlotState,
 * so a simulation resumed from a saved state continues the exact same sequence.
 * Only integer operations and IEEE-exact arithmetic are used, so Node and browsers agree.
 */
export type RngState = [number, number, number, number];

const TWO_POW_32 = 4294967296;
const PPM = 1_000_000;

/** Advances the state in place and returns a uint32. */
export function rngNext(s: RngState): number {
  const a = s[0];
  const b = s[1];
  const c = s[2];
  const d = s[3];
  const t = (((a + b) | 0) + d) | 0;
  s[3] = (d + 1) | 0;
  s[0] = b ^ (b >>> 9);
  s[1] = (c + (c << 3)) | 0;
  const r = (c << 21) | (c >>> 11);
  s[2] = (r + t) | 0;
  return t >>> 0;
}

/** Builds a warmed-up state from four uint32 seed words. */
export function createRng(seed: readonly [number, number, number, number]): RngState {
  const s: RngState = [seed[0] | 0, seed[1] | 0, seed[2] | 0, seed[3] | 0];
  for (let i = 0; i < 15; i++) rngNext(s);
  return s;
}

/** Uniform integer in [min, max] (inclusive), without modulo bias. */
export function rngInt(s: RngState, min: number, max: number): number {
  if (max < min) throw new RangeError(`rngInt: max ${max} < min ${min}`);
  const range = max - min + 1;
  if (range > TWO_POW_32) throw new RangeError('rngInt: range too large');
  const limit = TWO_POW_32 - (TWO_POW_32 % range);
  let x = rngNext(s);
  while (x >= limit) x = rngNext(s);
  return min + (x % range);
}

/** True with probability ppm / 1,000,000. Certain outcomes do not consume the RNG. */
export function rngChance(s: RngState, chancePpm: number): boolean {
  if (chancePpm <= 0) return false;
  if (chancePpm >= PPM) return true;
  return rngInt(s, 0, PPM - 1) < chancePpm;
}

/** Below this variance the binomial is sampled exactly; above it a normal approximation is used. */
const BINOMIAL_NORMAL_MIN_VARIANCE = 100;

/**
 * One binomial draw: number of successes in n trials of chance ppm.
 * Exact (n Bernoulli trials) when the variance is small; otherwise a normal approximation
 * whose deviate is Irwin–Hall (sum of 12 uniforms), so only +, *, / and sqrt are used —
 * operations IEEE 754 defines exactly, which keeps results identical across JS engines.
 */
export function rngBinomial(s: RngState, n: number, chancePpm: number): number {
  if (n <= 0 || chancePpm <= 0) return 0;
  if (chancePpm >= PPM) return n;
  const p = chancePpm / PPM;
  const variance = n * p * (1 - p);
  if (variance < BINOMIAL_NORMAL_MIN_VARIANCE) {
    let hits = 0;
    for (let i = 0; i < n; i++) if (rngInt(s, 0, PPM - 1) < chancePpm) hits++;
    return hits;
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += rngNext(s) / TWO_POW_32;
  const z = sum - 6;
  const value = Math.floor(n * p + z * Math.sqrt(variance) + 0.5);
  return Math.min(n, Math.max(0, value));
}
