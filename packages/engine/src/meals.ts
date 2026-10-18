import type { Consumable, ContentDb } from '@abismo/content';
import { TICKS_PER_SECOND } from './constants.ts';
import { IntentError } from './progression.ts';
import { gathering } from './professions.ts';
import type { StatMods } from './stats.ts';
import type { GameState, Hero } from './types.ts';

/**
 * Meals (Cooking, docs/plan-oficios.md): one meal gives a small bonus for a stretch of hunting
 * time. The player picks a meal; the hero eats the next one when the last runs out. Like
 * gathering, a meal only counts down while the hero is in a hunt.
 */

export function mealOf(content: ContentDb, id: string | null): Consumable | undefined {
  const c = id ? content.consumables.get(id) : undefined;
  return c?.kind === 'meal' ? c : undefined;
}

export function mealTicks(meal: Consumable): number {
  return (meal.durationSeconds ?? 0) * TICKS_PER_SECOND;
}

/** Stat bonus of the meal the hero is under. */
export function mealMods(hero: Hero, content: ContentDb): StatMods {
  const meal = mealOf(content, hero.meal?.mealId ?? null);
  return meal?.buff ? { [meal.buff.stat]: meal.buff.value } : {};
}

/** Eats the chosen meal when none is active and there is one in stock. */
export function eatIfHungry(s: GameState, content: ContentDb): boolean {
  if (s.hero.meal) return false;
  const meal = mealOf(content, s.settings.mealId);
  if (!meal || (s.consumables[meal.id] ?? 0) <= 0) return false;
  s.consumables[meal.id]!--;
  s.hero.meal = { mealId: meal.id, ticksLeft: mealTicks(meal) };
  return true;
}

/**
 * One tick of meals while hunting. In rate sampling (`frozen`) the meal does not run out,
 * so the sheet measures the fed setup.
 */
export function tickMeal(s: GameState, content: ContentDb, frozen: boolean) {
  if (!gathering(s)) return;
  const m = s.hero.meal;
  if (m && !frozen && --m.ticksLeft <= 0) s.hero.meal = null;
  eatIfHungry(s, content);
}

/** Hunting ticks the hero stays fed: the meal under way plus the stock of the chosen meal. */
export function fedTicks(s: GameState, content: ContentDb): number {
  const meal = mealOf(content, s.settings.mealId);
  const stock = meal ? (s.consumables[meal.id] ?? 0) * mealTicks(meal) : 0;
  return (s.hero.meal?.ticksLeft ?? 0) + stock;
}

/**
 * Hunting time away: meals eaten and what is left of the last one. Called by the offline
 * resolution for a stretch the hero is fed all along.
 */
export function consumeMeals(s: GameState, content: ContentDb, huntingTicks: number): number {
  let left = huntingTicks;
  let eaten = 0;
  while (left > 0) {
    const m = s.hero.meal;
    if (!m) {
      if (!eatIfHungry(s, content)) break;
      eaten++;
      continue;
    }
    const used = Math.min(left, m.ticksLeft);
    m.ticksLeft -= used;
    left -= used;
    if (m.ticksLeft <= 0) s.hero.meal = null;
  }
  // Like the live game, the next meal is eaten as soon as the last one ends.
  if (!s.hero.meal && huntingTicks > 0 && eatIfHungry(s, content)) eaten++;
  return eaten;
}

/** Chooses the meal the hero eats (null: none). */
export function setMeal(s: GameState, content: ContentDb, mealId: string | null) {
  if (mealId !== null && !mealOf(content, mealId)) throw new IntentError('not_a_meal');
  s.settings.mealId = mealId;
}
