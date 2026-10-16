import { MAX_LEVEL, XP_GAP_PENALTIES } from './constants.ts';

/**
 * XP to go from level L to L+1 = floor(100 × 1.08^(L−1)), computed with BigInt rationals
 * (100 × 108^(L−1) / 100^(L−1)) so no floating point is involved. Index = level (1..99);
 * XP_TO_NEXT[100] = 0 because 100 is the cap of a reset cycle.
 */
export const XP_TO_NEXT: readonly number[] = (() => {
  const table: number[] = [0];
  let num = 100n;
  let den = 1n;
  for (let level = 1; level < MAX_LEVEL; level++) {
    table.push(Number(num / den));
    num *= 108n;
    den *= 100n;
  }
  table.push(0);
  return table;
})();

/** XP needed to go from `level` to `level + 1` (0 at the cap). */
export function xpToNext(level: number): number {
  return XP_TO_NEXT[level] ?? 0;
}

/** Total XP from level 1 to reaching `level`. */
export function totalXpToReach(level: number): number {
  let total = 0;
  for (let l = 1; l < level && l < MAX_LEVEL; l++) total += xpToNext(l);
  return total;
}

/** Percent of a monster's XP the hero receives, given the level gap. */
export function xpGapPct(heroLevel: number, monsterLevel: number): number {
  const gap = heroLevel - monsterLevel;
  for (const p of XP_GAP_PENALTIES) if (gap >= p.gap) return p.pct;
  return 100;
}
