import { buildContentDb, CONTENT_FILES, mergeContentFiles, type Rarity } from '@abismo/content';
import { describe, expect, it } from 'vitest';
import {
  applyBulkPity,
  createRng,
  decodeSave,
  DROP_PITY,
  encodeSave,
  pityDropsLeft,
  pityRarity,
  recordDrop,
  RARITY_ORDER,
  rngBinomial,
  rngInt,
  step,
  type DropPity,
  type GameEvent,
  type ItemInstance,
} from '../src/index.ts';
import { content, HUNT, hunting, newGame } from './fixture.ts';

const empty = (): Record<Rarity, number> => ({
  common: 0,
  magic: 0,
  rare: 0,
  epic: 0,
  legendary: 0,
});

/** Steps until the next equipment drop and returns it. */
function nextDrop(s: ReturnType<typeof hunting>, db = content): ItemInstance {
  for (let i = 0; i < 2_000; i++) {
    const drop = step(s, db, 100).find(
      (e): e is Extract<GameEvent, { type: 'ItemDropped' }> => e.type === 'ItemDropped',
    );
    if (drop) return drop.item;
  }
  throw new Error('no drop');
}

describe('equipment pity', () => {
  it('counts drops and guarantees the tier on the last one', () => {
    const p: DropPity = { epic: 0, legendary: 0 };
    recordDrop(p, 'common', true);
    recordDrop(p, 'rare', false);
    expect(p).toEqual({ epic: 2, legendary: 1 });
    recordDrop(p, 'epic', true);
    expect(p).toEqual({ epic: 0, legendary: 2 });
    recordDrop(p, 'legendary', true);
    expect(p).toEqual({ epic: 0, legendary: 0 });

    expect(pityRarity({ epic: DROP_PITY.epic - 2, legendary: 0 }, true)).toBeNull();
    expect(pityRarity({ epic: DROP_PITY.epic - 1, legendary: 0 }, true)).toBe('epic');
    expect(pityRarity({ epic: 0, legendary: DROP_PITY.legendary - 1 }, true)).toBe('legendary');
    // Where legendaries cannot drop, only the epic guarantee applies.
    expect(pityRarity({ epic: 0, legendary: DROP_PITY.legendary - 1 }, false)).toBeNull();
    expect(pityDropsLeft({ epic: 10, legendary: 0 }, 'epic')).toBe(DROP_PITY.epic - 10);
  });

  it('the guaranteed drop happens in the hunt and resets the counter', () => {
    const s = hunting(3);
    s.flags.push('first_magic');
    s.dropPity.epic = DROP_PITY.epic - 1;
    expect(nextDrop(s).rarity).toBe('epic');
    expect(s.dropPity.epic).toBe(0);
  });

  it('guarantees a legendary in hunts where legendaries drop', () => {
    const merged = mergeContentFiles(Object.values(CONTENT_FILES));
    merged.hunts = merged.hunts.map((h) => (h.id === HUNT ? { ...h, ilvl: 45 } : h));
    const db = buildContentDb(merged);
    const s = hunting(5, db);
    s.flags.push('first_magic');
    s.dropPity.legendary = DROP_PITY.legendary - 1;
    expect(nextDrop(s, db).rarity).toBe('legendary');
    expect(s.dropPity).toEqual({ epic: 0, legendary: 0 });
  });

  it('bulk resolution matches drop-by-drop pity on average', () => {
    // Rates low enough that the guarantee matters: expected 500 drops per epic, 2,500 per legendary.
    const epicPpm = 1_600;
    const legendaryPpm = 400;
    const drops = 1_500;
    const runs = 3_000;
    const rng = createRng([7, 11, 13, 17]);
    const seq = { epic: 0, legendary: 0, epicLeft: 0 };
    const bulk = { epic: 0, legendary: 0, epicLeft: 0 };
    for (let run = 0; run < runs; run++) {
      const start: DropPity = { epic: run % 200, legendary: run % 1_500 };
      // Drop by drop.
      const p = { ...start };
      for (let i = 0; i < drops; i++) {
        let r: Rarity = pityRarity(p, true) ?? 'common';
        if (r === 'common') {
          const roll = rngInt(rng, 0, 999_999);
          if (roll < legendaryPpm) r = 'legendary';
          else if (roll < legendaryPpm + epicPpm) r = 'epic';
        }
        if (r === 'legendary') seq.legendary++;
        if (r === 'epic') seq.epic++;
        recordDrop(p, r, true);
      }
      seq.epicLeft += p.epic;
      // In bulk.
      const c = empty();
      c.legendary = rngBinomial(rng, drops, legendaryPpm);
      c.epic = rngBinomial(rng, drops, epicPpm);
      c.common = drops - c.legendary - c.epic;
      const q = { ...start };
      applyBulkPity(rng, q, [c], true);
      expect(RARITY_ORDER.reduce((n, r) => n + c[r], 0)).toBe(drops);
      bulk.legendary += c.legendary;
      bulk.epic += c.epic;
      bulk.epicLeft += q.epic;
    }
    expect(Math.abs(bulk.legendary / seq.legendary - 1)).toBeLessThan(0.05);
    expect(Math.abs(bulk.epic / seq.epic - 1)).toBeLessThan(0.05);
    expect(Math.abs(bulk.epicLeft / seq.epicLeft - 1)).toBeLessThan(0.05);
  });

  it('migrates v7 saves with empty counters', () => {
    const s = newGame();
    const raw = JSON.parse(encodeSave(s, 1)) as {
      version: number;
      state: Record<string, unknown>;
    };
    raw.version = 7;
    raw.state.version = 7;
    delete raw.state.dropPity;
    delete raw.state.login;
    const loaded = decodeSave(JSON.stringify(raw), content);
    expect(loaded.state.dropPity).toEqual({ epic: 0, legendary: 0 });
    expect(loaded.state).toEqual(s);
  });
});
