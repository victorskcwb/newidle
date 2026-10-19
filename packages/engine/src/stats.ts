import { collectionMods } from './collection.ts';
import { setMods } from './sets.ts';
import { petMods } from './pets.ts';
import { primaryAttribute } from './classes.ts';
import { mealMods } from './meals.ts';
import {
  EQUIPMENT_SLOTS,
  type ContentDb,
  type EquipmentSlot,
  type Stat,
  type UniqueEffect,
} from '@abismo/content';
import {
  ACCURACY_PER_LEVEL,
  ACCURACY_PERMILLE_PER_DEXTERITY,
  BASE_ACCURACY,
  BASE_CRIT_CHANCE_PPM,
  BASE_CRIT_DAMAGE_PCT,
  BASE_EVASION,
  BASE_LIFE,
  BASE_MANA,
  CRIT_CHANCE_PPM_PER_DEXTERITY,
  EVASION_PER_LEVEL,
  LIFE_PER_LEVEL,
  LIFE_PER_VITALITY,
  LIFE_REGEN_DIVISOR,
  MANA_PER_ENERGY,
  MANA_REGEN_DIVISOR,
  REFINE_PCT_PER_LEVEL,
  SKILL_DAMAGE_PERMILLE_PER_ENERGY,
  STARTING_ATTRIBUTE,
  TICKS_PER_SECOND,
  UNARMED,
} from './constants.ts';
import { ATTRIBUTES, type Attributes, type Hero, type ItemInstance } from './types.ts';
import { upgradeTotal } from './upgrades.ts';
import { cardMods } from './cards.ts';

export type StatMods = Partial<Record<Stat, number>>;

/** Base values of an item after refining, plus its stat modifiers (implicit + affixes). */
export interface ItemStats {
  damageMin?: number;
  damageMax?: number;
  attacksPerSecond?: number;
  defense?: number;
  mods: StatMods;
}

export function itemStats(item: ItemInstance, content: ContentDb): ItemStats {
  const base = content.itemBases.get(item.baseId);
  if (!base) throw new Error(`unknown item base ${item.baseId}`);
  const refinePct = 100 + item.refine * REFINE_PCT_PER_LEVEL;
  const refined = (v: number | undefined) =>
    v === undefined ? undefined : Math.floor((v * refinePct) / 100);
  const mods: StatMods = { ...base.implicit };
  for (const a of item.affixes) {
    const affix = content.affixes.get(a.affixId);
    if (!affix) throw new Error(`unknown affix ${a.affixId}`);
    mods[affix.stat] = (mods[affix.stat] ?? 0) + a.value;
  }
  const out: ItemStats = { mods };
  const dmgMin = refined(base.base.damageMin);
  const dmgMax = refined(base.base.damageMax);
  const defense = refined(base.base.defense);
  if (dmgMin !== undefined) out.damageMin = dmgMin;
  if (dmgMax !== undefined) out.damageMax = dmgMax;
  if (base.base.attacksPerSecond !== undefined) out.attacksPerSecond = base.base.attacksPerSecond;
  if (defense !== undefined) out.defense = defense;
  return out;
}

/**
 * Attributes from the starting value, the reset shop's "Poder ancestral" and allocated
 * points (no item bonuses).
 */
export function baseAttributes(hero: Hero, content: ContentDb): Attributes {
  const start = STARTING_ATTRIBUTE + upgradeTotal(hero, content, 'startingAttributes');
  const out = {} as Attributes;
  for (const a of ATTRIBUTES) out[a] = start + hero.allocated[a];
  return out;
}

export type InactiveReason =
  | { kind: 'level'; required: number }
  | { kind: 'attribute'; attribute: keyof Attributes; required: number }
  | { kind: 'class'; classId: string };

/**
 * Why an equipped item is not active, or null if it is. Requirements are checked against the
 * hero's own attributes (without item bonuses), so items never enable each other.
 */
