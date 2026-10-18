import { EQUIPMENT_SLOTS, type ContentDb, type EquipmentSlot, type Rarity } from '@abismo/content';
import { MAX_LEVEL, TICKS_PER_SECOND } from './constants.ts';
import { rarityRank, rollSalvage } from './items.ts';
import { IntentError, addXp, autoAllocate } from './progression.ts';
import { computeHeroStats, heroStats, inactiveReason, type HeroStats } from './stats.ts';
import type {
  AutoAllocateProfile,
  GameEvent,
  GameState,
  ItemInstance,
  LootFilter,
  TargetPriority,
} from './types.ts';
import { upgradeTotal } from './upgrades.ts';
import { xpToNext } from './xp.ts';

/**
 * Player intents. Each validates, mutates the state at the current tick and returns the
 * events it caused (so the scene can stage them like any other event).
 */

/** Sends the hero to a hunt. From the field, the hero leaves the current fight at once. */
export function startHunt(s: GameState, content: ContentDb, huntId: string): GameEvent[] {
  const hunt = content.hunts.get(huntId);
  if (!hunt) throw new IntentError('unknown_hunt');
  if (!s.unlockedHunts.includes(huntId)) throw new IntentError('hunt_locked');
  const sameHunt = s.hunt?.huntId === huntId;
  s.hunt = {
    huntId,
    killsSinceBoss: sameHunt ? s.hunt!.killsSinceBoss : 0,
    consecutiveDeaths: 0,
  };
  const arriveTick = s.tick + Math.max(1, Math.round(hunt.travelSeconds * TICKS_PER_SECOND));
  s.activity = { kind: 'to_hunt', untilTick: arriveTick };
  return [
    { type: 'HuntStarted', tick: s.tick, huntId },
    { type: 'ReturningToHunt', tick: s.tick, arriveTick },
  ];
}

/** Walks back to town and stays there. */
export function returnToTown(s: GameState, content: ContentDb): GameEvent[] {
  const a = s.activity;
  if (a.kind === 'idle_town' || a.kind === 'dead') return [];
  if (a.kind === 'to_town') {
    a.reason = 'manual';
    return [];
  }
  if (a.kind === 'in_town') {
    a.then = 'idle';
    return [];
  }
  const hunt = s.hunt ? content.hunts.get(s.hunt.huntId) : undefined;
  const arriveTick =
    s.tick + Math.max(1, Math.round((hunt?.travelSeconds ?? 0) * TICKS_PER_SECOND));
  s.activity = { kind: 'to_town', untilTick: arriveTick, reason: 'manual' };
  return [{ type: 'TownTripStarted', tick: s.tick, reason: 'manual', arriveTick }];
}

function takeItem(s: GameState, uid: number): { item: ItemInstance; from: 'backpack' | 'stash' } {
  for (const from of ['backpack', 'stash'] as const) {
    const list = s[from];
    const i = list.findIndex((it) => it.uid === uid);
    if (i >= 0) return { item: list.splice(i, 1)[0]!, from };
  }
  throw new IntentError('item_not_found');
}

/** Equips an item from the backpack or stash; the replaced item goes where the new one was. */
export function equipItem(s: GameState, content: ContentDb, uid: number) {
  const { item, from } = takeItem(s, uid);
  const base = content.itemBases.get(item.baseId);
  if (!base) throw new IntentError('unknown_item_base');
  const slot: EquipmentSlot = base.slot;
  const previous = s.hero.equipment[slot];
  s.hero.equipment[slot] = item;
  if (previous) s[from].push(previous);
  clampVitals(s, content);
}

export function unequipItem(s: GameState, content: ContentDb, slot: EquipmentSlot) {
  const item = s.hero.equipment[slot];
  if (!item) throw new IntentError('slot_empty');
  delete s.hero.equipment[slot];
  s.stash.push(item);
  clampVitals(s, content);
}

/** Salvages an item from the backpack or stash into materials. */
export function salvageItem(s: GameState, content: ContentDb, uid: number) {
  const { item } = takeItem(s, uid);
  const { materialId, qty } = rollSalvage(s.rng, content, item.rarity);
  s.materials[materialId] = (s.materials[materialId] ?? 0n) + BigInt(qty);
  return { materialId, qty };
}

function clampVitals(s: GameState, content: ContentDb) {
  const stats = heroStats(s.hero, content);
  s.hero.hp = Math.min(s.hero.hp, stats.maxHp);
  s.hero.mana = Math.min(s.hero.mana, stats.maxMana);
}

