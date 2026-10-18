import { describe, expect, it } from 'vitest';
import { FIRST_RARE_ITEM_KILL, step, type GameEvent } from '../src/index.ts';
import { content, hunting } from './fixture.ts';

type Drop = Extract<GameEvent, { type: 'ItemDropped' }>;

/** Steps until the kill that makes lifetime kills reach `kill`; returns that kill's drops. */
function dropsOfKill(s: ReturnType<typeof hunting>, kill: bigint): Drop[] {
  for (let i = 0; i < 200_000; i++) {
    const before = s.lifetime.kills;
    const events = step(s, content, 1);
    if (before < kill && s.lifetime.kills >= kill) {
      return events.filter((e): e is Drop => e.type === 'ItemDropped');
    }
  }
  throw new Error('kill not reached');
}

describe('first rare item', () => {
  it('a hero without rares gets one around the 150th kill', () => {
    const s = hunting(2);
    s.flags.push('first_magic');
    s.lifetime.kills = FIRST_RARE_ITEM_KILL - 1n;
    s.lifetime.itemsByRarity = { common: 3, magic: 1, rare: 0, epic: 0, legendary: 0 };
    const drops = dropsOfKill(s, FIRST_RARE_ITEM_KILL);
    expect(drops.some((d) => d.item.rarity === 'rare')).toBe(true);
    expect(s.flags).toContain('first_rare');
  });

  it('a hero who already found a rare gets nothing extra', () => {
    const s = hunting(2);
    s.flags.push('first_magic');
    s.lifetime.kills = FIRST_RARE_ITEM_KILL - 1n;
    s.lifetime.itemsByRarity = { common: 3, magic: 1, rare: 1, epic: 0, legendary: 0 };
    const twin = structuredClone(s);
    twin.flags.push('first_rare');
    const a = dropsOfKill(s, FIRST_RARE_ITEM_KILL);
    const b = dropsOfKill(twin, FIRST_RARE_ITEM_KILL);
    expect(a.map((d) => d.item)).toEqual(b.map((d) => d.item));
  });
});
