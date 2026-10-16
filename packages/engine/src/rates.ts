import type { ContentDb, Rarity } from '@abismo/content';
import {
  ELITE_DAMAGE_PCT,
  ELITE_DROP_CHANCE_PCT,
  ELITE_MAGIC_FIND_BONUS,
  ELITE_REWARD_PCT,
  PPM,
  RARITY_ORDER,
  RATE_SAMPLE_TICKS,
  TICKS_PER_HOUR,
} from './constants.ts';
import { stepQuiet, type SimCounters } from './hunt.ts';
import { cardChancePpm } from './cards.ts';
import { legendaryAllowed, rarityTable } from './items.ts';
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
  /** Expected cards per hour by card id (base chances, without the pity rule). */
  cardsPerHour: Record<string, number>;
}

export function newCounters(): SimCounters {
  return {
    kills: new Map(),
    xp: 0,
    gold: 0,
    goldSpent: 0,
    potionsUsed: {},
    cards: {},
    groups: { normal: 0, elite: 0, boss: 0 },
    potionsByGroup: { normal: {}, elite: {}, boss: {} },
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
/**
 * Potions per hour = potions per group of each kind (measured) × groups of that kind per hour
 * (exact). Elite groups are rare in a sample, so when none was fought they cost as much as
 * a normal group times the elite damage bonus.
 */
function potionRates(
  c: SimCounters,
  normalPerHour: number,
  elitePerHour: number,
  bossPerHour: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  const ids = new Set([
    ...Object.keys(c.potionsByGroup.normal),
    ...Object.keys(c.potionsByGroup.elite),
    ...Object.keys(c.potionsByGroup.boss),
  ]);
  for (const id of ids) {
    const perNormal = (c.potionsByGroup.normal[id] ?? 0) / Math.max(1, c.groups.normal);
    const perElite =
      c.groups.elite > 0
        ? (c.potionsByGroup.elite[id] ?? 0) / c.groups.elite
        : (perNormal * ELITE_DAMAGE_PCT) / 100;
    const perBoss = c.groups.boss > 0 ? (c.potionsByGroup.boss[id] ?? 0) / c.groups.boss : 0;
    out[id] = perNormal * normalPerHour + perElite * elitePerHour + perBoss * bossPerHour;
  }
  return out;
}

/** Average gold of one kill, exactly as killMonster rolls and floors it. */
export function expectedGold(
  content: ContentDb,
  monsterId: string,
  elite: boolean,
  goldPct: number,
): number {
  const def = content.monsters.get(monsterId)!;
  const rewardPct = elite ? ELITE_REWARD_PCT : 100;
  let total = 0;
  for (let roll = def.gold[0]; roll <= def.gold[1]; roll++) {
    total += Math.floor((roll * rewardPct * (100 + goldPct)) / 10_000);
  }
  return total / (def.gold[1] - def.gold[0] + 1);
}

export function categoryLoot(
  content: ContentDb,
  monsterId: string,
  elite: boolean,
  magicFindPct: number,
  huntIlvl: number,
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
    rarity: rarityTable(mf, table.minRarity, legendaryAllowed(huntIlvl)),
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
  // Kill counts come from the sample; the mix of monsters is exact from the hunt's content
  // (spawn weights, group sizes, elite chance), so rare elite drops do not depend on a lucky
  // sample. Bosses come from the sample (they only count when the hero actually wins).
  const hunt = content.hunts.get(huntId)!;
  let normalKills = 0;
  let bossKills = 0;
  for (const [key, n] of counters.kills) {
    const monsterId = key.split('|')[0]!;
    if (content.monsters.get(monsterId)?.boss) bossKills += n;
    else normalKills += n;
  }
  const avgGroup = (hunt.groupSize.min + hunt.groupSize.max) / 2;
  const eliteKills = (normalKills / avgGroup) * (hunt.eliteChancePpm / PPM);
  const totalWeight = hunt.spawns.reduce((sum, sp) => sum + sp.weight, 0);
  const mix: { monsterId: string; elite: boolean; n: number }[] = [];
  for (const sp of hunt.spawns) {
    const share = sp.weight / totalWeight;
    mix.push({ monsterId: sp.monsterId, elite: false, n: (normalKills - eliteKills) * share });
    mix.push({ monsterId: sp.monsterId, elite: true, n: eliteKills * share });
  }
  if (hunt.boss && bossKills > 0)
    mix.push({ monsterId: hunt.boss.monsterId, elite: false, n: bossKills });

  let goldPerHour = 0;
  const cardsPerHour: Record<string, number> = {};
  for (const { monsterId, elite, n } of mix) {
    if (n <= 0) continue;
    const killsPerHour = perHour(n);
    goldPerHour += killsPerHour * expectedGold(content, monsterId, elite, stats.goldPct);
    const cardId = content.monsters.get(monsterId)?.cardId;
    const card = cardId ? content.cards.get(cardId) : undefined;
    if (card) {
      cardsPerHour[card.id] =
        (cardsPerHour[card.id] ?? 0) +
        (killsPerHour * cardChancePpm(card, elite, false, stats.cardLuckPct)) / PPM;
    }
    categories.push({ monsterId, elite, killsPerHour });
    const loot = categoryLoot(content, monsterId, elite, stats.magicFindPct, hunt.ilvl);
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
  const kills = normalKills + bossKills;
  const groupsPerHour = perHour(normalKills / avgGroup);
  const eliteGroupsPerHour = groupsPerHour * (hunt.eliteChancePpm / PPM);
  const normalGroupsPerHour = groupsPerHour - eliteGroupsPerHour;

  return {
    huntId,
    heroLevel: state.hero.level,
    sampleTicks: activeTicks,
    killsPerHour: perHour(kills),
    categories,
    xpPerHour: perHour(counters.xp),
    goldPerHour,
    goldSpentPerHour: perHour(counters.goldSpent),
    potionsUsedPerHour: potionRates(
      counters,
      normalGroupsPerHour,
      eliteGroupsPerHour,
      bossKills / hours,
    ),
    potionsBoughtPerHour: perHourRecord(counters.potionsBought),
    deathsPerHour: perHour(counters.deaths),
    townTripsPerHour: perHour(counters.townTrips),
    bossKillsPerHour: perHour(bossKills),
    sustainHours: counters.stoppedAtTick === null ? null : hours,
    dropsPerHour,
    extrasPerHour,
    cardsPerHour,
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
