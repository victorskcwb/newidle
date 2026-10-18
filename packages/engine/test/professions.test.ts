import { describe, expect, it } from 'vitest';
import {
  computeRates,
  decodeSave,
  encodeSave,
  gatherTarget,
  IntentError,
  PROFESSION_XP_TO_NEXT,
  refineItem,
  resolveOffline,
  setGathering,
  setRecipe,
  stepQuiet,
  TICKS_PER_HOUR,
  workTicks,
} from '../src/index.ts';
import { content, HUNT, hunting, newGame } from './fixture.ts';

describe('professions', () => {
  it('XP curve grows and stops at 99', () => {
    expect(PROFESSION_XP_TO_NEXT[1]).toBe(50);
    for (let l = 2; l < 99; l++) {
      expect(PROFESSION_XP_TO_NEXT[l]!).toBeGreaterThanOrEqual(PROFESSION_XP_TO_NEXT[l - 1]!);
    }
    expect(PROFESSION_XP_TO_NEXT[99]).toBe(0);
    const total = PROFESSION_XP_TO_NEXT.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(2_000_000);
    expect(total).toBeLessThan(3_500_000);
  });

  it('gathers the best resource the hunt and the level allow', () => {
    const s = hunting(1);
    expect(gatherTarget(s, content)).toBeNull();
    setGathering(s, content, 'mining');
    expect(gatherTarget(s, content)?.id).toBe('ore_copper');
    // A tier-5 hunt still gives copper to a level-1 miner, and silver at level 30.
    s.hunt!.huntId = 'burning_throne';
    expect(gatherTarget(s, content)?.id).toBe('ore_copper');
    s.professions.skills.mining = { level: 30, xp: 0 };
    expect(gatherTarget(s, content)?.id).toBe('ore_silver');
    // The cemetery is tier 1, whatever the level.
    s.hunt!.huntId = HUNT;
    expect(gatherTarget(s, content)?.id).toBe('ore_copper');
    expect(() => setGathering(s, content, 'alchemy')).toThrow(IntentError);
  });

  it('gathers while hunting and crafts from what it gathered', () => {
    const s = hunting(1);
    s.consumables.potion_hp_small = 10_000;
    setGathering(s, content, 'herbalism');
    setRecipe(s, content, 'alch_hp');
    stepQuiet(s, content, TICKS_PER_HOUR);
    const herb = content.resources.get('herb_ashleaf')!;
    const perHour = Math.floor(TICKS_PER_HOUR / workTicks(herb.seconds, herb.level, 1));
    // Every herb gathered went into a potion except the leftovers of the last craft.
    const herbs = s.resources.herb_ashleaf ?? 0;
    expect(herbs).toBeLessThan(2);
    expect(s.professions.skills.herbalism!.level).toBeGreaterThan(1);
    expect(s.professions.skills.alchemy!.level).toBeGreaterThan(1);
    expect(perHour).toBeGreaterThan(100);
  });

  it('a recipe above the level is locked; production waits for inputs', () => {
    const s = newGame();
    expect(() => setRecipe(s, content, 'alch_essence')).toThrow(IntentError);
    setRecipe(s, content, 'smith_fragments');
    stepQuiet(s, content, TICKS_PER_HOUR); // in town, nothing to smith
    expect(s.materials.fragment ?? 0n).toBe(0n);
    s.resources.ore_copper = 7;
    stepQuiet(s, content, TICKS_PER_HOUR);
    expect(s.materials.fragment).toBe(12n);
    expect(s.resources.ore_copper).toBe(1);
  });

  it('offline gathers and crafts exactly like the live game', () => {
    const live = hunting(6);
    live.consumables.potion_hp_small = 10_000;
    setGathering(live, content, 'mining');
    setRecipe(live, content, 'smith_fragments');
    live.resources.ore_copper = 2;
    const away = structuredClone(live);
    stepQuiet(live, content, 2 * TICKS_PER_HOUR);
    const rates = computeRates(away, content, HUNT);
    const report = resolveOffline(away, content, rates, 2 * TICKS_PER_HOUR);
    expect(report.stoppedBy).toBeNull();
    expect(away.resources).toEqual(live.resources);
    expect(away.professions).toEqual(live.professions);
    expect(report.crafted.smith_fragments).toBeGreaterThan(0);
    expect(report.gathered.ore_copper).toBeGreaterThan(0);
  });

  it('a tempering stone adds 10 points to a refine attempt and is spent', () => {
    const s = newGame();
    s.gold = 10_000_000_000n;
    s.materials = { fragment: 10_000_000n, essence: 10_000_000n, crystal: 10_000_000n };
    const item = s.hero.equipment.weapon!;
    item.refine = 6;
    expect(() => refineItem(s, content, item.uid, false, true)).toThrow(IntentError);
    // +7 at 80% → 90% with the stone: over many attempts, more successes.
    let plain = 0;
    let tempered = 0;
    for (let i = 0; i < 2_000; i++) {
      item.refine = 6;
      if (refineItem(s, content, item.uid).success) plain++;
      item.refine = 6;
      s.consumables.tempering_stone = 1;
      if (refineItem(s, content, item.uid, false, true).success) tempered++;
      expect(s.consumables.tempering_stone).toBe(0);
    }
    expect(plain / 2_000).toBeGreaterThan(0.76);
    expect(plain / 2_000).toBeLessThan(0.84);
    expect(tempered / 2_000).toBeGreaterThan(0.87);
    expect(tempered / 2_000).toBeLessThan(0.93);
  });

  it('migrates v11 saves with every profession at level 1', () => {
    const s = newGame();
    const raw = JSON.parse(encodeSave(s, 1)) as {
      version: number;
      state: Record<string, unknown>;
    };
    raw.version = 11;
    raw.state.version = 11;
    delete raw.state.professions;
    delete raw.state.resources;
    expect(decodeSave(JSON.stringify(raw), content).state).toEqual(s);
  });
});
