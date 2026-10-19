import type { ContentDb, Hunt } from '@abismo/content';
import { MAX_LEVEL } from './constants.ts';
import { IntentError } from './progression.ts';
import type { GameEvent, GameState } from './types.ts';

/**
 * The endless dungeon, "the Abyss" (section 6.4). Each block of ten floors echoes one hunt, in
 * order: its monsters, its boss on the tenth floor, its map. Monsters gain 8% life and damage
 * per floor inside the block; past the last hunt the floors keep growing. A run ends at the
 * first defeat; the next one starts from the last tenth floor reached.
 */
export const DUNGEON_FLOORS_PER_BLOCK = 10;
export const DUNGEON_KILLS_PER_FLOOR = 10;
export const DUNGEON_GROWTH_PCT = 8;
/** Bosses defeated (ever) that open the dungeon: the first region's three. */
export const DUNGEON_UNLOCK_BOSSES = 3;
/** Every cleared floor gives crystals; every boss floor gives cores and an item. */
export const DUNGEON_FLOOR_REWARD: Readonly<Record<string, number>> = { crystal: 1 };
export const DUNGEON_BOSS_CORES_PER_BLOCK = 1;
/** Magic find of the boss floor's item, per floor (the legendary chance grows with depth). */
export const DUNGEON_BOSS_MAGIC_FIND_PER_FLOOR = 10;
/** Reset points: one per this many floors of the cycle's best (section 8.1). */
export const DUNGEON_FLOORS_PER_RESET_POINT = 5;

export interface Dungeon {
  active: boolean;
  floor: number;
  killsOnFloor: number;
  /** Deepest floor cleared in this reset cycle, and ever. */
  best: number;
  bestEver: number;
}

export function newDungeon(): Dungeon {
  return { active: false, floor: 1, killsOnFloor: 0, best: 0, bestEver: 0 };
}

export function dungeonUnlocked(s: GameState): boolean {
  return s.defeatedBosses.length >= DUNGEON_UNLOCK_BOSSES;
}

/** First floor of a new run: right after the deepest tenth floor ever cleared. */
export function dungeonStartFloor(s: GameState): number {
  const best = s.dungeon.bestEver;
  return best - (best % DUNGEON_FLOORS_PER_BLOCK) + 1;
}

export function isBossFloor(floor: number): boolean {
  return floor % DUNGEON_FLOORS_PER_BLOCK === 0;
}

/** The hunt a floor echoes, and the floor's position inside its block (0 = first floor). */
export function floorBlock(content: ContentDb, floor: number): { hunt: Hunt; step: number } {
  const hunts = [...content.hunts.values()];
  const index = Math.floor((floor - 1) / DUNGEON_FLOORS_PER_BLOCK);
  const last = hunts.length - 1;
  const hunt = hunts[Math.min(index, last)]!;
  const blockStart = Math.min(index, last) * DUNGEON_FLOORS_PER_BLOCK + 1;
  return { hunt, step: floor - blockStart };
}

/** Life and damage of the floor's monsters, in % of their base. */
export function floorScalePct(content: ContentDb, floor: number): number {
  return 100 + DUNGEON_GROWTH_PCT * floorBlock(content, floor).step;
}

/**
 * The floor seen as a hunt, so the hunt machinery (groups, combat, loot, gathering) runs
 * unchanged: the echoed hunt's monsters and map, item level growing with the floor, no boss
 * counter (the tenth floor is the boss) and no trips to town.
 */
export function floorHunt(content: ContentDb, floor: number): Hunt {
  const { hunt, step } = floorBlock(content, floor);
  return {
    ...hunt,
    id: `abyss_${floor}`,
    ilvl: Math.min(MAX_LEVEL, hunt.ilvl + step),
    boss: undefined,
    unlocks: undefined,
    walkSecondsBetweenGroups: Math.min(hunt.walkSecondsBetweenGroups, 2),
  };
}

/** Starts a run. The hero leaves the current hunt, which they return to when the run ends. */
export function enterDungeon(s: GameState): GameEvent[] {
  if (!dungeonUnlocked(s)) throw new IntentError('dungeon_locked');
  if (!s.hunt) throw new IntentError('dungeon_needs_hunt');
  const d = s.dungeon;
  d.active = true;
  d.floor = dungeonStartFloor(s);
  d.killsOnFloor = 0;
  s.activity = { kind: 'to_hunt', untilTick: s.tick + 1 };
  return [{ type: 'DungeonEntered', tick: s.tick, floor: d.floor }];
}

/** Ends the run (defeat, or the player leaves). The hero goes back to town. */
export function endDungeonRun(s: GameState, t: number, out: GameEvent[] | null) {
  const d = s.dungeon;
  if (!d.active) return;
  d.active = false;
  out?.push({ type: 'DungeonEnded', tick: t, floor: d.floor, best: d.best });
}

/** Reset points the dungeon adds to a reset. */
export function dungeonResetPoints(s: GameState): number {
  return Math.floor(s.dungeon.best / DUNGEON_FLOORS_PER_RESET_POINT);
}
