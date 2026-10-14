import { z } from 'zod';

export const SKILL_IDS = [
  'attack',
  'strength',
  'defence',
  'vitality',
  'archery',
  'arcana',
  'devotion',
  'mining',
  'woodcutting',
  'fishing',
  'farming',
  'hunting',
  'smithing',
  'cooking',
  'alchemy',
  'crafting',
  'fletching',
  'glyphcraft',
  'thieving',
  'agility',
  'summoning',
] as const;

export const SKILL_GROUPS = {
  attack: 'combat',
  strength: 'combat',
  defence: 'combat',
  vitality: 'combat',
  archery: 'combat',
  arcana: 'combat',
  devotion: 'combat',
  mining: 'gathering',
  woodcutting: 'gathering',
  fishing: 'gathering',
  farming: 'gathering',
  hunting: 'gathering',
  smithing: 'production',
  cooking: 'production',
  alchemy: 'production',
  crafting: 'production',
  fletching: 'production',
  glyphcraft: 'production',
  thieving: 'support',
  agility: 'support',
  summoning: 'support',
} as const satisfies Record<(typeof SKILL_IDS)[number], string>;

export const skillIdSchema = z.enum(SKILL_IDS);
export type SkillId = z.infer<typeof skillIdSchema>;

const id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are lower_snake_case');
const key = z.string().regex(/^[a-z][a-zA-Z0-9_.]*$/);
const ppm = z.number().int().min(0).max(1_000_000);
const posInt = z.number().int().positive();
const nonNegInt = z.number().int().nonnegative();

export const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export const combatStyles = ['melee', 'archery', 'arcana'] as const;
export const toolTypes = ['pickaxe', 'hammer', 'axe', 'rod'] as const;
export const equipSlots = [
  'head',
  'cape',
  'neck',
  'ammo',
  'weapon',
  'body',
  'shield',
  'legs',
  'hands',
  'feet',
  'ring',
  'tool',
] as const;
export const gatherAnims = ['mine', 'chop', 'fish', 'smith', 'cook', 'craft'] as const;

const combatBonusesSchema = z.strictObject({
  accuracy: z.number().int(),
  strength: z.number().int(),
  defMelee: z.number().int(),
  defArchery: z.number().int(),
  defArcana: z.number().int(),
});

export const itemSchema = z.strictObject({
  id,
  nameKey: key,
  type: z.enum(['resource', 'equipment', 'food', 'tool', 'currency', 'misc']),
  rarity: z.enum(rarities),
  baseValue: nonNegInt,
  tradeable: z.boolean(),
  icon: z.string().min(1),
  equip: z
    .strictObject({
      slot: z.enum(equipSlots),
      style: z.enum(combatStyles).optional(),
      speedTicks: z.number().int().min(1).max(10).optional(),
      requires: z.partialRecord(skillIdSchema, posInt),
      bonuses: combatBonusesSchema,
      sprite: z.string().min(1),
    })
    .optional(),
  food: z.strictObject({ heal: posInt }).optional(),
  tool: z
    .strictObject({
      type: z.enum(toolTypes),
      speedBonusPpm: ppm,
    })
    .optional(),
});

export const actionSchema = z.strictObject({
  id,
  nameKey: key,
  skill: skillIdSchema,
  level: z.number().int().min(1).max(99),
  durationMs: z.number().int().min(600).max(600_000),
  xpTenths: posInt,
  inputs: z.array(z.strictObject({ itemId: id, qty: posInt })),
  outputs: z.array(z.strictObject({ itemId: id, qty: posInt, chancePpm: ppm })).min(1),
  tool: z.enum(toolTypes).optional(),
  regionId: id,
  scene: z.strictObject({
    prop: z.string().min(1),
    anim: z.enum(gatherAnims),
    particles: z.string().min(1),
  }),
});

export const regionSchema = z.strictObject({
  id,
  nameKey: key,
  skyColor: z.string().regex(/^#[0-9a-f]{6}$/),
  background: z.string().min(1),
});

export const monsterSchema = z.strictObject({
  id,
  nameKey: key,
  combatLevel: posInt,
  style: z.enum(combatStyles),
  weakness: z.enum(combatStyles),
  hp: posInt,
  levels: z.partialRecord(skillIdSchema, posInt),
  bonuses: combatBonusesSchema,
  speedTicks: z.number().int().min(1).max(10),
  lootTableId: id,
  petChancePpm: ppm,
  sprite: z.strictObject({
    atlas: z.string().min(1),
    key: z.string().min(1),
    spawnAnim: z.string().min(1),
    impactFrame: z.record(z.string(), nonNegInt),
  }),
});

export const lootTableSchema = z.strictObject({
  id,
  always: z.array(z.strictObject({ itemId: id, qty: posInt })),
  weighted: z.array(
    z.union([
      z.strictObject({ itemId: id, min: posInt, max: posInt, weight: posInt }),
      z.strictObject({ nothing: z.literal(true), weight: posInt }),
    ]),
  ),
  rare: z.array(z.strictObject({ itemId: id, qty: posInt, chancePpm: ppm })),
});

export const huntingAreaSchema = z.strictObject({
  id,
  regionId: id,
  nameKey: key,
  recommendedLevel: posInt,
  spawns: z.array(z.strictObject({ monsterId: id, weight: posInt })).min(1),
  waveSize: z.strictObject({
    min: z.number().int().min(1).max(3),
    max: z.number().int().min(1).max(3),
  }),
  waveIntervalTicks: z.strictObject({ min: posInt, max: posInt }),
  walkTicks: nonNegInt,
  background: z.string().min(1),
});

export const rawContentSchema = z.strictObject({
  items: z.array(itemSchema),
  actions: z.array(actionSchema),
  regions: z.array(regionSchema),
  monsters: z.array(monsterSchema),
  lootTables: z.array(lootTableSchema),
  huntingAreas: z.array(huntingAreaSchema),
});

export type Item = z.infer<typeof itemSchema>;
export type Action = z.infer<typeof actionSchema>;
export type Region = z.infer<typeof regionSchema>;
export type Monster = z.infer<typeof monsterSchema>;
export type LootTable = z.infer<typeof lootTableSchema>;
export type HuntingArea = z.infer<typeof huntingAreaSchema>;
export type RawContent = z.infer<typeof rawContentSchema>;
export type ToolType = (typeof toolTypes)[number];