export function inactiveReason(
  hero: Hero,
  item: ItemInstance,
  content: ContentDb,
): InactiveReason | null {
  const base = content.itemBases.get(item.baseId);
  if (!base) throw new Error(`unknown item base ${item.baseId}`);
  if (base.classId && base.classId !== hero.classId)
    return { kind: 'class', classId: base.classId };
  if (hero.level < base.requires.level) return { kind: 'level', required: base.requires.level };
  const attrs = baseAttributes(hero, content);
  for (const a of ATTRIBUTES) {
    const required = base.requires[a];
    if (required !== undefined && attrs[a] < required) {
      return { kind: 'attribute', attribute: a, required };
    }
  }
  return null;
}

export interface HeroStats {
  attributes: Attributes;
  maxHp: number;
  maxMana: number;
  hpRegenPerSecond: number;
  manaRegenPerSecond: number;
  damageMin: number;
  damageMax: number;
  attacksPerSecond: number;
  attackIntervalTicks: number;
  accuracy: number;
  evasion: number;
  defense: number;
  critChancePpm: number;
  critDamagePct: number;
  lifeLeechPct: number;
  /** Extra skill damage from Energia, in tenths of a percent. */
  skillDamagePermille: number;
  xpPct: number;
  goldPct: number;
  magicFindPct: number;
  damageVsUndeadPct: number;
  inactiveSlots: EquipmentSlot[];
  /** Unique legendary effects of active equipped items. */
  uniques: UniqueEffect[];
  /** Extra card chance in percent (unique effect). */
  cardLuckPct: number;
}

const cache = new WeakMap<Hero, { key: string; stats: HeroStats }>();

/** Cheap fingerprint of everything stats depend on, so cached stats are never stale. */
function statsKey(hero: Hero): string {
  const items = EQUIPMENT_SLOTS.map((s) => {
    const it = hero.equipment[s];
    // Affixes are part of the key because reforging changes them in place.
    return it
      ? `${it.uid}.${it.refine}.${it.uniqueId ?? ''}.${it.affixes.map((a) => a.affixId + a.value).join('.')}`
      : '-';
  }).join(',');
  const a = hero.allocated;
  const skills = Object.entries(hero.skillLevels)
    .map(([id, l]) => `${id}${l}`)
    .join(',');
  const cards = Object.entries(hero.cards)
    .map(([id, n]) => `${id}${n}`)
    .join(',');
  const pet = hero.activePet ? `${hero.activePet}${hero.pets[hero.activePet] ?? 0}` : '';
  const collection = Object.entries(hero.collection)
    .map(([id, r]) => `${id}${r[0]}`)
    .join(',');
  const ups = Object.entries(hero.resets.upgrades)
    .map(([id, l]) => `${id}${l}`)
    .join(',');
  return `${hero.level}|${a.strength},${a.dexterity},${a.vitality},${a.energy}|${items}|${skills}|${ups}|${cards}|${collection}|${pet}|${hero.meal?.mealId ?? ''}`;
}

/** Derived stats of the hero. Cached per hero object; the cache key covers every input. */
export function heroStats(hero: Hero, content: ContentDb): HeroStats {
  const key = statsKey(hero);
  const hit = cache.get(hero);
  if (hit && hit.key === key) return hit.stats;
  const stats = computeHeroStats(hero, content);
  cache.set(hero, { key, stats });
  return stats;
}

