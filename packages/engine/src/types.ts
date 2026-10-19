import type { EquipmentSlot, Rarity } from '@abismo/content';
import type { Quests } from './quests.ts';
import type { RngState } from './rng.ts';
import type { Professions } from './professions.ts';
import type { Dungeon } from './dungeon.ts';

export type Attribute = 'strength' | 'dexterity' | 'vitality' | 'energy';
export const ATTRIBUTES: readonly Attribute[] = ['strength', 'dexterity', 'vitality', 'energy'];
export type Attributes = Record<Attribute, number>;

export interface RolledAffix {
  affixId: string;
  /** Index into the affix's tiers. */
  tier: number;
  value: number;
}

/** One equipment item. Generated at drop time; never mutated except by refining. */
export interface ItemInstance {
  uid: number;
  baseId: string;
  ilvl: number;
  rarity: Rarity;
  affixes: RolledAffix[];
  /** Refine level, 0..15. */
  refine: number;
  /** Unique legendary effect, if any (content uniqueItems id). */
  uniqueId?: string;
  /** Piece of an item set, if any (content itemSets id). */
  setId?: string;
}

/** Progress across reset cycles (section 8). */
export interface ResetProgress {
  count: number;
  /** Unspent reset points. */
  points: number;
  /** Reset shop upgrade levels by id. */
  upgrades: Record<string, number>;
  /** Bosses defeated for the first time ever during the current cycle (worth reset points). */
  newBossesThisCycle: number;
}

export type AutoAllocateProfile = 'off' | 'balanced' | 'strength' | 'vitality';

export interface Hero {
  name: string;
  appearance: { hair: number; outfit: number };
  classId: string;
  level: number;
  /** XP inside the current level (0 ≤ xp < xpToNext(level)). */
  xp: number;
  /** Points spent on each attribute (the starting 10 are not included). */
  allocated: Attributes;
  unspentAttributePoints: number;
  autoAllocate: AutoAllocateProfile;
  skillLevels: Record<string, number>;
  unspentSkillPoints: number;
  /** Active skills by priority (4 slots; null = empty). */
  activeSkills: (string | null)[];
  hp: number;
  mana: number;
  equipment: Partial<Record<EquipmentSlot, ItemInstance>>;
  /** Paid skill redistributions so far (the price grows with each). */
  respecs: number;
  /** A free redistribution is available (after a reset). */
  freeRespec: boolean;
  resets: ResetProgress;
  /** Card copies by card id (section 8.4). */
  cards: Record<string, number>;
  /** Skills in the order they were learned this cycle (the build), and last cycle's. */
  skillOrder: string[];
  lastSkillOrder: string[];
  /** Active skill slots at the last reset, to put them back in the same order. */
  lastActiveSkills: (string | null)[];
  /** Item collection: best rarity registered for each item base. */
  collection: Record<string, Rarity>;
  /** Meal under way: its bonus lasts `ticksLeft` more ticks of hunting. */
  meal: { mealId: string; ticksLeft: number } | null;
}

export interface LootFilter {
  /** Items below this rarity are salvaged on pickup. */
  keepFromRarity: Rarity;
  /** Items with any of these affixes are always kept, whatever the rarity. */
  alwaysKeepAffixes: string[];
}

export interface Settings {
  potionThresholdPct: number;
  manaPotionThresholdPct: number;
  hpPotionId: string;
  manaPotionId: string;
  /** Automations switched on (they also need to be unlocked). */
  automation: { equipBest: boolean; bestHunt: boolean; autoSkills: boolean; autoReset: boolean };
  /** Meal the hero eats when the last one ends (null: none). */
  mealId: string | null;
  /** Potions bought up to this amount on every town visit (0 = never buy). */
  potionTarget: number;
  returnWhenOutOfPotions: boolean;
  autoReturnAfterDeath: boolean;
  lootFilter: LootFilter;
  /** Which monster of a group the hero hits first. */
  targetPriority: TargetPriority;
  /** On every town visit, backpack items up to this rarity are sold (null = never). */
  autoSellUpTo: Rarity | null;
}

export type TargetPriority = 'first' | 'weakest' | 'strongest';

export interface MonsterInstance {
  uid: number;
  monsterId: string;
  elite: boolean;
  boss: boolean;
  hp: number;
  maxHp: number;
  damageMin: number;
  damageMax: number;
  attackIntervalTicks: number;
  nextAttackTick: number;
  /** Elite modifiers (monster affix ids). */
  affixes: string[];
}

/** What the hero is doing. Each phase ends at a known tick or when the fight resolves. */
export type Activity =
  | { kind: 'idle_town' }
  | { kind: 'walking'; untilTick: number; group: MonsterInstance[] }
  | { kind: 'fighting'; group: MonsterInstance[] }
  | { kind: 'to_town'; untilTick: number; reason: TownReason }
  | { kind: 'in_town'; untilTick: number; then: 'hunt' | 'idle' }
  | { kind: 'to_hunt'; untilTick: number }
  | { kind: 'dead'; untilTick: number };

export type TownReason = 'backpack_full' | 'no_potions' | 'death' | 'manual' | 'dungeon';

export interface HuntProgress {
  huntId: string;
  killsSinceBoss: number;
  consecutiveDeaths: number;
}

