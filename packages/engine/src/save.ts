import { PROFESSION_MAX_LEVEL } from './professions.ts';
import { EQUIPMENT_SLOTS, RARITIES, type ContentDb } from '@abismo/content';
import { z } from 'zod';
import type { GameState, ItemInstance } from './types.ts';

/**
 * Save format. A save is a JSON text: `{ version, savedAt, state }`, where `savedAt` is the
 * wall-clock time (ms) of the save — used only to compute the time away — and `state` is
 * the GameState with every bigint written as `{ "$bigint": "<digits>" }`. Loading migrates
 * older versions step by step and validates the result with Zod and against the content.
 */
export const SAVE_VERSION = 20;

export interface SaveFile {
  version: number;
  savedAt: number;
  state: GameState;
}

export class SaveError extends Error {
  constructor(
    readonly code: 'not_json' | 'not_a_save' | 'newer_version' | 'invalid' | 'unknown_content',
    readonly problems: readonly string[] = [],
  ) {
    super(problems.length > 0 ? `${code}: ${problems.join('; ')}` : code);
  }
}

const int = z.number().int();
const nonNeg = int.min(0);
const id = z.string().min(1);
const rarity = z.enum(RARITIES);

const item: z.ZodType<ItemInstance> = z.strictObject({
  uid: nonNeg,
  baseId: id,
  ilvl: int.min(1),
  rarity,
  affixes: z.array(z.strictObject({ affixId: id, tier: nonNeg, value: int })),
  refine: int.min(0).max(15),
  uniqueId: id.optional(),
  setId: id.optional(),
});

const monster = z.strictObject({
  uid: nonNeg,
  monsterId: id,
  elite: z.boolean(),
  boss: z.boolean(),
  hp: int,
  maxHp: int.min(1),
  damageMin: nonNeg,
  damageMax: nonNeg,
  attackIntervalTicks: int.min(1),
  nextAttackTick: nonNeg,
  affixes: z.array(id),
});

const pctThreshold = int.min(1).max(99);
const ruleCondition = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.enum(['hero_hp', 'hero_mana', 'target_hp']),
    op: z.enum(['below', 'above']),
    pct: pctThreshold,
  }),
  z.strictObject({
    kind: z.literal('enemies'),
    op: z.enum(['at_least', 'at_most']),
    count: int.min(1).max(8),
  }),
  z.strictObject({ kind: z.literal('target'), is: z.enum(['boss', 'elite', 'normal']) }),
]);
export const skillRuleSchema = z.strictObject({
  logic: z.enum(['all', 'any']),
  conditions: z.array(ruleCondition).max(3),
});

const townReason = z.enum(['backpack_full', 'no_potions', 'death', 'manual']);

const attributes = z.strictObject({
  strength: nonNeg,
  dexterity: nonNeg,
  vitality: nonNeg,
  energy: nonNeg,
});

const quest = z.strictObject({
  kind: z.enum([
    'kill_monsters',
    'kill_elites',
    'loot_magic',
    'loot_rare',
    'defeat_bosses',
    'refine',
    'earn_gold',
  ]),
  target: int.min(1),
  progress: nonNeg,
  claimed: z.boolean(),
  reward: z.record(z.string(), nonNeg),
});

