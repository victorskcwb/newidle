import { describe, expect, it } from 'vitest';
import { autoSell, setHuntBehaviour, stepQuiet, type ItemInstance } from '../src/index.ts';
import { content, hunting, newGame } from './fixture.ts';

const item = (uid: number, rarity: ItemInstance['rarity']): ItemInstance => ({
  uid,
  baseId: 'sword_rusty',
  ilvl: 10,
  rarity,
  affixes: [],
  refine: 0,
});

describe('hunt behaviour', () => {
  it('auto-sell keeps items above the chosen rarity and pays for the rest', () => {
    const s = newGame(1);
    setHuntBehaviour(s, { targetPriority: 'first', autoSellUpTo: 'magic' });
    const gold = s.gold;
    const { kept, gold: earned } = autoSell(s, [
      item(1, 'common'),
      item(2, 'magic'),
      item(3, 'rare'),
    ]);
    expect(kept.map((i) => i.uid)).toEqual([3]);
    expect(earned).toBeGreaterThan(0);
    expect(s.gold).toBe(gold + BigInt(earned));
  });

  it('target priority changes the fight but stays deterministic', () => {
    const a = hunting(9);
    const b = hunting(9);
    for (const s of [a, b]) setHuntBehaviour(s, { targetPriority: 'weakest', autoSellUpTo: null });
    stepQuiet(a, content, 20_000);
    stepQuiet(b, content, 20_000);
    expect(a.lifetime.kills).toBe(b.lifetime.kills);
    expect(a.lifetime.kills).toBeGreaterThan(0n);
  });
});
