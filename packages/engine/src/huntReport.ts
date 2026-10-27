import type { ContentDb, Rarity } from '@abismo/content';
import { RARITY_ORDER, TICK_MS } from './constants.ts';
import type { GameEvent } from './types.ts';

/**
 * What a hunting session yielded, added up from the game events (the hunt analyzer of the
 * reference games): XP, gold, supplies spent, kills and loot since the hunt started. Not game
 * state: it lives as long as the screen showing it.
 */
export interface HuntReport {
  /** The hunt, or null for a dive in the Abyss. */
  huntId: string | null;
  startTick: number;
  /** Tick of the latest event added. */
  lastTick: number;
  /** Set when the hunt stopped; the report then stays as it was. */
  stoppedTick: number | null;
  kills: number;
  bossKills: number;
  deaths: number;
  xp: number;
  xpLost: number;
  gold: number;
  /** Gold value of the potions drunk, at their shop price. */
  supplies: number;
  potionsUsed: Record<string, number>;
  /** Equipment found, kept or salvaged, by rarity. */
  drops: Record<Rarity, number>;
  cards: number;
}

export function newHuntReport(huntId: string | null, tick: number): HuntReport {
  return {
    huntId,
    startTick: tick,
    lastTick: tick,
    stoppedTick: null,
    kills: 0,
    bossKills: 0,
    deaths: 0,
    xp: 0,
    xpLost: 0,
    gold: 0,
    supplies: 0,
    potionsUsed: {},
    drops: Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>,
    cards: 0,
  };
}

/**
 * Adds a batch of events to a report and returns the report to show next: a new one when a
 * hunt or a dive starts, the same values copied otherwise (so screens see a new object).
 * `report` null starts one at the first hunt event.
 */
export function addToReport(
  report: HuntReport | null,
  events: readonly GameEvent[],
  content: ContentDb,
): HuntReport | null {
  let r = report
    ? { ...report, potionsUsed: { ...report.potionsUsed }, drops: { ...report.drops } }
    : null;
  for (const e of events) {
    if (e.type === 'HuntStarted') {
      r = newHuntReport(e.huntId, e.tick);
      continue;
    }
    if (
      e.type === 'DungeonEntered' &&
      (r === null || r.huntId !== null || r.stoppedTick !== null)
    ) {
      r = newHuntReport(null, e.tick);
      continue;
    }
    if (r === null || r.stoppedTick !== null) continue;
    r.lastTick = Math.max(r.lastTick, e.tick);
    switch (e.type) {
      case 'MonsterDied': {
        r.kills++;
        r.xp += e.xp;
        r.gold += e.gold;
        if (content.monsters.get(e.monsterId)?.boss) r.bossKills++;
        break;
      }
      case 'PotionUsed':
        r.potionsUsed[e.consumableId] = (r.potionsUsed[e.consumableId] ?? 0) + 1;
        r.supplies += content.consumables.get(e.consumableId)?.price ?? 0;
        break;
      case 'ItemDropped':
        r.drops[e.item.rarity]++;
        break;
      case 'CardDropped':
        r.cards++;
        break;
      case 'HeroDied':
        r.deaths++;
        r.xpLost += e.xpLost;
        break;
      case 'TownTripStarted':
        // Going back on purpose ends the session; supply trips are part of it.
        if (e.reason === 'manual') r.stoppedTick = e.tick;
        break;
      case 'HuntStopped':
      case 'DungeonEnded':
        r.stoppedTick = e.tick;
        break;
    }
  }
  return r;
}

/** Per-hour figures of a report; null while it covers less than a minute. */
export function reportRates(r: HuntReport) {
  const ms = ((r.stoppedTick ?? r.lastTick) - r.startTick) * TICK_MS;
  const hours = ms / 3_600_000;
  const profit = r.gold - r.supplies;
  const perHour = (v: number) => (ms < 60_000 ? null : Math.round(v / hours));
  return {
    ms,
    profit,
    xpPerHour: perHour(r.xp - r.xpLost),
    goldPerHour: perHour(r.gold),
    suppliesPerHour: perHour(r.supplies),
    profitPerHour: perHour(profit),
    killsPerHour: perHour(r.kills),
  };
}
