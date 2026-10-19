import type { ContentDb, Rarity } from '@abismo/content';
import {
  DEATH_XP_LOSS_PCT,
  OFFLINE_ITEM_LIMIT,
  PPM,
  RARITY_ORDER,
  TICKS_PER_HOUR,
} from './constants.ts';
import { filterKeeps, generateItem, legendaryAllowed, rarityRank } from './items.ts';
import { applyBulkPity } from './pity.ts';
import { rollSetPiece } from './sets.ts';
import { rollOfflinePets } from './pets.ts';
import { professionLevel, tickProfessions } from './professions.ts';
import { autoSell, killXp } from './hunt.ts';
import { cardChancePpm, pityThreshold } from './cards.ts';
import { addXp } from './progression.ts';
import { questLoot, questProgress } from './quests.ts';
import { categoryLoot, computeRates, potionHoursLeft, type RateSheet } from './rates.ts';
import { consumeMeals, fedTicks } from './meals.ts';
import { runAutomations } from './automation.ts';
import { stepQuiet } from './hunt.ts';
import { rngBinomial, rngChance, rngInt, type RngState } from './rng.ts';
import { heroStats } from './stats.ts';
import { offlineCapTicks } from './upgrades.ts';
import type { GameEvent, GameState, ItemInstance } from './types.ts';

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
  /** Resources gathered and recipes crafted while away. */
  gathered: Record<string, number>;
  crafted: Record<string, number>;
  /** Profession levels gained while away: id → [before, after]. */
  professionLevels: Record<string, [number, number]>;
  mealsEaten: number;
  /** Pets found while away: id → copies. */
  pets: Record<string, number>;
  /** A dungeon run under way when the player left: first floor and deepest floor cleared. */
  dungeon: { from: number; to: number } | null;
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

/**
 * Gathering for the first `gatherTicks` (the time spent hunting), production for all of
 * `ticks`, exactly as the live game would do them.
 */
function resolveProfessions(
  s: GameState,
  content: ContentDb,
  ticks: number,
  gatherTicks: number,
  report: OfflineReport,
) {
  const p = s.professions;
  if (!p.gathering && !p.recipe) return;
  const resourcesBefore = { ...s.resources };
  const levelsBefore = Object.fromEntries(
    [...content.professions.keys()].map((id) => [id, professionLevel(s, id)]),
  );
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) tickProfessions(s, content, s.tick + i, events, i < gatherTicks);
  for (const e of events) {
    if (e.type === 'ItemCrafted')
      report.crafted[e.recipeId] = (report.crafted[e.recipeId] ?? 0) + 1;
  }
  // Gathered = resources gained plus what the crafts consumed.
  const used: Record<string, number> = {};
  for (const [id, n] of Object.entries(report.crafted)) {
    for (const [res, qty] of Object.entries(content.recipes.get(id)!.inputs)) {
      used[res] = (used[res] ?? 0) + qty * n;
    }
  }
  for (const id of new Set([...Object.keys(s.resources), ...Object.keys(used)])) {
    const n = (s.resources[id] ?? 0) - (resourcesBefore[id] ?? 0) + (used[id] ?? 0);
    if (n > 0) report.gathered[id] = n;
  }
  for (const [id, before] of Object.entries(levelsBefore)) {
    const after = professionLevel(s, id);
    if (after > before) report.professionLevels[id] = [before, after];
  }
}

/**
 * Resolves the time away (section 9.2). Meals change the hero's stats, so when the food runs
 * out partway the time is resolved in two stretches: fed, with the given sheet, then unfed,
 * with a sheet computed for the hero without a meal.
 */
export function resolveOffline(
  s: GameState,
  content: ContentDb,
  rates: RateSheet | null,
  elapsedTicks: number,
  capTicks = offlineCapTicks(s.hero, content),
): OfflineReport {
  const resolved = Math.max(0, Math.min(elapsedTicks, capTicks));
  if (s.dungeon.active && resolved > 0) {
    // A dungeon run cannot be summed up by a rate sheet (every floor is harder): it is played
    // out tick by tick until the defeat, then the rest of the time goes to the hunt.
    const run = resolveDungeonRun(s, content, resolved);
    if (run.resolvedTicks >= elapsedTicks) return run;
    const rest = s.hunt ? computeRates(s, content, s.hunt.huntId) : null;
    const after = resolveOffline(
      s,
      content,
      rest,
      elapsedTicks - run.resolvedTicks,
      capTicks - run.resolvedTicks,
    );
    return mergeReports(run, after);
  }
  const fed = fedTicks(s, content);
  const hunting = s.hunt !== null && s.activity.kind !== 'idle_town' && rates !== null;
  if (!hunting || fed === 0 || fed >= resolved) {
    const report = resolveStretch(s, content, rates, elapsedTicks, capTicks);
    report.mealsEaten = consumeMeals(s, content, report.huntingTicks);
    if (hunting) runAutomations(s, content, null);
    return report;
  }
  const first = resolveStretch(s, content, rates, fed, fed);
  first.mealsEaten = consumeMeals(s, content, first.huntingTicks);
  s.hero.meal = null;
  const stillHunting = s.hunt !== null && s.activity.kind !== 'idle_town';
  const unfed = stillHunting ? computeRates(s, content, s.hunt!.huntId) : null;
  const second = resolveStretch(s, content, unfed, elapsedTicks - fed, capTicks - fed);
  runAutomations(s, content, null);
  return mergeReports(first, second);
}

