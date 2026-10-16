import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  IntentError,
  computeHeroStats,
  equipItem,
  reforgeBlock,
  reforgeCost,
  reforgeItem,
  type GameState,
  type ItemInstance,
} from '../src/index.ts';
import { content, newGame } from './fixture.ts';

function withRing(rarity: ItemInstance['rarity'], seed = 1): { s: GameState; ring: ItemInstance } {
  const s = newGame(seed);
  s.gold = 10_000_000n;
  s.materials = { essence: 1000n, crystal: 1000n, core: 1000n, soul: 1000n };
  const ring: ItemInstance = {
    uid: 700,
    baseId: 'ring_copper',
    ilvl: 10,
    rarity,
    affixes: [
      { affixId: 'inc_damage', tier: 0, value: 6 },
      { affixId: 'flat_life', tier: 0, value: 10 },
      { affixId: 'inc_xp', tier: 0, value: 3 },
    ],
    refine: 0,
  };
  s.stash.push(ring);
  return { s, ring };
}

describe('reforge', () => {
  it('only rare or better items; costs gold and materials by rarity', () => {
    const { s, ring } = withRing('magic');
    expect(reforgeBlock(s, ring, 0)).toBe('rarity');
    ring.rarity = 'rare';
    expect(reforgeCost(ring)).toEqual({ gold: 2000n, materials: { essence: 5, crystal: 3 } });
    reforgeItem(s, content, 700, 0);
    expect(s.gold).toBe(10_000_000n - 2000n);
    expect(s.materials.crystal).toBe(997n);
  });

  it('rerolls only the chosen affix, never into a duplicate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.integer({ min: 0, max: 2 }),
        (seed, index) => {
          const { s, ring } = withRing('rare', seed);
          const others = ring.affixes.filter((_, i) => i !== index).map((a) => ({ ...a }));
          const rolled = reforgeItem(s, content, 700, index);
          expect(ring.affixes[index]).toEqual(rolled);
          expect(ring.affixes.filter((_, i) => i !== index)).toEqual(others);
          const ids = ring.affixes.map((a) => a.affixId);
          expect(new Set(ids).size).toBe(ids.length);
          const affix = content.affixes.get(rolled.affixId)!;
          expect(affix.slots).toContain('ring');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('an equipped item’s new affix changes the hero stats at once', () => {
    const { s, ring } = withRing('rare', 3);
    equipItem(s, content, 700);
    ring.affixes[0] = { affixId: 'flat_life', tier: 0, value: 15 };
    ring.affixes[1] = { affixId: 'inc_xp', tier: 0, value: 3 };
    ring.affixes[2] = { affixId: 'inc_damage', tier: 0, value: 5 };
    const before = computeHeroStats(s.hero, content);
    let after = before;
    for (let i = 0; i < 20 && after.maxHp === before.maxHp; i++) {
      reforgeItem(s, content, 700, 0);
      after = computeHeroStats(s.hero, content);
    }
    expect(after.maxHp).not.toBe(before.maxHp);
  });

  it('refuses without materials', () => {
    const { s } = withRing('rare');
    s.materials = {};
    expect(() => reforgeItem(s, content, 700, 0)).toThrow(IntentError);
  });
});
