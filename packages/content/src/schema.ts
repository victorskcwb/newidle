import { z } from 'zod';

/** Lowercase snake_case identifier used for every content id. */
const id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are lowercase snake_case');
const key = z.string().regex(/^[a-z][a-zA-Z0-9_.]*$/, 'translation keys are dotted');
const ppm = z.number().int().min(0).max(1_000_000);
const posInt = z.number().int().min(1);
const nonNegInt = z.number().int().min(0);
const range = z
  .tuple([nonNegInt, nonNegInt])
  .refine(([min, max]) => min <= max, 'range min must be <= max');

export const EQUIPMENT_SLOTS = [
  'weapon',
  'offhand',
  'helm',
  'chest',
  'gloves',
  'pants',
  'boots',
  'belt',
  'ring',
  'amulet',
] as const;
export const slotSchema = z.enum(EQUIPMENT_SLOTS);
export type EquipmentSlot = z.infer<typeof slotSchema>;

export const RARITIES = ['common', 'magic', 'rare', 'epic', 'legendary'] as const;
export const raritySchema = z.enum(RARITIES);
export type Rarity = z.infer<typeof raritySchema>;

/**
 * Every stat an item, affix or card can modify. The engine knows how to apply each one;
 * adding a stat here means adding its effect in `packages/engine/src/stats.ts`.
 * Percent stats are whole percents (5 = +5%).
 */
export const STATS = [
  'strength',
  'dexterity',
  'vitality',
  'energy',
  'life',
  'lifePct',
  'mana',
  'damageFlat',
  'damagePct',
  'attackSpeedPct',
  'critChancePct',
  'critDamagePct',
  'lifeLeechPct',
  'accuracy',
  'defense',
  'defensePct',
  'evasion',
  'xpPct',
  'goldPct',
  'magicFindPct',
  'damageVsUndeadPct',
] as const;
export const statSchema = z.enum(STATS);
export type Stat = z.infer<typeof statSchema>;

const statBlock = z.partialRecord(statSchema, z.number().int());

const attributeRequirements = z.strictObject({
  level: posInt,
  strength: posInt.optional(),
  dexterity: posInt.optional(),
  vitality: posInt.optional(),
  energy: posInt.optional(),
});

export const itemBaseSchema = z
  .strictObject({
    id,
    nameKey: key,
    slot: slotSchema,
    ilvl: posInt,
    requires: attributeRequirements,
    base: z.strictObject({
      damageMin: posInt.optional(),
      damageMax: posInt.optional(),
      attacksPerSecond: z.number().positive().max(5).optional(),
      defense: nonNegInt.optional(),
    }),
    /** Fixed stats every copy of this base has (e.g. a ring's small life bonus). */
    implicit: statBlock.optional(),
    icon: z.string().min(1),
    sprite: z.string().min(1).optional(),
  })
  .superRefine((base, ctx) => {
    const { damageMin, damageMax, attacksPerSecond } = base.base;
    const isWeapon = base.slot === 'weapon';
    const hasDamage = damageMin !== undefined && damageMax !== undefined;
    if (isWeapon && (!hasDamage || attacksPerSecond === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'weapons need damageMin, damageMax and attacksPerSecond',
      });
    }
    if (hasDamage && damageMin > damageMax) {
      ctx.addIssue({ code: 'custom', message: 'damageMin must be <= damageMax' });
    }
  });
export type ItemBase = z.infer<typeof itemBaseSchema>;

export const affixSchema = z
  .strictObject({
    id,
    textKey: key,
    stat: statSchema,
    slots: z.array(slotSchema).min(1),
    minIlvl: posInt,
    weight: posInt,
    tiers: z.array(z.strictObject({ minIlvl: posInt, min: posInt, max: posInt })).min(1),
  })
  .superRefine((affix, ctx) => {
    let prev = 0;
    for (const tier of affix.tiers) {
      if (tier.min > tier.max) ctx.addIssue({ code: 'custom', message: 'tier min must be <= max' });
      if (tier.minIlvl <= prev && prev !== 0) {
        ctx.addIssue({ code: 'custom', message: 'tiers must be sorted by increasing minIlvl' });
      }
      prev = tier.minIlvl;
    }
    if (affix.tiers[0] && affix.tiers[0].minIlvl !== affix.minIlvl) {
      ctx.addIssue({ code: 'custom', message: 'first tier minIlvl must equal the affix minIlvl' });
    }
  });
export type Affix = z.infer<typeof affixSchema>;

