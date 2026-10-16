import type { ContentDb, Rarity } from '@abismo/content';
import {
  DEATH_XP_LOSS_PCT,
  OFFLINE_ITEM_LIMIT,
  PPM,
  RARITY_ORDER,
  TICKS_PER_HOUR,
} from './constants.ts';
import { filterKeeps, generateItem, rarityRank } from './items.ts';
import { killXp } from './hunt.ts';
import { cardChancePpm, pityThreshold } from './cards.ts';
import { addXp } from './progression.ts';
import { questLoot, questProgress } from './quests.ts';
import { categoryLoot, potionHoursLeft, type RateSheet } from './rates.ts';
import { rngBinomial, rngChance, rngInt, type RngState } from './rng.ts';
import { heroStats } from './stats.ts';
import { offlineCapTicks } from './upgrades.ts';
import type { GameState, ItemInstance } from './types.ts';

/** Offline XP is applied in this many time slices (see resolveOffline). */
const OFFLINE_XP_SLICES = 48;

export type OfflineStop = 'no_potions' | 'too_many_deaths';

export interface OfflineReport {
  elapsedTicks: number;
  /** Elapsed time after the offline cap. */
  resolvedTicks: number;
  /** Time actually spent hunting (stops early when potions run out or deaths pile up). */
  huntingTicks: number;
  stoppedBy: OfflineStop | null;
  huntId: string | null;
  levelBefore: number;
  levelAfter: number;
  xp: number;
  xpLost: number;
  gold: bigint;
  goldSpent: bigint;
  kills: number;
  deaths: number;
  bossKills: number;
  potionsUsed: Record<string, number>;
  potionsBought: Record<string, number>;
  /** Every equipment drop by rarity, kept or salvaged. */
  dropsByRarity: Record<Rarity, number>;
  /** Items kept in the stash, best rarity first. */
  items: ItemInstance[];
  materials: Record<string, number>;
  consumables: Record<string, number>;
  newBosses: string[];
  /** Cards gained while away: card id → copies gained. */
  cards: Record<string, number>;
  unlockedHunts: string[];
}

/** floor(x) plus one with probability frac(x): unbiased rounding of an expected count. */
export function rngRound(rng: RngState, x: number): number {
  if (x <= 0) return 0;
  const whole = Math.floor(x);
  const frac = x - whole;
  return whole + (rngChance(rng, Math.floor(frac * PPM)) ? 1 : 0);
}

/** Sum of `n` uniform draws in [min, max]; exact for small n, expected value beyond. */
function sumUniform(rng: RngState, n: number, min: number, max: number): number {
  if (n <= 0) return 0;
  if (min === max) return n * min;
  if (n <= 2000) {
    let total = 0;
    for (let i = 0; i < n; i++) total += rngInt(rng, min, max);
    return total;
  }
  return rngRound(rng, (n * (min + max)) / 2);
}

function emptyRarities(): Record<Rarity, number> {
  return { common: 0, magic: 0, rare: 0, epic: 0, legendary: 0 };
}

/**
 * Applies the time away using the rate sheet of the current setup (section 9.2): no
 * per-hit simulation. Counts are expected values with binomial / unbiased-rounding noise,
 * so the mean over many resolutions matches the tick simulation.
 */
function rollOfflineCards(
  s: GameState,
  content: ContentDb,
  monsterId: string,
  elite: boolean,
  kills: number,
  report: OfflineReport,
  luckPct: number,
) {
  const cardId = content.monsters.get(monsterId)?.cardId;
  const card = cardId ? content.cards.get(cardId) : undefined;
  if (!card || kills <= 0) return;
  const copies = s.hero.cards[card.id] ?? 0;
  if (copies >= card.maxCopies) return;
  const since = s.cardPity[card.id] ?? 0;
  const beforePity = Math.max(0, Math.min(kills, pityThreshold(card) - since));
  const hits =
    rngBinomial(s.rng, beforePity, cardChancePpm(card, elite, false, luckPct)) +
    rngBinomial(s.rng, kills - beforePity, cardChancePpm(card, elite, true, luckPct));
  const gained = Math.min(hits, card.maxCopies - copies);
  if (gained > 0) {
    s.hero.cards[card.id] = copies + gained;
    s.cardPity[card.id] = 0;
    report.cards[card.id] = (report.cards[card.id] ?? 0) + gained;
  } else {
    s.cardPity[card.id] = since + kills;
  }
}

