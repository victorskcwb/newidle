import economy from '../data/economy.json' with { type: 'json' };
import elites from '../data/elites.json' with { type: 'json' };
import login from '../data/login.json' with { type: 'json' };
import bestiary from '../data/bestiary.json' with { type: 'json' };
import achievements from '../data/achievements.json' with { type: 'json' };
import professions from '../data/professions.json' with { type: 'json' };
import sets from '../data/sets.json' with { type: 'json' };
import pets from '../data/pets.json' with { type: 'json' };
import items from '../data/items.json' with { type: 'json' };
import monsters from '../data/monsters.json' with { type: 'json' };
import resets from '../data/resets.json' with { type: 'json' };
import skills from '../data/skills.json' with { type: 'json' };
import uniques from '../data/uniques.json' with { type: 'json' };
import world from '../data/world.json' with { type: 'json' };
import { buildContentDb, mergeContentFiles, type ContentDb } from './db.ts';
import type { ContentFile } from './schema.ts';

/** Raw content files in a fixed order (the order is part of determinism: weighted picks follow it). */
export const CONTENT_FILES = {
  items,
  monsters,
  economy,
  skills,
  world,
  resets,
  elites,
  uniques,
  login,
  bestiary,
  achievements,
  professions,
  sets,
  pets,
} as unknown as Record<string, Partial<ContentFile>>;

let cached: ContentDb | undefined;

/** The game content shipped with the build, validated once. */
export function loadContent(): ContentDb {
  cached ??= buildContentDb(mergeContentFiles(Object.values(CONTENT_FILES)));
  return cached;
}
