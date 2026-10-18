import { describe, expect, it } from 'vitest';
import {
  computeRates,
  debugSetLevel,
  learnSkill,
  startHunt,
  decodeSave,
  encodeSave,
  heroStats,
  IntentError,
  resolveOffline,
  setMeal,
  stepQuiet,
  TICKS_PER_HOUR,
} from '../src/index.ts';
import { content, hunting, newGame } from './fixture.ts';

const FISH = 'meal_grilled_fish'; // +10% gold for 30 min of hunting
const HALF_HOUR = TICKS_PER_HOUR / 2;
const CRYPT = 'cracked_crypt';

/** A level-30 hero in the crypt: gold per kill large enough for +10% to show, level steady. */
function veteran(seed: number) {
  const s = newGame(seed);
  debugSetLevel(s, content, 30);
  s.hero.unspentSkillPoints = 50;
  for (let i = 0; i < 3; i++) learnSkill(s, content, 'heavy_strike');
  s.consumables.potion_hp_small = 10_000;
  s.unlockedHunts.push(CRYPT);
  startHunt(s, content, CRYPT);
  return s;
}

describe('meals', () => {
  it('the hero eats the chosen meal, gets its bonus and eats the next when it ends', () => {
    const s = hunting(1);
    s.consumables.potion_hp_small = 10_000;
    const base = heroStats(s.hero, content).goldPct;
    expect(() => setMeal(s, content, 'potion_hp_small')).toThrow(IntentError);
    setMeal(s, content, FISH);
    s.consumables[FISH] = 2;
    stepQuiet(s, content, 1);
    expect(s.hero.meal?.mealId).toBe(FISH);
    expect(s.consumables[FISH]).toBe(1);
    expect(heroStats(s.hero, content).goldPct).toBe(base + 10);
    stepQuiet(s, content, HALF_HOUR);
    expect(s.consumables[FISH]).toBe(0);
    expect(s.hero.meal).not.toBeNull();
    stepQuiet(s, content, HALF_HOUR);
    expect(s.hero.meal).toBeNull();
    expect(heroStats(s.hero, content).goldPct).toBe(base);
  });

  it('a meal only runs out while hunting', () => {
    const s = newGame();
    setMeal(s, content, FISH);
    s.consumables[FISH] = 1;
    stepQuiet(s, content, TICKS_PER_HOUR); // resting in town
    expect(s.consumables[FISH]).toBe(1);
    expect(s.hero.meal).toBeNull();
  });

  it('the rate sheet measures the fed hero', () => {
    const s = veteran(2);
    const plain = computeRates(s, content, CRYPT);
    setMeal(s, content, FISH);
    s.consumables[FISH] = 5;
    const fed = computeRates(s, content, CRYPT);
    expect(fed.goldPerHour).toBeGreaterThan(plain.goldPerHour * 1.05);
    expect(s.consumables[FISH]).toBe(5); // sampling never touches the real state
  });

  it('offline: fed while the food lasts, then plain', () => {
    const tries = 12;
    let gold = 0;
    let expected = 0;
    for (let i = 0; i < tries; i++) {
      const s = veteran(100 + i);
      const plain = computeRates(s, content, CRYPT);
      setMeal(s, content, FISH);
      s.consumables[FISH] = 2; // one hour of food
      const fed = computeRates(s, content, CRYPT);
      const report = resolveOffline(s, content, fed, 4 * TICKS_PER_HOUR);
      expect(report.mealsEaten).toBe(2);
      expect(report.resolvedTicks).toBe(4 * TICKS_PER_HOUR);
      expect(s.consumables[FISH]).toBe(0);
      expect(s.hero.meal).toBeNull();
      gold += Number(report.gold);
      expected += fed.goldPerHour + 3 * plain.goldPerHour;
    }
    expect(Math.abs(gold / expected - 1)).toBeLessThan(0.05);
  });

  it('cooking turns fish into meals', () => {
    const s = newGame();
    s.resources.fish_minnow = 4;
    s.professions.recipe = 'cook_grilled_fish';
    stepQuiet(s, content, TICKS_PER_HOUR);
    expect(s.consumables[FISH]).toBe(2);
    expect(s.resources.fish_minnow).toBe(0);
  });

  it('migrates v12 saves with no meal', () => {
    const s = newGame();
    const raw = JSON.parse(encodeSave(s, 1)) as {
      version: number;
      state: { version: number; hero: Record<string, unknown>; settings: Record<string, unknown> };
    };
    raw.version = 12;
    raw.state.version = 12;
    delete raw.state.hero.meal;
    delete raw.state.settings.mealId;
    expect(decodeSave(JSON.stringify(raw), content).state).toEqual(s);
  });
});
