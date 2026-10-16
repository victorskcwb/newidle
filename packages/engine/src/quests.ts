import type { Rarity } from '@abismo/content';
import { pickWeighted, rarityRank } from './items.ts';
import { IntentError } from './progression.ts';
import { createRng, rngInt } from './rng.ts';
import type { GameState } from './types.ts';

/**
 * Daily and weekly goals (milestone 2). The engine has no clock: the client passes the local
 * day number, and the goals of a day are generated from it alone (same day → same goals).
 * Rewards are materials and protection charms, never power for sale.
 */
export type QuestKind =
  | 'kill_monsters'
  | 'kill_elites'
  | 'loot_magic'
  | 'loot_rare'
  | 'defeat_bosses'
  | 'refine'
  | 'earn_gold';

export interface Quest {
  kind: QuestKind;
  target: number;
  progress: number;
  claimed: boolean;
  reward: Record<string, number>;
}

export interface Quests {
  /** Local day number the daily goals belong to. */
  day: number;
  daily: Quest[];
  /** Week number (days since epoch + 3, ÷ 7: weeks start on Monday). */
  week: number;
  weekly: Quest | null;
}

export const DAILY_QUESTS = 3;

interface Template {
  kind: QuestKind;
  weight: number;
  target: (level: number, rng: ReturnType<typeof createRng>) => number;
  reward: Record<string, number>;
}

const DAILY: Template[] = [
  {
    kind: 'kill_monsters',
    weight: 3,
    target: (_, r) => 50 * rngInt(r, 4, 8),
    reward: { fragment: 15, essence: 5 },
  },
  {
    kind: 'kill_elites',
    weight: 2,
    target: (_, r) => rngInt(r, 8, 15),
    reward: { essence: 8, crystal: 1 },
  },
  {
    kind: 'loot_magic',
    weight: 2,
    target: (_, r) => rngInt(r, 10, 20),
    reward: { fragment: 20, essence: 4 },
  },
  {
    kind: 'loot_rare',
    weight: 1,
    target: (_, r) => rngInt(r, 2, 4),
    reward: { essence: 6, crystal: 2 },
  },
  { kind: 'defeat_bosses', weight: 1, target: () => 1, reward: { crystal: 3 } },
  {
    kind: 'refine',
    weight: 1,
    target: (_, r) => rngInt(r, 2, 5),
    reward: { fragment: 10, essence: 6 },
  },
  {
    kind: 'earn_gold',
    weight: 2,
    target: (level) => 500 * Math.max(1, level),
    reward: { fragment: 12, essence: 4 },
  },
];

const WEEKLY: Template[] = [
  {
    kind: 'kill_monsters',
    weight: 2,
    target: () => 5_000,
    reward: { crystal: 10, core: 2, refine_charm: 1 },
  },
  {
    kind: 'kill_elites',
    weight: 1,
    target: () => 120,
    reward: { crystal: 10, core: 2, refine_charm: 1 },
  },
  {
    kind: 'defeat_bosses',
    weight: 1,
    target: () => 6,
    reward: { crystal: 12, core: 2, refine_charm: 1 },
  },
];

export function weekOf(day: number): number {
  return Math.floor((day + 3) / 7);
}

function make(t: Template, level: number, rng: ReturnType<typeof createRng>): Quest {
  return {
    kind: t.kind,
    target: t.target(level, rng),
    progress: 0,
    claimed: false,
    reward: { ...t.reward },
  };
}

/**
 * New goals when the day (or week) changed. Goals of an earlier day are dropped unclaimed.
 * Uses its own RNG seeded by the day, so the game's RNG sequence is not touched.
 */
export function refreshQuests(s: GameState, day: number) {
  const level = s.hero.level;
  if (s.quests.day !== day) {
    const rng = createRng([day, 0x51ed270b, 0x2545f491, 0x9e3779b9]);
    const pool = [...DAILY];
    const daily: Quest[] = [];
    while (daily.length < DAILY_QUESTS && pool.length > 0) {
      const t = pickWeighted(rng, pool, (x) => x.weight);
      pool.splice(pool.indexOf(t), 1);
      daily.push(make(t, level, rng));
    }
    s.quests.day = day;
    s.quests.daily = daily;
  }
  const week = weekOf(day);
  if (s.quests.week !== week || !s.quests.weekly) {
    const rng = createRng([week, 0x68e31da4, 0xb5297a4d, 0x1b56c4e9]);
    s.quests.week = week;
    s.quests.weekly = make(
      pickWeighted(rng, WEEKLY, (x) => x.weight),
      level,
      rng,
    );
  }
}

/** Adds progress to every open goal of a kind. */
export function questProgress(s: GameState, kind: QuestKind, amount: number) {
  if (amount <= 0) return;
  for (const q of [...s.quests.daily, s.quests.weekly]) {
    if (q && q.kind === kind && !q.claimed) q.progress = Math.min(q.target, q.progress + amount);
  }
}

/** Progress for one looted item of a rarity. */
export function questLoot(s: GameState, rarity: Rarity, count = 1) {
  if (rarityRank(rarity) >= rarityRank('magic')) questProgress(s, 'loot_magic', count);
  if (rarityRank(rarity) >= rarityRank('rare')) questProgress(s, 'loot_rare', count);
}

/** Claims a finished goal: 'weekly' or the index of a daily goal. */
export function claimQuest(s: GameState, which: number | 'weekly'): Record<string, number> {
  const q = which === 'weekly' ? s.quests.weekly : s.quests.daily[which];
  if (!q) throw new IntentError('unknown_quest');
  if (q.claimed) throw new IntentError('quest_claimed');
  if (q.progress < q.target) throw new IntentError('quest_not_done');
  q.claimed = true;
  for (const [id, qty] of Object.entries(q.reward)) {
    if (id === 'refine_charm') s.consumables[id] = (s.consumables[id] ?? 0) + qty;
    else s.materials[id] = (s.materials[id] ?? 0n) + BigInt(qty);
  }
  return q.reward;
}

/** Finished goals waiting to be claimed (for the menu badge). */
export function claimableQuests(s: GameState): number {
  return [...s.quests.daily, s.quests.weekly].filter(
    (q) => q && !q.claimed && q.progress >= q.target,
  ).length;
}
