import type { ContentDb } from '@abismo/content';
import { IntentError } from './progression.ts';
import type { GameState, MonsterInstance, RuleCondition, SkillRule } from './types.ts';

/**
 * Skill rules (decision 169): the player decides when each active skill may be used, the way
 * a hunter would — "the area skill only against 3 or more", "the strong hit only on bosses",
 * "the buff only below half life". The engine still walks the skills in priority order and
 * takes the first that is ready and affordable; a rule only adds "and only if".
 * Checking a rule draws nothing from the RNG, so a game without rules plays exactly as before.
 */

export const MAX_RULE_CONDITIONS = 3;

/** What a rule can look at when the hero is about to swing. */
export interface RuleContext {
  heroHp: number;
  heroMaxHp: number;
  heroMana: number;
  heroMaxMana: number;
  /** The monster the swing would hit first (the target priority setting), if any. */
  target: MonsterInstance | null;
  /** Monsters of the group still alive. */
  enemies: number;
}

/** Below = strictly under the threshold (like the potion setting); above = over it. */
function pctHolds(value: number, max: number, op: 'below' | 'above', pct: number): boolean {
  if (max <= 0) return false;
  return op === 'below' ? value * 100 < max * pct : value * 100 > max * pct;
}

export function conditionHolds(c: RuleCondition, ctx: RuleContext): boolean {
  switch (c.kind) {
    case 'hero_hp':
      return pctHolds(ctx.heroHp, ctx.heroMaxHp, c.op, c.pct);
    case 'hero_mana':
      return pctHolds(ctx.heroMana, ctx.heroMaxMana, c.op, c.pct);
    case 'target_hp':
      return ctx.target !== null && pctHolds(ctx.target.hp, ctx.target.maxHp, c.op, c.pct);
    case 'enemies':
      return c.op === 'at_least' ? ctx.enemies >= c.count : ctx.enemies <= c.count;
    case 'target': {
      const t = ctx.target;
      if (!t) return false;
      if (c.is === 'boss') return t.boss;
      if (c.is === 'elite') return t.elite;
      return !t.boss && !t.elite;
    }
  }
}

/** True when the rule lets the skill be used now. No rule, or no conditions, always allows. */
export function ruleAllows(rule: SkillRule | undefined, ctx: RuleContext): boolean {
  if (!rule || rule.conditions.length === 0) return true;
  return rule.logic === 'all'
    ? rule.conditions.every((c) => conditionHolds(c, ctx))
    : rule.conditions.some((c) => conditionHolds(c, ctx));
}

function validCondition(c: RuleCondition): boolean {
  switch (c.kind) {
    case 'hero_hp':
    case 'hero_mana':
    case 'target_hp':
      return (
        (c.op === 'below' || c.op === 'above') &&
        Number.isInteger(c.pct) &&
        c.pct >= 1 &&
        c.pct <= 99
      );
    case 'enemies':
      return (
        (c.op === 'at_least' || c.op === 'at_most') &&
        Number.isInteger(c.count) &&
        c.count >= 1 &&
        c.count <= 8
      );
    case 'target':
      return c.is === 'boss' || c.is === 'elite' || c.is === 'normal';
    default:
      return false;
  }
}

/**
 * Sets (or with null, clears) the rule of an active skill of the hero's class. Rules are
 * settings: they survive resets and stay when the skill leaves the action slots.
 */
export function setSkillRule(
  s: GameState,
  content: ContentDb,
  skillId: string,
  rule: SkillRule | null,
) {
  const skill = content.skills.get(skillId);
  if (!skill || skill.kind !== 'active') throw new IntentError('unknown_skill');
  if (rule === null || rule.conditions.length === 0) {
    delete s.settings.skillRules[skillId];
    return;
  }
  if (rule.logic !== 'all' && rule.logic !== 'any') throw new IntentError('invalid_rule');
  if (rule.conditions.length > MAX_RULE_CONDITIONS) throw new IntentError('invalid_rule');
  if (!rule.conditions.every(validCondition)) throw new IntentError('invalid_rule');
  s.settings.skillRules[skillId] = {
    logic: rule.logic,
    conditions: rule.conditions.map((c) => ({ ...c })),
  };
}
