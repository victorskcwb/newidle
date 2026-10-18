import { describe, expect, it } from 'vitest';
import {
  computeRates,
  decodeSave,
  encodeSave,
  setMeal,
  stepQuiet,
  TICKS_PER_HOUR,
} from '../src/index.ts';
import { content, HUNT, hunting, newGame } from './fixture.ts';

describe('gold fractions', () => {
  it('a +10% gold bonus counts in full even where monsters drop 2 to 6 gold', () => {
    const s = hunting(4);
    s.consumables.potion_hp_small = 10_000;
    const plain = computeRates(s, content, HUNT);
    setMeal(s, content, 'meal_grilled_fish');
    s.consumables.meal_grilled_fish = 10;
    const fed = computeRates(s, content, HUNT);
    expect(fed.goldPerHour / plain.goldPerHour).toBeGreaterThan(1.08);
  });

  it('the fraction carried between kills stays below one coin', () => {
    const s = hunting(5);
    s.consumables.potion_hp_small = 10_000;
    stepQuiet(s, content, TICKS_PER_HOUR);
    expect(s.lifetime.kills).toBeGreaterThan(0n);
    expect(s.goldRemainder).toBeGreaterThanOrEqual(0);
    expect(s.goldRemainder).toBeLessThan(10_000);
  });

  it('migrates v13 saves with no fraction', () => {
    const s = newGame();
    const raw = JSON.parse(encodeSave(s, 1)) as {
      version: number;
      state: Record<string, unknown>;
    };
    raw.version = 13;
    raw.state.version = 13;
    delete raw.state.goldRemainder;
    expect(decodeSave(JSON.stringify(raw), content).state).toEqual(s);
  });
});
