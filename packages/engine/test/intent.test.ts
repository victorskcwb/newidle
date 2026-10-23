import { describe, expect, it } from 'vitest';
import {
  IntentError,
  applyIntent,
  buyConsumable,
  cloneState,
  debugSetLevel,
  equipItem,
  forgeItem,
  hashState,
  intentSchema,
  learnSkill,
  MAX_FLAGS,
  refineItem,
  sellItems,
  setSkillRule,
  stepQuiet,
  type GameState,
  type Intent,
  type IntentType,
} from '../src/index.ts';
import { content, hunting } from './fixture.ts';

/** A level 30 hero in town, with loot, gold and materials, after a long hunt. */
function midGame(): GameState {
  const s = hunting(3);
  stepQuiet(s, content, 40_000);
  debugSetLevel(s, content, 30);
  s.gold += 1_000_000n;
  for (const m of ['fragment', 'essence', 'crystal']) s.materials[m] = 1_000n;
  s.activity = { kind: 'idle_town' };
  return s;
}

/** Runs `fn` and returns the IntentError code it threw, or null. */
function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof IntentError) return e.code;
    throw e;
  }
}

describe('player intents as data', () => {
  const base = midGame();
  const item = base.backpack[0] ?? base.stash[0];
  if (!item) throw new Error('the fixture should have loot');

  /** One example of every intent type (the Record makes the list exhaustive). */
  const examples: Record<IntentType, Intent> = {
    start_hunt: { type: 'start_hunt', huntId: 'forgotten_cemetery', difficulty: 'easy' },
    enter_dungeon: { type: 'enter_dungeon' },
    return_to_town: { type: 'return_to_town' },
    equip: { type: 'equip', uid: item.uid },
    equip_best: { type: 'equip_best' },
    unequip: { type: 'unequip', slot: 'weapon' },
    register: { type: 'register', uid: item.uid },
    salvage: { type: 'salvage', uid: item.uid },
    salvage_up_to: { type: 'salvage_up_to', rarity: 'magic' },
    set_hunt_behaviour: {
      type: 'set_hunt_behaviour',
      targetPriority: 'weakest',
      autoSellUpTo: 'common',
    },
    sell: { type: 'sell', uids: [item.uid] },
    deposit_all: { type: 'deposit_all' },
    buy: { type: 'buy', consumableId: 'potion_hp_small', qty: 5 },
    forge: { type: 'forge', slot: 'helm', rarity: 'rare' },
    refresh_quests: { type: 'refresh_quests', day: 20_000 },
    claim_quest: { type: 'claim_quest', which: 0 },
    claim_login: { type: 'claim_login', day: 20_000 },
    set_gathering: { type: 'set_gathering', professionId: 'mining' },
    set_recipe: { type: 'set_recipe', recipeId: null },
    set_automation: { type: 'set_automation', id: 'equipBest', on: false },
    set_active_pet: { type: 'set_active_pet', petId: null },
    set_meal: { type: 'set_meal', mealId: null },
    set_title: { type: 'set_title', achievementId: null },
    allocate: { type: 'allocate', attribute: 'vitality', points: 1 },
    set_auto_allocate: { type: 'set_auto_allocate', profile: 'off' },
    learn_skill: { type: 'learn_skill', skillId: 'heavy_strike' },
    set_active_skill: { type: 'set_active_skill', slot: 1, skillId: null },
    set_skill_rule: {
      type: 'set_skill_rule',
      skillId: 'heavy_strike',
      rule: { logic: 'all', conditions: [{ kind: 'target', is: 'boss' }] },
    },
    respec_skills: { type: 'respec_skills' },
    refine: { type: 'refine', uid: item.uid, useProtection: false, useTempering: false },
    reforge: { type: 'reforge', uid: item.uid, index: 0 },
    set_loot_filter: { type: 'set_loot_filter', keepFromRarity: 'magic', alwaysKeepAffixes: [] },
    set_potion_settings: {
      type: 'set_potion_settings',
      potionThresholdPct: 40,
      manaPotionThresholdPct: 30,
      potionTarget: 50,
      returnWhenOutOfPotions: false,
      autoReturnAfterDeath: true,
    },
    reset: { type: 'reset' },
    buy_upgrade: { type: 'buy_upgrade', upgradeId: 'wisdom' },
    set_flag: { type: 'set_flag', flag: 'tip.seen' },
  };

  it('every example passes the schema and applying it is deterministic', () => {
    for (const intent of Object.values(examples)) {
      expect(intentSchema.safeParse(intent).success, intent.type).toBe(true);
      const a = cloneState(base);
      const b = cloneState(base);
      const ca = codeOf(() => applyIntent(a, content, intent));
      const cb = codeOf(() => applyIntent(b, content, intent));
      expect(ca, intent.type).toBe(cb);
      expect(hashState(a), intent.type).toBe(hashState(b));
    }
  });

  it('applyIntent does what the direct rule call does', () => {
    const direct: [Intent, (s: GameState) => unknown][] = [
      [examples.equip, (s) => equipItem(s, content, item.uid)],
      [examples.sell, (s) => sellItems(s, [item.uid])],
      [examples.buy, (s) => buyConsumable(s, content, 'potion_hp_small', 5)],
      [examples.forge, (s) => forgeItem(s, content, 'helm', 'rare')],
      [examples.learn_skill, (s) => learnSkill(s, content, 'heavy_strike')],
      [examples.refine, (s) => refineItem(s, content, item.uid, false, false)],
      [
        examples.set_skill_rule,
        (s) =>
          setSkillRule(s, content, 'heavy_strike', {
            logic: 'all',
            conditions: [{ kind: 'target', is: 'boss' }],
          }),
      ],
    ];
    for (const [intent, call] of direct) {
      const a = cloneState(base);
      const b = cloneState(base);
      const viaIntent = codeOf(() => applyIntent(a, content, intent));
      const viaCall = codeOf(() => call(b));
      expect(viaIntent, intent.type).toBe(viaCall);
      expect(hashState(a), intent.type).toBe(hashState(b));
    }
  });

  it('returns the rule result (refine outcome, forged item)', () => {
    const s = cloneState(base);
    const forged = applyIntent(s, content, examples.forge).result as { uid: number };
    expect(typeof forged.uid).toBe('number');
    const refined = applyIntent(s, content, {
      type: 'refine',
      uid: forged.uid,
      useProtection: false,
      useTempering: false,
    }).result;
    expect(refined).toHaveProperty('success');
  });

  it('the schema refuses extra fields, unknown types and out-of-range values', () => {
    const bad: unknown[] = [
      { type: 'equip', uid: 1, gold: 999 },
      { type: 'give_gold', amount: 1 },
      { type: 'allocate', attribute: '__proto__', points: 1 },
      { type: 'allocate', attribute: 'strength', points: -5 },
      { type: 'buy', consumableId: 'potion_hp_small', qty: 1e9 },
      {
        type: 'set_potion_settings',
        potionThresholdPct: 40,
        manaPotionThresholdPct: 30,
        potionTarget: 50,
        returnWhenOutOfPotions: false,
        autoReturnAfterDeath: true,
        hpPotionId: 'x',
      },
      { type: 'set_flag', flag: 'Not A Flag!' },
      { type: 'sell', uids: Array.from({ length: 501 }, (_, i) => i) },
    ];
    for (const b of bad) expect(intentSchema.safeParse(b).success, JSON.stringify(b)).toBe(false);
  });

  it('flags are kept once and bounded', () => {
    const s = cloneState(base);
    s.flags = [];
    applyIntent(s, content, examples.set_flag);
    applyIntent(s, content, examples.set_flag);
    expect(s.flags.filter((f) => f === 'tip.seen')).toHaveLength(1);
    s.flags = Array.from({ length: MAX_FLAGS }, (_, i) => `f${i}`);
    expect(codeOf(() => applyIntent(s, content, { type: 'set_flag', flag: 'one.more' }))).toBe(
      'too_many_flags',
    );
  });
});