/** Loot filter rules. "Always keep affix" rules need the reset shop's Automação. */
export function setLootFilter(s: GameState, content: ContentDb, filter: LootFilter) {
  if (filter.alwaysKeepAffixes.length > 0 && upgradeTotal(s.hero, content, 'automation') <= 0) {
    throw new IntentError('needs_automation');
  }
  for (const id of filter.alwaysKeepAffixes) {
    if (!content.affixes.has(id)) throw new IntentError('unknown_affix');
  }
  s.settings.lootFilter = {
    keepFromRarity: filter.keepFromRarity,
    alwaysKeepAffixes: [...filter.alwaysKeepAffixes],
  };
}

export interface PotionSettings {
  potionThresholdPct: number;
  manaPotionThresholdPct: number;
  potionTarget: number;
  returnWhenOutOfPotions: boolean;
  autoReturnAfterDeath: boolean;
}

export function setPotionSettings(s: GameState, settings: PotionSettings) {
  const pct = (n: number) => Number.isInteger(n) && n >= 0 && n <= 95;
  if (!pct(settings.potionThresholdPct) || !pct(settings.manaPotionThresholdPct)) {
    throw new IntentError('invalid_threshold');
  }
  if (
    !Number.isInteger(settings.potionTarget) ||
    settings.potionTarget < 0 ||
    settings.potionTarget > 500
  ) {
    throw new IntentError('invalid_potion_target');
  }
  Object.assign(s.settings, settings);
}

export function setAutoAllocate(s: GameState, profile: AutoAllocateProfile) {
  s.hero.autoAllocate = profile;
  autoAllocate(s.hero);
}

/**
 * Salvages every item in the backpack and stash up to a rarity (blacksmith's bulk salvage).
 * Equipped items are never touched.
 */
export function salvageUpTo(s: GameState, content: ContentDb, maxRarity: Rarity) {
  const max = rarityRank(maxRarity);
  const gained: Record<string, number> = {};
  let count = 0;
  for (const list of ['backpack', 'stash'] as const) {
    const keep: ItemInstance[] = [];
    for (const item of s[list]) {
      if (rarityRank(item.rarity) > max) {
        keep.push(item);
        continue;
      }
      const { materialId, qty } = rollSalvage(s.rng, content, item.rarity);
      s.materials[materialId] = (s.materials[materialId] ?? 0n) + BigInt(qty);
      gained[materialId] = (gained[materialId] ?? 0) + qty;
      count++;
    }
    s[list] = keep;
  }
  return { count, gained };
}

/** Debug only (development builds): jump to a level, e.g. 100 to test the reset. */
export function debugSetLevel(s: GameState, content: ContentDb, level: number) {
  const target = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  while (s.hero.level < target) addXp(s, content, xpToNext(s.hero.level) - s.hero.xp, s.tick, null);
}

/**
 * One number for "how strong the hero is": damage per second (with crits) times effective
 * life (defence, evasion, leech). Used to pick the best items; not shown to the player.
 */
export function heroPower(st: HeroStats): number {
  const avg = (st.damageMin + st.damageMax) / 2;
  const crit = 1 + (st.critChancePpm / 1_000_000) * Math.max(0, st.critDamagePct / 100 - 1);
  const dps = (avg * crit * TICKS_PER_SECOND) / Math.max(1, st.attackIntervalTicks);
  const ehp =
    st.maxHp * (1 + st.defense / 200) * (1 + st.evasion / 1000) * (1 + st.lifeLeechPct / 100);
  return dps * ehp;
}

/**
 * Equips, slot by slot, the backpack or stash item that raises the hero's power the most
 * (items whose requirements the hero does not meet are skipped). Returns the uids equipped.
 */
export function equipBest(s: GameState, content: ContentDb): number[] {
  const equipped: number[] = [];
  for (const slot of EQUIPMENT_SLOTS) {
    let best: ItemInstance | null = null;
    let bestPower = heroPower(computeHeroStats(s.hero, content));
    for (const item of [...s.backpack, ...s.stash]) {
      if (content.itemBases.get(item.baseId)?.slot !== slot) continue;
      if (inactiveReason(s.hero, item, content)) continue;
      const trial = { ...s.hero, equipment: { ...s.hero.equipment, [slot]: item } };
      const power = heroPower(computeHeroStats(trial, content));
      if (power > bestPower * 1.000001) {
        best = item;
        bestPower = power;
      }
    }
    if (best) {
      equipItem(s, content, best.uid);
      equipped.push(best.uid);
    }
  }
  return equipped;
}

/** Hunt behaviour from the action bar: target priority and auto-sell in town. */
export function setHuntBehaviour(
  s: GameState,
  behaviour: { targetPriority: TargetPriority; autoSellUpTo: Rarity | null },
) {
  if (!['first', 'weakest', 'strongest'].includes(behaviour.targetPriority)) {
    throw new IntentError('invalid_target');
  }
  s.settings.targetPriority = behaviour.targetPriority;
  s.settings.autoSellUpTo = behaviour.autoSellUpTo;
}
