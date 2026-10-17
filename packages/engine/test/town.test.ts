import { describe, expect, it } from 'vitest';
import {
  IntentError,
  buyConsumable,
  depositAll,
  forgeCost,
  forgeIlvl,
  forgeItem,
  hashState,
  sellItems,
  sellPrice,
  type GameState,
  type ItemInstance,
} from '../src/index.ts';
import { content, newGame } from './fixture.ts';

function inTown(seed = 1): GameState {
  const s = newGame(seed);
  s.activity = { kind: 'idle_town' };
  return s;
}

const sword = (uid: number, rarity: ItemInstance['rarity'], ilvl = 10): ItemInstance => ({
  uid,
  baseId: 'sword_rusty',
  ilvl,
  rarity,
  affixes: [],
  refine: 0,
});

describe('town services', () => {
  it('only work in town', () => {
    const s = newGame(1);
    s.activity = { kind: 'walking', untilTick: 10, group: [] } as unknown as GameState['activity'];
    expect(() => buyConsumable(s, content, 'potion_hp_small', 1)).toThrow(IntentError);
    expect(() => sellItems(s, [])).toThrow(IntentError);
    expect(() => forgeItem(s, content, 'weapon', 'magic')).toThrow(IntentError);
  });

  it('sells items from backpack and stash for a price by level and rarity', () => {
    const s = inTown();
    s.backpack.push(sword(901, 'common', 10));
    s.stash.push(sword(902, 'rare', 20));
    expect(sellPrice(sword(0, 'common', 10))).toBe(30);
    expect(sellPrice(sword(0, 'rare', 20))).toBe(525);
    const gold = s.gold;
    expect(sellItems(s, [901, 902])).toEqual({ count: 2, gold: 555 });
    expect(s.gold).toBe(gold + 555n);
    expect(s.backpack.some((i) => i.uid === 901)).toBe(false);
    expect(() => sellItems(s, [901])).toThrow(IntentError);
  });

  it('buys potions with gold', () => {
    const s = inTown();
    s.gold = 100n;
    const before = s.consumables.potion_hp_small ?? 0;
    buyConsumable(s, content, 'potion_hp_small', 5);
    expect(s.gold).toBe(50n);
    expect(s.consumables.potion_hp_small).toBe(before + 5);
    expect(() => buyConsumable(s, content, 'potion_hp_small', 6)).toThrow(IntentError);
    expect(() => buyConsumable(s, content, 'refine_charm', 1)).toThrow(IntentError);
    expect(() => buyConsumable(s, content, 'potion_hp_small', 0)).toThrow(IntentError);
  });

  it('forges an item of the slot and rarity, paying gold and materials', () => {
    const s = inTown();
    s.gold = 1_000_000n;
    s.materials = { fragment: 100n, essence: 100n, crystal: 100n };
    const cost = forgeCost(s, content, 'rare');
    const item = forgeItem(s, content, 'helm', 'rare');
    expect(content.itemBases.get(item.baseId)!.slot).toBe('helm');
    expect(item.rarity).toBe('rare');
    expect(item.ilvl).toBe(forgeIlvl(s, content));
    expect(item.affixes.length).toBeGreaterThanOrEqual(1);
    expect(s.gold).toBe(1_000_000n - BigInt(cost.gold));
    expect(s.materials.fragment).toBe(90n);
    expect(s.materials.essence).toBe(94n);
    expect(s.backpack.at(-1)).toBe(item);
  });

  it('refuses to forge without materials, and forging is deterministic', () => {
    const s = inTown();
    s.gold = 1_000_000n;
    s.materials = {};
    expect(() => forgeItem(s, content, 'weapon', 'magic')).toThrow(IntentError);
    const a = inTown(7);
    const b = inTown(7);
    for (const x of [a, b]) {
      x.gold = 1_000_000n;
      x.materials = { fragment: 100n };
      forgeItem(x, content, 'ring', 'magic');
    }
    expect(hashState(a)).toBe(hashState(b));
  });

  it('deposits the whole backpack into the stash', () => {
    const s = inTown();
    s.backpack.push(sword(903, 'common'), sword(904, 'magic'));
    const before = s.stash.length;
    expect(depositAll(s)).toBe(2);
    expect(s.backpack).toEqual([]);
    expect(s.stash.length).toBe(before + 2);
  });
});
