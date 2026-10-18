import {
  RARITIES,
  contentSchema,
  type Affix,
  type Card,
  type Consumable,
  type ContentFile,
  type Hunt,
  type ItemBase,
  type LootTable,
  type LoginReward,
  type Material,
  type Monster,
  type Rarity,
  type Region,
  type ResetUpgrade,
  type MonsterAffix,
  type UniqueItem,
  type Skill,
} from './schema.ts';

/** Validated content, indexed by id. Arrays keep the file order (it is deterministic). */
export interface ContentDb {
  readonly itemBases: ReadonlyMap<string, ItemBase>;
  readonly affixes: ReadonlyMap<string, Affix>;
  readonly monsters: ReadonlyMap<string, Monster>;
  readonly lootTables: ReadonlyMap<string, LootTable>;
  readonly consumables: ReadonlyMap<string, Consumable>;
  readonly materials: ReadonlyMap<string, Material>;
  readonly skills: ReadonlyMap<string, Skill>;
  readonly cards: ReadonlyMap<string, Card>;
  readonly regions: ReadonlyMap<string, Region>;
  readonly hunts: ReadonlyMap<string, Hunt>;
  readonly resetUpgrades: ReadonlyMap<string, ResetUpgrade>;
  readonly monsterAffixes: ReadonlyMap<string, MonsterAffix>;
  readonly uniqueItems: ReadonlyMap<string, UniqueItem>;
  /** Login calendar, in order (GDD 6.1). */
  readonly loginRewards: readonly LoginReward[];
  /** Material yielded by salvaging each rarity. */
  readonly salvageMaterial: Readonly<Record<Rarity, Material>>;
}

