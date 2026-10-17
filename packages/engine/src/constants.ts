import type { Rarity } from '@abismo/content';

/** Simulation tick length. Everything in the engine is measured in ticks. */
export const TICK_MS = 100;
export const TICKS_PER_SECOND = 1000 / TICK_MS;
export const TICKS_PER_HOUR = 3600 * TICKS_PER_SECOND;

export const PPM = 1_000_000;

// --- Levels ---------------------------------------------------------------------------------
export const MAX_LEVEL = 100;
export const ATTRIBUTE_POINTS_PER_LEVEL = 5;
/** One skill point on every even level: 50 per reset cycle. */
export const SKILL_POINT_EVERY_LEVELS = 2;
export const STARTING_ATTRIBUTE = 10;
/** XP from monsters this many levels below the hero is reduced. */
export const XP_GAP_PENALTIES: readonly { gap: number; pct: number }[] = [
  { gap: 20, pct: 10 },
  { gap: 10, pct: 50 },
];

// --- Hero base stats ------------------------------------------------------------------------
export const BASE_LIFE = 50;
export const LIFE_PER_VITALITY = 10;
export const LIFE_PER_LEVEL = 5;
export const BASE_MANA = 10;
export const MANA_PER_ENERGY = 5;
export const BASE_ACCURACY = 40;
export const ACCURACY_PER_LEVEL = 4;
/** Destreza: +0.5% accuracy per point (in tenths of a percent). */
export const ACCURACY_PERMILLE_PER_DEXTERITY = 5;
export const BASE_EVASION = 10;
export const EVASION_PER_LEVEL = 2;
export const BASE_CRIT_CHANCE_PPM = 50_000;
/** Destreza: +0.1% crit chance per point. */
export const CRIT_CHANCE_PPM_PER_DEXTERITY = 1_000;
export const BASE_CRIT_DAMAGE_PCT = 150;
/** Energia: +0.5% skill damage per point (in tenths of a percent). */
export const SKILL_DAMAGE_PERMILLE_PER_ENERGY = 5;
export const UNARMED = { damageMin: 1, damageMax: 3, attacksPerSecond: 1 } as const;
/** Regeneration per second: 1 + maxLife / LIFE_REGEN_DIVISOR. */
export const LIFE_REGEN_DIVISOR = 100;
export const MANA_REGEN_DIVISOR = 20;

// --- Combat ---------------------------------------------------------------------------------
export const HIT_CHANCE_MIN_PPM = 50_000;
export const HIT_CHANCE_MAX_PPM = 950_000;
export const DEFENSE_PER_ATTACKER_LEVEL = 50;
export const DEFENSE_REDUCTION_CAP_PPM = 750_000;
export const ELITE_LIFE_PCT = 200;
export const ELITE_DAMAGE_PCT = 150;
/** Elites give more XP and gold and roll loot with better odds. */
export const ELITE_REWARD_PCT = 200;
export const ELITE_DROP_CHANCE_PCT = 300;
export const ELITE_MAGIC_FIND_BONUS = 100;
/** Elite modifiers rolled per elite (milestone 2). */
export const ELITE_AFFIX_COUNT: readonly [number, number] = [1, 2];
export const POTION_COOLDOWN_TICKS = 5 * TICKS_PER_SECOND;
export const DEFAULT_POTION_THRESHOLD_PCT = 50;
export const DEFAULT_MANA_POTION_THRESHOLD_PCT = 30;

// --- Hunt flow ------------------------------------------------------------------------------
export const BACKPACK_SIZE = 40;
/** Time spent in town depositing and buying before heading back. */
export const TOWN_STAY_TICKS = 5 * TICKS_PER_SECOND;
export const RESPAWN_TICKS = 5 * TICKS_PER_SECOND;
/** Death costs this share of the XP earned inside the current level. */
export const DEATH_XP_LOSS_PCT = 10;
export const MAX_CONSECUTIVE_AUTO_RETURNS = 3;
export const STARTING_POTIONS = 10;
/** The 5th kill of a new hero drops a guaranteed magic item (section 11.4). */
export const FIRST_MAGIC_ITEM_KILL = 5n;
export const DEFAULT_POTION_TARGET = 10;

