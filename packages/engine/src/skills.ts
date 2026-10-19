import type { ContentDb, Skill } from '@abismo/content';
import { RESPEC_BASE_COST, RESET_FOR_FIFTH_SKILL_SLOT, SKILL_SLOTS } from './constants.ts';
import { IntentError } from './progression.ts';
import type { GameState, Hero } from './types.ts';

/** Active skill slots: 4, plus a 5th from the 3rd reset (section 8.3). */
export function skillSlots(hero: Hero): number {
  return SKILL_SLOTS + (hero.resets.count >= RESET_FOR_FIFTH_SKILL_SLOT ? 1 : 0);
}

export type LearnBlock =
  | { kind: 'no_points' }
  | { kind: 'max_level' }
  | { kind: 'other_class' }
  | { kind: 'requires'; skillId: string; level: number };

/** Why the next level of a skill cannot be learned now, or null if it can. */
export function learnBlock(hero: Hero, skill: Skill): LearnBlock | null {
  if (skill.classId !== hero.classId) return { kind: 'other_class' };
  if ((hero.skillLevels[skill.id] ?? 0) >= skill.maxLevel) return { kind: 'max_level' };
  for (const r of skill.requires) {
    if ((hero.skillLevels[r.skillId] ?? 0) < r.level) {
      return { kind: 'requires', skillId: r.skillId, level: r.level };
    }
  }
  if (hero.unspentSkillPoints <= 0) return { kind: 'no_points' };
  return null;
}

/** Spends one skill point on a skill. A new active skill takes the first free slot. */
export function learnSkill(s: GameState, content: ContentDb, skillId: string) {
  const skill = content.skills.get(skillId);
  if (!skill) throw new IntentError('unknown_skill');
  const block = learnBlock(s.hero, skill);
  if (block) throw new IntentError(`cannot_learn_${block.kind}`);
  const hero = s.hero;
  const before = hero.skillLevels[skillId] ?? 0;
  hero.skillLevels[skillId] = before + 1;
  hero.unspentSkillPoints--;
  hero.skillOrder.push(skillId);
  if (skill.kind === 'active' && before === 0 && !hero.activeSkills.includes(skillId)) {
    normalizeSlots(hero);
    const free = hero.activeSkills.indexOf(null);
    if (free >= 0) hero.activeSkills[free] = skillId;
  }
}

/**
 * Spends skill points following last cycle's build, in the order it was learned, then puts
 * the active skills back in last cycle's slots. Returns how many points were spent.
 */
export function followSkillPlan(s: GameState, content: ContentDb): number {
  const hero = s.hero;
  const seen: Record<string, number> = {};
  let spent = 0;
  for (const id of hero.lastSkillOrder) {
    if (hero.unspentSkillPoints <= 0) break;
    seen[id] = (seen[id] ?? 0) + 1;
    if ((hero.skillLevels[id] ?? 0) >= seen[id]!) continue;
    const skill = content.skills.get(id);
    if (!skill || learnBlock(hero, skill)) break; // keep the order: never skip ahead
    learnSkill(s, content, id);
    spent++;
  }
  if (spent > 0 && hero.lastActiveSkills.length > 0) {
    normalizeSlots(hero);
    const wanted = hero.lastActiveSkills.filter(
      (id): id is string => !!id && (hero.skillLevels[id] ?? 0) > 0,
    );
    const others = hero.activeSkills.filter((id): id is string => !!id && !wanted.includes(id));
    const order = [...wanted, ...others].slice(0, hero.activeSkills.length);
    hero.activeSkills = hero.activeSkills.map((_, i) => order[i] ?? null);
  }
  return spent;
}

/** Makes the slot list exactly as long as the hero's slot count. */
function normalizeSlots(hero: Hero) {
  const n = skillSlots(hero);
  while (hero.activeSkills.length < n) hero.activeSkills.push(null);
  hero.activeSkills.length = n;
}

/**
 * Puts a learned active skill in a slot (slot order = priority), or clears the slot with null.
 * If the skill was in another slot, the two slots swap.
 */
export function setActiveSkill(
  s: GameState,
  content: ContentDb,
  slot: number,
  skillId: string | null,
) {
  const hero = s.hero;
  normalizeSlots(hero);
  if (!Number.isInteger(slot) || slot < 0 || slot >= hero.activeSkills.length) {
    throw new IntentError('invalid_slot');
  }
  if (skillId !== null) {
    const skill = content.skills.get(skillId);
    if (!skill || skill.kind !== 'active') throw new IntentError('not_an_active_skill');
    if ((hero.skillLevels[skillId] ?? 0) <= 0) throw new IntentError('skill_not_learned');
    const other = hero.activeSkills.indexOf(skillId);
    if (other >= 0) hero.activeSkills[other] = hero.activeSkills[slot] ?? null;
  }
  hero.activeSkills[slot] = skillId;
}

/** Gold for the next skill redistribution: grows with each paid one; free after a reset. */
export function respecCost(hero: Hero): bigint {
  if (hero.freeRespec) return 0n;
  const n = BigInt(hero.respecs + 1);
  return BigInt(RESPEC_BASE_COST) * n * n;
}

/** Refunds every skill point and empties the slots. */
export function respecSkills(s: GameState) {
  const hero = s.hero;
  const cost = respecCost(hero);
  if (s.gold < cost) throw new IntentError('not_enough_gold');
  s.gold -= cost;
  if (hero.freeRespec) hero.freeRespec = false;
  else hero.respecs++;
  let points = 0;
  for (const level of Object.values(hero.skillLevels)) points += level;
  hero.skillLevels = {};
  hero.skillOrder = [];
  hero.unspentSkillPoints += points;
  hero.activeSkills = hero.activeSkills.map(() => null);
  normalizeSlots(hero);
  s.combat.buffUntil = {};
}
