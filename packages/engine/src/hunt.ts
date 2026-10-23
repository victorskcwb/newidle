import type {
  Consumable,
  ContentDb,
  Element,
  Hunt,
  Monster,
  MonsterAffix,
  Rarity,
} from '@abismo/content';
import { classOf } from './classes.ts';
import { rollHit, type AttackProfile } from './combat.ts';
import {
  BASE_CRIT_CHANCE_PPM,
  BASE_CRIT_DAMAGE_PCT,
  DEATH_XP_LOSS_PCT,
  ELITE_DAMAGE_PCT,
  ELITE_AFFIX_COUNT,
  ELITE_DROP_CHANCE_PCT,
  ELITE_LIFE_PCT,
  ELITE_MAGIC_FIND_BONUS,
  ELITE_REWARD_PCT,
  FIRST_MAGIC_ITEM_KILL,
  FIRST_RARE_ITEM_KILL,
  MAX_CONSECUTIVE_AUTO_RETURNS,
  POTION_COOLDOWN_TICKS,
  PPM,
  RESPAWN_TICKS,
  TICKS_PER_SECOND,
  TOWN_STAY_TICKS,
} from './constants.ts';
import {
  filterKeeps,
  generateItem,
  legendaryAllowed,
  pickWeighted,
  rarityTable,
  rollRarity,
  rarityRank,
  rollSalvage,
} from './items.ts';
import { pityRarity, recordDrop } from './pity.ts';
import { bestiaryDamagePct } from './bestiary.ts';
import { tickProfessions } from './professions.ts';
import { tickMeal } from './meals.ts';
import { runAutomations } from './automation.ts';
import {
  DUNGEON_BOSS_CORES_MAX,
  DUNGEON_BOSS_CORES_PER_BLOCK,
  DUNGEON_BOSS_MAGIC_FIND_PER_FLOOR,
  DUNGEON_FLOOR_REWARD,
  DUNGEON_FLOORS_PER_BLOCK,
  DUNGEON_KILLS_PER_FLOOR,
  endDungeonRun,
  floorBlock,
  floorTimedOut,
  floorHunt,
  floorScalePct,
  isBossFloor,
} from './dungeon.ts';
import { grantReward } from './login.ts';
import { currentDifficulty, difficultyRule, huntAt } from './difficulty.ts';
import { ruleAllows, type RuleContext } from './skillRules.ts';
import { rollSetPiece } from './sets.ts';
import { rollPetDrop } from './pets.ts';
import { sellPrice } from './town.ts';
import { rollCard } from './cards.ts';
import { questLoot, questProgress } from './quests.ts';
import { addXp } from './progression.ts';
import { rngChance, rngInt } from './rng.ts';
import { heroResistPct, heroStats, type HeroStats } from './stats.ts';
import type {
  GameEvent,
  GameState,
  HitResult,
  ItemInstance,
  MonsterInstance,
  TownReason,
} from './types.ts';
import { backpackSize } from './upgrades.ts';
import { xpGapPct } from './xp.ts';

/** Counters a rate-sampling run collects; the normal game passes none. */
export interface SimCounters {
  /** Kills by category key `${monsterId}|${elite ? 1 : 0}`. */
  kills: Map<string, number>;
  xp: number;
  gold: number;
  goldSpent: number;
  potionsUsed: Record<string, number>;
  potionsBought: Record<string, number>;
  deaths: number;
  townTrips: number;
  bossEncounters: number;
  /** Cards dropped by id. */
  cards: Record<string, number>;
  /** Groups cleared, by kind, and potions drunk while fighting each kind (rate sheet). */
  groups: Record<GroupKind, number>;
  potionsByGroup: Record<GroupKind, Record<string, number>>;
  /** Tick at which the hunt stopped on its own (too many deaths, no potions), if it did. */
  stoppedAtTick: number | null;
}

export type GroupKind = 'normal' | 'elite' | 'boss';

export function groupKind(group: readonly MonsterInstance[]): GroupKind {
  if (group.some((m) => m.boss)) return 'boss';
  return group.some((m) => m.elite) ? 'elite' : 'normal';
}

/** Counts a potion for the rate sheet, under the kind of group being fought (else normal). */
function countPotion(s: GameState, o: StepOptions, id: string) {
  if (!o.counters) return;
  o.counters.potionsUsed[id] = (o.counters.potionsUsed[id] ?? 0) + 1;
  const kind = s.activity.kind === 'fighting' ? groupKind(s.activity.group) : 'normal';
  const bucket = o.counters.potionsByGroup[kind];
  bucket[id] = (bucket[id] ?? 0) + 1;
}

export interface StepOptions {
  /**
   * Rate sampling: XP is counted but levels do not change and no cards are collected, so the
   * sample measures one setup (card rates are computed exactly by the rate sheet).
   */
  freezeLevel?: boolean;
  counters?: SimCounters;
}

export function categoryKey(monsterId: string, elite: boolean): string {
  return `${monsterId}|${elite ? 1 : 0}`;
}

const floorHunts = new WeakMap<ContentDb, Map<number, Hunt>>();

