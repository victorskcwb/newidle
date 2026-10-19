import type { ContentDb, HeroClass } from '@abismo/content';
import { IntentError } from './progression.ts';
import type { Attribute, Hero } from './types.ts';

/** Classes (section 5.3): the hero's class decides the attribute that drives damage. */

const FALLBACK: HeroClass = {
  id: 'warrior',
  nameKey: 'class.warrior',
  primary: 'strength',
  unlockResets: 0,
  ranged: false,
  starterWeapon: 'sword_rusty',
};

export function classOf(content: ContentDb, hero: Hero): HeroClass {
  return content.classes.get(hero.classId) ?? FALLBACK;
}

export function primaryAttribute(content: ContentDb, hero: Hero): Attribute {
  return classOf(content, hero).primary;
}

/** Classes a reset can turn the hero into: resets done, counting the one being made. */
export function classUnlocked(content: ContentDb, hero: Hero, classId: string): boolean {
  const k = content.classes.get(classId);
  return !!k && hero.resets.count + 1 >= k.unlockResets;
}

export function checkClassChoice(content: ContentDb, hero: Hero, classId: string) {
  if (!content.classes.has(classId)) throw new IntentError('unknown_class');
  if (!classUnlocked(content, hero, classId)) throw new IntentError('class_locked');
}
