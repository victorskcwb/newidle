import { describe, expect, it } from 'vitest';
import {
  collectionMaxPoints,
  collectionPoints,
  decodeSave,
  encodeSave,
  heroStats,
  IntentError,
  registerItem,
  type ItemInstance,
} from '../src/index.ts';
import { content, newGame } from './fixture.ts';

function item(uid: number, baseId: string, rarity: ItemInstance['rarity']): ItemInstance {
  return { uid, baseId, ilvl: 5, rarity, affixes: [], refine: 0 };
}

describe('item collection', () => {
  it('registering gives the item up and records its best rarity', () => {
    const s = newGame();
    const base = s.hero.equipment.weapon!.baseId;
    s.backpack.push(item(500, base, 'rare'), item(501, base, 'magic'));
    registerItem(s, 500);
    expect(s.hero.collection[base]).toBe('rare');
    expect(s.backpack.map((i) => i.uid)).toEqual([501]);
    expect(collectionPoints(s.hero)).toBe(3);
    // A lower rarity would waste the item.
    expect(() => registerItem(s, 501)).toThrow(IntentError);
    // Equipped items cannot be registered.
    expect(() => registerItem(s, s.hero.equipment.weapon!.uid)).toThrow(IntentError);
  });

  it('points become small permanent bonuses', () => {
    const s = newGame();
    const before = heroStats(s.hero, content);
    for (const [i, base] of [...content.itemBases.keys()].slice(0, 10).entries()) {
      s.stash.push(item(600 + i, base, 'legendary'));
      registerItem(s, 600 + i);
    }
    expect(collectionPoints(s.hero)).toBe(50);
    const after = heroStats(s.hero, content);
    expect(after.magicFindPct - before.magicFindPct).toBe(12);
    expect(collectionMaxPoints(content)).toBe(content.itemBases.size * 5);
  });

  it('migrates v16 saves with an empty collection', () => {
    const s = newGame();
    const raw = JSON.parse(encodeSave(s, 1)) as {
      version: number;
      state: { version: number; hero: Record<string, unknown> };
    };
    raw.version = 16;
    raw.state.version = 16;
    delete raw.state.hero.collection;
    expect(decodeSave(JSON.stringify(raw), content).state).toEqual(s);
  });
});