/** The hunt the hero is in: the assigned one, or the dungeon floor during a run. */
export function huntOf(state: GameState, content: ContentDb): Hunt | null {
  if (state.dungeon.active) {
    let cache = floorHunts.get(content);
    if (!cache) floorHunts.set(content, (cache = new Map()));
    let hunt = cache.get(state.dungeon.floor);
    if (!hunt) cache.set(state.dungeon.floor, (hunt = floorHunt(content, state.dungeon.floor)));
    return hunt;
  }
  const hunt = state.hunt ? content.hunts.get(state.hunt.huntId) : undefined;
  return hunt ? huntAt(hunt, state.hunt!.difficulty) : null;
}

function seconds(s: number): number {
  return Math.max(1, Math.round(s * TICKS_PER_SECOND));
}

function monsterInstance(
  uid: number,
  m: Monster,
  elite: boolean,
  affixes: readonly MonsterAffix[] = [],
  /** Dungeon floors scale life and damage (in %). */
  scalePct = 100,
): MonsterInstance {
  const sum = (k: 'lifePct' | 'damagePct' | 'attackSpeedPct') =>
    affixes.reduce((n, a) => n + (a[k] ?? 0), 0);
  const lifePct = ((elite ? ELITE_LIFE_PCT : 100) * (100 + sum('lifePct')) * scalePct) / 10_000;
  const dmgPct = ((elite ? ELITE_DAMAGE_PCT : 100) * (100 + sum('damagePct')) * scalePct) / 10_000;
  const aps = (m.attacksPerSecond * (100 + sum('attackSpeedPct'))) / 100;
  const hp = Math.floor((m.hp * lifePct) / 100);
  return {
    uid,
    monsterId: m.id,
    elite,
    boss: m.boss === true,
    hp,
    maxHp: hp,
    damageMin: Math.floor((m.damageMin * dmgPct) / 100),
    damageMax: Math.floor((m.damageMax * dmgPct) / 100),
    attackIntervalTicks: Math.max(1, Math.ceil(TICKS_PER_SECOND / aps)),
    nextAttackTick: 0,
    affixes: affixes.map((a) => a.id),
  };
}

/** One or two distinct elite modifiers. RNG draws: count, then one pick per modifier. */
function rollEliteAffixes(s: GameState, content: ContentDb): MonsterAffix[] {
  const pool = [...content.monsterAffixes.values()];
  const count = Math.min(pool.length, rngInt(s.rng, ELITE_AFFIX_COUNT[0], ELITE_AFFIX_COUNT[1]));
  const out: MonsterAffix[] = [];
  for (let i = 0; i < count; i++) {
    const a = pickWeighted(s.rng, pool, (x) => x.weight);
    pool.splice(pool.indexOf(a), 1);
    out.push(a);
  }
  return out;
}

/** Sum of one numeric field over a monster's elite modifiers. */
function affixTotal(content: ContentDb, m: MonsterInstance, k: 'defensePct' | 'leechPct'): number {
  let n = 0;
  for (const id of m.affixes) n += content.monsterAffixes.get(id)?.[k] ?? 0;
  return n;
}

/**
 * Rolls the next group and starts walking towards it. The group is known from the start of
 * the walk so the scene can show it ahead on the route. RNG draws: boss check needs none;
 * otherwise group size, elite roll, then one pick per monster.
 */
function startWalking(
  s: GameState,
  content: ContentDb,
  t: number,
  out: GameEvent[] | null,
  o: StepOptions,
) {
  const hunt = huntOf(s, content)!;
  const group: MonsterInstance[] = [];
  const progress = s.hunt!;
  const d = s.dungeon;
  const scale = d.active ? floorScalePct(content, d.floor) : 100;
  const floorBoss =
    d.active && isBossFloor(d.floor) ? floorBlock(content, d.floor).hunt.boss : null;
  if (floorBoss) {
    // The tenth floor of a block is its hunt's boss, alone.
    group.push(
      monsterInstance(s.nextUid++, content.monsters.get(floorBoss.monsterId)!, false, [], scale),
    );
  } else if (!d.active && hunt.boss && progress.killsSinceBoss >= hunt.boss.everyKills) {
    group.push(monsterInstance(s.nextUid++, content.monsters.get(hunt.boss.monsterId)!, false));
    if (o.counters) o.counters.bossEncounters++;
  } else {
    const size = rngInt(s.rng, hunt.groupSize.min, hunt.groupSize.max);
    const elite = rngChance(s.rng, hunt.eliteChancePpm);
    for (let i = 0; i < size; i++) {
      const pick = pickWeighted(s.rng, hunt.spawns, (sp) => sp.weight);
      const m = content.monsters.get(pick.monsterId)!;
      const isElite = elite && i === 0;
      group.push(
        monsterInstance(
          s.nextUid++,
          m,
          isElite,
          isElite ? rollEliteAffixes(s, content) : [],
          scale,
        ),
      );
    }
  }
  const engageTick = t + seconds(hunt.walkSecondsBetweenGroups);
  s.activity = { kind: 'walking', untilTick: engageTick, group };
  out?.push({
    type: 'GroupSpawned',
    tick: t,
    engageTick,
    monsters: group.map((m) => ({
      uid: m.uid,
      monsterId: m.monsterId,
      elite: m.elite,
      boss: m.boss,
      maxHp: m.maxHp,
      affixes: m.affixes,
    })),
  });
}

