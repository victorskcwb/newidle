import type { ContentDb, Rarity } from '@abismo/content';
import {
  DEATH_XP_LOSS_PCT,
  OFFLINE_CAP_TICKS,
  OFFLINE_ITEM_LIMIT,
  PPM,
  RARITY_ORDER,
  TICKS_PER_HOUR,
} from './constants.ts';
import { filterKeeps, generateItem, rarityRank } from './items.ts';
import { addXp } from './progression.ts';
import { categoryLoot, potionHoursLeft, type RateSheet } from './rates.ts';
import { rngBinomial, rngChance, rngInt, type RngState } from './rng.ts';
import { heroStats } from './stats.ts';
import type { GameState, ItemInstance } from './types.ts';

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
export function resolveOffline(
  s: GameState,
  content: ContentDb,
  rates: RateSheet | null,
  elapsedTicks: number,
  capTicks = OFFLINE_CAP_TICKS,
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
  report.xp = rngRound(rng, rates.xpPerHour * hours);
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
  addXp(s, content, report.xp, s.tick, null);
  if (rates.deathsPerHour > 1) {
    report.deaths = rngRound(rng, rates.deathsPerHour * hours);
    for (let i = 0; i < report.deaths; i++) {
      const lost = Math.floor((s.hero.xp * DEATH_XP_LOSS_PCT) / 100);
      s.hero.xp -= lost;
      report.xpLost += lost;
    }
    s.lifetime.deaths += report.deaths;
  }
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

  // 6. Bosses.
  const progress = s.hunt!;
  if (hunt.boss) {
    const total = progress.killsSinceBoss + normalKills;
    progress.killsSinceBoss = report.bossKills > 0 ? total % hunt.boss.everyKills : total;
    if (report.bossKills > 0) {
      s.lifetime.bossKills += report.bossKills;
      if (!s.defeatedBosses.includes(hunt.boss.monsterId)) {
        s.defeatedBosses.push(hunt.boss.monsterId);
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
