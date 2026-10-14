import { MAX_LEVEL, MAX_XP_TENTHS, MASTERY_MAX_LEVEL } from './constants.ts';

/**
 * Cumulative XP table for the curve "XP from L to L+1 = floor(base × 1.1^(L−1))".
 * Computed with BigInt rationals (base × 11^(L−1) / 10^(L−1)) so there is no floating point.
 * table[L] = total XP needed to reach level L (table[1] = 0), multiplied by `scale`.
 */
function buildCurve(base: number, maxLevel: number, scale: number): readonly number[] {
  const table: number[] = [0, 0];
  let num = BigInt(base);
  let den = 1n;
  let total = 0;
  for (let level = 1; level < maxLevel; level++) {
    total += Number(num / den) * scale;
    table.push(total);
    num *= 11n;
    den *= 10n;
  }
  return table;
}

/** XP needed to reach each skill level, in tenths of XP. Index = level (1..99). */
export const SKILL_XP_TABLE: readonly number[] = buildCurve(75, MAX_LEVEL, 10);

/** Mastery points needed to reach each mastery level (1 point per execution). Index = level (1..50). */
export const MASTERY_XP_TABLE: readonly number[] = buildCurve(10, MASTERY_MAX_LEVEL, 1);

function levelIn(table: readonly number[], xp: number): number {
  let lo = 1;
  let hi = table.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((table[mid] ?? Infinity) <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Total XP (tenths) needed to reach `level`. */
export function xpForLevel(level: number): number {
  const clamped = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  return SKILL_XP_TABLE[clamped] ?? 0;
}

/** Skill level for an XP total (tenths). XP keeps counting after 99 but the level caps there. */
export function levelForXp(xpTenths: number): number {
  return levelIn(SKILL_XP_TABLE, xpTenths);
}

export function masteryLevelForXp(points: number): number {
  return levelIn(MASTERY_XP_TABLE, points);
}

export function addXp(xpTenths: number, gainTenths: number): number {
  return Math.min(MAX_XP_TENTHS, xpTenths + gainTenths);
}
