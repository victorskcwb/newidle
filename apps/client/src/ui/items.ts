import type { ContentDb, Stat } from '@abismo/content';
import {
  computeHeroStats,
  equippedSetPieces,
  inactiveReason,
  itemStats,
  RESIST_ELEMENTS,
  type Hero,
  type HeroStats,
  type ItemInstance,
} from '@abismo/engine';
import { localeTag, t } from '../i18n.ts';

export function itemName(content: ContentDb, item: ItemInstance): string {
  const base = content.itemBases.get(item.baseId);
  const unique = item.uniqueId ? content.uniqueItems.get(item.uniqueId) : undefined;
  const name = unique ? t(unique.nameKey) : base ? t(base.nameKey) : item.baseId;
  return item.refine > 0 ? `${name} ${t('item.refine', { n: item.refine })}` : name;
}

/** Base lines (damage, speed, defense) and affix lines of an item, all from i18n. */
export function itemLines(
  content: ContentDb,
  item: ItemInstance,
): { base: string[]; affixes: string[]; unique: string | null } {
  const s = itemStats(item, content);
  const base: string[] = [];
  if (s.damageMin !== undefined && s.damageMax !== undefined) {
    base.push(t('item.damage', { min: s.damageMin, max: s.damageMax }));
  }
  if (s.attacksPerSecond !== undefined) {
    base.push(t('item.aps', { aps: s.attacksPerSecond.toLocaleString(localeTag) }));
  }
  if (s.defense !== undefined) base.push(t('item.defense', { value: s.defense }));
  const implicit = content.itemBases.get(item.baseId)?.implicit ?? {};
  for (const [stat, value] of Object.entries(implicit))
    base.push(t(`stat.${stat as Stat}`, { value }));
  const affixes = item.affixes.map((a) => {
    const affix = content.affixes.get(a.affixId);
    return affix ? t(affix.textKey, { value: a.value }) : a.affixId;
  });
  return { base, affixes, unique: uniqueText(content, item) };
}

/** Set name with the pieces equipped, and each bonus (active or not), for a set piece. */
export function setLines(
  content: ContentDb,
  hero: Hero,
  item: ItemInstance,
): { title: string; bonuses: { text: string; active: boolean }[] } | null {
  const set = item.setId ? content.itemSets.get(item.setId) : undefined;
  if (!set) return null;
  const n = equippedSetPieces(hero)[set.id] ?? 0;
  return {
    title: t('item.set', { name: t(set.nameKey), n, max: set.slots.length }),
    bonuses: set.bonuses.map((b) => ({
      text: t('item.setBonus', {
        pieces: b.pieces,
        bonus: t(`stat.${b.stat}`, { value: b.value }),
      }),
      active: n >= b.pieces,
    })),
  };
}

/** The unique legendary effect of an item, as text (null for regular items). */
export function uniqueText(content: ContentDb, item: ItemInstance): string | null {
  const unique = item.uniqueId ? content.uniqueItems.get(item.uniqueId) : undefined;
  if (!unique) return null;
  // The effect's numbers (damagePct, thresholdPct…) fill the description's placeholders.
  const values = Object.fromEntries(
    Object.entries(unique.effect).filter((e): e is [string, number] => typeof e[1] === 'number'),
  );
  return t(unique.descKey, values);
}

export function requirementText(content: ContentDb, hero: Hero, item: ItemInstance): string | null {
  const reason = inactiveReason(hero, item, content);
  if (!reason) return null;
  if (reason.kind === 'level') return t('item.requires', { level: reason.required });
  if (reason.kind === 'class') {
    return t('item.requiresClass', {
      class: t(content.classes.get(reason.classId)?.nameKey ?? reason.classId),
    });
  }
  return t('item.requiresAttribute', {
    value: reason.required,
    attribute: t(`attribute.${reason.attribute}`),
  });
}

export interface CompareRow {
  label: string;
  before: number;
  after: number;
  /** Decimal places to show. */
  digits: number;
}

const avgDamage = (s: HeroStats) => (s.damageMin + s.damageMax) / 2;

/** Hero stats with the item equipped vs now, for the rows that change. */
export function compareItem(content: ContentDb, hero: Hero, item: ItemInstance): CompareRow[] {
  const slot = content.itemBases.get(item.baseId)!.slot;
  const now = computeHeroStats(hero, content);
  const swapped = computeHeroStats(
    { ...hero, equipment: { ...hero.equipment, [slot]: item } },
    content,
  );
  const rows: CompareRow[] = [
    { label: t('compare.damage'), before: avgDamage(now), after: avgDamage(swapped), digits: 1 },
    {
      label: t('compare.attackSpeed'),
      before: 10 / now.attackIntervalTicks,
      after: 10 / swapped.attackIntervalTicks,
      digits: 2,
    },
    { label: t('compare.defense'), before: now.defense, after: swapped.defense, digits: 0 },
    { label: t('compare.maxHp'), before: now.maxHp, after: swapped.maxHp, digits: 0 },
    { label: t('compare.xpPct'), before: now.xpPct, after: swapped.xpPct, digits: 0 },
    {
      label: t('compare.magicFindPct'),
      before: now.magicFindPct,
      after: swapped.magicFindPct,
      digits: 0,
    },
    {
      label: t('compare.lifeLeechPct'),
      before: now.lifeLeechPct,
      after: swapped.lifeLeechPct,
      digits: 0,
    },
    ...RESIST_ELEMENTS.map((e) => ({
      label: t(`compare.${e}ResPct`),
      before: now.resistPct[e],
      after: swapped.resistPct[e],
      digits: 0,
    })),
  ];
  return rows.filter((r) => Math.abs(r.after - r.before) > 1e-9);
}
