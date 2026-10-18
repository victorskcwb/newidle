import type { BestiaryTier, ContentDb } from '@abismo/content';
import type { GameState } from './types.ts';

/**
 * Bestiary (GDD 3.4): kills of each monster, kept across resets. Each tier reached gives a
 * permanent damage bonus against that monster; the first one also reveals its entry.
 */

/** Kills needed for a tier (bosses use their own, smaller numbers). */
export function tierKills(tier: BestiaryTier, boss: boolean): number {
  return boss ? tier.bossKills : tier.kills;
}

/** Tiers reached for a monster (0 = none). */
export function bestiaryTier(s: GameState, content: ContentDb, monsterId: string): number {
  const kills = s.bestiary[monsterId] ?? 0;
  const boss = !!content.monsters.get(monsterId)?.boss;
  let tier = 0;
  for (const t of content.bestiaryTiers) if (kills >= tierKills(t, boss)) tier++;
  return tier;
}

/** Damage bonus (%) against a monster from its bestiary tier. */
export function bestiaryDamagePct(s: GameState, content: ContentDb, monsterId: string): number {
  const tier = bestiaryTier(s, content, monsterId);
  return tier > 0 ? content.bestiaryTiers[tier - 1]!.damagePct : 0;
}
