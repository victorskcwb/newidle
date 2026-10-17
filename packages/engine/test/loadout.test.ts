import { describe, expect, it } from 'vitest';
import {
  computeHeroStats,
  equipBest,
  hashState,
  heroPower,
  type ItemInstance,
} from '../src/index.ts';
import { content, newGame } from './fixture.ts';

const item = (uid: number, baseId: string, ilvl: number, affixes: ItemInstance['affixes'] = []) =>
  ({
    uid,
    baseId,
    ilvl,
    rarity: affixes.length ? 'magic' : 'common',
    affixes,
    refine: 0,
  }) as ItemInstance;

describe('equip best', () => {
  it('equips the items that raise the hero power and keeps the rest', () => {
    const s = newGame(3);
    const before = heroPower(computeHeroStats(s.hero, content));
    s.stash.push(
      item(801, 'helm_leather', 5),
      item(802, 'ring_copper', 5, [{ affixId: 'flat_life', tier: 0, value: 30 }]),
    );
    const done = equipBest(s, content);
    expect(done).toEqual(expect.arrayContaining([801, 802]));
    expect(s.hero.equipment.helm?.uid).toBe(801);
    expect(s.hero.equipment.ring?.uid).toBe(802);
    expect(heroPower(computeHeroStats(s.hero, content))).toBeGreaterThan(before);
    // Nothing better left: a second call changes nothing.
    expect(equipBest(s, content)).toEqual([]);
  });

  it('skips items whose requirements the hero does not meet, deterministically', () => {
    const a = newGame(4);
    const strong = item(803, 'abyssal_blade', 90);
    a.stash.push(strong);
    equipBest(a, content);
    expect(a.hero.equipment.weapon?.uid).not.toBe(803);
    const b = newGame(4);
    b.stash.push({ ...strong });
    equipBest(b, content);
    expect(hashState(a)).toBe(hashState(b));
  });
});
