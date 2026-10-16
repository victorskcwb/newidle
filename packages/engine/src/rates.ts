import type { ContentDb, Rarity } from '@abismo/content';
import {
  ELITE_DROP_CHANCE_PCT,
  ELITE_MAGIC_FIND_BONUS,
  PPM,
  RARITY_ORDER,
  RATE_SAMPLE_TICKS,
  TICKS_PER_HOUR,
} from './constants.ts';
import { stepQuiet, type SimCounters } from './hunt.ts';
import { rarityTable } from './items.ts';
import { cloneState } from './state.ts';
import { heroStats } from './stats.ts';
import type { GameState } from './types.ts';

/** Kills of one kind of monster (elite or not) per hour. */
export interface KillCategory {
  monsterId: string;
  elite: boolean;
  killsPerHour: number;
}

/**
 * Expected results per hour of the current setup in a hunt. XP, gold, kills, potions and
 * deaths come from a deterministic simulation; equipment and extras per kill are computed
 * exactly from the loot tables, which keeps rare drops from depending on a lucky sample.
 */
export interface RateSheet {
  huntId: string;
  heroLevel: number;
  /** Simulated hunting time the sheet is based on. */
  sampleTicks: number;
  killsPerHour: number;
  categories: KillCategory[];
  xpPerHour: number;
  goldPerHour: number;
  goldSpentPerHour: number;
  potionsUsedPerHour: Record<string, number>;
  potionsBoughtPerHour: Record<string, number>;
  deathsPerHour: number;
  townTripsPerHour: number;
  bossKillsPerHour: number;
  /** Hours until the hunt stops on its own (deaths, potions), or null if it never does. */
  sustainHours: number | null;
  dropsPerHour: Record<Rarity, number>;
  extrasPerHour: Record<string, number>;
}

export function newCounters(): SimCounters {
  return {
    kills: new Map(),
    xp: 0,
    gold: 0,
    goldSpent: 0,
    potionsUsed: {},
    potionsBought: {},
    deaths: 0,
    townTrips: 0,
    bossEncounters: 0,
    stoppedAtTick: null,
  };
}

/** Puts a copy of the hero at the start of a hunt (no travel), ready to sample it. */
export function prepareSample(state: GameState, content: ContentDb, huntId: string): GameState {
  const s = cloneState(state);
  const stats = heroStats(s.hero, content);
  const same = s.hunt?.huntId === huntId;
  s.hunt = { huntId, killsSinceBoss: same ? s.hunt!.killsSinceBoss : 0, consecutiveDeaths: 0 };
  s.activity = { kind: 'to_hunt', untilTick: s.tick };
  s.hero.hp = stats.maxHp;
  s.hero.mana = stats.maxMana;
  return s;
}

interface CategoryLoot {
  rolls: number;
  dropPpm: number;
  rarity: Record<Rarity, number>;
  lootTableId: string;
}

/** Equipment odds for one kill of a monster category, given the hero's magic find. */
export function categoryLoot(
  content: ContentDb,
  monsterId: string,
  elite: boolean,
  magicFindPct: number,
): CategoryLoot {
  const monster = content.monsters.get(monsterId)!;
  const table = content.lootTables.get(monster.lootTableId)!;
  const dropPpm = Math.min(
    PPM,
    Math.floor((table.equipmentDropChancePpm * (elite ? ELITE_DROP_CHANCE_PCT : 100)) / 100),
  );
  const mf = magicFindPct + (elite ? ELITE_MAGIC_FIND_BONUS : 0);
  return {
    rolls: table.rolls ?? 1,
    dropPpm,
    rarity: rarityTable(mf, table.minRarity),
    lootTableId: table.id,
  };
}

