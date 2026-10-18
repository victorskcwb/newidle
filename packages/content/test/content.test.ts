import { readFileSync } from 'node:fs';
import { hasKey } from '@abismo/i18n';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_FILES,
  ContentError,
  buildContentDb,
  loadContent,
  mergeContentFiles,
  tiledMapSchema,
  translationKeys,
  validateHuntMap,
  type TiledMap,
} from '../src/index.ts';

const merged = () => structuredClone(mergeContentFiles(Object.values(CONTENT_FILES)));

function problemsOf(raw: unknown): string[] {
  try {
    buildContentDb(raw);
    return [];
  } catch (e) {
    if (e instanceof ContentError) return [...e.problems];
    throw e;
  }
}

describe('bundled content', () => {
  it('is valid and complete for the first hunt', () => {
    const c = loadContent();
    expect(c.hunts.get('forgotten_cemetery')).toBeDefined();
    expect(c.monsters.size).toBe(35);
    expect(c.itemBases.size).toBe(40);
    expect(c.affixes.size).toBe(20);
  });

  it('has pt-BR text for every key it references', () => {
    const missing = translationKeys(loadContent()).filter((k) => !hasKey(k));
    expect(missing).toEqual([]);
  });
});

describe('validation', () => {
  it('rejects duplicate ids', () => {
    const c = merged();
    c.monsters.push(c.monsters[0]!);
    expect(problemsOf(c)).toContain('duplicate monster id "bone_walker"');
  });

  it('rejects unknown references', () => {
    const c = merged();
    c.monsters[0]!.lootTableId = 'nope';
    c.hunts[0]!.spawns.push({ monsterId: 'ghost', weight: 1 });
    const problems = problemsOf(c);
    expect(problems).toContain('monster bone_walker: unknown lootTableId nope');
    expect(problems).toContain('hunt forgotten_cemetery: unknown spawn monsterId ghost');
  });

  it('rejects schema violations with the path', () => {
    const c = merged();
    (c.affixes[0] as { weight: number }).weight = -1;
    expect(problemsOf(c).some((p) => p.startsWith('affixes.0.weight'))).toBe(true);
  });

  it('rejects a boss used as a regular spawn', () => {
    const c = merged();
    c.hunts[0]!.spawns.push({ monsterId: 'gravekeeper', weight: 1 });
    expect(problemsOf(c)).toContain(
      'hunt forgotten_cemetery: boss gravekeeper listed as a regular spawn',
    );
  });
});

describe('skill tree validation', () => {
  it('rejects unknown prerequisites and cycles', () => {
    const c = merged();
    const strike = c.skills.find((sk) => sk.id === 'heavy_strike')!;
    strike.requires = [{ skillId: 'charge', level: 1 }];
    const problems = problemsOf(c);
    expect(problems).toContain('skill heavy_strike: prerequisite cycle');
    const c2 = merged();
    c2.skills[0]!.requires = [{ skillId: 'nope', level: 1 }];
    expect(problemsOf(c2)).toContain(`skill ${c2.skills[0]!.id}: unknown required skill nope`);
  });
});

describe('hunt maps', () => {
  const load = (): TiledMap =>
    tiledMapSchema.parse(
      JSON.parse(
        readFileSync(
          new URL('../../../assets/maps/forgotten_cemetery.tmj', import.meta.url),
          'utf8',
        ),
      ),
    );

  it('every hunt map is valid: layers, numbered route, everything reachable', () => {
    for (const hunt of loadContent().hunts.values()) {
      const map = tiledMapSchema.parse(
        JSON.parse(
          readFileSync(new URL(`../../../assets/${hunt.mapId}.tmj`, import.meta.url), 'utf8'),
        ),
      );
      expect(validateHuntMap(map, hunt.routeLayer), hunt.id).toEqual([]);
    }
  });

  it('hunts form one unlock chain through the three regions', () => {
    const hunts = [...loadContent().hunts.values()];
    expect(hunts).toHaveLength(9);
    expect(hunts.filter((h) => h.startUnlocked).map((h) => h.id)).toEqual(['forgotten_cemetery']);
    for (let i = 0; i + 1 < hunts.length; i++) expect(hunts[i]!.unlocks).toBe(hunts[i + 1]!.id);
    expect(new Set(hunts.map((h) => h.regionId)).size).toBe(3);
  });

  it('detects an unreachable waypoint', () => {
    const map = load();
    const collision = map.layers.find((l) => l.name === 'collision');
    const route = map.layers.find((l) => l.name === 'route');
    if (collision?.type !== 'tilelayer' || route?.type !== 'objectgroup') throw new Error('layers');
    const wp = route.objects.find((o) => o.name === 'wp_3')!;
    const tx = Math.floor(wp.x / 32);
    const ty = Math.floor(wp.y / 32);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      collision.data[(ty + dy) * map.width + tx + dx] = 10;
    }
    expect(validateHuntMap(map, 'route')).toContain('wp_3 is not reachable from wp_1');
  });
});