export const monsterSchema = z.strictObject({
  id,
  nameKey: key,
  level: posInt,
  hp: posInt,
  damageMin: posInt,
  damageMax: posInt,
  attacksPerSecond: z.number().positive().max(5),
  accuracy: posInt,
  defense: nonNegInt,
  evasion: nonNegInt,
  xp: nonNegInt,
  gold: range,
  tags: z.array(id),
  boss: z.boolean().optional(),
  cardId: id.optional(),
  lootTableId: id,
  sprite: z.strictObject({
    atlas: z.string().min(1),
    key: z.string().min(1),
    spawnAnim: z.string().min(1).optional(),
    /** Placeholder colour (#rrggbb) used until the final atlas exists. */
    tint: z.string().regex(/^#[0-9a-f]{6}$/),
    /** Placeholder size in tiles (bosses are bigger). */
    scale: z.number().positive().max(4).optional(),
  }),
});
export type Monster = z.infer<typeof monsterSchema>;

export const lootTableSchema = z.strictObject({
  id,
  equipmentDropChancePpm: ppm,
  /** Equipment rolls per kill (bosses roll more than once). */
  rolls: posInt.optional(),
  /** Rarities below this are bumped up to it (boss loot). */
  minRarity: raritySchema.optional(),
  bases: z.array(z.strictObject({ itemBaseId: id, weight: posInt })).min(1),
  extras: z.array(z.strictObject({ itemId: id, chancePpm: ppm, qty: range })),
});
export type LootTable = z.infer<typeof lootTableSchema>;

export const consumableSchema = z
  .strictObject({
    id,
    nameKey: key,
    /** hp/mana potions are drunk automatically; refine_protection is spent by the blacksmith. */
    kind: z.enum(['hp', 'mana', 'refine_protection', 'refine_tempering', 'meal']),
    /** Flat amount restored. */
    restore: nonNegInt,
    /** Extra percent of the maximum restored, so potions stay useful at every level. */
    restorePct: z.number().int().min(0).max(100).optional(),
    /** Price at the potion seller; absent = not sold. */
    price: posInt.optional(),
    /** Meals: the bonus while fed and how long one meal lasts (hunting time). */
    buff: z.strictObject({ stat: statSchema, value: posInt }).optional(),
    durationSeconds: posInt.optional(),
    icon: z.string().min(1),
  })
  .refine(
    (c) => (c.kind !== 'hp' && c.kind !== 'mana') || c.restore > 0 || (c.restorePct ?? 0) > 0,
    'potions must restore something',
  )
  .refine(
    (c) => c.kind !== 'meal' || (!!c.buff && !!c.durationSeconds),
    'meals need a buff and a duration',
  );
export type Consumable = z.infer<typeof consumableSchema>;

export const materialSchema = z.strictObject({
  id,
  nameKey: key,
  /** Salvaging an item of this rarity yields this material. */
  fromRarity: raritySchema,
  salvageQty: range,
  icon: z.string().min(1),
});
export type Material = z.infer<typeof materialSchema>;

const skillCommon = {
  id,
  nameKey: key,
  descKey: key,
  classId: id,
  maxLevel: posInt.max(10),
  /** Skills that must reach a level before this one can be learned. */
  requires: z.array(z.strictObject({ skillId: id, level: posInt })),
  /** Place in the tree (rows top to bottom, columns left to right). */
  position: z.strictObject({ row: nonNegInt, col: nonNegInt }),
};

export const skillSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...skillCommon,
    kind: z.literal('active'),
    manaCost: nonNegInt,
    manaCostPerLevel: nonNegInt,
    cooldownSeconds: z.number().min(0).max(120),
    /** Damage of the skill hit as a percent of a normal hit (0 = no hit, e.g. a buff). */
    damagePct: nonNegInt,
    damagePctPerLevel: nonNegInt,
    /** 1 = single target; more = area hitting up to N monsters of the group. */
    maxTargets: posInt.max(8),
    /** Self buff while it lasts: +value% (plus perLevel per extra level) of a stat. */
    buff: z
      .strictObject({
        stat: z.literal('damagePct'),
        value: posInt,
        perLevel: nonNegInt,
        durationSeconds: z.number().positive().max(120),
      })
      .optional(),
    /** Seconds the first target cannot attack after being hit. */
    stunSeconds: z.number().positive().max(10).optional(),
    effect: z.string().min(1),
  }),
  z.strictObject({
    ...skillCommon,
    kind: z.literal('passive'),
    stat: statSchema,
    perLevel: posInt,
  }),
]);
export type Skill = z.infer<typeof skillSchema>;