export function resolveOffline(
  s: GameState,
  content: ContentDb,
  rates: RateSheet | null,
  elapsedTicks: number,
  capTicks = offlineCapTicks(s.hero, content),
): OfflineReport {
  const rng = s.rng;
  const resolvedTicks = Math.max(0, Math.min(elapsedTicks, capTicks));
  const report: OfflineReport = {
    elapsedTicks,
    resolvedTicks,
    huntingTicks: 0,
    stoppedBy: null,
    huntId: s.hunt?.huntId ?? null,
    levelBefore: s.hero.level,
    levelAfter: s.hero.level,
    xp: 0,
    xpLost: 0,
    gold: 0n,
    goldSpent: 0n,
    kills: 0,
    deaths: 0,
    bossKills: 0,
    potionsUsed: {},
    potionsBought: {},
    dropsByRarity: emptyRarities(),
    items: [],
    materials: {},
    consumables: {},
    newBosses: [],
    cards: {},
    unlockedHunts: [],
  };
  const hunting = s.hunt !== null && s.activity.kind !== 'idle_town' && rates !== null;
  if (!hunting || rates.huntId !== s.hunt!.huntId) {
    s.tick += elapsedTicks;
    return report;
  }
  const hunt = content.hunts.get(rates.huntId)!;

  // 1. Effective hunting time.
  let hours = resolvedTicks / TICKS_PER_HOUR;
  if (rates.sustainHours !== null && rates.sustainHours < hours) {
    hours = rates.sustainHours;
    report.stoppedBy = 'too_many_deaths';
  }
  const potionId = s.settings.hpPotionId;
  const potionHours = potionHoursLeft(rates, potionId, {
    stock: s.consumables[potionId] ?? 0,
    gold: Number(s.gold),
    price: content.consumables.get(potionId)?.price ?? 0,
    autoBuy: s.settings.potionTarget > 0,
  });
  if (s.settings.returnWhenOutOfPotions && potionHours !== null && potionHours < hours) {
    hours = potionHours;
    report.stoppedBy = 'no_potions';
  }
  report.huntingTicks = Math.round(hours * TICKS_PER_HOUR);

  // 2. Kills per category.
  const kills = rates.categories.map((c) => ({ ...c, n: rngRound(rng, c.killsPerHour * hours) }));
  let normalKills = 0;
  for (const c of kills) {
    report.kills += c.n;
    if (content.monsters.get(c.monsterId)?.boss) report.bossKills += c.n;
    else normalKills += c.n;
  }

  // 3. XP, gold, potions, deaths.
  const gold = rngRound(rng, rates.goldPerHour * hours);
  const spent = rngRound(rng, rates.goldSpentPerHour * hours);
  report.gold = BigInt(gold);
  report.goldSpent = BigInt(spent);
  s.gold += BigInt(gold);
  s.gold = s.gold > BigInt(spent) ? s.gold - BigInt(spent) : 0n;
  s.lifetime.goldEarned += BigInt(gold);
  for (const [id, rate] of Object.entries(rates.potionsUsedPerHour)) {
    report.potionsUsed[id] = rngRound(rng, rate * hours);
  }
  for (const [id, rate] of Object.entries(rates.potionsBoughtPerHour)) {
    report.potionsBought[id] = rngRound(rng, rate * hours);
  }
  for (const id of new Set([
    ...Object.keys(report.potionsUsed),
    ...Object.keys(report.potionsBought),
  ])) {
    const next =
      (s.consumables[id] ?? 0) + (report.potionsBought[id] ?? 0) - (report.potionsUsed[id] ?? 0);
    s.consumables[id] = Math.max(0, next);
  }
  // XP in time slices, so the level-gap penalty follows the levels gained while away
  // (each kill gives exactly what killMonster would give at the hero's current level).
  const xpPct = heroStats(s.hero, content).xpPct;
  for (let i = 0; i < OFFLINE_XP_SLICES; i++) {
    let xp = 0;
    for (const c of kills) {
      const n =
        Math.floor((c.n * (i + 1)) / OFFLINE_XP_SLICES) - Math.floor((c.n * i) / OFFLINE_XP_SLICES);
      if (n === 0) continue;
      xp += n * killXp(content.monsters.get(c.monsterId)!, c.elite, s.hero.level, xpPct);
    }
    report.xp += xp;
    addXp(s, content, xp, s.tick, null);
  }
  // Deaths at the sampled rate, whatever it is (decisions.md #24): each costs 10% of the
  // XP inside the current level, never a level or items.
  report.deaths = rngRound(rng, rates.deathsPerHour * hours);
  for (let i = 0; i < report.deaths; i++) {
    const lost = Math.floor((s.hero.xp * DEATH_XP_LOSS_PCT) / 100);
    s.hero.xp -= lost;
    report.xpLost += lost;
  }
  s.lifetime.deaths += report.deaths;
  s.lifetime.kills += BigInt(report.kills);
  report.levelAfter = s.hero.level;

  // 4. Equipment drops: binomial count per rarity, then generate only what the filter keeps.
  const stats = heroStats(s.hero, content);
  const filter = s.settings.lootFilter;
  const mustInspect = filter.alwaysKeepAffixes.length > 0;
  const salvage = (rarity: Rarity, n: number) => {
    const m = content.salvageMaterial[rarity];
    const qty = sumUniform(rng, n, m.salvageQty[0], m.salvageQty[1]);
    if (qty > 0) report.materials[m.id] = (report.materials[m.id] ?? 0) + qty;
  };
  let generated = 0;
  for (const c of kills) {
    if (c.n === 0) continue;
    const loot = categoryLoot(content, c.monsterId, c.elite, stats.magicFindPct);
    const table = content.lootTables.get(loot.lootTableId)!;
    for (const r of RARITY_ORDER) {
      const perRollPpm = Math.floor((loot.dropPpm * loot.rarity[r]) / PPM);
      const count = rngBinomial(rng, c.n * loot.rolls, perRollPpm);
      if (count === 0) continue;
      report.dropsByRarity[r] += count;
      s.lifetime.itemsByRarity[r] += count;
      const keptByRarity = rarityRank(r) >= rarityRank(filter.keepFromRarity);
      if (!keptByRarity && !mustInspect) {
        salvage(r, count);
        continue;
      }
      let leftover = 0;
      for (let i = 0; i < count; i++) {
        if (generated >= OFFLINE_ITEM_LIMIT) {
          leftover = count - i;
          break;
        }
        const item = generateItem(rng, content, table, hunt.ilvl, s.nextUid++, r);
        if (filterKeeps(filter, item)) {
          report.items.push(item);
          generated++;
        } else {
          leftover++;
        }
      }
      salvage(r, leftover);
    }
    // Cards: binomial over the kills, with the pity rule from the kill where it starts.
    rollOfflineCards(s, content, c.monsterId, c.elite, c.n, report, stats.cardLuckPct);
    // 5. Extras (potions dropped by monsters).
    for (const e of table.extras) {
      const hits = rngBinomial(rng, c.n, e.chancePpm);
      const qty = sumUniform(rng, hits, e.qty[0], e.qty[1]);
      if (qty > 0) report.consumables[e.itemId] = (report.consumables[e.itemId] ?? 0) + qty;
    }
  }
  report.items.sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || a.uid - b.uid);
  s.stash.push(...report.items);
  for (const [id, qty] of Object.entries(report.materials)) {
    s.materials[id] = (s.materials[id] ?? 0n) + BigInt(qty);
  }
  for (const [id, qty] of Object.entries(report.consumables)) {
    s.consumables[id] = (s.consumables[id] ?? 0) + qty;
  }

  // Goals progress with what happened while away.
  questProgress(s, 'kill_monsters', report.kills);
  questProgress(s, 'defeat_bosses', report.bossKills);
  questProgress(
    s,
    'kill_elites',
    kills.filter((c) => c.elite).reduce((n, c) => n + c.n, 0),
  );
  questProgress(s, 'earn_gold', gold);
  for (const r of RARITY_ORDER) questLoot(s, r, report.dropsByRarity[r]);

  // 6. Bosses.
  const progress = s.hunt!;
  if (hunt.boss) {
    const total = progress.killsSinceBoss + normalKills;
    progress.killsSinceBoss = report.bossKills > 0 ? total % hunt.boss.everyKills : total;
    if (report.bossKills > 0) {
      s.lifetime.bossKills += report.bossKills;
      if (!s.defeatedBosses.includes(hunt.boss.monsterId)) {
        s.defeatedBosses.push(hunt.boss.monsterId);
        s.hero.resets.newBossesThisCycle++;
        report.newBosses.push(hunt.boss.monsterId);
      }
      if (hunt.unlocks && !s.unlockedHunts.includes(hunt.unlocks)) {
        s.unlockedHunts.push(hunt.unlocks);
        report.unlockedHunts.push(hunt.unlocks);
      }
    }
  }

  // 7. Where the hero is now. Offline loot already went to the stash; the backpack is kept.
  s.tick += elapsedTicks;
  const after = heroStats(s.hero, content);
  s.hero.hp = after.maxHp;
  s.hero.mana = after.maxMana;
  progress.consecutiveDeaths = 0;
  s.activity = report.stoppedBy ? { kind: 'idle_town' } : { kind: 'to_hunt', untilTick: s.tick };
  return report;
}
