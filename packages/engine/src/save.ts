import { EQUIPMENT_SLOTS, RARITIES, type ContentDb } from '@abismo/content';
import { z } from 'zod';
import type { GameState, ItemInstance } from './types.ts';

/**
 * Save format. A save is a JSON text: `{ version, savedAt, state }`, where `savedAt` is the
 * wall-clock time (ms) of the save — used only to compute the time away — and `state` is
 * the GameState with every bigint written as `{ "$bigint": "<digits>" }`. Loading migrates
 * older versions step by step and validates the result with Zod and against the content.
 */
export const SAVE_VERSION = 3;

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
});

const townReason = z.enum(['backpack_full', 'no_potions', 'death', 'manual']);

const attributes = z.strictObject({
  strength: nonNeg,
  dexterity: nonNeg,
  vitality: nonNeg,
  energy: nonNeg,
});

export const gameStateSchema: z.ZodType<GameState> = z.strictObject({
  version: z.literal(3),
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
  }),
  backpack: z.array(item),
  stash: z.array(item),
  gold: z.bigint().nonnegative(),
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
  }),
  hunt: z
    .strictObject({ huntId: id, killsSinceBoss: nonNeg, consecutiveDeaths: nonNeg })
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
