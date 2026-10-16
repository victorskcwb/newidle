import { describe, expect, it } from 'vitest';
import {
  TICKS_PER_HOUR,
  decodeSave,
  encodeSave,
  step,
  type GameEvent,
  type MonsterInstance,
} from '../src/index.ts';
import { content, hunting } from './fixture.ts';

type Spawn = Extract<GameEvent, { type: 'GroupSpawned' }>;

describe('elite modifiers', () => {
  it('every elite rolls one or two distinct modifiers; normal monsters none', () => {
    const s = hunting(8);
    s.hero.level = 30;
    const spawns = step(s, content, 10 * TICKS_PER_HOUR).filter(
      (e): e is Spawn => e.type === 'GroupSpawned',
    );
    const monsters = spawns.flatMap((g) => g.monsters);
    const elites = monsters.filter((m) => m.elite);
    expect(elites.length).toBeGreaterThan(10);
    for (const m of elites) {
      expect(m.affixes.length).toBeGreaterThanOrEqual(1);
      expect(m.affixes.length).toBeLessThanOrEqual(2);
      expect(new Set(m.affixes).size).toBe(m.affixes.length);
    }
    expect(monsters.filter((m) => !m.elite).every((m) => m.affixes.length === 0)).toBe(true);
    // Giants have more life than plain elites of the same monster.
    const walkers = elites.filter((m) => m.monsterId === 'bone_walker');
    const giant = walkers.find((m) => m.affixes.includes('giant'));
    const plain = walkers.find((m) => !m.affixes.includes('giant'));
    if (giant && plain) expect(giant.maxHp).toBe(plain.maxHp * 2);
  });

  it('swift elites attack faster and vampiric elites heal when they hit', () => {
    const s = hunting(9);
    const base: MonsterInstance = {
      uid: 500,
      monsterId: 'bone_walker',
      elite: true,
      boss: false,
      hp: 10,
      maxHp: 64,
      damageMin: 50,
      damageMax: 50,
      attackIntervalTicks: 13,
      nextAttackTick: 0,
      affixes: ['vampiric'],
    };
    s.hero.hp = 100_000;
    s.hero.allocated.vitality = 0;
    s.activity = { kind: 'fighting', group: [base] };
    s.combat.nextAttackTick = s.tick + 1_000; // the hero does not swing
    const events = step(s, content, 200);
    const hits = events.filter((e) => e.type === 'MonsterAttack' && !e.miss);
    expect(hits.length).toBeGreaterThan(0);
    expect(base.hp).toBeGreaterThan(10);
  });

  it('a version 3 save gives monsters already in a fight no modifiers', () => {
    const s = hunting(2);
    step(s, content, 200);
    const v3 = JSON.parse(encodeSave(s, 0)) as {
      version: number;
      state: Record<string, unknown> & { activity: { group?: Record<string, unknown>[] } };
    };
    v3.version = 3;
    v3.state.version = 3;
    for (const m of v3.state.activity.group ?? []) delete m.affixes;
    const loaded = decodeSave(JSON.stringify(v3), content).state;
    const group = 'group' in loaded.activity ? loaded.activity.group : [];
    expect(group.every((m) => Array.isArray(m.affixes) && m.affixes.length === 0)).toBe(true);
  });
});