// --- Items ----------------------------------------------------------------------------------
export const RARITY_ORDER: readonly Rarity[] = ['common', 'magic', 'rare', 'epic', 'legendary'];
/** Base chance of each rarity per equipment drop, in ppm (sums to 1,000,000). */
export const RARITY_BASE_PPM: Readonly<Record<Rarity, number>> = {
  common: 700_000,
  magic: 220_000,
  rare: 70_000,
  epic: 9_000,
  legendary: 1_000,
};
export const AFFIX_COUNT: Readonly<Record<Rarity, readonly [number, number]>> = {
  common: [0, 0],
  magic: [1, 2],
  rare: [3, 4],
  epic: [4, 5],
  legendary: [4, 4],
};
/** Legendaries only drop in hunts of at least this item level (from the Aldeia Afogada on). */
export const LEGENDARY_MIN_HUNT_ILVL = 45;
/** Drop item level = hunt ilvl ± this. */
export const ILVL_SPREAD = 2;
/** Refine: +5% base stats per level. */
export const REFINE_PCT_PER_LEVEL = 5;

// --- Offline --------------------------------------------------------------------------------
export const OFFLINE_CAP_TICKS = 12 * TICKS_PER_HOUR;
/** The offline cap never goes beyond this, whatever the upgrades. */
export const OFFLINE_MAX_TICKS = 24 * TICKS_PER_HOUR;
/** Most items generated with affixes by one offline resolution; the rest are salvaged. */
export const OFFLINE_ITEM_LIMIT = 200;
/** Hunting time simulated to build a rate sheet. */
export const RATE_SAMPLE_TICKS = 8 * TICKS_PER_HOUR;

// --- Skills ---------------------------------------------------------------------------------
export const SKILL_SLOTS = 4;
export const RESET_FOR_FIFTH_SKILL_SLOT = 3;
/** Paid redistribution n costs RESPEC_BASE_COST × n² gold. */
export const RESPEC_BASE_COST = 200;

// --- Refine (section 7.5) -------------------------------------------------------------------
export const MAX_REFINE = 15;
/** Failed attempts for this level and above drop the item one level. */
export const REFINE_LOSES_LEVEL_FROM = 10;
/** Success chance by target level (index = target, 1..15), in ppm. */
export const REFINE_SUCCESS_PPM: readonly number[] = [
  0, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 800_000, 700_000, 600_000,
  500_000, 400_000, 350_000, 300_000, 250_000, 200_000,
];

// --- Reset (section 8) ----------------------------------------------------------------------
export const RESET_BASE_COST = 100_000;
export const RESET_BASE_POINTS = 10;
export const RESET_POINTS_PER_NEW_BOSS = 2;
/** Each reset is worth more than the last: + this × resets already done (decisions #68). */
export const RESET_POINTS_PER_PAST_RESET = 2;
export const RESETS_FOR_SHOP = 1;

// --- Cards (section 8.4) --------------------------------------------------------------------
/** Elite kills roll cards at 4× the base chance (1/2,000 → 1/500). */
export const CARD_ELITE_KILL_PCT = 400;
/** After this many times the expected kills without a copy, the chance doubles. */
export const CARD_PITY_FACTOR = 3;

// --- Reforge (milestone 2) ------------------------------------------------------------------
/** Gold per reforge = this × item level². */
export const REFORGE_GOLD_PER_ILVL_SQUARED = 20;
/** Materials per reforge by rarity (rare and better only). */
export const REFORGE_MATERIALS: Partial<Record<Rarity, Record<string, number>>> = {
  rare: { essence: 5, crystal: 3 },
  epic: { crystal: 5, core: 2 },
  legendary: { core: 3, soul: 1 },
};

// --- Town services ----------------------------------------------------------------------------
/** The merchant pays (5 + ilvl²/4 + 10 per refine) gold times this per rarity. */
export const SELL_RARITY_MULT = {
  common: 1,
  magic: 2,
  rare: 5,
  epic: 12,
  legendary: 30,
} as const;
/** Rarities the smith can forge (legendaries only drop). */
export type CraftRarity = 'magic' | 'rare' | 'epic';
/** Forge recipes: materials plus gold per item level of the forged item. */
export const CRAFT_RECIPES: Record<
  CraftRarity,
  { materials: Record<string, number>; goldPerIlvl: number }
> = {
  magic: { materials: { fragment: 8 }, goldPerIlvl: 20 },
  rare: { materials: { fragment: 10, essence: 6 }, goldPerIlvl: 60 },
  epic: { materials: { essence: 6, crystal: 5 }, goldPerIlvl: 200 },
};