export const gameStateSchema: z.ZodType<GameState> = z.strictObject({
  version: z.literal(20),
  tick: nonNeg,
  rng: z.tuple([int, int, int, int]),
  nextUid: nonNeg,
  hero: z.strictObject({
    name: z.string().min(1).max(32),
    appearance: z.strictObject({ hair: nonNeg, outfit: nonNeg }),
    classId: id,
    level: int.min(1).max(100),
    xp: nonNeg,
    allocated: attributes,
    unspentAttributePoints: nonNeg,
    autoAllocate: z.enum(['off', 'balanced', 'strength', 'vitality']),
    skillLevels: z.record(z.string(), nonNeg),
    unspentSkillPoints: nonNeg,
    activeSkills: z.array(z.string().nullable()),
    hp: int,
    mana: int,
    equipment: z.partialRecord(z.enum(EQUIPMENT_SLOTS), item),
    respecs: nonNeg,
    freeRespec: z.boolean(),
    resets: z.strictObject({
      count: nonNeg,
      points: nonNeg,
      upgrades: z.record(z.string(), nonNeg),
      newBossesThisCycle: nonNeg,
    }),
    cards: z.record(z.string(), nonNeg),
    collection: z.record(z.string(), rarity),
    pets: z.record(z.string(), int.min(1)),
    activePet: id.nullable(),
    skillOrder: z.array(id),
    lastSkillOrder: z.array(id),
    lastActiveSkills: z.array(id.nullable()),
    meal: z.strictObject({ mealId: id, ticksLeft: nonNeg }).nullable(),
  }),
  backpack: z.array(item),
  stash: z.array(item),
  gold: z.bigint().nonnegative(),
  goldRemainder: int.min(0).max(9_999),
  materials: z.record(z.string(), z.bigint().nonnegative()),
  consumables: z.record(z.string(), nonNeg),
  unlockedHunts: z.array(id),
  defeatedBosses: z.array(id),
  settings: z.strictObject({
    potionThresholdPct: int.min(0).max(100),
    manaPotionThresholdPct: int.min(0).max(100),
    hpPotionId: id,
    manaPotionId: id,
    potionTarget: nonNeg,
    returnWhenOutOfPotions: z.boolean(),
    autoReturnAfterDeath: z.boolean(),
    lootFilter: z.strictObject({ keepFromRarity: rarity, alwaysKeepAffixes: z.array(id) }),
    targetPriority: z.enum(['first', 'weakest', 'strongest']),
    autoSellUpTo: rarity.nullable(),
    mealId: id.nullable(),
    automation: z.strictObject({
      equipBest: z.boolean(),
      bestHunt: z.boolean(),
      autoSkills: z.boolean(),
      autoReset: z.boolean(),
    }),
    skillRules: z.record(z.string(), skillRuleSchema),
  }),
  hunt: z
    .strictObject({
      huntId: id,
      difficulty: z.enum(['easy', 'normal', 'hard']),
      killsSinceBoss: nonNeg,
      consecutiveDeaths: nonNeg,
    })
    .nullable(),
  activity: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('idle_town') }),
    z.strictObject({ kind: z.literal('walking'), untilTick: nonNeg, group: z.array(monster) }),
    z.strictObject({ kind: z.literal('fighting'), group: z.array(monster) }),
    z.strictObject({ kind: z.literal('to_town'), untilTick: nonNeg, reason: townReason }),
    z.strictObject({
      kind: z.literal('in_town'),
      untilTick: nonNeg,
      then: z.enum(['hunt', 'idle']),
    }),
    z.strictObject({ kind: z.literal('to_hunt'), untilTick: nonNeg }),
    z.strictObject({ kind: z.literal('dead'), untilTick: nonNeg }),
  ]),
  combat: z.strictObject({
    nextAttackTick: nonNeg,
    potionReadyTick: nonNeg,
    manaPotionReadyTick: nonNeg,
    skillReadyTick: z.record(z.string(), nonNeg),
    buffUntil: z.record(z.string(), nonNeg),
  }),
  lifetime: z.strictObject({
    kills: z.bigint().nonnegative(),
    deaths: nonNeg,
    xpEarned: z.bigint().nonnegative(),
    goldEarned: z.bigint().nonnegative(),
    itemsByRarity: z.strictObject({
      common: nonNeg,
      magic: nonNeg,
      rare: nonNeg,
      epic: nonNeg,
      legendary: nonNeg,
    }),
    bossKills: nonNeg,
  }),
  flags: z.array(z.string()),
  cardPity: z.record(z.string(), nonNeg),
  dropPity: z.strictObject({ epic: nonNeg, legendary: nonNeg }),
  login: z.strictObject({ lastDay: int, claimed: nonNeg }),
  bestiary: z.record(z.string(), nonNeg),
  achievements: z.strictObject({
    unlocked: z.record(z.string(), nonNeg),
    title: z.string().nullable(),
  }),
  professions: z.strictObject({
    skills: z.record(
      z.string(),
      z.strictObject({ level: int.min(1).max(PROFESSION_MAX_LEVEL), xp: nonNeg }),
    ),
    gathering: z.string().nullable(),
    gatherTicks: nonNeg,
    recipe: z.string().nullable(),
    craftTicks: nonNeg,
  }),
  resources: z.record(z.string(), nonNeg),
  dungeon: z.strictObject({
    active: z.boolean(),
    floor: int.min(1),
    killsOnFloor: nonNeg,
    floorStartTick: nonNeg,
    best: nonNeg,
    bestEver: nonNeg,
  }),
  quests: z.strictObject({
    day: int,
    daily: z.array(quest),
    week: int,
    weekly: quest.nullable(),
  }),
});

/**
 * Migrations from version N to N+1, applied in order on the raw (decoded) JSON before
 * validation. Add one entry per format change and bump SAVE_VERSION; never edit old ones.
 */
export const SAVE_MIGRATIONS: Record<
  number,
  (raw: Record<string, unknown>) => Record<string, unknown>