/** A report with nothing in it yet, for `elapsedTicks` of time away. */
function emptyReport(s: GameState, elapsedTicks: number): OfflineReport {
  return {
    elapsedTicks,
    resolvedTicks: elapsedTicks,
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
    gathered: {},
    crafted: {},
    professionLevels: {},
    mealsEaten: 0,
    pets: {},
    dungeon: null,
  };
}

/** Ticks played at a time while replaying a dungeon run offline. */
const DUNGEON_REPLAY_CHUNK = 600;

/** Plays the dungeon run out (up to `maxTicks`) and reports what changed. */
function resolveDungeonRun(s: GameState, content: ContentDb, maxTicks: number): OfflineReport {
  const from = s.dungeon.floor;
  const before = {
    level: s.hero.level,
    lifetime: structuredClone(s.lifetime),
    materials: { ...s.materials },
    uids: new Set([...s.backpack, ...s.stash].map((i) => i.uid)),
    professions: Object.fromEntries(
      [...content.professions.keys()].map((id) => [id, professionLevel(s, id)]),
    ),
  };
  let ticks = 0;
  while (s.dungeon.active && ticks < maxTicks) {
    const n = Math.min(DUNGEON_REPLAY_CHUNK, maxTicks - ticks);
    stepQuiet(s, content, n);
    ticks += n;
  }
  const l = s.lifetime;
  const report: OfflineReport = {
    ...emptyReport(s, ticks),
    huntingTicks: ticks,
    levelBefore: before.level,
    levelAfter: s.hero.level,
    xp: Number(l.xpEarned - before.lifetime.xpEarned),
    gold: l.goldEarned - before.lifetime.goldEarned,
    kills: Number(l.kills - before.lifetime.kills),
    deaths: l.deaths - before.lifetime.deaths,
    bossKills: l.bossKills - before.lifetime.bossKills,
    items: [...s.backpack, ...s.stash]
      .filter((i) => !before.uids.has(i.uid))
      .sort((x, y) => rarityRank(y.rarity) - rarityRank(x.rarity) || x.uid - y.uid),
    dungeon: { from, to: s.dungeon.best },
  };
  for (const r of RARITY_ORDER) {
    report.dropsByRarity[r] = l.itemsByRarity[r] - before.lifetime.itemsByRarity[r];
  }
  for (const [id, qty] of Object.entries(s.materials)) {
    const n = Number(qty - (before.materials[id] ?? 0n));
    if (n > 0) report.materials[id] = n;
  }
  for (const [id, lv] of Object.entries(before.professions)) {
    const after = professionLevel(s, id);
    if (after > lv) report.professionLevels[id] = [lv, after];
  }
  return report;
}

function addRecord(a: Record<string, number>, b: Record<string, number>) {
  for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v;
}