/** Floor cleared: rewards, records, next floor. */
function clearFloor(
  s: GameState,
  content: ContentDb,
  stats: HeroStats,
  t: number,
  out: GameEvent[] | null,
) {
  const d = s.dungeon;
  const floor = d.floor;
  grantReward(s, content, DUNGEON_FLOOR_REWARD);
  let item: ItemInstance | null = null;
  if (isBossFloor(floor)) {
    const block = floor / DUNGEON_FLOORS_PER_BLOCK;
    grantReward(s, content, {
      core: Math.min(DUNGEON_BOSS_CORES_MAX, block * DUNGEON_BOSS_CORES_PER_BLOCK),
    });
    const hunt = huntOf(s, content)!;
    const def = content.monsters.get(hunt.spawns[0]!.monsterId)!;
    const table = content.lootTables.get(def.lootTableId)!;
    const rarity = rollRarity(
      s.rng,
      rarityTable(
        stats.magicFindPct + floor * DUNGEON_BOSS_MAGIC_FIND_PER_FLOOR,
        'rare',
        legendaryAllowed(hunt.ilvl),
      ),
    );
    item = generateItem(s.rng, content, table, hunt.ilvl, s.nextUid++, rarity, s.hero.classId);
    rollSetPiece(s.rng, content, item, hunt.regionId);
    s.lifetime.itemsByRarity[item.rarity]++;
    if (s.backpack.length < backpackSize(s.hero, content)) s.backpack.push(item);
    else s.stash.push(item);
  }
  d.best = Math.max(d.best, floor);
  d.bestEver = Math.max(d.bestEver, floor);
  d.floor = floor + 1;
  d.killsOnFloor = 0;
  d.floorStartTick = t;
  out?.push({ type: 'DungeonFloorCleared', tick: t, floor, item });
}

function goToTown(
  s: GameState,
  content: ContentDb,
  t: number,
  reason: TownReason,
  out: GameEvent[] | null,
  o: StepOptions,
) {
  const hunt = huntOf(s, content);
  const arriveTick = t + (hunt ? seconds(hunt.travelSeconds) : 1);
  s.activity = { kind: 'to_town', untilTick: arriveTick, reason };
  if (o.counters) o.counters.townTrips++;
  out?.push({ type: 'TownTripStarted', tick: t, reason, arriveTick });
}

/**
 * Sells the backpack items up to the auto-sell rarity to the merchant (town visits and
 * offline loot). Returns the gold earned.
 */
export function autoSell(
  s: GameState,
  items: ItemInstance[],
): { kept: ItemInstance[]; gold: number } {
  const limit = s.settings.autoSellUpTo;
  if (limit === null) return { kept: items, gold: 0 };
  let gold = 0;
  const kept = items.filter((item) => {
    if (rarityRank(item.rarity) > rarityRank(limit)) return true;
    gold += sellPrice(item);
    return false;
  });
  s.gold += BigInt(gold);
  s.lifetime.goldEarned += BigInt(gold);
  return { kept, gold };
}

/** Deposits the backpack, refills life and mana and buys potions up to the target. */
function visitTown(s: GameState, content: ContentDb, stats: HeroStats, o: StepOptions) {
  const sold = autoSell(s, s.backpack);
  s.backpack = sold.kept;
  if (o.counters) o.counters.gold += sold.gold;
  const deposited = s.backpack.length;
  s.stash.push(...s.backpack);
  s.backpack = [];
  s.hero.hp = stats.maxHp;
  s.hero.mana = stats.maxMana;
  const potion = content.consumables.get(s.settings.hpPotionId);
  let bought = 0;
  if (potion?.price) {
    const have = s.consumables[potion.id] ?? 0;
    const want = Math.max(0, s.settings.potionTarget - have);
    const price = BigInt(potion.price);
    const affordable = Number(s.gold / price);
    bought = Math.min(want, affordable);
    if (bought > 0) {
      s.gold -= price * BigInt(bought);
      s.consumables[potion.id] = have + bought;
      if (o.counters) {
        o.counters.goldSpent += potion.price * bought;
        o.counters.potionsBought[potion.id] = (o.counters.potionsBought[potion.id] ?? 0) + bought;
      }
    }
  }
  return { deposited, bought };
}

function arriveInTown(
  s: GameState,
  content: ContentDb,
  t: number,
  reason: TownReason,
  out: GameEvent[] | null,
  o: StepOptions,
) {
  const stats = heroStats(s.hero, content);
  const { deposited, bought } = visitTown(s, content, stats, o);
  const noPotions = (s.consumables[s.settings.hpPotionId] ?? 0) === 0;
  let stop: 'manual' | 'too_many_deaths' | 'no_potions' | null = null;
  if (reason === 'manual') stop = 'manual';
  else if (
    reason === 'death' &&
    (!s.settings.autoReturnAfterDeath || s.hunt!.consecutiveDeaths > MAX_CONSECUTIVE_AUTO_RETURNS)
  ) {
    stop = 'too_many_deaths';
  } else if (noPotions && s.settings.returnWhenOutOfPotions) stop = 'no_potions';

  if (stop) {
    s.activity = { kind: 'idle_town' };
    out?.push({
      type: 'ArrivedInTown',
      tick: t,
      deposited,
      potionsBought: bought,
      leaveTick: null,
    });
    out?.push({ type: 'HuntStopped', tick: t, reason: stop });
    if (o.counters && stop !== 'manual') o.counters.stoppedAtTick ??= t;
    return;
  }
  // Automations (not while measuring rates: they would change the setup being measured).
  if (!o.freezeLevel) runAutomations(s, content, out);
  const leaveTick = t + TOWN_STAY_TICKS;
  s.activity = { kind: 'in_town', untilTick: leaveTick, then: 'hunt' };
  out?.push({ type: 'ArrivedInTown', tick: t, deposited, potionsBought: bought, leaveTick });
}