/** Builds the rate sheet of the hero's current setup in a hunt. Does not touch `state`. */
export function computeRates(
  state: GameState,
  content: ContentDb,
  huntId: string,
  sampleTicks = RATE_SAMPLE_TICKS,
): RateSheet {
  const s = prepareSample(state, content, huntId);
  const counters = newCounters();
  const start = s.tick;
  stepQuiet(s, content, sampleTicks, { freezeLevel: true, counters });
  const activeTicks =
    counters.stoppedAtTick === null ? sampleTicks : counters.stoppedAtTick - start;
  const hours = Math.max(1, activeTicks) / TICKS_PER_HOUR;
  const perHour = (n: number) => n / hours;
  const perHourRecord = (r: Record<string, number>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, perHour(v)]));

  const stats = heroStats(state.hero, content);
  const categories: KillCategory[] = [];
  const dropsPerHour = { common: 0, magic: 0, rare: 0, epic: 0, legendary: 0 } as Record<
    Rarity,
    number
  >;
  const extrasPerHour: Record<string, number> = {};
  let kills = 0;
  let bossKills = 0;
  // Sorted keys keep the category order (and so offline RNG use) independent of kill order.
  for (const key of [...counters.kills.keys()].sort()) {
    const n = counters.kills.get(key)!;
    const [monsterId, eliteFlag] = key.split('|') as [string, string];
    const elite = eliteFlag === '1';
    const killsPerHour = perHour(n);
    categories.push({ monsterId, elite, killsPerHour });
    kills += n;
    if (content.monsters.get(monsterId)?.boss) bossKills += n;
    const loot = categoryLoot(content, monsterId, elite, stats.magicFindPct);
    for (const r of RARITY_ORDER) {
      dropsPerHour[r] += (killsPerHour * loot.rolls * loot.dropPpm * loot.rarity[r]) / (PPM * PPM);
    }
    const table = content.lootTables.get(loot.lootTableId)!;
    for (const e of table.extras) {
      const avg = (e.qty[0] + e.qty[1]) / 2;
      extrasPerHour[e.itemId] =
        (extrasPerHour[e.itemId] ?? 0) + (killsPerHour * e.chancePpm * avg) / PPM;
    }
  }

  return {
    huntId,
    heroLevel: state.hero.level,
    sampleTicks: activeTicks,
    killsPerHour: perHour(kills),
    categories,
    xpPerHour: perHour(counters.xp),
    goldPerHour: perHour(counters.gold),
    goldSpentPerHour: perHour(counters.goldSpent),
    potionsUsedPerHour: perHourRecord(counters.potionsUsed),
    potionsBoughtPerHour: perHourRecord(counters.potionsBought),
    deathsPerHour: perHour(counters.deaths),
    townTripsPerHour: perHour(counters.townTrips),
    bossKillsPerHour: perHour(bossKills),
    sustainHours: counters.stoppedAtTick === null ? null : hours,
    dropsPerHour,
    extrasPerHour,
  };
}

export interface PotionBudget {
  /** Potions in stock. */
  stock: number;
  /** Gold available to buy more (only when auto-buy is on). */
  gold: number;
  price: number;
  autoBuy: boolean;
}

/**
 * How long the hero can keep hunting before potions run out (hours), or null if drops and
 * purchases keep up. With auto-buy, every coin earned can become a potion on the next town
 * visit, so the hunt only stops once gold income cannot pay for the potions drunk.
 * Used by the UI ("poções duram 3 h 10 min") and by the offline resolution.
 */
export function potionHoursLeft(
  rates: RateSheet,
  potionId: string,
  budget: PotionBudget,
): number | null {
  const used = rates.potionsUsedPerHour[potionId] ?? 0;
  const dropped = rates.extrasPerHour[potionId] ?? 0;
  const buyable = budget.autoBuy && budget.price > 0 ? rates.goldPerHour / budget.price : 0;
  const drain = used - dropped - buyable;
  if (drain <= 0) return null;
  const reserve =
    budget.stock + (budget.autoBuy && budget.price > 0 ? budget.gold / budget.price : 0);
  return reserve / drain;
}