> = {
  /** v1 → v2: skill tree, buffs, reset progress and one-time flags. */
  1: (raw) => {
    const state = raw.state as Record<string, Record<string, unknown>>;
    const hero = state.hero!;
    const lifetime = state.lifetime as { kills?: bigint };
    return {
      ...raw,
      state: {
        ...state,
        version: 2,
        hero: {
          ...hero,
          respecs: 0,
          freeRespec: false,
          resets: { count: 0, points: 0, upgrades: {}, newBossesThisCycle: 0 },
        },
        combat: { ...state.combat, buffUntil: {} },
        // Heroes past their 5th kill already had their chance at the first magic item.
        flags: (lifetime.kills ?? 0n) >= 5n ? ['first_magic'] : [],
      },
    };
  },
  /** v2 → v3: cards (section 8.4). */
  2: (raw) => {
    const state = raw.state as Record<string, Record<string, unknown>>;
    return {
      ...raw,
      state: { ...state, version: 3, hero: { ...state.hero, cards: {} }, cardPity: {} },
    };
  },
  /** v3 → v4: elite modifiers on monsters (none for monsters already in a fight). */
  3: (raw) => {
    const state = raw.state as Record<string, unknown> & { activity: { group?: object[] } };
    const activity = state.activity.group
      ? { ...state.activity, group: state.activity.group.map((m) => ({ ...m, affixes: [] })) }
      : state.activity;
    return { ...raw, state: { ...state, version: 4, activity } };
  },
  /** v4 → v5: unique legendary effects (optional on items; nothing to convert). */
  4: (raw) => ({ ...raw, state: { ...(raw.state as object), version: 5 } }),
  /** v5 → v6: daily and weekly goals (generated on the next refresh). */
  5: (raw) => ({
    ...raw,
    state: {
      ...(raw.state as object),
      version: 6,
      quests: { day: -1, daily: [], week: -1, weekly: null },
    },
  }),
  /** v6 → v7: target priority and auto-sell in town (off by default). */
  6: (raw) => {
    const state = raw.state as { settings: object };
    return {
      ...raw,
      state: {
        ...state,
        version: 7,
        settings: { ...state.settings, targetPriority: 'first', autoSellUpTo: null },
      },
    };
  },
  /** v7 → v8: equipment pity counters (start empty). */
  7: (raw) => ({
    ...raw,
    state: { ...(raw.state as object), version: 8, dropPity: { epic: 0, legendary: 0 } },
  }),
  /** v8 → v9: login calendar (nothing claimed yet). */
  8: (raw) => ({
    ...raw,
    state: { ...(raw.state as object), version: 9, login: { lastDay: -1, claimed: 0 } },
  }),
  /** v9 → v10: bestiary (kills per monster were not kept before; it starts empty). */
  9: (raw) => ({ ...raw, state: { ...(raw.state as object), version: 10, bestiary: {} } }),
  /** v10 → v11: achievements (unlocked on the next check from what the save already has). */
  10: (raw) => ({
    ...raw,
    state: {
      ...(raw.state as object),
      version: 11,
      achievements: { unlocked: {}, title: null },
    },
  }),
  /** v11 → v12: professions (all at level 1) and gathered resources. */
  11: (raw) => ({
    ...raw,
    state: {
      ...(raw.state as object),
      version: 12,
      professions: { skills: {}, gathering: null, gatherTicks: 0, recipe: null, craftTicks: 0 },
      resources: {},
    },
  }),
  /** v19 → v20: skill rules (none: every skill used when ready) and hunt difficulty (normal). */
  19: (raw) => {
    const state = raw.state as { settings: object; hunt: object | null };
    return {
      ...raw,
      state: {
        ...state,
        version: 20,
        settings: { ...state.settings, skillRules: {} },
        hunt: state.hunt ? { ...state.hunt, difficulty: 'normal' } : null,
      },
    };
  },
  /** v18 → v19: pets (none found). */
  18: (raw) => {
    const state = raw.state as { hero: object };
    return {
      ...raw,
      state: { ...state, version: 19, hero: { ...state.hero, pets: {}, activePet: null } },
    };
  },
  /** v17 → v18: the skill build is remembered; two more automations (off). */
  17: (raw) => {
    const state = raw.state as {
      hero: object;
      settings: { automation: object };
    };
    return {
      ...raw,
      state: {
        ...state,
        version: 18,
        hero: { ...state.hero, skillOrder: [], lastSkillOrder: [], lastActiveSkills: [] },
        settings: {
          ...state.settings,
          automation: { ...state.settings.automation, autoSkills: false, autoReset: false },
        },
      },
    };
  },
  /** v16 → v17: item collection (empty). */
  16: (raw) => {
    const state = raw.state as { hero: object };
    const dungeon = (raw.state as { dungeon: object }).dungeon;
    return {
      ...raw,
      state: {
        ...state,
        version: 17,
        hero: { ...state.hero, collection: {} },
        dungeon: { ...dungeon, floorStartTick: 0 },
      },
    };
  },
  /** v15 → v16: the endless dungeon (never entered). */
  15: (raw) => ({
    ...raw,
    state: {
      ...(raw.state as object),
      version: 16,
      dungeon: { active: false, floor: 1, killsOnFloor: 0, best: 0, bestEver: 0 },
    },
  }),
  /** v14 → v15: automations (off). */
  14: (raw) => {
    const state = raw.state as { settings: object };
    return {
      ...raw,
      state: {
        ...state,
        version: 15,
        settings: { ...state.settings, automation: { equipBest: false, bestHunt: false } },
      },
    };
  },
  /** v13 → v14: gold fractions carried between kills. */
  13: (raw) => ({ ...raw, state: { ...(raw.state as object), version: 14, goldRemainder: 0 } }),
  /** v12 → v13: meals (none eaten, none chosen). */
  12: (raw) => {
    const state = raw.state as { hero: object; settings: object };
    return {
      ...raw,
      state: {
        ...state,
        version: 13,
        hero: { ...state.hero, meal: null },
        settings: { ...state.settings, mealId: null },
      },
    };
  },
};

