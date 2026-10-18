import type { ContentDb, Recipe, Resource } from '@abismo/content';
import { TICKS_PER_SECOND } from './constants.ts';
import { grantReward } from './login.ts';
import { IntentError } from './progression.ts';
import type { GameEvent, GameState } from './types.ts';

/**
 * Professions (GDD 3.2, docs/plan-oficios.md). Gathering runs alongside the hunt (any activity
 * but resting in town); production runs all the time while there are inputs. Both are counters
 * without randomness, so the offline resolution can replay them tick by tick and match exactly.
 */

export const PROFESSION_MAX_LEVEL = 99;
/** Speed bonus per level above a resource's or recipe's level, and its cap (%). */
const SPEED_PER_LEVEL_PCT = 1;
const SPEED_MAX_PCT = 50;

/**
 * XP from level L to L+1 = floor(50 × 1.09^(L−1)), with BigInt rationals (no floating point).
 * Index = level; the entry for 99 is 0.
 */
export const PROFESSION_XP_TO_NEXT: readonly number[] = (() => {
  const table: number[] = [0];
  let num = 50n;
  let den = 1n;
  for (let level = 1; level < PROFESSION_MAX_LEVEL; level++) {
    table.push(Number(num / den));
    num *= 109n;
    den *= 100n;
  }
  table.push(0);
  return table;
})();

export interface ProfessionSkill {
  level: number;
  xp: number;
}

export interface Professions {
  skills: Record<string, ProfessionSkill>;
  /** Gathering profession in use, or null. */
  gathering: string | null;
  gatherTicks: number;
  /** Production recipe in use, or null. */
  recipe: string | null;
  craftTicks: number;
}

export function newProfessions(): Professions {
  return { skills: {}, gathering: null, gatherTicks: 0, recipe: null, craftTicks: 0 };
}

export function professionLevel(s: GameState, professionId: string): number {
  return s.professions.skills[professionId]?.level ?? 1;
}

/** Ticks for one unit or craft at a level, given the base seconds and the level required. */
export function workTicks(seconds: number, required: number, level: number): number {
  const bonus = Math.min(SPEED_MAX_PCT, Math.max(0, level - required) * SPEED_PER_LEVEL_PCT);
  return Math.ceil((seconds * TICKS_PER_SECOND * 100) / (100 + bonus));
}

/** Resource the hero gathers now: the best one the hunt offers and the level allows. */
export function gatherTarget(s: GameState, content: ContentDb): Resource | null {
  const profession = s.professions.gathering;
  if (!profession || !s.hunt) return null;
  const huntTier = content.hunts.get(s.hunt.huntId)?.gatherTier ?? 1;
  const level = professionLevel(s, profession);
  let best: Resource | null = null;
  for (const r of content.resources.values()) {
    if (r.professionId !== profession || r.tier > huntTier || r.level > level) continue;
    if (!best || r.tier > best.tier) best = r;
  }
  return best;
}

/** True while the hero gathers: assigned to a hunt and not resting in town. */
export function gathering(s: GameState): boolean {
  return s.hunt !== null && s.activity.kind !== 'idle_town';
}

export function hasInputs(s: GameState, recipe: Recipe): boolean {
  return Object.entries(recipe.inputs).every(([id, qty]) => (s.resources[id] ?? 0) >= qty);
}

function addProfessionXp(
  s: GameState,
  professionId: string,
  xp: number,
  t: number,
  out: GameEvent[] | null,
) {
  const skill = (s.professions.skills[professionId] ??= { level: 1, xp: 0 });
  if (skill.level >= PROFESSION_MAX_LEVEL) return;
  skill.xp += xp;
  while (skill.level < PROFESSION_MAX_LEVEL && skill.xp >= PROFESSION_XP_TO_NEXT[skill.level]!) {
    skill.xp -= PROFESSION_XP_TO_NEXT[skill.level]!;
    skill.level++;
    out?.push({ type: 'ProfessionLevelUp', tick: t, professionId, level: skill.level });
  }
  if (skill.level >= PROFESSION_MAX_LEVEL) skill.xp = 0;
}

/** One tick of gathering and production (gathering first, so a new unit can feed a craft). */
export function tickProfessions(
  s: GameState,
  content: ContentDb,
  t: number,
  out: GameEvent[] | null,
  gatherNow = gathering(s),
) {
  const p = s.professions;
  if (gatherNow) {
    const target = gatherTarget(s, content);
    if (target) {
      p.gatherTicks++;
      const need = workTicks(target.seconds, target.level, professionLevel(s, target.professionId));
      if (p.gatherTicks >= need) {
        p.gatherTicks -= need;
        s.resources[target.id] = (s.resources[target.id] ?? 0) + 1;
        addProfessionXp(s, target.professionId, target.xp, t, out);
      }
    }
  }
  const recipe = p.recipe ? content.recipes.get(p.recipe) : undefined;
  if (recipe && hasInputs(s, recipe)) {
    p.craftTicks++;
    const need = workTicks(recipe.seconds, recipe.level, professionLevel(s, recipe.professionId));
    if (p.craftTicks >= need) {
      p.craftTicks -= need;
      for (const [id, qty] of Object.entries(recipe.inputs)) s.resources[id]! -= qty;
      grantReward(s, content, recipe.outputs);
      addProfessionXp(s, recipe.professionId, recipe.xp, t, out);
      out?.push({ type: 'ItemCrafted', tick: t, recipeId: recipe.id });
    }
  }
}

/** Chooses the gathering profession (null stops gathering). */
export function setGathering(s: GameState, content: ContentDb, professionId: string | null) {
  if (professionId !== null && content.professions.get(professionId)?.kind !== 'gathering') {
    throw new IntentError('not_gathering');
  }
  if (s.professions.gathering !== professionId) s.professions.gatherTicks = 0;
  s.professions.gathering = professionId;
}

/** Chooses the production recipe (null stops production). */
export function setRecipe(s: GameState, content: ContentDb, recipeId: string | null) {
  if (recipeId !== null) {
    const recipe = content.recipes.get(recipeId);
    if (!recipe) throw new IntentError('unknown_recipe');
    if (professionLevel(s, recipe.professionId) < recipe.level) {
      throw new IntentError('recipe_locked');
    }
  }
  if (s.professions.recipe !== recipeId) s.professions.craftTicks = 0;
  s.professions.recipe = recipeId;
}

/** Units per hour of a resource, or crafts per hour of a recipe, at a level. */
export function perHour(seconds: number, required: number, level: number): number {
  return (3600 * TICKS_PER_SECOND) / workTicks(seconds, required, level);
}