function leaveTown(s: GameState, content: ContentDb, t: number, out: GameEvent[] | null) {
  const hunt = huntOf(s, content);
  if (!hunt) {
    s.activity = { kind: 'idle_town' };
    return;
  }
  const arriveTick = t + seconds(hunt.travelSeconds);
  s.activity = { kind: 'to_hunt', untilTick: arriveTick };
  out?.push({ type: 'ReturningToHunt', tick: t, arriveTick });
}

function die(s: GameState, t: number, out: GameEvent[] | null, o: StepOptions) {
  const xpLost = Math.floor((s.hero.xp * DEATH_XP_LOSS_PCT) / 100);
  s.hero.xp -= xpLost;
  s.hero.hp = 0;
  s.lifetime.deaths++;
  s.hunt!.consecutiveDeaths++;
  // A defeat ends a dungeon run; the hero revives in town and goes back to the hunt.
  endDungeonRun(s, t, out, 'defeat');
  if (o.counters) o.counters.deaths++;
  s.activity = { kind: 'dead', untilTick: t + RESPAWN_TICKS };
  out?.push({ type: 'HeroDied', tick: t, xpLost });
}

/** Flat amount plus a share of the maximum, so potions stay useful at every level. */
export function potionAmount(potion: Consumable, max: number): number {
  return potion.restore + Math.floor((max * (potion.restorePct ?? 0)) / 100);
}

function usePotions(
  s: GameState,
  content: ContentDb,
  stats: HeroStats,
  t: number,
  out: GameEvent[] | null,
  o: StepOptions,
) {
  const c = s.combat;
  const hero = s.hero;
  if (t >= c.potionReadyTick && hero.hp * 100 < stats.maxHp * s.settings.potionThresholdPct) {
    const id = s.settings.hpPotionId;
    const have = s.consumables[id] ?? 0;
    const potion = content.consumables.get(id);
    if (potion && have > 0) {
      s.consumables[id] = have - 1;
      const amount = Math.min(potionAmount(potion, stats.maxHp), stats.maxHp - hero.hp);
      hero.hp += amount;
      c.potionReadyTick = t + POTION_COOLDOWN_TICKS;
      countPotion(s, o, id);
      out?.push({ type: 'PotionUsed', tick: t, consumableId: id, kind: 'hp', amount });
    }
  }
  const usesMana = hero.activeSkills.some((id) => id !== null && (hero.skillLevels[id] ?? 0) > 0);
  if (
    usesMana &&
    t >= c.manaPotionReadyTick &&
    hero.mana * 100 < stats.maxMana * s.settings.manaPotionThresholdPct
  ) {
    const id = s.settings.manaPotionId;
    const have = s.consumables[id] ?? 0;
    const potion = content.consumables.get(id);
    if (potion && have > 0) {
      s.consumables[id] = have - 1;
      const amount = Math.min(potionAmount(potion, stats.maxMana), stats.maxMana - hero.mana);
      hero.mana += amount;
      c.manaPotionReadyTick = t + POTION_COOLDOWN_TICKS;
      countPotion(s, o, id);
      out?.push({ type: 'PotionUsed', tick: t, consumableId: id, kind: 'mana', amount });
    }
  }
}

/**
 * Picks the first active skill (by priority) that is learned, off cooldown, affordable and
 * allowed by its rule right now (decision 169).
 */
function pickSkill(
  s: GameState,
  content: ContentDb,
  stats: HeroStats,
  group: MonsterInstance[],
  t: number,
) {
  let ctx: RuleContext | null = null;
  for (const id of s.hero.activeSkills) {
    if (id === null) continue;
    const level = s.hero.skillLevels[id] ?? 0;
    const skill = content.skills.get(id);
    if (!skill || skill.kind !== 'active' || level <= 0) continue;
    const cost = skill.manaCost + skill.manaCostPerLevel * (level - 1);
    if (s.hero.mana < cost) continue;
    if (t < (s.combat.skillReadyTick[id] ?? 0)) continue;
    // A buff is not recast while it is still running.
    if (skill.buff && t < (s.combat.buffUntil[id] ?? 0)) continue;
    const rule = s.settings.skillRules[id];
    if (rule) {
      ctx ??= ruleContext(s, stats, group);
      if (!ruleAllows(rule, ctx)) continue;
    }
    return { skill, level, cost };
  }
  return null;
}

function ruleContext(s: GameState, stats: HeroStats, group: MonsterInstance[]): RuleContext {
  let enemies = 0;
  for (const m of group) if (m.hp > 0) enemies++;
  const target = targetOrder(s, group).find((m) => m.hp > 0) ?? null;
  return {
    heroHp: s.hero.hp,
    heroMaxHp: stats.maxHp,
    heroMana: s.hero.mana,
    heroMaxMana: stats.maxMana,
    target,
    enemies,
  };
}