export function encodeSave(state: GameState, savedAt: number): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt, state };
  return JSON.stringify(file, (_key, value: unknown) =>
    typeof value === 'bigint' ? { $bigint: value.toString() } : value,
  );
}

function reviveBigints(_key: string, value: unknown): unknown {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { $bigint?: unknown }).$bigint === 'string' &&
    /^-?\d+$/.test((value as { $bigint: string }).$bigint)
  ) {
    return BigInt((value as { $bigint: string }).$bigint);
  }
  return value;
}

/** Content ids a state refers to that the current content does not have. */
export function unknownContentRefs(state: GameState, content: ContentDb): string[] {
  const problems: string[] = [];
  const items = [...state.backpack, ...state.stash, ...Object.values(state.hero.equipment)];
  for (const it of items) {
    if (!it) continue;
    if (!content.itemBases.has(it.baseId)) problems.push(`item base ${it.baseId}`);
    for (const a of it.affixes) {
      if (!content.affixes.has(a.affixId)) problems.push(`affix ${a.affixId}`);
    }
    if (it.uniqueId && !content.uniqueItems.has(it.uniqueId))
      problems.push(`unique ${it.uniqueId}`);
  }
  for (const h of state.unlockedHunts) if (!content.hunts.has(h)) problems.push(`hunt ${h}`);
  for (const id of Object.keys(state.hero.cards)) {
    if (!content.cards.has(id)) problems.push(`card ${id}`);
  }
  if (state.hunt && !content.hunts.has(state.hunt.huntId))
    problems.push(`hunt ${state.hunt.huntId}`);
  const a = state.activity;
  if (a.kind === 'walking' || a.kind === 'fighting') {
    for (const m of a.group)
      if (!content.monsters.has(m.monsterId)) problems.push(`monster ${m.monsterId}`);
  }
  return [...new Set(problems)];
}

export interface SaveFormat {
  version: number;
  migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>;
}

/**
 * Parses, migrates and validates a save. Throws SaveError with the reasons.
 * `format` is only overridden by tests that exercise the migration chain.
 */
export function decodeSave(
  text: string,
  content: ContentDb,
  format: SaveFormat = { version: SAVE_VERSION, migrations: SAVE_MIGRATIONS },
): SaveFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text, reviveBigints);
  } catch {
    throw new SaveError('not_json');
  }
  if (raw === null || typeof raw !== 'object' || typeof (raw as SaveFile).version !== 'number') {
    throw new SaveError('not_a_save');
  }
  let file = raw as Record<string, unknown>;
  let version = file.version as number;
  if (version > format.version) throw new SaveError('newer_version');
  while (version < format.version) {
    const migrate = format.migrations[version];
    if (!migrate) throw new SaveError('not_a_save', [`no migration from version ${version}`]);
    file = { ...migrate(file), version: version + 1 };
    version++;
  }
  const savedAt = z.number().finite().nonnegative().safeParse(file.savedAt);
  const state = gameStateSchema.safeParse(file.state);
  if (!savedAt.success || !state.success) {
    const issues = state.success ? [] : state.error.issues;
    throw new SaveError(
      'invalid',
      [
        ...(savedAt.success ? [] : ['savedAt']),
        ...issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      ].slice(0, 10),
    );
  }
  const unknown = unknownContentRefs(state.data, content);
  if (unknown.length > 0) throw new SaveError('unknown_content', unknown);
  return { version, savedAt: savedAt.data, state: state.data };
}
