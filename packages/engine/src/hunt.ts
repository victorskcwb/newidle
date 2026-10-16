import type { ContentDb, Hunt, Monster } from '@abismo/content';
import { rollHit, type AttackProfile } from './combat.ts';
import {
  BACKPACK_SIZE,
  BASE_CRIT_CHANCE_PPM,
  BASE_CRIT_DAMAGE_PCT,
  DEATH_XP_LOSS_PCT,
  ELITE_DAMAGE_PCT,
  ELITE_DROP_CHANCE_PCT,
  ELITE_LIFE_PCT,
  ELITE_MAGIC_FIND_BONUS,
  ELITE_REWARD_PCT,
  MAX_CONSECUTIVE_AUTO_RETURNS,
  POTION_COOLDOWN_TICKS,
  PPM,
  RESPAWN_TICKS,
  TICKS_PER_SECOND,
  TOWN_STAY_TICKS,
} from './constants.ts';
import { filterKeeps, generateItem, pickWeighted, rollSalvage } from './items.ts';
import { addXp } from './progression.ts';
import { rngChance, rngInt } from './rng.ts';
import { heroStats, type HeroStats } from './stats.ts';
import type { GameEvent, GameState, HitResult, MonsterInstance, TownReason } from './types.ts';
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
  /** Tick at which the hunt stopped on its own (too many deaths, no potions), if it did. */
  stoppedAtTick: number | null;
}

export interface StepOptions {
  /** Rate sampling: XP is counted but levels do not change, so the sample measures one setup. */
  freezeLevel?: boolean;
  counters?: SimCounters;
}

export function categoryKey(monsterId: string, elite: boolean): string {
  return `${monsterId}|${elite ? 1 : 0}`;
}

export function huntOf(state: GameState, content: ContentDb): Hunt | null {
  return state.hunt ? (content.hunts.get(state.hunt.huntId) ?? null) : null;
}

function seconds(s: number): number {
  return Math.max(1, Math.round(s * TICKS_PER_SECOND));
}

function monsterInstance(uid: number, m: Monster, elite: boolean): MonsterInstance {
  const lifePct = elite ? ELITE_LIFE_PCT : 100;
  const dmgPct = elite ? ELITE_DAMAGE_PCT : 100;
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
    attackIntervalTicks: Math.max(1, Math.ceil(TICKS_PER_SECOND / m.attacksPerSecond)),
    nextAttackTick: 0,
  };
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
  if (hunt.boss && progress.killsSinceBoss >= hunt.boss.everyKills) {
    group.push(monsterInstance(s.nextUid++, content.monsters.get(hunt.boss.monsterId)!, false));
    if (o.counters) o.counters.bossEncounters++;
  } else {
    const size = rngInt(s.rng, hunt.groupSize.min, hunt.groupSize.max);
    const elite = rngChance(s.rng, hunt.eliteChancePpm);
    for (let i = 0; i < size; i++) {
      const pick = pickWeighted(s.rng, hunt.spawns, (sp) => sp.weight);
      const m = content.monsters.get(pick.monsterId)!;
      group.push(monsterInstance(s.nextUid++, m, elite && i === 0));
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
    })),
  });
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

/** Deposits the backpack, refills life and mana and buys potions up to the target. */
function visitTown(s: GameState, content: ContentDb, stats: HeroStats, o: StepOptions) {
  const deposited = s.backpack.length;
  s.stash.push(...s.backpack);
  s.backpack = [];
  s.hero.hp = stats.maxHp;
  s.hero.mana = stats.maxMana;
  const potion = content.consumables.get(s.settings.hpPotionId);
  let bought = 0;
  if (potion) {
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
  if (o.counters) o.counters.deaths++;
  s.activity = { kind: 'dead', untilTick: t + RESPAWN_TICKS };
  out?.push({ type: 'HeroDied', tick: t, xpLost });
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
      const amount = Math.min(potion.restore, stats.maxHp - hero.hp);
      hero.hp += amount;
      c.potionReadyTick = t + POTION_COOLDOWN_TICKS;
      if (o.counters) o.counters.potionsUsed[id] = (o.counters.potionsUsed[id] ?? 0) + 1;
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
      const amount = Math.min(potion.restore, stats.maxMana - hero.mana);
      hero.mana += amount;
      c.manaPotionReadyTick = t + POTION_COOLDOWN_TICKS;
      if (o.counters) o.counters.potionsUsed[id] = (o.counters.potionsUsed[id] ?? 0) + 1;
      out?.push({ type: 'PotionUsed', tick: t, consumableId: id, kind: 'mana', amount });
    }
  }
}