export interface Combat {
  nextAttackTick: number;
  potionReadyTick: number;
  manaPotionReadyTick: number;
  skillReadyTick: Record<string, number>;
  /** Buff skills active until these ticks. */
  buffUntil: Record<string, number>;
}

export interface Lifetime {
  kills: bigint;
  deaths: number;
  xpEarned: bigint;
  goldEarned: bigint;
  itemsByRarity: Record<Rarity, number>;
  bossKills: number;
}

export interface DropPity {
  epic: number;
  legendary: number;
}

/**
 * The whole game state of one hero. Plain data plus `bigint` for the unbounded counters
 * (gold, materials, lifetime totals); the save layer encodes bigints as strings.
 */
export interface GameState {
  version: 18;
  /** Simulation ticks since the hero was created. */
  tick: number;
  rng: RngState;
  nextUid: number;
  hero: Hero;
  backpack: ItemInstance[];
  stash: ItemInstance[];
  gold: bigint;
  /** Fraction of a gold coin carried between kills, in 1/10,000ths. */
  goldRemainder: number;
  materials: Record<string, bigint>;
  consumables: Record<string, number>;
  unlockedHunts: string[];
  defeatedBosses: string[];
  settings: Settings;
  /** Hunt the hero is assigned to (kept while in town). */
  hunt: HuntProgress | null;
  activity: Activity;
  combat: Combat;
  lifetime: Lifetime;
  /** One-time events already done (e.g. the guaranteed first magic item). */
  flags: string[];
  /** Kills of each card's monster since its last copy (pity rule). */
  cardPity: Record<string, number>;
  /** Equipment drops since the last epic-or-better and the last legendary (pity rule). */
  dropPity: DropPity;
  /** Login calendar: last local day claimed and how many days were claimed in total. */
  login: { lastDay: number; claimed: number };
  /** Kills of each monster, kept across resets (bestiary). */
  bestiary: Record<string, number>;
  /** Achievements unlocked (id → tick) and the title shown next to the hero's name. */
  achievements: { unlocked: Record<string, number>; title: string | null };
  /** Profession levels and what they are doing (kept across resets). */
  professions: Professions;
  /** Gathered resources (ores, herbs). */
  resources: Record<string, number>;
  /** The endless dungeon: the run under way and the deepest floors. */
  dungeon: Dungeon;
  /** Daily and weekly goals. */
  quests: Quests;
}

// --- Events ---------------------------------------------------------------------------------

export interface SpawnedMonster {
  uid: number;
  monsterId: string;
  elite: boolean;
  boss: boolean;
  maxHp: number;
  affixes: string[];
}

export interface HitResult {
  uid: number;
  damage: number;
  crit: boolean;
  miss: boolean;
}

export type GameEvent =
  | { type: 'HuntStarted'; tick: number; huntId: string }
  | { type: 'GroupSpawned'; tick: number; engageTick: number; monsters: SpawnedMonster[] }
  | { type: 'GroupEngaged'; tick: number }
  | { type: 'HeroAttack'; tick: number; skillId: string | null; hits: HitResult[]; leech: number }
  | { type: 'MonsterAttack'; tick: number; uid: number; damage: number; miss: boolean }
  | { type: 'PotionUsed'; tick: number; consumableId: string; kind: 'hp' | 'mana'; amount: number }
  | { type: 'MonsterDied'; tick: number; uid: number; monsterId: string; xp: number; gold: number }
  | {
      type: 'ItemDropped';
      tick: number;
      fromUid: number;
      item: ItemInstance;
      kept: boolean;
      /** The rarity came from the pity rule. */
      pity?: true;
    }
  | { type: 'ConsumableDropped'; tick: number; fromUid: number; consumableId: string; qty: number }
  | { type: 'MaterialsGained'; tick: number; materialId: string; qty: number }
  | { type: 'CardDropped'; tick: number; fromUid: number; cardId: string; copies: number }
  | { type: 'LevelUp'; tick: number; level: number }
  | { type: 'HeroDied'; tick: number; xpLost: number }
  | { type: 'TownTripStarted'; tick: number; reason: TownReason; arriveTick: number }
  | {
      type: 'ArrivedInTown';
      tick: number;
      deposited: number;
      potionsBought: number;
      leaveTick: number | null;
    }
  | { type: 'ReturningToHunt'; tick: number; arriveTick: number }
  | { type: 'BossDefeated'; tick: number; monsterId: string; firstTime: boolean }
  | { type: 'HuntUnlocked'; tick: number; huntId: string }
  | { type: 'ProfessionLevelUp'; tick: number; professionId: string; level: number }
  | { type: 'ItemCrafted'; tick: number; recipeId: string }
  | { type: 'AutoEquipped'; tick: number; uids: number[] }
  | { type: 'AutoReset'; tick: number; resets: number; points: number }
  | { type: 'DungeonEntered'; tick: number; floor: number }
  | { type: 'DungeonFloorCleared'; tick: number; floor: number; item: ItemInstance | null }
  | {
      type: 'DungeonEnded';
      tick: number;
      floor: number;
      best: number;
      reason: 'defeat' | 'time' | 'left';
    }
  | { type: 'HuntStopped'; tick: number; reason: 'manual' | 'too_many_deaths' | 'no_potions' };

export type GameEventType = GameEvent['type'];
