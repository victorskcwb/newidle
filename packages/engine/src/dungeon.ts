import type { ContentDb, Hunt } from '@abismo/content';
import { MAX_LEVEL, TICKS_PER_SECOND } from './constants.ts';
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
/** Past the last hunt's block, each floor multiplies life and damage by this (compound). */
export const DUNGEON_DEEP_GROWTH_PERMILLE = 1_050;
/** Cores from a boss floor: one per block, up to this many. */
export const DUNGEON_BOSS_CORES_MAX = 2;
/** Bosses defeated (ever) that open the dungeon: the first region's three. */
export const DUNGEON_UNLOCK_BOSSES = 3;
/** Every cleared floor gives crystals; every boss floor gives cores and an item. */
export const DUNGEON_FLOOR_REWARD: Readonly<Record<string, number>> = { crystal: 1 };
export const DUNGEON_BOSS_CORES_PER_BLOCK = 1;
/** The boss floor's item is rare or better; magic find per floor raises the odds of more. */
export const DUNGEON_BOSS_MAGIC_FIND_PER_FLOOR = 10;
/**
 * A floor not cleared in this time ends the run: a hero who can neither win nor lose (healing
 * through a boss they cannot kill) would otherwise stay there forever.
 */
export const DUNGEON_FLOOR_TIME_LIMIT_TICKS = 5 * 60 * TICKS_PER_SECOND;
/** Reset points: one per this many floors of the cycle's best (section 8.1). */
export const DUNGEON_FLOORS_PER_RESET_POINT = 5;

export interface Dungeon {
  active: boolean;
  floor: number;
  killsOnFloor: number;
  /** Tick the current floor started (for its time limit). */
  floorStartTick: number;
  /** Deepest floor cleared in this reset cycle, and ever. */
  best: number;
  bestEver: number;
}

export function newDungeon(): Dungeon {
  return { active: false, floor: 1, killsOnFloor: 0, floorStartTick: 0, best: 0, bestEver: 0 };
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

/**
 * Life and damage of the floor's monsters, in % of their base: +8% a floor inside a block;
 * past the last block, +5% a floor compounded, so the descent has a bottom for every hero.
 */
export function floorScalePct(content: ContentDb, floor: number): number {
  const lastBlockEnd = content.hunts.size * DUNGEON_FLOORS_PER_BLOCK;
  if (floor <= lastBlockEnd) return 100 + DUNGEON_GROWTH_PCT * floorBlock(content, floor).step;
  let pct = 100 + DUNGEON_GROWTH_PCT * (DUNGEON_FLOORS_PER_BLOCK - 1);
  for (let f = lastBlockEnd; f < floor; f++)
    pct = Math.floor((pct * DUNGEON_DEEP_GROWTH_PERMILLE) / 1000);
  return pct;
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
  d.floorStartTick = s.tick;
  s.activity = { kind: 'to_hunt', untilTick: s.tick + 1 };
  return [{ type: 'DungeonEntered', tick: s.tick, floor: d.floor }];
}

/** Ends the run: a defeat, the floor's time running out, or the player leaving. */
export function endDungeonRun(
  s: GameState,
  t: number,
  out: GameEvent[] | null,
  reason: 'defeat' | 'time' | 'left' = 'left',
) {
  const d = s.dungeon;
  if (!d.active) return;
  d.active = false;
  out?.push({ type: 'DungeonEnded', tick: t, floor: d.floor, best: d.best, reason });
}

export function floorTimedOut(s: GameState, t: number): boolean {
  return s.dungeon.active && t - s.dungeon.floorStartTick >= DUNGEON_FLOOR_TIME_LIMIT_TICKS;
}

/** Reset points the dungeon adds to a reset. */
export function dungeonResetPoints(s: GameState): number {
  return Math.floor(s.dungeon.best / DUNGEON_FLOORS_PER_RESET_POINT);
}
