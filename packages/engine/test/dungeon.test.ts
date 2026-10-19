import { describe, expect, it } from 'vitest';
import {
  computeRates,
  debugSetLevel,
  decodeSave,
  DUNGEON_FLOOR_TIME_LIMIT_TICKS,
  dungeonStartFloor,
  encodeSave,
  enterDungeon,
  floorBlock,
  floorScalePct,
  huntOf,
  IntentError,
  isBossFloor,
  learnSkill,
  performReset,
  resetPointsEarned,
  resolveOffline,
  returnToTown,
  stepQuiet,
  TICKS_PER_HOUR,
} from '../src/index.ts';
import { content, HUNT, hunting, newGame } from './fixture.ts';

/** A strong hero, dungeon unlocked, in the starting hunt. */
function veteran(level: number, seed = 1) {
  const s = hunting(seed);
  debugSetLevel(s, content, level);
  s.hero.unspentSkillPoints = 60;
  for (let i = 0; i < 5; i++) learnSkill(s, content, 'heavy_strike');
  s.consumables.potion_hp_small = 10_000;
  s.defeatedBosses = ['gravekeeper', 'spider_matriarch', 'lord_vharok'];
  return s;
}

describe('dungeon', () => {
  it('floors echo the hunts in blocks of ten and grow 8% a floor', () => {
    expect(floorBlock(content, 1).hunt.id).toBe(HUNT);
    expect(floorScalePct(content, 1)).toBe(100);
    expect(floorScalePct(content, 10)).toBe(172);
    expect(isBossFloor(10)).toBe(true);
    expect(floorBlock(content, 11).hunt.id).toBe('pale_woods');
    expect(floorScalePct(content, 11)).toBe(100);
    // Past the last hunt the floors keep growing.
    expect(floorBlock(content, 95).hunt.id).toBe('burning_throne');
    expect(floorScalePct(content, 95)).toBe(100 + 8 * 14);
  });

  it('opens after the first region and starts from the last tenth floor', () => {
    const s = newGame();
    expect(() => enterDungeon(s)).toThrow(IntentError);
    const v = veteran(50);
    v.dungeon.bestEver = 37;
    expect(dungeonStartFloor(v)).toBe(31);
    enterDungeon(v);
    expect(v.dungeon.floor).toBe(31);
    expect(huntOf(v, content)?.mapId).toBe(floorBlock(content, 31).hunt.mapId);
  });

  it('a strong hero climbs, collects floor rewards and beats the tenth-floor boss', () => {
    const s = veteran(60, 2);
    enterDungeon(s);
    stepQuiet(s, content, TICKS_PER_HOUR / 2);
    expect(s.dungeon.best).toBeGreaterThanOrEqual(10);
    expect(s.materials.crystal ?? 0n).toBeGreaterThanOrEqual(10n);
    expect(s.materials.core ?? 0n).toBeGreaterThanOrEqual(1n);
    // While in the dungeon, the assigned hunt's boss counter does not move.
    if (s.dungeon.active) expect(s.hunt!.killsSinceBoss).toBe(0);
  });

  it('a defeat ends the run and the hero goes back to the hunt', () => {
    const s = veteran(5, 3);
    s.dungeon.bestEver = 90; // starts at floor 91, far too strong
    enterDungeon(s);
    for (let i = 0; i < 60 && s.dungeon.active; i++) stepQuiet(s, content, 600);
    expect(s.dungeon.active).toBe(false);
    stepQuiet(s, content, 600);
    expect(huntOf(s, content)?.id).toBe(HUNT);
  });

  it('a floor not cleared in time ends the run', () => {
    const s = veteran(60);
    enterDungeon(s);
    stepQuiet(s, content, 50);
    // Pretend the floor started long ago.
    s.dungeon.floorStartTick = s.tick - DUNGEON_FLOOR_TIME_LIMIT_TICKS;
    stepQuiet(s, content, 1);
    expect(s.dungeon.active).toBe(false);
    expect(s.activity.kind).toBe('to_town');
  });

  it('a boss floor gives a rare or better item', () => {
    const s = veteran(60, 5);
    s.dungeon.bestEver = 9;
    enterDungeon(s); // starts at floor 1
    s.dungeon.floor = 10;
    const before = new Set([...s.backpack, ...s.stash].map((i) => i.uid));
    for (let i = 0; i < 20 && s.dungeon.best < 10; i++) stepQuiet(s, content, 600);
    const loot = [...s.backpack, ...s.stash].filter((i) => !before.has(i.uid));
    expect(loot.some((i) => ['rare', 'epic', 'legendary'].includes(i.rarity))).toBe(true);
  });

  it('leaving by hand ends the run too', () => {
    const s = veteran(60);
    enterDungeon(s);
    stepQuiet(s, content, 100);
    returnToTown(s, content);
    expect(s.dungeon.active).toBe(false);
  });

  it('the deepest floor of the cycle adds reset points, then starts over', () => {
    const s = veteran(100);
    s.dungeon.best = 23;
    s.dungeon.bestEver = 23;
    expect(resetPointsEarned(s.hero, s.dungeon.best)).toBe(resetPointsEarned(s.hero) + 4);
    s.gold = 10_000_000n;
    const { points } = performReset(s, content);
    expect(points).toBe(10 + 4); // first reset, no new bosses this cycle
    expect(s.dungeon.best).toBe(0);
    expect(s.dungeon.bestEver).toBe(23);
  });

  it('offline plays the run out, then hunts for the rest of the time', () => {
    const s = veteran(40, 4);
    enterDungeon(s);
    const rates = computeRates(s, content, HUNT);
    const report = resolveOffline(s, content, rates, 6 * TICKS_PER_HOUR);
    expect(s.dungeon.active).toBe(false);
    expect(report.dungeon?.to).toBeGreaterThan(0);
    expect(report.resolvedTicks).toBe(6 * TICKS_PER_HOUR);
    expect(report.kills).toBeGreaterThan(0);
  });

  it('migrates v15 saves with a fresh dungeon', () => {
    const s = newGame();
    const raw = JSON.parse(encodeSave(s, 1)) as {
      version: number;
      state: Record<string, unknown>;
    };
    raw.version = 15;
    raw.state.version = 15;
    delete raw.state.dungeon;
    expect(decodeSave(JSON.stringify(raw), content).state).toEqual(s);
  });
});
