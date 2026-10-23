import { newDungeon } from './dungeon.ts';
import { newProfessions } from './professions.ts';
import type { ContentDb } from '@abismo/content';
import {
  DEFAULT_MANA_POTION_THRESHOLD_PCT,
  DEFAULT_POTION_TARGET,
  DEFAULT_POTION_THRESHOLD_PCT,
  STARTING_POTIONS,
} from './constants.ts';
import { createRng } from './rng.ts';
import { heroStats } from './stats.ts';
import type { GameState, ItemInstance } from './types.ts';

export interface NewHero {
  name: string;
  appearance?: { hair: number; outfit: number };
  /** Four uint32 words; the client draws them from crypto.getRandomValues at creation. */
  seed: readonly [number, number, number, number];
}

export const STARTER_WEAPON = 'sword_rusty';
export const STARTER_POTION = 'potion_hp_small';
export const STARTER_MANA_POTION = 'potion_mana_small';

/** A new level 1 Guerreiro with the starter sword (the elder's gift) and a few potions. */
export function createGame(content: ContentDb, hero: NewHero): GameState {
  const sword: ItemInstance = {
    uid: 1,
    baseId: STARTER_WEAPON,
    ilvl: 1,
    rarity: 'common',
    affixes: [],
    refine: 0,
  };
  const s: GameState = {
    version: 20,
    tick: 0,
    rng: createRng(hero.seed),
    nextUid: 2,
    hero: {
      name: hero.name,
      appearance: hero.appearance ?? { hair: 0, outfit: 0 },
      classId: 'warrior',
      level: 1,
      xp: 0,
      allocated: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
      unspentAttributePoints: 0,
      autoAllocate: 'balanced',
      skillLevels: {},
      unspentSkillPoints: 0,
      activeSkills: [null, null, null, null],
      hp: 1,
      mana: 0,
      equipment: content.itemBases.has(STARTER_WEAPON) ? { weapon: sword } : {},
      respecs: 0,
      freeRespec: false,
      resets: { count: 0, points: 0, upgrades: {}, newBossesThisCycle: 0 },
      cards: {},
      meal: null,
      collection: {},
      pets: {},
      activePet: null,
      skillOrder: [],
      lastSkillOrder: [],
      lastActiveSkills: [],
    },
    backpack: [],
    stash: [],
    gold: 0n,
    goldRemainder: 0,
    materials: {},
    consumables: { [STARTER_POTION]: STARTING_POTIONS },
    unlockedHunts: [...content.hunts.values()].filter((h) => h.startUnlocked).map((h) => h.id),
    defeatedBosses: [],
    settings: {
      potionThresholdPct: DEFAULT_POTION_THRESHOLD_PCT,
      manaPotionThresholdPct: DEFAULT_MANA_POTION_THRESHOLD_PCT,
      hpPotionId: STARTER_POTION,
      manaPotionId: STARTER_MANA_POTION,
      potionTarget: DEFAULT_POTION_TARGET,
      returnWhenOutOfPotions: true,
      autoReturnAfterDeath: true,
      lootFilter: { keepFromRarity: 'common', alwaysKeepAffixes: [] },
      targetPriority: 'first',
      autoSellUpTo: null,
      mealId: null,
      automation: { equipBest: false, bestHunt: false, autoSkills: false, autoReset: false },
      skillRules: {},
    },
    hunt: null,
    activity: { kind: 'idle_town' },
    combat: {
      nextAttackTick: 0,
      potionReadyTick: 0,
      manaPotionReadyTick: 0,
      skillReadyTick: {},
      buffUntil: {},
    },
    lifetime: {
      kills: 0n,
      deaths: 0,
      xpEarned: 0n,
      goldEarned: 0n,
      itemsByRarity: { common: 0, magic: 0, rare: 0, epic: 0, legendary: 0 },
      bossKills: 0,
    },
    flags: [],
    cardPity: {},
    dropPity: { epic: 0, legendary: 0 },
    login: { lastDay: -1, claimed: 0 },
    bestiary: {},
    achievements: { unlocked: {}, title: null },
    professions: newProfessions(),
    resources: {},
    dungeon: newDungeon(),
    quests: { day: -1, daily: [], week: -1, weekly: null },
  };
  const stats = heroStats(s.hero, content);
  s.hero.hp = stats.maxHp;
  s.hero.mana = stats.maxMana;
  return s;
}

/** Deep copy (structuredClone keeps bigints). */
export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}