/** Elite modifiers (milestone 2): each elite rolls one or two. Percent values (50 = +50%). */
export const monsterAffixSchema = z.strictObject({
  id,
  nameKey: key,
  weight: posInt,
  lifePct: nonNegInt.optional(),
  damagePct: nonNegInt.optional(),
  attackSpeedPct: nonNegInt.optional(),
  defensePct: nonNegInt.optional(),
  /** Share of the damage dealt to the hero that heals the monster. */
  leechPct: nonNegInt.optional(),
  /** Name colour on the map (#rrggbb). */
  color: z.string().regex(/^#[0-9a-f]{6}$/),
});
export type MonsterAffix = z.infer<typeof monsterAffixSchema>;

/**
 * Unique legendary effects (section 7.3): a legendary of a slot rolls one of these on top of
 * its 4 affixes. Each kind is implemented in the engine; content only sets its numbers.
 */
export const uniqueEffectSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('skill_bonus'),
    skillId: id,
    damagePct: nonNegInt,
    extraTargets: nonNegInt,
  }),
  z.strictObject({ kind: z.literal('execute'), thresholdPct: posInt.max(99), damagePct: posInt }),
  z.strictObject({ kind: z.literal('thorns'), pct: posInt.max(200) }),
  z.strictObject({ kind: z.literal('crit_heal'), pctOfMaxHp: posInt.max(50) }),
  z.strictObject({ kind: z.literal('first_strike'), damagePct: posInt }),
  z.strictObject({
    kind: z.literal('last_stand'),
    thresholdPct: posInt.max(99),
    damagePct: posInt,
  }),
  z.strictObject({ kind: z.literal('card_luck'), pct: posInt }),
  z.strictObject({ kind: z.literal('calm_regen'), multiplier: posInt.max(10) }),
]);
export type UniqueEffect = z.infer<typeof uniqueEffectSchema>;

export const uniqueItemSchema = z.strictObject({
  id,
  nameKey: key,
  descKey: key,
  slot: slotSchema,
  minIlvl: posInt,
  weight: posInt,
  effect: uniqueEffectSchema,
});
export type UniqueItem = z.infer<typeof uniqueItemSchema>;

export const cardSchema = z.strictObject({
  id,
  nameKey: key,
  chancePpm: ppm,
  maxCopies: posInt,
  bonusPerCopy: z.strictObject({ stat: statSchema, value: z.number().int() }),
});
export type Card = z.infer<typeof cardSchema>;

export const regionSchema = z.strictObject({
  id,
  nameKey: key,
  levelRange: range,
  order: nonNegInt,
  /** Bonus for owning at least one copy of every card of the region's monsters. */
  cardSetBonus: z.strictObject({ stat: statSchema, value: z.number().int() }).optional(),
});
export type Region = z.infer<typeof regionSchema>;

export const huntSchema = z
  .strictObject({
    id,
    nameKey: key,
    regionId: id,
    /** Map file under assets/, without extension (e.g. "maps/forgotten_cemetery"). */
    mapId: z.string().regex(/^maps\/[a-z0-9_]+$/),
    routeLayer: z.string().min(1),
    recommendedLevel: posInt,
    levelRange: range,
    /** Base item level of drops; each drop is this ± 2. */
    ilvl: posInt,
    spawns: z.array(z.strictObject({ monsterId: id, weight: posInt })).min(1),
    groupSize: z.strictObject({ min: posInt.max(4), max: posInt.max(4) }),
    walkSecondsBetweenGroups: z.number().positive().max(60),
    /** One-way trip between the hunt and town, in seconds. */
    travelSeconds: z.number().positive().max(300),
    /** Best resource tier gathered here (professions); 1 when absent. */
    gatherTier: posInt.max(5).optional(),
    eliteChancePpm: ppm,
    boss: z.strictObject({ monsterId: id, everyKills: posInt }).optional(),
    unlocks: id.optional(),
    /** True for the hunt every new hero starts with. */
    startUnlocked: z.boolean().optional(),
  })
  .refine((h) => h.groupSize.min <= h.groupSize.max, 'groupSize.min must be <= max');
export type Hunt = z.infer<typeof huntSchema>;

