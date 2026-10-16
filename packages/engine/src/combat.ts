import {
  DEFENSE_PER_ATTACKER_LEVEL,
  DEFENSE_REDUCTION_CAP_PPM,
  HIT_CHANCE_MAX_PPM,
  HIT_CHANCE_MIN_PPM,
  PPM,
} from './constants.ts';
import { rngChance, rngInt, type RngState } from './rng.ts';

/** Chance to hit = accuracy ÷ (accuracy + evasion), clamped to [5%, 95%], in ppm. */
export function hitChancePpm(accuracy: number, evasion: number): number {
  const total = accuracy + evasion;
  const raw = total <= 0 ? HIT_CHANCE_MAX_PPM : Math.floor((accuracy * PPM) / total);
  return Math.min(HIT_CHANCE_MAX_PPM, Math.max(HIT_CHANCE_MIN_PPM, raw));
}

/** Damage reduction = defense ÷ (defense + 50 × attacker level), capped at 75%, in ppm. */
export function defenseReductionPpm(defense: number, attackerLevel: number): number {
  if (defense <= 0) return 0;
  const raw = Math.floor((defense * PPM) / (defense + DEFENSE_PER_ATTACKER_LEVEL * attackerLevel));
  return Math.min(DEFENSE_REDUCTION_CAP_PPM, raw);
}

export interface AttackProfile {
  level: number;
  accuracy: number;
  damageMin: number;
  damageMax: number;
  critChancePpm: number;
  critDamagePct: number;
  /** Total damage multiplier in percent (100 = normal), e.g. a skill hit at 180%. */
  damagePct: number;
}

export interface DefenseProfile {
  evasion: number;
  defense: number;
}

export interface Hit {
  damage: number;
  crit: boolean;
  miss: boolean;
}

/**
 * Resolves one attack. RNG draws, in order: hit roll, damage roll, crit roll.
 * Damage = uniform[min, max] × damagePct × (1 − defense reduction), crits × critDamage; min 1.
 */
export function rollHit(rng: RngState, atk: AttackProfile, def: DefenseProfile): Hit {
  if (!rngChance(rng, hitChancePpm(atk.accuracy, def.evasion))) {
    return { damage: 0, crit: false, miss: true };
  }
  const raw = rngInt(rng, atk.damageMin, atk.damageMax);
  const reduction = defenseReductionPpm(def.defense, atk.level);
  let damage = Math.floor((raw * atk.damagePct * (PPM - reduction)) / (100 * PPM));
  const crit = rngChance(rng, atk.critChancePpm);
  if (crit) damage = Math.floor((damage * atk.critDamagePct) / 100);
  return { damage: Math.max(1, damage), crit, miss: false };
}