/** Sum of one numeric parameter over the hero's unique effects of a kind. */
function uniqueSum(stats: HeroStats, kind: 'thorns' | 'calm_regen'): number {
  let n = 0;
  for (const u of stats.uniques) {
    if (u.kind === 'thorns' && kind === 'thorns') n += u.pct;
    if (u.kind === 'calm_regen' && kind === 'calm_regen') n += u.multiplier;
  }
  return n;
}

function skillBonus(stats: HeroStats, skillId: string) {
  let damagePct = 0;
  let extraTargets = 0;
  for (const u of stats.uniques) {
    if (u.kind === 'skill_bonus' && u.skillId === skillId) {
      damagePct += u.damagePct;
      extraTargets += u.extraTargets;
    }
  }
  return damagePct > 0 || extraTargets > 0 ? { damagePct, extraTargets } : null;
}

/** Extra damage % of one hit from unique effects (execute, first strike, last stand). */
function uniqueHitPct(
  stats: HeroStats,
  heroHp: number,
  target: MonsterInstance,
  group: MonsterInstance[],
): number {
  let pct = 0;
  for (const u of stats.uniques) {
    if (u.kind === 'execute' && target.hp * 100 < target.maxHp * u.thresholdPct) pct += u.damagePct;
    if (u.kind === 'first_strike' && group.every((m) => m.hp === m.maxHp)) pct += u.damagePct;
    if (u.kind === 'last_stand' && heroHp * 100 < stats.maxHp * u.thresholdPct) pct += u.damagePct;
  }
  return pct;
}

/** Life healed by a critical hit (unique effect). */
function critHeal(stats: HeroStats): number {
  let pct = 0;
  for (const u of stats.uniques) if (u.kind === 'crit_heal') pct += u.pctOfMaxHp;
  return Math.floor((stats.maxHp * pct) / 100);
}

/** Extra damage % from buffs active at tick t. */
function buffDamagePct(s: GameState, content: ContentDb, t: number): number {
  let pct = 0;
  for (const [id, until] of Object.entries(s.combat.buffUntil)) {
    if (t >= until) continue;
    const skill = content.skills.get(id);
    if (skill?.kind !== 'active' || !skill.buff) continue;
    const level = s.hero.skillLevels[id] ?? 1;
    pct += skill.buff.value + skill.buff.perLevel * (level - 1);
  }
  return pct;
}

/** XP for one kill: base × level-gap penalty × elite reward × (1 + XP bonus), floored. */
export function killXp(def: Monster, elite: boolean, heroLevel: number, xpPct: number): number {
  const rewardPct = elite ? ELITE_REWARD_PCT : 100;
  return Math.floor(
    (((def.xp * xpGapPct(heroLevel, def.level)) / 100) * rewardPct * (100 + xpPct)) / 10_000,
  );
}

