import { buildContentDb, CONTENT_FILES, mergeContentFiles } from '@abismo/content';
import { describe, expect, it } from 'vitest';
import {
  BACKPACK_SIZE,
  computeHeroStats,
  createRng,
  defenseReductionPpm,
  equipItem,
  hitChancePpm,
  rollHit,
  totalXpToReach,
  xpGapPct,
  xpToNext,
  type ItemInstance,
} from '../src/index.ts';
import { content, newGame } from './fixture.ts';

describe('XP curve', () => {
  it('matches floor(100 × 1.08^(L−1)) at levels 2, 50 and 100', () => {
    expect(xpToNext(1)).toBe(100); // to reach level 2
    expect(xpToNext(2)).toBe(108);
    expect(xpToNext(49)).toBe(4021); // to reach level 50
    expect(xpToNext(99)).toBe(188_594); // to reach level 100
    expect(xpToNext(100)).toBe(0);
  });

  it('totals about 2.5 million XP to level 100', () => {
    expect(totalXpToReach(100)).toBe(2_544_721);
  });

  it('reduces XP from monsters far below the hero', () => {
    expect(xpGapPct(10, 5)).toBe(100);
    expect(xpGapPct(15, 5)).toBe(50);
    expect(xpGapPct(25, 5)).toBe(10);
  });
});

describe('combat formulas', () => {
  it('clamps hit chance to [5%, 95%]', () => {
    expect(hitChancePpm(50, 50)).toBe(500_000);
    expect(hitChancePpm(1000, 1)).toBe(950_000);
    expect(hitChancePpm(1, 1000)).toBe(50_000);
  });

  it('caps defense reduction at 75%', () => {
    expect(defenseReductionPpm(0, 10)).toBe(0);
    expect(defenseReductionPpm(50, 1)).toBe(500_000);
    expect(defenseReductionPpm(1_000_000, 1)).toBe(750_000);
  });

  it('applies damage %, defense and crits, never below 1', () => {
    const rng = createRng([1, 2, 3, 4]);
    const atk = {
      level: 1,
      accuracy: 1e6,
      damageMin: 10,
      damageMax: 10,
      critChancePpm: 0,
      critDamagePct: 150,
      damagePct: 200,
    };
    expect(rollHit(rng, atk, { evasion: 0, defense: 50 })).toEqual({
      damage: 10,
      crit: false,
      miss: false,
    });
    const crit = rollHit(rng, { ...atk, critChancePpm: 1_000_000 }, { evasion: 0, defense: 0 });
    expect(crit).toEqual({ damage: 30, crit: true, miss: false });
    const tiny = rollHit(rng, { ...atk, damageMin: 1, damageMax: 1 }, { evasion: 0, defense: 1e9 });
    expect(tiny.damage).toBe(1);
  });
});

describe('hero stats', () => {
  it('derives stats from attributes as section 5.2 says', () => {
    const s = newGame();
    const base = computeHeroStats(s.hero, content);
    s.hero.allocated.vitality = 3;
    s.hero.allocated.energy = 2;
    s.hero.allocated.strength = 10;
    const more = computeHeroStats(s.hero, content);
    expect(more.maxHp - base.maxHp).toBe(30);
    expect(more.maxMana - base.maxMana).toBe(10);
    expect(more.damageMax).toBeGreaterThan(base.damageMax);
    expect(base.critDamagePct).toBe(150);
    expect(base.critChancePpm).toBe(50_000 + 10 * 1_000);
  });

  it('keeps items with unmet requirements equipped but inactive', () => {
    const merged = mergeContentFiles(Object.values(CONTENT_FILES));
    merged.itemBases = merged.itemBases.map((b) =>
      b.id === 'helm_leather' ? { ...b, requires: { level: 5 } } : b,
    );
    const gatedContent = buildContentDb(merged);
    const s = newGame();
    const helm: ItemInstance = {
      uid: 999,
      baseId: 'helm_leather',
      ilvl: 1,
      rarity: 'magic',
      affixes: [{ affixId: 'flat_life', tier: 0, value: 15 }],
      refine: 0,
    };
    s.stash.push(helm);
    equipItem(s, content, 999);
    const active = computeHeroStats(s.hero, content);
    expect(active.inactiveSlots).toEqual([]);
    const gated = computeHeroStats(s.hero, gatedContent);
    expect(gated.inactiveSlots).toEqual(['helm']);
    expect(gated.maxHp).toBe(active.maxHp - 15);
    expect(gated.defense).toBe(active.defense - 4);
    s.hero.level = 5;
    expect(computeHeroStats(s.hero, gatedContent).inactiveSlots).toEqual([]);
  });

  it('starts with a 40-slot backpack and the starter sword', () => {
    const s = newGame();
    expect(BACKPACK_SIZE).toBe(40);
    expect(s.hero.equipment.weapon?.baseId).toBe('sword_rusty');
  });
});
