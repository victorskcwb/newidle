import actions from '../data/actions.json' with { type: 'json' };
import huntingAreas from '../data/huntingAreas.json' with { type: 'json' };
import items from '../data/items.json' with { type: 'json' };
import lootTables from '../data/lootTables.json' with { type: 'json' };
import monsters from '../data/monsters.json' with { type: 'json' };
import regions from '../data/regions.json' with { type: 'json' };
import { buildContentDb, type ContentDb } from './db.ts';

/** The raw content as stored in data/*.json, merged into one object. */
export const bundledRawContent: unknown = {
  ...items,
  ...actions,
  ...regions,
  ...monsters,
  ...lootTables,
  ...huntingAreas,
};

let cached: ContentDb | undefined;

/** Validated content shipped with this package (cached after the first call). */
export function loadBundledContent(): ContentDb {
  cached ??= buildContentDb(bundledRawContent);
  return cached;
}
