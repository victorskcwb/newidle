import type { Rarity } from '@abismo/content';
import { DROP_PITY, RARITY_ORDER } from './constants.ts';
import { rarityRank } from './items.ts';
import { rngInt, type RngState } from './rng.ts';
import type { DropPity } from './types.ts';

/**
 * Bad-luck protection for equipment (GDD 3.3). Two counters of equipment drops: since the last
 * epic-or-better and since the last legendary (counted only where legendaries can drop). The
 * DROP_PITY[tier]-th drop without that tier is guaranteed to be of it.
 */

/** Drops left until the guarantee, counting the guaranteed one (1 = the next drop). */
export function pityDropsLeft(p: DropPity, tier: 'epic' | 'legendary'): number {
  return Math.max(1, DROP_PITY[tier] - p[tier]);
}

/** Rarity the next drop is guaranteed to have, or null when it rolls normally. */
export function pityRarity(p: DropPity, legendaryOk: boolean): Rarity | null {
  if (legendaryOk && pityDropsLeft(p, 'legendary') === 1) return 'legendary';
  if (pityDropsLeft(p, 'epic') === 1) return 'epic';
  return null;
}

/** Updates the counters after one equipment drop. */
export function recordDrop(p: DropPity, rarity: Rarity, legendaryOk: boolean): void {
  p.epic = rarityRank(rarity) >= rarityRank('epic') ? 0 : p.epic + 1;
  if (rarity === 'legendary') p.legendary = 0;
  else if (legendaryOk) p.legendary++;
}

/**
 * Applies the guarantee to drops counted in bulk (offline). `counts` is one rarity record per
 * kill category, already drawn without pity. The natural drops of a tier are placed at random
 * positions in the sequence of all drops; walking the gaps between them gives where the
 * guarantee fires. Each guaranteed drop turns one drop of the lowest rarity present into the
 * tier. Mutates `counts` and `p`; returns how many drops were upgraded per tier.
 */
export function applyBulkPity(
  rng: RngState,
  p: DropPity,
  counts: Record<Rarity, number>[],
  legendaryOk: boolean,
): { epic: number; legendary: number } {
  const total = counts.reduce((n, c) => n + RARITY_ORDER.reduce((m, r) => m + c[r], 0), 0);
  const tierCount = (tier: 'epic' | 'legendary') =>
    counts.reduce((n, c) => n + c.legendary + (tier === 'epic' ? c.epic : 0), 0);
  const upgrade = (tier: 'epic' | 'legendary', n: number) => {
    for (const from of RARITY_ORDER) {
      if (rarityRank(from) >= rarityRank(tier)) break;
      for (const c of counts) {
        const k = Math.min(n, c[from]);
        c[from] -= k;
        c[tier] += k;
        n -= k;
        if (n === 0) return;
      }
    }
  };
  const walk = (tier: 'epic' | 'legendary'): number => {
    const natural = tierCount(tier);
    const positions: number[] = [];
    for (let i = 0; i < natural; i++) positions.push(rngInt(rng, 0, total - 1));
    positions.sort((a, b) => a - b);
    positions.push(total);
    const limit = DROP_PITY[tier];
    let since = p[tier];
    let cursor = 0;
    let forced = 0;
    positions.forEach((pos, i) => {
      let gap = Math.max(0, pos - cursor);
      while (since + gap >= limit) {
        const step = Math.max(1, limit - since);
        forced++;
        cursor += step;
        gap -= step;
        since = 0;
      }
      if (i < positions.length - 1) {
        since = 0;
        cursor = Math.max(cursor, pos + 1);
      } else {
        since += gap;
      }
    });
    // Never more upgrades than drops below the tier.
    forced = Math.min(forced, total - natural);
    upgrade(tier, forced);
    p[tier] = since;
    return forced;
  };
  if (total === 0) return { epic: 0, legendary: 0 };
  const legendary = legendaryOk ? walk('legendary') : 0;
  const epic = walk('epic');
  return { epic, legendary };
}
