import {
  rawContentSchema,
  type Action,
  type HuntingArea,
  type Item,
  type LootTable,
  type Monster,
  type RawContent,
  type Region,
} from './schema.ts';

/** Validated, indexed content. Arrays are sorted by id so iteration order is deterministic. */
export interface ContentDb {
  readonly items: ReadonlyMap<string, Item>;
  readonly actions: ReadonlyMap<string, Action>;
  readonly regions: ReadonlyMap<string, Region>;
  readonly monsters: ReadonlyMap<string, Monster>;
  readonly lootTables: ReadonlyMap<string, LootTable>;
  readonly huntingAreas: ReadonlyMap<string, HuntingArea>;
  readonly raw: RawContent;
}

export class ContentError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid content:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ContentError';
  }
}

function byId<T extends { id: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function index<T extends { id: string }>(
  kind: string,
  list: T[],
  issues: string[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const entry of list) {
    if (map.has(entry.id)) issues.push(`duplicate ${kind} id "${entry.id}"`);
    map.set(entry.id, entry);
  }
  return map;
}

/** Validates shape (Zod) and cross references, then indexes the content. Throws ContentError. */
export function buildContentDb(input: unknown): ContentDb {
  const parsed = rawContentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ContentError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const raw: RawContent = {
    items: byId(parsed.data.items),
    actions: byId(parsed.data.actions),
    regions: byId(parsed.data.regions),
    monsters: byId(parsed.data.monsters),
    lootTables: byId(parsed.data.lootTables),
    huntingAreas: byId(parsed.data.huntingAreas),
  };

  const issues: string[] = [];
  const items = index('item', raw.items, issues);
  const actions = index('action', raw.actions, issues);
  const regions = index('region', raw.regions, issues);
  const monsters = index('monster', raw.monsters, issues);
  const lootTables = index('lootTable', raw.lootTables, issues);
  const huntingAreas = index('huntingArea', raw.huntingAreas, issues);

  const toolTypes = new Set(raw.items.flatMap((i) => (i.tool ? [i.tool.type] : [])));
  const needItem = (where: string, itemId: string) => {
    if (!items.has(itemId)) issues.push(`${where}: unknown item "${itemId}"`);
  };
  const needRegion = (where: string, regionId: string) => {
    if (!regions.has(regionId)) issues.push(`${where}: unknown region "${regionId}"`);
  };

  for (const item of raw.items) {
    if (item.type === 'equipment' && !item.equip) issues.push(`item ${item.id}: missing equip`);
    if (item.type === 'food' && !item.food) issues.push(`item ${item.id}: missing food`);
    if (item.type === 'tool' && !item.tool) issues.push(`item ${item.id}: missing tool`);
  }
  for (const action of raw.actions) {
    const where = `action ${action.id}`;
    action.inputs.forEach((i) => needItem(where, i.itemId));
    action.outputs.forEach((o) => needItem(where, o.itemId));
    needRegion(where, action.regionId);
    if (action.tool && !toolTypes.has(action.tool)) {
      issues.push(`${where}: no item provides tool "${action.tool}"`);
    }
    const inputIds = action.inputs.map((i) => i.itemId);
    if (new Set(inputIds).size !== inputIds.length) issues.push(`${where}: duplicate inputs`);
  }
  for (const monster of raw.monsters) {
    if (!lootTables.has(monster.lootTableId)) {
      issues.push(`monster ${monster.id}: unknown loot table "${monster.lootTableId}"`);
    }
  }
  for (const table of raw.lootTables) {
    const where = `lootTable ${table.id}`;
    table.always.forEach((e) => needItem(where, e.itemId));
    table.rare.forEach((e) => needItem(where, e.itemId));
    for (const e of table.weighted) {
      if ('itemId' in e) {
        needItem(where, e.itemId);
        if (e.min > e.max) issues.push(`${where}: min > max for "${e.itemId}"`);
      }
    }
  }
  for (const area of raw.huntingAreas) {
    const where = `huntingArea ${area.id}`;
    needRegion(where, area.regionId);
    area.spawns.forEach((s) => {
      if (!monsters.has(s.monsterId)) issues.push(`${where}: unknown monster "${s.monsterId}"`);
    });
    if (area.waveSize.min > area.waveSize.max) issues.push(`${where}: waveSize min > max`);
    if (area.waveIntervalTicks.min > area.waveIntervalTicks.max) {
      issues.push(`${where}: waveIntervalTicks min > max`);
    }
  }

  if (issues.length > 0) throw new ContentError(issues);
  return { items, actions, regions, monsters, lootTables, huntingAreas, raw };
}

/** Every translation key referenced by the content, sorted. */
export function contentTranslationKeys(db: ContentDb): string[] {
  const keys = new Set<string>();
  for (const list of [
    db.raw.items,
    db.raw.actions,
    db.raw.regions,
    db.raw.monsters,
    db.raw.huntingAreas,
  ]) {
    for (const entry of list) keys.add(entry.nameKey);
  }
  return [...keys].sort();
}
