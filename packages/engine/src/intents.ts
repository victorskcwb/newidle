import type { ContentDb, EquipmentSlot } from '@abismo/content';
import { TICKS_PER_SECOND } from './constants.ts';
import { rollSalvage } from './items.ts';
import { IntentError } from './progression.ts';
import { heroStats } from './stats.ts';
import type { GameEvent, GameState, ItemInstance } from './types.ts';

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