/** Picks the first active skill (by priority) that is learned, off cooldown and affordable. */
function pickSkill(s: GameState, content: ContentDb, t: number) {
  for (const id of s.hero.activeSkills) {
    if (id === null) continue;
    const level = s.hero.skillLevels[id] ?? 0;
    const skill = content.skills.get(id);
    if (!skill || skill.kind !== 'active' || level <= 0) continue;
    const cost = skill.manaCost + skill.manaCostPerLevel * (level - 1);
    if (s.hero.mana < cost) continue;
    if (t < (s.combat.skillReadyTick[id] ?? 0)) continue;
    return { skill, level, cost };
  }
  return null;
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
  const gold = Math.floor((goldRoll * rewardPct * (100 + stats.goldPct)) / 10_000);

  s.lifetime.kills++;
  s.lifetime.goldEarned += BigInt(gold);
  s.gold += BigInt(gold);
  if (o.counters) {
    const key = categoryKey(m.monsterId, m.elite);
    o.counters.kills.set(key, (o.counters.kills.get(key) ?? 0) + 1);
    o.counters.gold += gold;
    o.counters.xp += xp;
  }
  out?.push({ type: 'MonsterDied', tick: t, uid: m.uid, monsterId: m.monsterId, xp, gold });
  if (o.freezeLevel) s.lifetime.xpEarned += BigInt(xp);
  else addXp(s, content, xp, t, out);

  // Equipment
  const table = content.lootTables.get(def.lootTableId)!;
  const rolls = table.rolls ?? 1;
  const dropPpm = Math.min(
    PPM,
    Math.floor((table.equipmentDropChancePpm * (m.elite ? ELITE_DROP_CHANCE_PCT : 100)) / 100),
  );
  const magicFindPct = stats.magicFindPct + (m.elite ? ELITE_MAGIC_FIND_BONUS : 0);
  for (let r = 0; r < rolls; r++) {
    if (!rngChance(s.rng, dropPpm)) continue;
    const item = generateItem(s.rng, content, table, hunt.ilvl, s.nextUid++, { magicFindPct });
    s.lifetime.itemsByRarity[item.rarity]++;
    const kept = filterKeeps(s.settings.lootFilter, item) && s.backpack.length < BACKPACK_SIZE;
    out?.push({ type: 'ItemDropped', tick: t, fromUid: m.uid, item, kept });
    if (kept) {
      s.backpack.push(item);
    } else {
      const { materialId, qty } = rollSalvage(s.rng, content, item.rarity);
      s.materials[materialId] = (s.materials[materialId] ?? 0n) + BigInt(qty);
      out?.push({ type: 'MaterialsGained', tick: t, materialId, qty });
    }
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
  if (m.boss) {
    progress.killsSinceBoss = 0;
    s.lifetime.bossKills++;
    const firstTime = !s.defeatedBosses.includes(m.monsterId);
    if (firstTime) s.defeatedBosses.push(m.monsterId);
    out?.push({ type: 'BossDefeated', tick: t, monsterId: m.monsterId, firstTime });
    if (hunt.unlocks && !s.unlockedHunts.includes(hunt.unlocks)) {
      s.unlockedHunts.push(hunt.unlocks);
      out?.push({ type: 'HuntUnlocked', tick: t, huntId: hunt.unlocks });
    }
  } else {
    progress.killsSinceBoss++;
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
    const picked = pickSkill(s, content, t);
    const maxTargets = picked ? picked.skill.maxTargets : 1;
    let skillPct = 100;
    if (picked) {
      hero.mana -= picked.cost;
      c.skillReadyTick[picked.skill.id] =
        t + Math.round(picked.skill.cooldownSeconds * TICKS_PER_SECOND);
      const base = picked.skill.damagePct + picked.skill.damagePctPerLevel * (picked.level - 1);
      skillPct = Math.floor((base * (1000 + stats.skillDamagePermille)) / 1000);
    }
    const hits: HitResult[] = [];
    let leech = 0;
    for (const m of group) {
      if (hits.length >= maxTargets) break;
      if (m.hp <= 0) continue;
      const def = content.monsters.get(m.monsterId)!;
      const undead = def.tags.includes('undead') ? stats.damageVsUndeadPct : 0;
      const atk: AttackProfile = {
        level: hero.level,
        accuracy: stats.accuracy,
        damageMin: stats.damageMin,
        damageMax: stats.damageMax,
        critChancePpm: stats.critChancePpm,
        critDamagePct: stats.critDamagePct,
        damagePct: Math.floor((skillPct * (100 + undead)) / 100),
      };
      const hit = rollHit(s.rng, atk, def);
      const dealt = Math.min(hit.damage, m.hp);
      m.hp -= hit.damage;
      leech += Math.floor((dealt * stats.lifeLeechPct) / 100);
      hits.push({ uid: m.uid, damage: hit.damage, crit: hit.crit, miss: hit.miss });
    }
    if (leech > 0) hero.hp = Math.min(stats.maxHp, hero.hp + leech);
    c.nextAttackTick = t + stats.attackIntervalTicks;
    out?.push({ type: 'HeroAttack', tick: t, skillId: picked?.skill.id ?? null, hits, leech });
    for (const m of group) {
      if (m.hp <= 0 && hits.some((h) => h.uid === m.uid))
        killMonster(s, content, stats, m, t, out, o);
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
        damagePct: 100,
      },
      { evasion: stats.evasion, defense: stats.defense },
    );
    m.nextAttackTick = t + m.attackIntervalTicks;
    hero.hp -= hit.damage;
    out?.push({ type: 'MonsterAttack', tick: t, uid: m.uid, damage: hit.damage, miss: hit.miss });
    if (hero.hp <= 0) {
      die(s, t, out, o);
      return;
    }
  }

  usePotions(s, content, stats, t, out, o);

  if (group.every((m) => m.hp <= 0)) {
    s.hunt!.consecutiveDeaths = 0;
    const noPotions = (s.consumables[s.settings.hpPotionId] ?? 0) === 0;
    if (s.backpack.length >= BACKPACK_SIZE) goToTown(s, content, t, 'backpack_full', out, o);
    else if (noPotions && s.settings.returnWhenOutOfPotions)
      goToTown(s, content, t, 'no_potions', out, o);
    else startWalking(s, content, t, out, o);
  }
}

function regenerate(s: GameState, stats: HeroStats) {
  const hero = s.hero;
  hero.hp = Math.min(stats.maxHp, hero.hp + stats.hpRegenPerSecond);
  hero.mana = Math.min(stats.maxMana, hero.mana + stats.manaRegenPerSecond);
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
