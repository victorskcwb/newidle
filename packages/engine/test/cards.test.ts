import { describe, expect, it } from 'vitest';
import {
  TICKS_PER_HOUR,
  cardChancePpm,
  computeHeroStats,
  computeRates,
  createRng,
  decodeSave,
  encodeSave,
  pityThreshold,
  regionCards,
  regionComplete,
  resolveOffline,
  rollCard,
  step,
} from '../src/index.ts';
import { HUNT, content, hunting, newGame } from './fixture.ts';

const walker = content.cards.get('card_bone_walker')!;
const keeper = content.cards.get('card_gravekeeper')!;

describe('cards (section 8.4)', () => {
  it('chances: normal 1/2,000, elite 1/500, boss 1/100; pity doubles', () => {
    expect(cardChancePpm(walker, false, false)).toBe(500);
    expect(cardChancePpm(walker, true, false)).toBe(2_000);
    expect(cardChancePpm(keeper, false, false)).toBe(10_000);
    expect(cardChancePpm(walker, false, true)).toBe(1_000);
    expect(pityThreshold(walker)).toBe(6_000);
  });

  it('a drop adds a copy (up to 5) and resets the pity counter', () => {
    const s = newGame();
    const always = () => true;
    for (let i = 0; i < 7; i++) rollCard(s, content, 'bone_walker', false, always);
    expect(s.hero.cards.card_bone_walker).toBe(5);
    const never = () => false;
    rollCard(s, content, 'grave_rat', false, never);
    rollCard(s, content, 'grave_rat', false, never);
    expect(s.cardPity.card_grave_rat).toBe(2);
    expect(rollCard(s, content, 'grave_rat', false, always)).toEqual({
      cardId: 'card_grave_rat',
      copies: 1,
    });
    expect(s.cardPity.card_grave_rat).toBe(0);
  });

  it('the pity rule doubles the chance after 3× the expected kills', () => {
    const s = newGame();
    const seen: number[] = [];
    const record = (ppm: number) => {
      seen.push(ppm);
      return false;
    };
    s.cardPity.card_bone_walker = pityThreshold(walker) - 1;
    rollCard(s, content, 'bone_walker', false, record);
    rollCard(s, content, 'bone_walker', false, record);
    expect(seen).toEqual([500, 1_000]);
  });

  it('copies add their bonus; a full region adds the set bonus', () => {
    const s = newGame();
    const base = computeHeroStats(s.hero, content);
    s.hero.cards.card_grave_rat = 3;
    expect(computeHeroStats(s.hero, content).goldPct).toBe(base.goldPct + 6);
    const cinzarra = content.regions.get('cinzarra')!;
    for (const c of regionCards(content, cinzarra)) s.hero.cards[c.id] = 1;
    expect(regionComplete(s.hero, content, cinzarra)).toBe(true);
    const full = computeHeroStats(s.hero, content);
    // Gravekeeper card (+2% life) plus the region's +5% life.
    expect(full.maxHp).toBeGreaterThan(base.maxHp);
  });

  it('cards drop while hunting and appear as events', () => {
    const s = hunting(1);
    s.hero.level = 30;
    const events = step(s, content, 30 * TICKS_PER_HOUR);
    const drops = events.filter((e) => e.type === 'CardDropped');
    expect(drops.length).toBeGreaterThan(0);
    expect(Object.values(s.hero.cards).reduce((a, b) => a + b, 0)).toBe(drops.length);
  });

  it('offline cards match the expected rate on average', () => {
    const base = hunting(4);
    base.hero.level = 30;
    const rates = computeRates(base, content, HUNT);
    const expected = rates.cardsPerHour.card_bone_walker! * 12;
    let total = 0;
    const RUNS = 400;
    for (let i = 0; i < RUNS; i++) {
      const s = structuredClone(base);
      s.rng = createRng([i + 1, 2, 3, 4]);
      total += resolveOffline(s, content, rates, 12 * TICKS_PER_HOUR).cards.card_bone_walker ?? 0;
    }
    // Pity can only add drops, and the 5-copy cap barely matters at this rate.
    expect(total / RUNS).toBeGreaterThan(expected * 0.85);
    expect(total / RUNS).toBeLessThan(expected * 1.5);
  });

  it('a version 2 save gets an empty album', () => {
    const s = newGame();
    const v2 = JSON.parse(encodeSave(s, 0)) as {
      version: number;
      state: Record<string, Record<string, unknown>>;
    };
    v2.version = 2;
    (v2.state as Record<string, unknown>).version = 2;
    delete v2.state.hero!.cards;
    delete (v2.state as Record<string, unknown>).cardPity;
    const loaded = decodeSave(JSON.stringify(v2), content);
    expect(loaded.state.hero.cards).toEqual({});
    expect(loaded.state.cardPity).toEqual({});
  });
});
