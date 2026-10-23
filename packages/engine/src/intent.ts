import { EQUIPMENT_SLOTS, RARITIES, type ContentDb } from '@abismo/content';
import { z } from 'zod';
import { setTitle } from './achievements.ts';
import { AUTOMATIONS, setAutomation } from './automation.ts';
import { enterDungeon } from './dungeon.ts';
import {
  equipBest,
  equipItem,
  registerItem,
  returnToTown,
  salvageItem,
  salvageUpTo,
  setAutoAllocate,
  setHuntBehaviour,
  setLootFilter,
  setPotionSettings,
  startHunt,
  unequipItem,
} from './intents.ts';
import { claimLogin } from './login.ts';
import { setMeal } from './meals.ts';
import { setActivePet } from './pets.ts';
import { setGathering, setRecipe } from './professions.ts';
import { IntentError, allocateAttribute } from './progression.ts';
import { claimQuest, refreshQuests } from './quests.ts';
import { refineItem } from './refine.ts';
import { reforgeItem } from './reforge.ts';
import { buyUpgrade, performReset } from './resets.ts';
import { skillRuleSchema } from './save.ts';
import { setSkillRule } from './skillRules.ts';
import { learnSkill, respecSkills, setActiveSkill } from './skills.ts';
import { buyConsumable, depositAll, forgeItem, sellItems } from './town.ts';
import { ATTRIBUTES, type GameEvent, type GameState } from './types.ts';

/**
 * Player intents as data (decision 173): what the client sends to the server and what both
 * apply, at the same tick, through `applyIntent`. The schemas are strict, so a payload with
 * extra or ill-typed fields is rejected before it reaches the rules; the rules themselves still
 * check everything that depends on the state (gold, level, town…) and throw IntentError.
 */

const id = z.string().min(1).max(64);
const uid = z.number().int().min(0);
const rarity = z.enum(RARITIES);
const slot = z.enum(EQUIPMENT_SLOTS);
/** Days since 1970-01-01; the server checks it is today's (the engine has no clock). */
const day = z.number().int().min(0).max(1_000_000);

/** Most one-time flags a hero may hold (they are short tip ids set by the interface). */
export const MAX_FLAGS = 200;

export const intentSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('start_hunt'),
    huntId: id,
    difficulty: z.enum(['easy', 'normal', 'hard']).optional(),
  }),
  z.strictObject({ type: z.literal('enter_dungeon') }),
  z.strictObject({ type: z.literal('return_to_town') }),
  z.strictObject({ type: z.literal('equip'), uid }),
  z.strictObject({ type: z.literal('equip_best') }),
  z.strictObject({ type: z.literal('unequip'), slot }),
  z.strictObject({ type: z.literal('register'), uid }),
  z.strictObject({ type: z.literal('salvage'), uid }),
  z.strictObject({ type: z.literal('salvage_up_to'), rarity }),
  z.strictObject({
    type: z.literal('set_hunt_behaviour'),
    targetPriority: z.enum(['first', 'weakest', 'strongest']),
    autoSellUpTo: rarity.nullable(),
  }),
  z.strictObject({ type: z.literal('sell'), uids: z.array(uid).max(500) }),
  z.strictObject({ type: z.literal('deposit_all') }),
  z.strictObject({
    type: z.literal('buy'),
    consumableId: id,
    qty: z.number().int().min(1).max(1000),
  }),
  z.strictObject({ type: z.literal('forge'), slot, rarity: z.enum(['magic', 'rare', 'epic']) }),
  z.strictObject({ type: z.literal('refresh_quests'), day }),
  z.strictObject({
    type: z.literal('claim_quest'),
    which: z.union([z.number().int().min(0).max(9), z.literal('weekly')]),
  }),
  z.strictObject({ type: z.literal('claim_login'), day }),
  z.strictObject({ type: z.literal('set_gathering'), professionId: id.nullable() }),
  z.strictObject({ type: z.literal('set_recipe'), recipeId: id.nullable() }),
  z.strictObject({ type: z.literal('set_automation'), id: z.enum(AUTOMATIONS), on: z.boolean() }),
  z.strictObject({ type: z.literal('set_active_pet'), petId: id.nullable() }),
  z.strictObject({ type: z.literal('set_meal'), mealId: id.nullable() }),
  z.strictObject({ type: z.literal('set_title'), achievementId: id.nullable() }),
  z.strictObject({
    type: z.literal('allocate'),
    attribute: z.enum(ATTRIBUTES),
    points: z.number().int().min(1).max(10_000),
  }),
  z.strictObject({
    type: z.literal('set_auto_allocate'),
    profile: z.enum(['off', 'balanced', 'strength', 'vitality']),
  }),
  z.strictObject({ type: z.literal('learn_skill'), skillId: id }),
  z.strictObject({
    type: z.literal('set_active_skill'),
    slot: z.number().int().min(0).max(9),
    skillId: id.nullable(),
  }),
  z.strictObject({
    type: z.literal('set_skill_rule'),
    skillId: id,
    rule: skillRuleSchema.nullable(),
  }),
  z.strictObject({ type: z.literal('respec_skills') }),
  z.strictObject({
    type: z.literal('refine'),
    uid,
    useProtection: z.boolean(),
    useTempering: z.boolean(),
  }),
  z.strictObject({ type: z.literal('reforge'), uid, index: z.number().int().min(0).max(9) }),
  z.strictObject({
    type: z.literal('set_loot_filter'),
    keepFromRarity: rarity,
    alwaysKeepAffixes: z.array(id).max(100),
  }),
  z.strictObject({
    type: z.literal('set_potion_settings'),
    potionThresholdPct: z.number().int(),
    manaPotionThresholdPct: z.number().int(),
    potionTarget: z.number().int(),
    returnWhenOutOfPotions: z.boolean(),
    autoReturnAfterDeath: z.boolean(),
  }),
  z.strictObject({ type: z.literal('reset'), nextClassId: id.optional() }),
  z.strictObject({ type: z.literal('buy_upgrade'), upgradeId: id }),
  z.strictObject({
    type: z.literal('set_flag'),
    flag: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9_.]+$/),
  }),
]);

