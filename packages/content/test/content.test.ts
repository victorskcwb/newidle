import { hasKey } from '@valdren/i18n';
import { describe, expect, it } from 'vitest';
import {
  bundledRawContent,
  buildContentDb,
  contentTranslationKeys,
  ContentError,
  loadBundledContent,
  SKILL_IDS,
  type RawContent,
} from '../src/index.ts';

const raw = () => JSON.parse(JSON.stringify(bundledRawContent)) as RawContent;

describe('bundled content', () => {
  it('is valid', () => {
    const db = loadBundledContent();
    expect(db.actions.get('mine_copper')?.xpTenths).toBe(25);
    expect(db.items.get('dagger_bronze')?.equip?.slot).toBe('weapon');
  });

  it('has a pt-BR translation for every name and skill', () => {
    const db = loadBundledContent();
    const keys = [...contentTranslationKeys(db), ...SKILL_IDS.map((s) => `skill.${s}`)];
    expect(keys.filter((k) => !hasKey(k))).toEqual([]);
  });

  it('declares scene data for every action', () => {
    for (const action of loadBundledContent().raw.actions) {
      expect(action.scene.prop).toMatch(/^props\//);
    }
  });

  it('lists entries sorted by id', () => {
    const ids = loadBundledContent().raw.items.map((i) => i.id);
    expect(ids).toEqual([...ids].sort());
  });
});

describe('validation', () => {
  it('rejects broken cross references', () => {
    const bad = raw();
    bad.actions[0]!.outputs[0]!.itemId = 'ore_unobtainium';
    bad.actions[1]!.regionId = 'atlantis';
    expect(() => buildContentDb(bad)).toThrow(ContentError);
    try {
      buildContentDb(bad);
    } catch (e) {
      const issues = (e as ContentError).issues.join('\n');
      expect(issues).toContain('ore_unobtainium');
      expect(issues).toContain('atlantis');
    }
  });

  it('rejects duplicate ids and unknown skills', () => {
    const dup = raw();
    dup.items.push({ ...dup.items[0]! });
    expect(() => buildContentDb(dup)).toThrow(/duplicate item/);
    const skill = raw() as unknown as { actions: { skill: string }[] };
    skill.actions[0]!.skill = 'juggling';
    expect(() => buildContentDb(skill)).toThrow(ContentError);
  });

  it('rejects tools that no item provides', () => {
    const bad = raw();
    bad.items = bad.items.filter((i) => i.tool?.type !== 'pickaxe');
    expect(() => buildContentDb(bad)).toThrow(/no item provides tool "pickaxe"/);
  });
});