function killMonster(
  s: GameState,
  content: ContentDb,
  stats: HeroStats,
  m: MonsterInstance,
  t: number,
  out: GameEvent[] | null,
  o: StepOptions,
) {
  const def = content.monsters.get(m.monsterId)!;
  const hunt = huntOf(s, content)!;
  const rewardPct = m.elite ? ELITE_REWARD_PCT : 100;
  const xp = killXp(def, m.elite, s.hero.level, stats.xpPct);
  const goldRoll = rngInt(s.rng, def.gold[0], def.gold[1]);
  // Gold in 1/10,000ths: the fraction carries to the next kill, so small bonuses on cheap
  // monsters are not lost to rounding.
  const bonus = difficultyRule(currentDifficulty(s));
  const raw = goldRoll * rewardPct * (100 + stats.goldPct + bonus.goldPct) + s.goldRemainder;
  const gold = Math.floor(raw / 10_000);
  s.goldRemainder = raw % 10_000;

  s.lifetime.kills++;
  // Like cards, the bestiary does not grow while measuring rates (it would change power mid-sample).
  if (!o.freezeLevel) s.bestiary[m.monsterId] = (s.bestiary[m.monsterId] ?? 0) + 1;
  s.lifetime.goldEarned += BigInt(gold);
  s.gold += BigInt(gold);
  if (o.counters) {
    const key = categoryKey(m.monsterId, m.elite);
    o.counters.kills.set(key, (o.counters.kills.get(key) ?? 0) + 1);
    o.counters.gold += gold;
    o.counters.xp += xp;
  }
  out?.push({ type: 'MonsterDied', tick: t, uid: m.uid, monsterId: m.monsterId, xp, gold });
  questProgress(s, 'kill_monsters', 1);
  if (m.elite) questProgress(s, 'kill_elites', 1);
  if (m.boss) questProgress(s, 'defeat_bosses', 1);
  questProgress(s, 'earn_gold', gold);
  if (o.freezeLevel) s.lifetime.xpEarned += BigInt(xp);
  else addXp(s, content, xp, t, out);

  // Equipment
  const table = content.lootTables.get(def.lootTableId)!;
  const rolls = table.rolls ?? 1;
  const dropPpm = Math.min(
    PPM,
    Math.floor((table.equipmentDropChancePpm * (m.elite ? ELITE_DROP_CHANCE_PCT : 100)) / 100),
  );
  const magicFindPct =
    stats.magicFindPct + bonus.magicFindPct + (m.elite ? ELITE_MAGIC_FIND_BONUS : 0);
  const bagSize = backpackSize(s.hero, content);
  const legendaryOk = legendaryAllowed(hunt.ilvl);
  // A new hero's 5th kill always drops a magic item (first ten minutes, section 11.4).
  const firstMagic = s.lifetime.kills === FIRST_MAGIC_ITEM_KILL && !s.flags.includes('first_magic');
  if (firstMagic) s.flags.push('first_magic');
  // And around ten minutes in, a rare for a hero who has not found one yet.
  let firstRare = false;
  if (s.lifetime.kills === FIRST_RARE_ITEM_KILL && !s.flags.includes('first_rare')) {
    s.flags.push('first_rare');
    const l = s.lifetime.itemsByRarity;
    firstRare = l.rare + l.epic + l.legendary === 0;
  }
  const guaranteed: Rarity | null = firstMagic ? 'magic' : firstRare ? 'rare' : null;
  for (let r = 0; r < rolls + (guaranteed ? 1 : 0); r++) {
    const forced = guaranteed !== null && r === rolls;
    if (!forced && !rngChance(s.rng, dropPpm)) continue;
    const pity = pityRarity(s.dropPity, legendaryOk);
    const rarity = forced ? guaranteed : (pity ?? { magicFindPct });
    const item = generateItem(
      s.rng,
      content,
      table,
      hunt.ilvl,
      s.nextUid++,
      rarity,
      s.hero.classId,
    );
    rollSetPiece(s.rng, content, item, hunt.regionId);
    recordDrop(s.dropPity, item.rarity, legendaryOk);
    s.lifetime.itemsByRarity[item.rarity]++;
    questLoot(s, item.rarity);
    const kept = filterKeeps(s.settings.lootFilter, item) && s.backpack.length < bagSize;
    out?.push({
      type: 'ItemDropped',
      tick: t,
      fromUid: m.uid,
      item,
      kept,
      ...(pity && !forced ? { pity: true as const } : {}),
    });
    if (kept) {
      s.backpack.push(item);
    } else {
      const { materialId, qty } = rollSalvage(s.rng, content, item.rarity);
      s.materials[materialId] = (s.materials[materialId] ?? 0n) + BigInt(qty);
      out?.push({ type: 'MaterialsGained', tick: t, materialId, qty });
    }
  }
  const card = o.freezeLevel
    ? null
    : rollCard(s, content, m.monsterId, m.elite, (ppm) => rngChance(s.rng, ppm), stats.cardLuckPct);
  if (card) {
    if (o.counters) o.counters.cards[card.cardId] = (o.counters.cards[card.cardId] ?? 0) + 1;
    out?.push({ type: 'CardDropped', tick: t, fromUid: m.uid, ...card });
  }
  for (const extra of table.extras) {
    if (!rngChance(s.rng, extra.chancePpm)) continue;
    const qty = rngInt(s.rng, extra.qty[0], extra.qty[1]);
    s.consumables[extra.itemId] = (s.consumables[extra.itemId] ?? 0) + qty;
    out?.push({
      type: 'ConsumableDropped',
      tick: t,
      fromUid: m.uid,
      consumableId: extra.itemId,
      qty,
    });
  }

  const progress = s.hunt!;
  if (s.dungeon.active) {
    // Dungeon kills count for the floor, not for the assigned hunt's boss.
    s.dungeon.killsOnFloor++;
    if (m.boss) {
      s.lifetime.bossKills++;
      out?.push({ type: 'BossDefeated', tick: t, monsterId: m.monsterId, firstTime: false });
      rollPetDrop(s, content, m.monsterId, (ppm) => rngChance(s.rng, ppm), t, out);
    }
    return;
  }
  if (m.boss) {
    progress.killsSinceBoss = 0;
    s.lifetime.bossKills++;
    const firstTime = !s.defeatedBosses.includes(m.monsterId);
    if (firstTime) {
      s.defeatedBosses.push(m.monsterId);
      s.hero.resets.newBossesThisCycle++;
    }
    out?.push({ type: 'BossDefeated', tick: t, monsterId: m.monsterId, firstTime });
    // Pets: rate sampling skips them (like cards, they would change power mid-sample).
    if (!o.freezeLevel) {
      rollPetDrop(s, content, m.monsterId, (ppm) => rngChance(s.rng, ppm), t, out);
    }
    if (hunt.unlocks && !s.unlockedHunts.includes(hunt.unlocks)) {
      s.unlockedHunts.push(hunt.unlocks);
      out?.push({ type: 'HuntUnlocked', tick: t, huntId: hunt.unlocks });
    }
  } else {
    progress.killsSinceBoss++;
  }
}

/** Percent of the hero's damage of an element a monster ignores (negative = weakness). */
export function resistancePct(def: Monster, element: Element): number {
  return def.resistances?.[element] ?? 0;
}

/** One swing of the hero (a normal attack or a damaging skill) against the group. */
/** The group in the order the hero hits it (the target priority setting). */
function targetOrder(s: GameState, group: MonsterInstance[]): MonsterInstance[] {
  const p = s.settings.targetPriority;
  if (p === 'first') return group;
  const dir = p === 'weakest' ? 1 : -1;
  // Stable: ties keep the group order, so the result does not depend on the sort.
  return group
    .map((m, i) => ({ m, i }))
    .sort((a, b) => dir * (a.m.hp - b.m.hp) || a.i - b.i)
    .map((x) => x.m);
}

