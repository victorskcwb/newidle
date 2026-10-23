import { describe, expect, it } from 'vitest';
import {
  buildContentDb,
  CONTENT_FILES,
  contentSchema,
  mergeContentFiles,
  type ContentDb,
  type Element,
} from '@abismo/content';
import {
  canonicalJson,
  heroStats,
  HERO_RESIST_CAP_PCT,
  resistancePct,
  step,
  type GameState,
} from '../src/index.ts';
import { content, hunting } from './fixture.ts';

/** Bundled content where the cemetery's monsters resist one element by `pct`. */
function cemeteryResisting(element: Element, pct: number): ContentDb {
  const merged = mergeContentFiles(Object.values(CONTENT_FILES));
  merged.monsters = merged.monsters.map((m) =>
    m.id === 'bone_walker' || m.id === 'grave_rat' ? { ...m, resistances: { [element]: pct } } : m,
  );
  return buildContentDb(merged);
}

/** A sorcerer (arcane basic attack) with the apprentice staff, hunting the cemetery. */
function sorcerer(db: ContentDb, seed = 21): GameState {
  const s = hunting(seed, db);
  s.hero.classId = 'sorcerer';
  s.hero.equipment.weapon = {
    uid: 9_999,
    baseId: 'staff_apprentice',
    ilvl: 1,
    rarity: 'common',
    affixes: [],
    refine: 0,
  };
  return s;
}

function damageDealt(s: GameState, db: ContentDb, ticks: number): number {
  let total = 0;
  for (const e of step(s, db, ticks)) {
    if (e.type === 'HeroAttack') for (const h of e.hits) total += h.damage;
  }
  return total;
}

describe('elemental resistances', () => {
  it('the content gives fire monsters fire resistance and an ice weakness', () => {
    const hound = content.monsters.get('ember_hound')!;
    expect(resistancePct(hound, 'fire')).toBe(50);
    expect(resistancePct(hound, 'ice')).toBe(-25);
    expect(resistancePct(hound, 'physical')).toBe(0);
  });

  it('no monster resists physical damage, so the warrior plays as before', () => {
    for (const m of content.monsters.values()) expect(m.resistances?.physical ?? 0).toBe(0);
  });

  it('a resisted element deals about that much less damage', () => {
    const plain = cemeteryResisting('arcane', 0);
    const resisting = cemeteryResisting('arcane', 50);
    const full = damageDealt(sorcerer(plain), plain, 600);
    const half = damageDealt(sorcerer(resisting), resisting, 600);
    expect(full).toBeGreaterThan(0);
    expect(half / full).toBeGreaterThan(0.35);
    expect(half / full).toBeLessThan(0.65);
  });

  it('a weakness deals more damage', () => {
    const plain = cemeteryResisting('arcane', 0);
    const weak = cemeteryResisting('arcane', -50);
    const base = damageDealt(sorcerer(plain), plain, 600);
    expect(damageDealt(sorcerer(weak), weak, 600)).toBeGreaterThan(base * 1.3);
  });

  it('other elements do not touch a hit (the warrior ignores a fire resistance)', () => {
    const fireproof = cemeteryResisting('fire', 90);
    expect(canonicalJson(step(hunting(4), content, 20_000))).toBe(
      canonicalJson(step(hunting(4, fireproof), fireproof, 20_000)),
    );
  });

  it('resistances are bounded in the content schema', () => {
    const merged = mergeContentFiles(Object.values(CONTENT_FILES));
    merged.monsters[0] = { ...merged.monsters[0]!, resistances: { fire: 95 } };
    expect(contentSchema.safeParse(merged).success).toBe(false);
  });
});

/** Bundled content where the cemetery's monsters attack with `element`. */
function cemeteryAttacking(element: Element): ContentDb {
  const merged = mergeContentFiles(Object.values(CONTENT_FILES));
  merged.monsters = merged.monsters.map((m) =>
    m.id === 'bone_walker' || m.id === 'grave_rat'
      ? { ...m, attack: { style: 'magic' as const, element } }
      : m,
  );
  return buildContentDb(merged);
}

/** The hero wearing a leather helm with one resistance affix of `pct`. */
function wearing(s: GameState, affixId: string, pct: number): GameState {
  s.hero.equipment.helm = {
    uid: 9_998,
    baseId: 'helm_leather',
    ilvl: 1,
    rarity: 'magic',
    affixes: [{ affixId, tier: 0, value: pct }],
    refine: 0,
  };
  return s;
}

function damageTaken(s: GameState, db: ContentDb, ticks: number): number {
  let total = 0;
  for (const e of step(s, db, ticks)) if (e.type === 'MonsterAttack') total += e.damage;
  return total;
}

describe('hero resistances (decision 171)', () => {
  it('a fire resistance halves the damage of fire attacks', () => {
    const fiery = cemeteryAttacking('fire');
    const plain = damageTaken(wearing(hunting(7, fiery), 'flat_defense', 0), fiery, 3_000);
    const resisted = damageTaken(wearing(hunting(7, fiery), 'fire_res', 50), fiery, 3_000);
    expect(plain).toBeGreaterThan(0);
    expect(resisted / plain).toBeGreaterThan(0.35);
    expect(resisted / plain).toBeLessThan(0.65);
  });

  it('a resistance to another element, or against physical attacks, changes nothing', () => {
    const fiery = cemeteryAttacking('fire');
    const none = wearing(hunting(8, fiery), 'flat_defense', 0);
    const ice = wearing(hunting(8, fiery), 'ice_res', 60);
    expect(canonicalJson(step(ice, fiery, 20_000))).toBe(canonicalJson(step(none, fiery, 20_000)));
    // The bundled cemetery attacks physically: any resistance plays like none.
    const a = wearing(hunting(9), 'flat_defense', 0);
    const b = wearing(hunting(9), 'fire_res', 60);
    expect(canonicalJson(step(b, content, 20_000))).toBe(canonicalJson(step(a, content, 20_000)));
  });

  it('resistance is capped', () => {
    const s = wearing(hunting(10), 'poison_res', 300);
    expect(heroStats(s.hero, content).resistPct.poison).toBe(HERO_RESIST_CAP_PCT);
    expect(heroStats(s.hero, content).resistPct.fire).toBe(0);
  });

  it('every resistance affix rolls only on armour and jewellery', () => {
    for (const id of ['fire_res', 'ice_res', 'poison_res', 'dark_res']) {
      const affix = content.affixes.get(id)!;
      expect(affix.slots).not.toContain('weapon');
      expect(affix.stat).toBe(id.replace('_res', 'ResPct'));
    }
  });
});
