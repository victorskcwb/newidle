import { describe, expect, it } from 'vitest';
import {
  addXp,
  computeHeroStats,
  createRng,
  generateItem,
  inactiveReason,
  IntentError,
  learnSkill,
  performReset,
} from '../src/index.ts';
import { content, newGame } from './fixture.ts';

/** A hero ready to reset (level 100, gold), after `resets` resets. */
function atAltar(resets: number) {
  const s = newGame();
  s.hero.level = 100;
  s.hero.resets.count = resets;
  s.gold = 100_000_000n;
  return s;
}

describe('classes', () => {
  it('damage follows the class main attribute', () => {
    const s = newGame();
    s.hero.allocated.dexterity = 50;
    delete s.hero.equipment.weapon; // compare bare-handed: a sword would be inactive for her
    const warrior = computeHeroStats(s.hero, content).damageMax;
    s.hero.classId = 'huntress';
    const huntress = computeHeroStats(s.hero, content).damageMax;
    expect(huntress).toBeGreaterThan(warrior);
  });

  it("another class's weapon is inactive, and loot only brings the hero's own", () => {
    const s = newGame();
    const bow = {
      uid: 900,
      baseId: 'bow_short',
      ilvl: 1,
      rarity: 'common' as const,
      affixes: [],
      refine: 0,
    };
    expect(inactiveReason(s.hero, bow, content)).toEqual({ kind: 'class', classId: 'huntress' });
    const table = [...content.lootTables.values()][0]!;
    const rng = createRng([3, 1, 4, 1]);
    const weapons = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const item = generateItem(rng, content, table, 5, i, 'common', 'sorcerer');
      const base = content.itemBases.get(item.baseId)!;
      if (base.slot === 'weapon') weapons.add(base.classId ?? '');
    }
    expect([...weapons]).toEqual(['sorcerer']);
  });

  it('the class changes only at a reset, once unlocked, with its starting weapon', () => {
    const early = atAltar(0);
    expect(() => performReset(early, content, 'huntress')).toThrow(IntentError);
    const s = atAltar(4); // this reset is the 5th: the Huntress opens
    s.hero.skillOrder = ['heavy_strike'];
    const sword = s.hero.equipment.weapon!.uid;
    performReset(s, content, 'huntress');
    expect(s.hero.classId).toBe('huntress');
    expect(s.hero.equipment.weapon?.baseId).toBe('bow_short');
    expect(s.stash.some((i) => i.uid === sword)).toBe(true);
    expect(s.hero.lastSkillOrder).toEqual([]); // the warrior build does not carry over
    // The Huntress learns her own tree, not the Warrior's.
    s.hero.unspentSkillPoints = 2;
    expect(() => learnSkill(s, content, 'heavy_strike')).toThrow(IntentError);
    learnSkill(s, content, 'aimed_shot');
    expect(s.hero.skillLevels.aimed_shot).toBe(1);
  });

  it('automatic allocation feeds the main attribute', () => {
    const s = newGame();
    s.hero.classId = 'sorcerer';
    addXp(s, content, 5_000, 0, null);
    expect(s.hero.allocated.energy).toBeGreaterThan(s.hero.allocated.strength);
  });
});