/** One report for two stretches of time away, in order. */
export function mergeReports(a: OfflineReport, b: OfflineReport): OfflineReport {
  const out: OfflineReport = {
    ...a,
    elapsedTicks: a.elapsedTicks + b.elapsedTicks,
    resolvedTicks: a.resolvedTicks + b.resolvedTicks,
    huntingTicks: a.huntingTicks + b.huntingTicks,
    stoppedBy: b.stoppedBy ?? a.stoppedBy,
    levelAfter: b.levelAfter,
    xp: a.xp + b.xp,
    xpLost: a.xpLost + b.xpLost,
    gold: a.gold + b.gold,
    goldSpent: a.goldSpent + b.goldSpent,
    kills: a.kills + b.kills,
    deaths: a.deaths + b.deaths,
    bossKills: a.bossKills + b.bossKills,
    potionsUsed: { ...a.potionsUsed },
    potionsBought: { ...a.potionsBought },
    dropsByRarity: { ...a.dropsByRarity },
    items: [...a.items, ...b.items].sort(
      (x, y) => rarityRank(y.rarity) - rarityRank(x.rarity) || x.uid - y.uid,
    ),
    materials: { ...a.materials },
    consumables: { ...a.consumables },
    newBosses: [...new Set([...a.newBosses, ...b.newBosses])],
    cards: { ...a.cards },
    unlockedHunts: [...new Set([...a.unlockedHunts, ...b.unlockedHunts])],
    gathered: { ...a.gathered },
    crafted: { ...a.crafted },
    professionLevels: { ...a.professionLevels },
    mealsEaten: a.mealsEaten + b.mealsEaten,
    pets: { ...a.pets },
    dungeon: a.dungeon ?? b.dungeon,
  };
  addRecord(out.potionsUsed, b.potionsUsed);
  addRecord(out.potionsBought, b.potionsBought);
  addRecord(out.dropsByRarity, b.dropsByRarity);
  addRecord(out.materials, b.materials);
  addRecord(out.consumables, b.consumables);
  addRecord(out.cards, b.cards);
  addRecord(out.gathered, b.gathered);
  addRecord(out.crafted, b.crafted);
  addRecord(out.pets, b.pets);
  for (const [id, [from, to]] of Object.entries(b.professionLevels)) {
    const before = out.professionLevels[id]?.[0] ?? from;
    out.professionLevels[id] = [before, to];
  }
  return out;
}

function resolveStretch(
  s: GameState,
  content: ContentDb,
  rates: RateSheet | null,
  elapsedTicks: number,
  capTicks: number,
): OfflineReport {
  const rng = s.rng;
  const resolvedTicks = Math.max(0, Math.min(elapsedTicks, capTicks));
  const report: OfflineReport = { ...emptyReport(s, elapsedTicks), resolvedTicks };
  const hunting = s.hunt !== null && s.activity.kind !== 'idle_town' && rates !== null;
  if (!hunting || rates.huntId !== s.hunt!.huntId) {
    // Production keeps going in town.
    resolveProfessions(s, content, resolvedTicks, 0, report);
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
    if (c.n > 0) s.bestiary[c.monsterId] = (s.bestiary[c.monsterId] ?? 0) + c.n;
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
  // Counts per category first, so the pity rule can see every drop before items are made.
  const counts = kills.map((c) => {
    const out = emptyRarities();
    if (c.n === 0) return out;
    const loot = categoryLoot(content, c.monsterId, c.elite, stats.magicFindPct, hunt.ilvl);
    for (const r of RARITY_ORDER) {
      const perRollPpm = Math.floor((loot.dropPpm * loot.rarity[r]) / PPM);
      out[r] = rngBinomial(rng, c.n * loot.rolls, perRollPpm);
    }
    return out;
  });
  applyBulkPity(rng, s.dropPity, counts, legendaryAllowed(hunt.ilvl));
  let generated = 0;
  kills.forEach((c, ci) => {
    if (c.n === 0) return;
    const table = content.lootTables.get(content.monsters.get(c.monsterId)!.lootTableId)!;
    for (const r of RARITY_ORDER) {
      const count = counts[ci]![r];
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
        rollSetPiece(rng, content, item, hunt.regionId);
        if (filterKeeps(filter, item)) {
          report.items.push(item);
          generated++;
        } else {
          leftover++;
        }
      }
      salvage(r, leftover);
    }
    if (content.monsters.get(c.monsterId)?.boss) {
      addRecord(report.pets, rollOfflinePets(s, content, rng, c.monsterId, c.n));
    }
    // Cards: binomial over the kills, with the pity rule from the kill where it starts.
    rollOfflineCards(s, content, c.monsterId, c.elite, c.n, report, stats.cardLuckPct);
    // 5. Extras (potions dropped by monsters).
    for (const e of table.extras) {
      const hits = rngBinomial(rng, c.n, e.chancePpm);
      const qty = sumUniform(rng, hits, e.qty[0], e.qty[1]);
      if (qty > 0) report.consumables[e.itemId] = (report.consumables[e.itemId] ?? 0) + qty;
    }
  });
  report.items.sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || a.uid - b.uid);
  const sold = autoSell(s, report.items);
  report.items = sold.kept;
  report.gold += BigInt(sold.gold);
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

  // Professions: replayed tick by tick (plain counters, so it is exact and cheap).
  resolveProfessions(s, content, resolvedTicks, report.huntingTicks, report);

  // 7. Where the hero is now. Offline loot already went to the stash; the backpack is kept.
  s.tick += elapsedTicks;
  const after = heroStats(s.hero, content);
  s.hero.hp = after.maxHp;
  s.hero.mana = after.maxMana;
  progress.consecutiveDeaths = 0;
  s.activity = report.stoppedBy ? { kind: 'idle_town' } : { kind: 'to_hunt', untilTick: s.tick };
  return report;
}
