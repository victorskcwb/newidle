import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  AFFIX_COUNT,
  PPM,
  RARITY_ORDER,
  createRng,
  effectiveMagicFindPct,
  eligibleAffixes,
  filterKeeps,
  generateItem,
  rarityTable,
  rollRarity,
} from '../src/index.ts';
import { content } from './fixture.ts';

const table = content.lootTables.get('loot_cemetery')!;

describe('rarity', () => {
  it('base chances follow section 7.2 and always sum to 100%', () => {
    expect(rarityTable(0)).toEqual({
      common: 700_000,
      magic: 220_000,
      rare: 70_000,
      epic: 9_000,
      legendary: 1_000,
    });
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), (mf) => {
        const t = rarityTable(mf);
        const sum = RARITY_ORDER.reduce((n, r) => n + t[r], 0);
        return sum === PPM && t.common >= 0;
      }),
    );
  });

  it('magic find has diminishing returns', () => {
    expect(effectiveMagicFindPct(100)).toBe(50);
    expect(effectiveMagicFindPct(300)).toBe(75);
    expect(effectiveMagicFindPct(1e6)).toBeLessThan(100);
    expect(rarityTable(100).legendary).toBe(1_500);
  });

  it('minRarity folds lower rarities into it', () => {
    const t = rarityTable(0, 'magic');
    expect(t.common).toBe(0);
    expect(t.magic).toBe(920_000);
  });

  it('the rolled distribution matches the table', () => {
    const rng = createRng([7, 7, 7, 7]);
    const counts = { common: 0, magic: 0, rare: 0, epic: 0, legendary: 0 };
    const n = 200_000;
    const t = rarityTable(0);
    for (let i = 0; i < n; i++) counts[rollRarity(rng, t)]++;
    expect(counts.common / n).toBeCloseTo(0.7, 2);
    expect(counts.magic / n).toBeCloseTo(0.22, 2);
    expect(counts.rare / n).toBeCloseTo(0.07, 2);
  });
});

describe('item generation', () => {
  it('never repeats an affix, respects counts, slots and tiers', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 0xffffffff }), { minLength: 4, maxLength: 4 }),
        fc.constantFrom(...RARITY_ORDER),
        fc.integer({ min: 1, max: 100 }),
        (seed, rarity, huntIlvl) => {
          const rng = createRng(seed as [number, number, number, number]);
          const item = generateItem(rng, content, table, huntIlvl, 1, rarity);
          const base = content.itemBases.get(item.baseId)!;
          const ids = item.affixes.map((a) => a.affixId);
          expect(new Set(ids).size).toBe(ids.length);
          const [min, max] = AFFIX_COUNT[rarity];
          const pool = eligibleAffixes(content, base, item.ilvl).length;
          expect(ids.length).toBeLessThanOrEqual(max);
          expect(ids.length).toBeGreaterThanOrEqual(Math.min(min, pool));
          expect(Math.abs(item.ilvl - Math.min(100, Math.max(1, huntIlvl)))).toBeLessThanOrEqual(2);
          for (const a of item.affixes) {
            const affix = content.affixes.get(a.affixId)!;
            expect(affix.slots).toContain(base.slot);
            const tier = affix.tiers[a.tier]!;
            expect(tier.minIlvl).toBeLessThanOrEqual(item.ilvl);
            expect(a.value).toBeGreaterThanOrEqual(tier.min);
            expect(a.value).toBeLessThanOrEqual(tier.max);
            if (rarity === 'epic' || rarity === 'legendary') {
              expect(a.value).toBeGreaterThanOrEqual(Math.ceil((tier.min + tier.max) / 2));
            }
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('better affix tiers only appear at higher item levels', () => {
    const rng = createRng([3, 1, 4, 1]);
    for (let i = 0; i < 300; i++) {
      const low = generateItem(rng, content, table, 3, i, 'rare');
      expect(low.affixes.every((a) => a.tier === 0)).toBe(true);
      const high = generateItem(rng, content, table, 60, i, 'rare');
      for (const a of high.affixes) {
        expect(a.tier).toBe(content.affixes.get(a.affixId)!.tiers.length - 1);
      }
    }
  });

  it('loot filter keeps by rarity or by affix', () => {
    const item = {
      uid: 1,
      baseId: 'helm_leather',
      ilvl: 5,
      rarity: 'common' as const,
      affixes: [],
      refine: 0,
    };
    expect(filterKeeps({ keepFromRarity: 'magic', alwaysKeepAffixes: [] }, item)).toBe(false);
    expect(filterKeeps({ keepFromRarity: 'common', alwaysKeepAffixes: [] }, item)).toBe(true);
    const xp = {
      ...item,
      rarity: 'magic' as const,
      affixes: [{ affixId: 'inc_xp', tier: 0, value: 3 }],
    };
    expect(filterKeeps({ keepFromRarity: 'rare', alwaysKeepAffixes: ['inc_xp'] }, xp)).toBe(true);
  });
});
