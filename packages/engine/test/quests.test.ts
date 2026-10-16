import { describe, expect, it } from 'vitest';
import {
  DAILY_QUESTS,
  IntentError,
  TICKS_PER_HOUR,
  claimQuest,
  computeRates,
  decodeSave,
  encodeSave,
  refreshQuests,
  resolveOffline,
  step,
  weekOf,
} from '../src/index.ts';
import { HUNT, content, hunting, newGame } from './fixture.ts';

describe('daily and weekly goals', () => {
  it('the same day gives the same goals; a new day gives new ones', () => {
    const a = newGame(1);
    const b = newGame(2);
    refreshQuests(a, 20_000);
    refreshQuests(b, 20_000);
    expect(a.quests.daily).toEqual(b.quests.daily);
    expect(a.quests.daily).toHaveLength(DAILY_QUESTS);
    expect(new Set(a.quests.daily.map((q) => q.kind)).size).toBe(DAILY_QUESTS);
    const before = a.quests.daily;
    refreshQuests(a, 20_000);
    expect(a.quests.daily).toBe(before);
    refreshQuests(a, 20_001);
    expect(a.quests.day).toBe(20_001);
    expect(a.quests.weekly).not.toBeNull();
  });

  it('the game RNG is not touched by goal generation', () => {
    const a = newGame(3);
    const rng = [...a.rng];
    refreshQuests(a, 123);
    expect(a.rng).toEqual(rng);
  });

  it('weeks start on Monday and keep the weekly goal through the week', () => {
    // 1970-01-05 (day 4) was a Monday.
    expect(weekOf(4)).toBe(weekOf(10));
    expect(weekOf(11)).toBe(weekOf(4) + 1);
  });

  it('hunting fills goals; finished goals pay out once', () => {
    const s = hunting(5);
    s.hero.level = 30;
    refreshQuests(s, 20_000);
    s.quests.daily[0] = {
      kind: 'kill_monsters',
      target: 50,
      progress: 0,
      claimed: false,
      reward: { fragment: 15 },
    };
    step(s, content, TICKS_PER_HOUR / 2);
    const q = s.quests.daily[0]!;
    expect(q.progress).toBe(50);
    const before = s.materials.fragment ?? 0n;
    expect(claimQuest(s, 0)).toEqual({ fragment: 15 });
    expect(s.materials.fragment).toBe(before + 15n);
    expect(() => claimQuest(s, 0)).toThrow(IntentError);
  });

  it('unfinished goals cannot be claimed; the weekly charm goes to consumables', () => {
    const s = newGame();
    refreshQuests(s, 20_000);
    expect(() => claimQuest(s, 'weekly')).toThrow('quest_not_done');
    s.quests.weekly!.progress = s.quests.weekly!.target;
    claimQuest(s, 'weekly');
    expect(s.consumables.refine_charm).toBe(1);
  });

  it('time away counts toward goals', () => {
    const s = hunting(6);
    s.hero.level = 30;
    refreshQuests(s, 20_000);
    s.quests.daily[0] = {
      kind: 'kill_monsters',
      target: 100,
      progress: 0,
      claimed: false,
      reward: {},
    };
    const rates = computeRates(s, content, HUNT);
    resolveOffline(s, content, rates, TICKS_PER_HOUR);
    expect(s.quests.daily[0]!.progress).toBe(100);
  });

  it('a version 5 save starts with no goals until the next refresh', () => {
    const s = newGame();
    const v5 = JSON.parse(encodeSave(s, 0)) as { version: number; state: Record<string, unknown> };
    v5.version = 5;
    v5.state.version = 5;
    delete v5.state.quests;
    const loaded = decodeSave(JSON.stringify(v5), content).state;
    expect(loaded.quests).toEqual({ day: -1, daily: [], week: -1, weekly: null });
  });
});
