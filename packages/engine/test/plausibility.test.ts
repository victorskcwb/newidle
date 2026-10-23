import { describe, expect, it } from 'vitest';
import {
  TICKS_PER_HOUR,
  advanceAway,
  cloneState,
  implausibilities,
  stepQuiet,
  type GameState,
} from '../src/index.ts';
import { content, hunting } from './fixture.ts';

/** A hero played for a while with every automation on (equip, best hunt, skills, reset). */
function played(seed: number, hours: number): GameState {
  const s = hunting(seed);
  s.settings.automation = { equipBest: true, bestHunt: true, autoSkills: true, autoReset: true };
  for (let h = 0; h < hours; h++) {
    stepQuiet(s, content, TICKS_PER_HOUR / 2);
    // Half of each hour away, like a player who comes and goes.
    advanceAway(s, content, TICKS_PER_HOUR / 2);
  }
  return s;
}

describe('plausibility of imported saves (decision 177)', () => {
  const real = [1, 2, 3].map((seed) => played(seed, 30));

  it('real play is plausible', () => {
    for (const s of real) {
      expect(s.hero.level).toBeGreaterThan(10);
      expect(implausibilities(s, content)).toEqual([]);
    }
  });

  it('catches edited levels, gold, items, affixes and kills', () => {
    const edit = (fn: (s: GameState) => void) => {
      const s = cloneState(real[0]!);
      fn(s);
      return implausibilities(s, content);
    };
    expect(edit((s) => (s.hero.level = 99))).toContain('level');
    expect(edit((s) => (s.gold = s.lifetime.goldEarned + 1n))).toContain('gold');
    expect(
      edit((s) => {
        const it = s.backpack[0] ?? s.stash[0] ?? s.hero.equipment.weapon!;
        it.ilvl = 100;
      }),
    ).toContain('item_level');
    expect(
      edit((s) => {
        const it = [...s.backpack, ...s.stash].find((i) => i.affixes.length > 0)!;
        it.affixes[0]!.value = 9_999;
      }),
    ).toContain('affix_value');
    expect(edit((s) => (s.lifetime.kills = BigInt(s.tick) * 10n))).toContain('kills');
  });
});