function heroStrike(
  s: GameState,
  content: ContentDb,
  stats: HeroStats,
  group: MonsterInstance[],
  t: number,
  out: GameEvent[] | null,
  o: StepOptions,
  picked: ReturnType<typeof pickSkill>,
  maxTargets: number,
  baseSkillPct: number,
) {
  const hero = s.hero;
  const c = s.combat;
  const skillPct = Math.floor((baseSkillPct * (100 + buffDamagePct(s, content, t))) / 100);
  const hits: HitResult[] = [];
  let leech = 0;
  // Element of this swing: the skill's own, else the class's basic attack (decision 170).
  const element =
    (picked?.skill.kind === 'active' ? picked.skill.element : undefined) ??
    classOf(content, hero).element;
  for (const m of targetOrder(s, group)) {
    if (hits.length >= maxTargets) break;
    if (m.hp <= 0) continue;
    const def = content.monsters.get(m.monsterId)!;
    const undead =
      (def.tags.includes('undead') ? stats.damageVsUndeadPct : 0) +
      bestiaryDamagePct(s, content, m.monsterId);
    const atk: AttackProfile = {
      level: hero.level,
      accuracy: stats.accuracy,
      damageMin: stats.damageMin,
      damageMax: stats.damageMax,
      critChancePpm: stats.critChancePpm,
      critDamagePct: stats.critDamagePct,
      damagePct: Math.floor(
        (Math.floor(
          (skillPct * (100 + undead) * (100 + uniqueHitPct(stats, hero.hp, m, group))) / 10_000,
        ) *
          (100 - resistancePct(def, element))) /
          100,
      ),
    };
    const armorPct = 100 + affixTotal(content, m, 'defensePct');
    const hit = rollHit(s.rng, atk, {
      evasion: def.evasion,
      defense: Math.floor((def.defense * armorPct) / 100),
    });
    const dealt = Math.min(hit.damage, m.hp);
    m.hp -= hit.damage;
    leech += Math.floor((dealt * stats.lifeLeechPct) / 100);
    hits.push({ uid: m.uid, damage: hit.damage, crit: hit.crit, miss: hit.miss });
    if (hit.crit) leech += critHeal(stats);
  }
  if (leech > 0) hero.hp = Math.min(stats.maxHp, hero.hp + leech);
  c.nextAttackTick = t + stats.attackIntervalTicks;
  const stun = picked?.skill.kind === 'active' ? picked.skill.stunSeconds : undefined;
  const first = hits[0];
  const stunned = stun && first && !first.miss ? group.find((m) => m.uid === first.uid) : undefined;
  if (stunned && stun) {
    stunned.nextAttackTick = Math.max(
      stunned.nextAttackTick,
      t + Math.round(stun * TICKS_PER_SECOND),
    );
  }
  out?.push({ type: 'HeroAttack', tick: t, skillId: picked?.skill.id ?? null, hits, leech });
  for (const m of group) {
    if (m.hp <= 0 && hits.some((h) => h.uid === m.uid))
      killMonster(s, content, stats, m, t, out, o);
  }
}

function fight(
  s: GameState,
  content: ContentDb,
  stats: HeroStats,
  group: MonsterInstance[],
  t: number,
  out: GameEvent[] | null,
  o: StepOptions,
) {
  const hero = s.hero;
  const c = s.combat;

  if (t >= c.nextAttackTick) {
    const picked = pickSkill(s, content, stats, group, t);
    const bonus = picked ? skillBonus(stats, picked.skill.id) : null;
    const maxTargets = (picked ? picked.skill.maxTargets : 1) + (bonus?.extraTargets ?? 0);
    let skillPct = 100;
    if (picked) {
      hero.mana -= picked.cost;
      c.skillReadyTick[picked.skill.id] =
        t + Math.round(picked.skill.cooldownSeconds * TICKS_PER_SECOND);
      const base = picked.skill.damagePct + picked.skill.damagePctPerLevel * (picked.level - 1);
      skillPct = Math.floor((base * (1000 + stats.skillDamagePermille)) / 1000);
      if (bonus) skillPct = Math.floor((skillPct * (100 + bonus.damagePct)) / 100);
    }
    const buff = picked?.skill.kind === 'active' ? picked.skill.buff : undefined;
    if (picked && buff) {
      // Buff skills spend the swing on the cast and hit nothing.
      c.buffUntil[picked.skill.id] = t + Math.round(buff.durationSeconds * TICKS_PER_SECOND);
      c.nextAttackTick = t + stats.attackIntervalTicks;
      out?.push({ type: 'HeroAttack', tick: t, skillId: picked.skill.id, hits: [], leech: 0 });
    } else {
      heroStrike(s, content, stats, group, t, out, o, picked, maxTargets, skillPct);
    }
  }

  for (const m of group) {
    if (m.hp <= 0 || t < m.nextAttackTick) continue;
    const def = content.monsters.get(m.monsterId)!;
    const hit = rollHit(
      s.rng,
      {
        level: def.level,
        accuracy: def.accuracy,
        damageMin: m.damageMin,
        damageMax: m.damageMax,
        critChancePpm: BASE_CRIT_CHANCE_PPM,
        critDamagePct: BASE_CRIT_DAMAGE_PCT,
        // The hero's resistance to the attack's element (decision 171); 0 keeps it at 100%.
        damagePct: 100 - heroResistPct(stats, def.attack?.element ?? 'physical'),
      },
      { evasion: stats.evasion, defense: stats.defense },
    );
    m.nextAttackTick = t + m.attackIntervalTicks;
    hero.hp -= hit.damage;
    const leech = m.affixes.length > 0 ? affixTotal(content, m, 'leechPct') : 0;
    if (leech > 0) m.hp = Math.min(m.maxHp, m.hp + Math.floor((hit.damage * leech) / 100));
    const thorns = uniqueSum(stats, 'thorns');
    if (thorns > 0 && hit.damage > 0 && m.hp > 0) {
      m.hp -= Math.max(1, Math.floor((hit.damage * thorns) / 100));
      if (m.hp <= 0) killMonster(s, content, stats, m, t, out, o);
    }
    out?.push({ type: 'MonsterAttack', tick: t, uid: m.uid, damage: hit.damage, miss: hit.miss });
    if (hero.hp <= 0) {
      die(s, t, out, o);
      return;
    }
  }

  usePotions(s, content, stats, t, out, o);

  if (group.every((m) => m.hp <= 0)) {
    s.hunt!.consecutiveDeaths = 0;
    if (s.dungeon.active) {
      // No trips to town in the dungeon: a full backpack salvages on pickup.
      if (group.some((m) => m.boss) || s.dungeon.killsOnFloor >= DUNGEON_KILLS_PER_FLOOR) {
        clearFloor(s, content, stats, t, out);
      }
      startWalking(s, content, t, out, o);
      return;
    }
    if (o.counters) o.counters.groups[groupKind(group)]++;
    const noPotions = (s.consumables[s.settings.hpPotionId] ?? 0) === 0;
    if (s.backpack.length >= backpackSize(hero, content))
      goToTown(s, content, t, 'backpack_full', out, o);
    else if (noPotions && s.settings.returnWhenOutOfPotions)
      goToTown(s, content, t, 'no_potions', out, o);
    else startWalking(s, content, t, out, o);
  }
}