export type Intent = z.infer<typeof intentSchema>;
export type IntentType = Intent['type'];

/** What a player intent did: the events it caused and its own result, if any. */
export interface IntentOutcome {
  events: GameEvent[];
  result: unknown;
}

/** Marks a one-time tip as seen. */
export function setFlag(s: GameState, flag: string) {
  if (s.flags.includes(flag)) return;
  if (s.flags.length >= MAX_FLAGS) throw new IntentError('too_many_flags');
  s.flags.push(flag);
}

/**
 * Applies one player intent to the state at its current tick. Throws IntentError when the
 * rules refuse it (the caller rejects the intent; the state may have been left as the rule
 * left it, identically on both sides).
 */
export function applyIntent(s: GameState, content: ContentDb, i: Intent): IntentOutcome {
  const none = (result?: unknown): IntentOutcome => ({ events: [], result });
  switch (i.type) {
    case 'start_hunt':
      return { events: startHunt(s, content, i.huntId, i.difficulty), result: undefined };
    case 'enter_dungeon':
      return { events: enterDungeon(s), result: undefined };
    case 'return_to_town':
      return { events: returnToTown(s, content), result: undefined };
    case 'equip':
      return none(equipItem(s, content, i.uid));
    case 'equip_best':
      return none(equipBest(s, content));
    case 'unequip':
      return none(unequipItem(s, content, i.slot));
    case 'register':
      return none(registerItem(s, i.uid));
    case 'salvage':
      return none(salvageItem(s, content, i.uid));
    case 'salvage_up_to':
      return none(salvageUpTo(s, content, i.rarity));
    case 'set_hunt_behaviour':
      return none(
        setHuntBehaviour(s, { targetPriority: i.targetPriority, autoSellUpTo: i.autoSellUpTo }),
      );
    case 'sell':
      return none(sellItems(s, i.uids));
    case 'deposit_all':
      return none(depositAll(s));
    case 'buy':
      return none(buyConsumable(s, content, i.consumableId, i.qty));
    case 'forge':
      return none(forgeItem(s, content, i.slot, i.rarity));
    case 'refresh_quests':
      return none(refreshQuests(s, i.day));
    case 'claim_quest':
      return none(claimQuest(s, i.which));
    case 'claim_login':
      return none(claimLogin(s, content, i.day));
    case 'set_gathering':
      return none(setGathering(s, content, i.professionId));
    case 'set_recipe':
      return none(setRecipe(s, content, i.recipeId));
    case 'set_automation':
      return none(setAutomation(s, i.id, i.on));
    case 'set_active_pet':
      return none(setActivePet(s, i.petId));
    case 'set_meal':
      return none(setMeal(s, content, i.mealId));
    case 'set_title':
      return none(setTitle(s, content, i.achievementId));
    case 'allocate':
      return none(allocateAttribute(s, i.attribute, i.points));
    case 'set_auto_allocate':
      return none(setAutoAllocate(s, content, i.profile));
    case 'learn_skill':
      return none(learnSkill(s, content, i.skillId));
    case 'set_active_skill':
      return none(setActiveSkill(s, content, i.slot, i.skillId));
    case 'set_skill_rule':
      return none(setSkillRule(s, content, i.skillId, i.rule));
    case 'respec_skills':
      return none(respecSkills(s));
    case 'refine':
      return none(refineItem(s, content, i.uid, i.useProtection, i.useTempering));
    case 'reforge':
      return none(reforgeItem(s, content, i.uid, i.index));
    case 'set_loot_filter':
      return none(
        setLootFilter(s, content, {
          keepFromRarity: i.keepFromRarity,
          alwaysKeepAffixes: i.alwaysKeepAffixes,
        }),
      );
    case 'set_potion_settings':
      return none(
        setPotionSettings(s, {
          potionThresholdPct: i.potionThresholdPct,
          manaPotionThresholdPct: i.manaPotionThresholdPct,
          potionTarget: i.potionTarget,
          returnWhenOutOfPotions: i.returnWhenOutOfPotions,
          autoReturnAfterDeath: i.autoReturnAfterDeath,
        }),
      );
    case 'reset':
      return none(performReset(s, content, i.nextClassId));
    case 'buy_upgrade':
      return none(buyUpgrade(s, content, i.upgradeId));
    case 'set_flag':
      return none(setFlag(s, i.flag));
  }
}