export function computeHeroStats(hero: Hero, content: ContentDb): HeroStats {
  const mods: StatMods = {};
  const add = (from: StatMods) => {
    for (const k of Object.keys(from) as Stat[]) mods[k] = (mods[k] ?? 0) + (from[k] ?? 0);
  };
  let weapon: ItemStats | null = null;
  let armorDefense = 0;
  const uniques: UniqueEffect[] = [];
  const inactiveSlots: EquipmentSlot[] = [];
  for (const slot of EQUIPMENT_SLOTS) {
    const item = hero.equipment[slot];
    if (!item) continue;
    if (inactiveReason(hero, item, content)) {
      inactiveSlots.push(slot);
      continue;
    }
    const s = itemStats(item, content);
    add(s.mods);
    if (slot === 'weapon') weapon = s;
    armorDefense += s.defense ?? 0;
    const unique = item.uniqueId ? content.uniqueItems.get(item.uniqueId) : undefined;
    if (unique) uniques.push(unique.effect);
  }
  // Passive skills of the tree.
  for (const [id, level] of Object.entries(hero.skillLevels)) {
    const skill = content.skills.get(id);
    if (skill?.kind === 'passive' && level > 0) add({ [skill.stat]: skill.perLevel * level });
  }
  // Cards and completed regions.
  add(cardMods(hero, content));
  // The item collection and set bonuses.
  add(collectionMods(hero));
  add(setMods(hero, content));
  add(petMods(hero, content));
  // The meal under way.
  add(mealMods(hero, content));
  // Reset shop bonuses.
  add({
    xpPct: upgradeTotal(hero, content, 'xpPct'),
    goldPct: upgradeTotal(hero, content, 'goldPct'),
    magicFindPct: upgradeTotal(hero, content, 'magicFindPct'),
  });
  const m = (k: Stat) => mods[k] ?? 0;

  const base = baseAttributes(hero, content);
  const attributes: Attributes = {
    strength: base.strength + m('strength'),
    dexterity: base.dexterity + m('dexterity'),
    vitality: base.vitality + m('vitality'),
    energy: base.energy + m('energy'),
  };

  const flatLife =
    BASE_LIFE + attributes.vitality * LIFE_PER_VITALITY + hero.level * LIFE_PER_LEVEL + m('life');
  const maxHp = Math.floor((flatLife * (100 + m('lifePct'))) / 100);
  const maxMana = BASE_MANA + attributes.energy * MANA_PER_ENERGY + m('mana');

  const wMin = weapon?.damageMin ?? UNARMED.damageMin;
  const wMax = weapon?.damageMax ?? UNARMED.damageMax;
  const wAps = weapon?.attacksPerSecond ?? UNARMED.attacksPerSecond;
  const damagePct = 100 + attributes[primaryAttribute(content, hero)] + m('damagePct');
  const damageMin = Math.max(1, Math.floor(((wMin + m('damageFlat')) * damagePct) / 100));
  const damageMax = Math.max(damageMin, Math.floor(((wMax + m('damageFlat')) * damagePct) / 100));
  const attacksPerSecond = (wAps * (100 + m('attackSpeedPct'))) / 100;
  const attackIntervalTicks = Math.max(1, Math.ceil(TICKS_PER_SECOND / attacksPerSecond));

  const accuracyFlat = BASE_ACCURACY + hero.level * ACCURACY_PER_LEVEL + m('accuracy');
  const accuracy = Math.floor(
    (accuracyFlat * (1000 + attributes.dexterity * ACCURACY_PERMILLE_PER_DEXTERITY)) / 1000,
  );

  return {
    attributes,
    maxHp,
    maxMana,
    hpRegenPerSecond: 1 + Math.floor(maxHp / LIFE_REGEN_DIVISOR),
    manaRegenPerSecond: 1 + Math.floor(maxMana / MANA_REGEN_DIVISOR),
    damageMin,
    damageMax,
    attacksPerSecond,
    attackIntervalTicks,
    accuracy,
    evasion: BASE_EVASION + hero.level * EVASION_PER_LEVEL + m('evasion'),
    defense: Math.floor(((armorDefense + m('defense')) * (100 + m('defensePct'))) / 100),
    critChancePpm:
      BASE_CRIT_CHANCE_PPM +
      attributes.dexterity * CRIT_CHANCE_PPM_PER_DEXTERITY +
      m('critChancePct') * 10_000,
    critDamagePct: BASE_CRIT_DAMAGE_PCT + m('critDamagePct'),
    lifeLeechPct: m('lifeLeechPct'),
    skillDamagePermille: attributes.energy * SKILL_DAMAGE_PERMILLE_PER_ENERGY,
    xpPct: m('xpPct'),
    goldPct: m('goldPct'),
    magicFindPct: m('magicFindPct'),
    damageVsUndeadPct: m('damageVsUndeadPct'),
    uniques,
    cardLuckPct: uniques.reduce((n, u) => n + (u.kind === 'card_luck' ? u.pct : 0), 0),
    inactiveSlots,
  };
}