function regenerate(s: GameState, stats: HeroStats) {
  const hero = s.hero;
  // "Coroa do Vigia": regeneration multiplied outside fights.
  const calm = s.activity.kind === 'fighting' ? 1 : Math.max(1, uniqueSum(stats, 'calm_regen'));
  hero.hp = Math.min(stats.maxHp, hero.hp + stats.hpRegenPerSecond * calm);
  hero.mana = Math.min(stats.maxMana, hero.mana + stats.manaRegenPerSecond * calm);
}

/** Advances the simulation by one tick. */
export function tickOnce(
  s: GameState,
  content: ContentDb,
  out: GameEvent[] | null,
  o: StepOptions,
) {
  const t = s.tick;
  const a = s.activity;
  const stats = heroStats(s.hero, content);
  if (t % TICKS_PER_SECOND === 0 && a.kind !== 'dead') regenerate(s, stats);
  // Too long on one floor: the Abyss throws the hero out (back to town, then to the hunt).
  if (a.kind !== 'dead' && floorTimedOut(s, t)) {
    endDungeonRun(s, t, out, 'time');
    goToTown(s, content, t, 'dungeon', out, o);
    s.tick = t + 1;
    return;
  }
  // Professions do not change combat, so rate sampling skips them.
  if (!o.freezeLevel) tickProfessions(s, content, t, out);
  tickMeal(s, content, !!o.freezeLevel);
  switch (a.kind) {
    case 'idle_town':
      break;
    case 'walking':
      if (t >= a.untilTick) {
        for (const m of a.group) m.nextAttackTick = t + m.attackIntervalTicks;
        s.combat.nextAttackTick = Math.max(s.combat.nextAttackTick, t);
        s.activity = { kind: 'fighting', group: a.group };
        out?.push({ type: 'GroupEngaged', tick: t });
        fight(s, content, stats, a.group, t, out, o);
      } else {
        usePotions(s, content, stats, t, out, o);
      }
      break;
    case 'fighting':
      fight(s, content, stats, a.group, t, out, o);
      break;
    case 'to_town':
      if (t >= a.untilTick) arriveInTown(s, content, t, a.reason, out, o);
      break;
    case 'in_town':
      if (t >= a.untilTick) {
        if (a.then === 'hunt') leaveTown(s, content, t, out);
        else s.activity = { kind: 'idle_town' };
      }
      break;
    case 'to_hunt':
      if (t >= a.untilTick) startWalking(s, content, t, out, o);
      break;
    case 'dead':
      if (t >= a.untilTick) {
        const after = heroStats(s.hero, content);
        s.hero.hp = after.maxHp;
        arriveInTown(s, content, t, 'death', out, o);
      }
      break;
  }
  s.tick = t + 1;
}

/** Advances the simulation by `ticks` and returns the events produced. */
export function step(
  state: GameState,
  content: ContentDb,
  ticks: number,
  options: StepOptions = {},
): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) tickOnce(state, content, out, options);
  return out;
}

/** Same as `step` but without collecting events (rate sampling, catch-up). */
export function stepQuiet(
  state: GameState,
  content: ContentDb,
  ticks: number,
  options: StepOptions = {},
) {
  for (let i = 0; i < ticks; i++) tickOnce(state, content, null, options);
}
