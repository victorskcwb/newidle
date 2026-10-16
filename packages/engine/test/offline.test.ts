import { describe, expect, it } from 'vitest';
import {
  OFFLINE_CAP_TICKS,
  RARITY_ORDER,
  TICKS_PER_HOUR,
  cloneState,
  computeRates,
  createRng,
  newCounters,
  potionHoursLeft,
  prepareSample,
  resolveOffline,
  stepQuiet,
  type GameState,
} from '../src/index.ts';
import { HUNT, content, hunting, newGame } from './fixture.ts';

const TWO_HOURS = 2 * TICKS_PER_HOUR;

/**
 * A level 30 hero in the level 1–10 hunt: the XP penalty is already at its floor (10%), so
 * the levels gained in 2 h do not change XP per kill and the frozen-level reference holds.
 */
function setup(): GameState {
  const s = hunting(100);
  s.hero.level = 30;
  s.hero.allocated = { strength: 8, dexterity: 4, vitality: 8, energy: 0 };
  s.gold = 500n;
  // Drink on any damage, so potion use is large enough to compare; a big stock keeps
  // potion runs (and the town trips they cause) out of the comparison.
  s.settings.potionThresholdPct = 99;
  s.consumables.potion_hp_small = 5_000;
  return s;
}

describe('offline resolution vs tick simulation (section 9.3)', () => {
  it('the mean of 1,000 offline resolutions of 2 h is within ±5% of the tick simulation', () => {
    const base = setup();
    const rates = computeRates(base, content, HUNT);

    // Reference: many independent 2 h tick simulations of the same setup (level frozen, as in
    // the rate sheet: offline applies the rates of the setup the hero left with).
    const REF_RUNS = 120;
    const ref = {
      kills: 0,
      xp: 0,
      gold: 0,
      potions: 0,
      items: 0,
      byRarity: {} as Record<string, number>,
    };
    for (let i = 0; i < REF_RUNS; i++) {
      const s = prepareSample(base, content, HUNT);
      s.rng = createRng([i + 1, 77, 0xabcdef, i * 31 + 5]);
      const c = newCounters();
      stepQuiet(s, content, TWO_HOURS, { freezeLevel: true, counters: c });
      ref.kills += [...c.kills.values()].reduce((a, b) => a + b, 0);
      ref.xp += c.xp;
      ref.gold += c.gold;
      ref.potions += c.potionsUsed.potion_hp_small ?? 0;
      for (const r of RARITY_ORDER) {
        const n = s.lifetime.itemsByRarity[r] - base.lifetime.itemsByRarity[r];
        ref.byRarity[r] = (ref.byRarity[r] ?? 0) + n;
        ref.items += n;
      }
    }

    const RUNS = 1000;
    const off = {
      kills: 0,
      xp: 0,
      gold: 0,
      potions: 0,
      items: 0,
      byRarity: {} as Record<string, number>,
    };
    for (let i = 0; i < RUNS; i++) {
      const s = cloneState(base);
      s.rng = createRng([i + 1, 3, 5, 7]);
      const r = resolveOffline(s, content, rates, TWO_HOURS);
      expect(r.stoppedBy).toBeNull();
      off.kills += r.kills;
      off.xp += r.xp;
      off.gold += Number(r.gold);
      off.potions += r.potionsUsed.potion_hp_small ?? 0;
      for (const rar of RARITY_ORDER) {
        off.byRarity[rar] = (off.byRarity[rar] ?? 0) + r.dropsByRarity[rar];
        off.items += r.dropsByRarity[rar];
      }
    }

    const mean = (total: number, n: number) => total / n;
    const within = (label: string, offTotal: number, refTotal: number, tolerance = 0.05) => {
      const o = mean(offTotal, RUNS);
      const t = mean(refTotal, REF_RUNS);
      // Nothing expected on either side (e.g. legendaries below hunt item level 45).
      if (o === 0 && t === 0) return;
      const err = Math.abs(o - t) / t;
      // OFFLINE_REPORT=1 pnpm test prints the margins (docs/plan-marco-1.md quotes them).
      if (process.env.OFFLINE_REPORT) {
        console.log(
          `${label}: offline ${o.toFixed(1)} · tick ${t.toFixed(1)} · ${(err * 100).toFixed(1)}%`,
        );
      }
      expect(err, `${label}: offline ${o.toFixed(2)} vs tick ${t.toFixed(2)}`).toBeLessThanOrEqual(
        tolerance,
      );
    };
    within('kills', off.kills, ref.kills);
    within('xp', off.xp, ref.xp);
    within('gold', off.gold, ref.gold);
    within('potions', off.potions, ref.potions);
    within('items', off.items, ref.items);
    // Per rarity: ±5%, widened to 4 standard errors of the reference where the reference
    // itself has too few drops to be measured that precisely (epic, legendary).
    for (const r of RARITY_ORDER) {
      const refCount = ref.byRarity[r]!;
      const tolerance = Math.max(0.05, refCount > 0 ? 4 / Math.sqrt(refCount) : 1);
      within(`items ${r}`, off.byRarity[r]!, refCount, tolerance);
    }
  });
});