/** Every content file, merged. Each file in data/ contributes one or more of these arrays. */
/** Permanent upgrades bought with reset points (section 8.2). */
export const RESET_EFFECTS = [
  'xpPct',
  'startingAttributes',
  'startingSkillPoints',
  'goldPct',
  'magicFindPct',
  'backpackSlots',
  'offlineHours',
  'automation',
] as const;
export const resetUpgradeSchema = z.strictObject({
  id,
  nameKey: key,
  descKey: key,
  maxLevel: posInt,
  /** Cost of level n is baseCost + costPerLevel × (n − 1); costPerLevel defaults to baseCost. */
  baseCost: posInt,
  costPerLevel: nonNegInt.optional(),
  effects: z.array(z.strictObject({ effect: z.enum(RESET_EFFECTS), perLevel: posInt })).min(1),
});
export type ResetUpgrade = z.infer<typeof resetUpgradeSchema>;

/**
 * One day of the login calendar (GDD 6.1). Days are counted, not streaked: the Nth day the
 * player claims gets entry N (mod the calendar length). `big` marks the highlighted days.
 */
export const loginRewardSchema = z.strictObject({
  reward: z.record(id, posInt),
  big: z.boolean().optional(),
});
export type LoginReward = z.infer<typeof loginRewardSchema>;

/**
 * Bestiary tiers (GDD 3.4): kills of one monster (or of one boss) unlock a permanent damage
 * bonus against it. Tiers are in increasing order.
 */
export const bestiaryTierSchema = z.strictObject({
  kills: posInt,
  bossKills: posInt,
  damagePct: posInt,
});
export type BestiaryTier = z.infer<typeof bestiaryTierSchema>;

/** What an achievement counts (GDD 6.4). Descriptions come from the kind. */
export const ACHIEVEMENT_KINDS = [
  'level',
  'resets',
  'kills',
  'boss_kills',
  'deaths',
  'items',
  'cards',
  'card_regions',
  'refine',
  'bestiary',
  'login_days',
  'gold_earned',
  'profession',
  'profession_total',
  'dungeon_floor',
] as const;
export type AchievementKind = (typeof ACHIEVEMENT_KINDS)[number];
export const achievementSchema = z.strictObject({
  id,
  nameKey: key,
  kind: z.enum(ACHIEVEMENT_KINDS),
  target: posInt,
  /** `items`: rarity of the items counted (that rarity or better). */
  rarity: raritySchema.optional(),
  /** `bestiary`: tier the monsters counted must have reached. */
  tier: posInt.optional(),
  points: posInt,
  /** Title the hero can show once unlocked. */
  titleKey: key.optional(),
});
export type Achievement = z.infer<typeof achievementSchema>;

/** Professions (GDD 3.2): gathering runs alongside the hunt, production any time. */
export const professionSchema = z.strictObject({
  id,
  nameKey: key,
  kind: z.enum(['gathering', 'production']),
  icon: z.string().min(1),
});
export type Profession = z.infer<typeof professionSchema>;

/** A gathered resource: tier (matched against the hunt's gatherTier) and level needed. */
export const resourceSchema = z.strictObject({
  id,
  nameKey: key,
  professionId: id,
  tier: posInt.max(5),
  level: posInt.max(99),
  /** Seconds per unit at the required level (1% faster per level above, up to 50%). */
  seconds: posInt,
  xp: posInt,
  icon: z.string().min(1),
});
export type Resource = z.infer<typeof resourceSchema>;

/** A production recipe: resources in, materials or consumables out. */
export const recipeSchema = z.strictObject({
  id,
  professionId: id,
  level: posInt.max(99),
  seconds: posInt,
  xp: posInt,
  inputs: z.record(id, posInt),
  outputs: z.record(id, posInt),
});
export type Recipe = z.infer<typeof recipeSchema>;

export const contentSchema = z.strictObject({
  itemBases: z.array(itemBaseSchema),
  affixes: z.array(affixSchema),
  monsters: z.array(monsterSchema),
  lootTables: z.array(lootTableSchema),
  consumables: z.array(consumableSchema),
  materials: z.array(materialSchema),
  skills: z.array(skillSchema),
  cards: z.array(cardSchema),
  regions: z.array(regionSchema),
  hunts: z.array(huntSchema),
  resetUpgrades: z.array(resetUpgradeSchema),
  monsterAffixes: z.array(monsterAffixSchema),
  uniqueItems: z.array(uniqueItemSchema),
  loginRewards: z.array(loginRewardSchema),
  bestiaryTiers: z.array(bestiaryTierSchema),
  achievements: z.array(achievementSchema),
  professions: z.array(professionSchema),
  resources: z.array(resourceSchema),
  recipes: z.array(recipeSchema),
});
export type ContentFile = z.infer<typeof contentSchema>;