export class ContentError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid content:\n- ${problems.join('\n- ')}`);
  }
}

function indexById<T extends { id: string }>(
  kind: string,
  items: readonly T[],
  problems: string[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) problems.push(`duplicate ${kind} id "${item.id}"`);
    map.set(item.id, item);
  }
  return map;
}

/** Merges content files (each a partial set of arrays) into one object. */
export function mergeContentFiles(files: readonly Partial<ContentFile>[]): ContentFile {
  const merged: ContentFile = {
    itemBases: [],
    affixes: [],
    monsters: [],
    lootTables: [],
    consumables: [],
    materials: [],
    skills: [],
    cards: [],
    regions: [],
    hunts: [],
    resetUpgrades: [],
    monsterAffixes: [],
    uniqueItems: [],
    loginRewards: [],
  };
  for (const file of files) {
    for (const k of Object.keys(merged) as (keyof ContentFile)[]) {
      const items = file[k];
      if (items) (merged[k] as unknown[]).push(...items);
    }
  }
  return merged;
}

/**
 * Validates raw content with the Zod schemas and checks every cross-reference.
 * Throws ContentError listing every problem found.
 */
export function buildContentDb(raw: unknown): ContentDb {
  const parsed = contentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ContentError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const c = parsed.data;
  const problems: string[] = [];
  const db = {
    itemBases: indexById('itemBase', c.itemBases, problems),
    affixes: indexById('affix', c.affixes, problems),
    monsters: indexById('monster', c.monsters, problems),
    lootTables: indexById('lootTable', c.lootTables, problems),
    consumables: indexById('consumable', c.consumables, problems),
    materials: indexById('material', c.materials, problems),
    skills: indexById('skill', c.skills, problems),
    cards: indexById('card', c.cards, problems),
    regions: indexById('region', c.regions, problems),
    hunts: indexById('hunt', c.hunts, problems),
    resetUpgrades: indexById('resetUpgrade', c.resetUpgrades, problems),
    monsterAffixes: indexById('monsterAffix', c.monsterAffixes, problems),
    uniqueItems: indexById('uniqueItem', c.uniqueItems, problems),
    loginRewards: c.loginRewards,
  };

  const ref = (ok: boolean, message: string) => {
    if (!ok) problems.push(message);
  };

  for (const m of c.monsters) {
    ref(db.lootTables.has(m.lootTableId), `monster ${m.id}: unknown lootTableId ${m.lootTableId}`);
    if (m.cardId) ref(db.cards.has(m.cardId), `monster ${m.id}: unknown cardId ${m.cardId}`);
    if (m.cardId) {
      const owner = c.monsters.find((o) => o !== m && o.cardId === m.cardId);
      ref(!owner, `card ${m.cardId}: used by both ${m.id} and ${owner?.id}`);
    }
    ref(m.damageMin <= m.damageMax, `monster ${m.id}: damageMin > damageMax`);
  }
  for (const t of c.lootTables) {
    for (const b of t.bases) {
      ref(db.itemBases.has(b.itemBaseId), `lootTable ${t.id}: unknown itemBaseId ${b.itemBaseId}`);
    }
    for (const e of t.extras) {
      ref(db.consumables.has(e.itemId), `lootTable ${t.id}: unknown extra itemId ${e.itemId}`);
    }
  }
  for (const h of c.hunts) {
    ref(db.regions.has(h.regionId), `hunt ${h.id}: unknown regionId ${h.regionId}`);
    for (const s of h.spawns) {
      const monster = db.monsters.get(s.monsterId);
      ref(!!monster, `hunt ${h.id}: unknown spawn monsterId ${s.monsterId}`);
      if (monster) ref(!monster.boss, `hunt ${h.id}: boss ${monster.id} listed as a regular spawn`);
    }
    if (h.boss) {
      const boss = db.monsters.get(h.boss.monsterId);
      ref(!!boss, `hunt ${h.id}: unknown boss monsterId ${h.boss.monsterId}`);
      if (boss) ref(boss.boss === true, `hunt ${h.id}: boss ${boss.id} is not flagged boss`);
    }
    if (h.unlocks) ref(db.hunts.has(h.unlocks), `hunt ${h.id}: unknown unlocks ${h.unlocks}`);
    ref(h.levelRange[0] <= h.recommendedLevel, `hunt ${h.id}: recommendedLevel below levelRange`);
  }
  ref(
    c.hunts.some((h) => h.startUnlocked),
    'no hunt has startUnlocked: true (a new hero would have nowhere to hunt)',
  );
  for (const card of c.cards) {
    ref(
      c.monsters.some((m) => m.cardId === card.id),
      `card ${card.id}: no monster drops it`,
    );
  }
  for (const u of c.uniqueItems) {
    if (u.effect.kind === 'skill_bonus') {
      ref(db.skills.has(u.effect.skillId), `unique ${u.id}: unknown skill ${u.effect.skillId}`);
    }
  }
  for (const sk of c.skills) {
    for (const r of sk.requires) {
      const req = db.skills.get(r.skillId);
      ref(!!req, `skill ${sk.id}: unknown required skill ${r.skillId}`);
      if (req)
        ref(r.level <= req.maxLevel, `skill ${sk.id}: requires ${r.skillId} above its max level`);
    }
  }
  // Prerequisite cycles would make skills impossible to learn.
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (skillId: string): boolean => {
    if (done.has(skillId)) return true;
    if (visiting.has(skillId)) return false;
    visiting.add(skillId);
    const ok = (db.skills.get(skillId)?.requires ?? []).every((r) => visit(r.skillId));
    visiting.delete(skillId);
    done.add(skillId);
    return ok;
  };
  for (const sk of c.skills) ref(visit(sk.id), `skill ${sk.id}: prerequisite cycle`);
  const positions = new Set<string>();
  for (const sk of c.skills) {
    const pos = `${sk.classId}:${sk.position.row},${sk.position.col}`;
    ref(!positions.has(pos), `skill ${sk.id}: tree position taken`);
    positions.add(pos);
  }
  c.loginRewards.forEach((day, i) => {
    for (const rewardId of Object.keys(day.reward)) {
      ref(
        db.materials.has(rewardId) || db.consumables.has(rewardId),
        `loginRewards[${i}]: unknown reward ${rewardId}`,
      );
    }
  });
  for (const a of c.affixes) {
    ref(a.tiers[0]?.minIlvl === a.minIlvl, `affix ${a.id}: first tier must start at minIlvl`);
  }

  const salvage: Partial<Record<Rarity, Material>> = {};
  for (const m of c.materials) {
    if (salvage[m.fromRarity]) problems.push(`two materials for rarity ${m.fromRarity}`);
    salvage[m.fromRarity] = m;
  }
  for (const r of RARITIES) ref(!!salvage[r], `no salvage material for rarity ${r}`);

  if (problems.length > 0) throw new ContentError(problems);
  return { ...db, salvageMaterial: salvage as Record<Rarity, Material> };
}

/** Every translation key referenced by content, for the i18n completeness check. */
export function translationKeys(db: ContentDb): string[] {
  const keys: string[] = [];
  for (const b of db.itemBases.values()) keys.push(b.nameKey);
  for (const a of db.affixes.values()) keys.push(a.textKey);
  for (const m of db.monsters.values()) keys.push(m.nameKey);
  for (const x of db.consumables.values()) keys.push(x.nameKey);
  for (const x of db.materials.values()) keys.push(x.nameKey);
  for (const s of db.skills.values()) keys.push(s.nameKey, s.descKey);
  for (const x of db.cards.values()) keys.push(x.nameKey);
  for (const r of db.regions.values()) keys.push(r.nameKey);
  for (const h of db.hunts.values()) keys.push(h.nameKey);
  for (const u of db.resetUpgrades.values()) keys.push(u.nameKey, u.descKey);
  for (const a of db.monsterAffixes.values()) keys.push(a.nameKey);
  for (const u of db.uniqueItems.values()) keys.push(u.nameKey, u.descKey);
  return keys;
}