describe('resolveOffline', () => {
  it('applies the level-gap XP penalty as the hero levels up while away', () => {
    const s = setup();
    s.hero.level = 2;
    s.hero.xp = 0;
    s.hero.allocated = { strength: 0, dexterity: 0, vitality: 0, energy: 0 };
    s.settings.potionThresholdPct = 50;
    s.consumables.potion_hp_small = 100_000;
    const rates = computeRates(s, content, HUNT);
    const r = resolveOffline(s, content, rates, 3 * TICKS_PER_HOUR);
    expect(r.stoppedBy).toBeNull();
    // At the departure rate (no penalty) 3 h would be worth far more XP than with it.
    expect(r.xp).toBeLessThan(rates.xpPerHour * 3 * 0.6);
    expect(r.levelAfter).toBeLessThanOrEqual(25);
    expect(r.levelAfter).toBeGreaterThan(10);
  });

  it('caps the time at 12 h', () => {
    const s = setup();
    const rates = computeRates(s, content, HUNT);
    const r = resolveOffline(s, content, rates, 48 * TICKS_PER_HOUR);
    expect(r.resolvedTicks).toBe(OFFLINE_CAP_TICKS);
    expect(r.huntingTicks).toBeLessThanOrEqual(OFFLINE_CAP_TICKS);
  });

  it('stops hunting when potions would run out', () => {
    const s = setup();
    s.gold = 0n;
    s.consumables.potion_hp_small = 10;
    s.settings.potionTarget = 0;
    // A setup that drinks 30 potions/h and finds 10/h: 10 in stock last 30 minutes.
    const rates = {
      ...computeRates(s, content, HUNT),
      potionsUsedPerHour: { potion_hp_small: 30 },
      extrasPerHour: { potion_hp_small: 10 },
      sustainHours: null,
    };
    expect(
      potionHoursLeft(rates, 'potion_hp_small', { stock: 10, gold: 0, price: 10, autoBuy: false }),
    ).toBe(0.5);
    const r = resolveOffline(s, content, rates, 10 * TICKS_PER_HOUR);
    expect(r.stoppedBy).toBe('no_potions');
    expect(r.huntingTicks).toBe(TICKS_PER_HOUR / 2);
    expect(s.activity.kind).toBe('idle_town');
  });

  it('with auto-buy, gold income keeps the potions coming', () => {
    const s = setup();
    const rates = {
      ...computeRates(s, content, HUNT),
      potionsUsedPerHour: { potion_hp_small: 30 },
      extrasPerHour: {},
      goldPerHour: 400,
    };
    // 400 gold/h buys 40 potions/h at 10 each: more than the 30 drunk.
    expect(
      potionHoursLeft(rates, 'potion_hp_small', { stock: 0, gold: 0, price: 10, autoBuy: true }),
    ).toBeNull();
    // 200 gold/h buys 20/h; 10 in stock + 100 gold (10 potions) last 20 / 10 = 2 h.
    const poorer = { ...rates, goldPerHour: 200 };
    expect(
      potionHoursLeft(poorer, 'potion_hp_small', {
        stock: 10,
        gold: 100,
        price: 10,
        autoBuy: true,
      }),
    ).toBe(2);
  });

  it('levels up, keeps items within the limit, sends loot to the stash', () => {
    const s = setup();
    s.hero.level = 1;
    s.hero.xp = 0;
    s.settings.lootFilter.keepFromRarity = 'magic';
    const rates = computeRates(s, content, HUNT);
    const before = s.stash.length;
    const r = resolveOffline(s, content, rates, 12 * TICKS_PER_HOUR);
    expect(r.levelAfter).toBeGreaterThan(1);
    expect(r.items.length).toBeLessThanOrEqual(200);
    expect(s.stash.length).toBe(before + r.items.length);
    expect(Object.values(r.materials).some((q) => q > 0)).toBe(true);
    // Best rarity first.
    const ranks = r.items.map((i) => RARITY_ORDER.indexOf(i.rarity));
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
  });

  it('the loot filter turns filtered rarities into materials without generating them', () => {
    const s = setup();
    s.settings.lootFilter = { keepFromRarity: 'rare', alwaysKeepAffixes: [] };
    const rates = computeRates(s, content, HUNT);
    const r = resolveOffline(s, content, rates, 6 * TICKS_PER_HOUR);
    expect(r.items.every((i) => i.rarity !== 'common' && i.rarity !== 'magic')).toBe(true);
    expect(r.materials.fragment).toBeGreaterThan(0);
  });

  it('does nothing but advance the clock when the hero is idle in town', () => {
    const s = newGame();
    const r = resolveOffline(s, content, null, TICKS_PER_HOUR);
    expect(r.kills).toBe(0);
    expect(s.tick).toBe(TICKS_PER_HOUR);
  });

  it('rate sheets do not modify the state and are deterministic', () => {
    const s = setup();
    const snapshot = structuredClone(s);
    const a = computeRates(s, content, HUNT);
    const b = computeRates(s, content, HUNT);
    expect(a).toEqual(b);
    expect(s).toEqual(snapshot);
    expect(a.killsPerHour).toBeGreaterThan(0);
  });
});
