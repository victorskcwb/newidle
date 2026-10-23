import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  conditionHolds,
  decodeSave,
  encodeSave,
  IntentError,
  ruleAllows,
  setSkillRule,
  step,
  type GameEvent,
  type GameState,
  type MonsterInstance,
  type RuleContext,
} from '../src/index.ts';
import { content, hunting } from './fixture.ts';

function monster(over: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    uid: 1,
    monsterId: 'bone_walker',
    elite: false,
    boss: false,
    hp: 50,
    maxHp: 100,
    damageMin: 1,
    damageMax: 2,
    attackIntervalTicks: 10,
    nextAttackTick: 0,
    affixes: [],
    ...over,
  };
}

function ctx(over: Partial<RuleContext> = {}): RuleContext {
  return {
    heroHp: 40,
    heroMaxHp: 100,
    heroMana: 80,
    heroMaxMana: 100,
    target: monster(),
    enemies: 2,
    ...over,
  };
}

/** A warrior hunting the cemetery with Heavy Strike learned in the first action slot. */
function striker(seed: number): GameState {
  const s = hunting(seed);
  s.hero.skillLevels.heavy_strike = 1;
  s.hero.activeSkills[0] = 'heavy_strike';
  return s;
}

const strikes = (events: GameEvent[]) =>
  events.filter((e) => e.type === 'HeroAttack' && e.skillId === 'heavy_strike').length;

describe('skill rule conditions', () => {
  it('compare life and mana strictly, like the potion setting', () => {
    expect(conditionHolds({ kind: 'hero_hp', op: 'below', pct: 50 }, ctx())).toBe(true);
    expect(conditionHolds({ kind: 'hero_hp', op: 'below', pct: 40 }, ctx())).toBe(false);
    expect(conditionHolds({ kind: 'hero_hp', op: 'above', pct: 40 }, ctx())).toBe(false);
    expect(conditionHolds({ kind: 'hero_mana', op: 'above', pct: 50 }, ctx())).toBe(true);
    expect(conditionHolds({ kind: 'target_hp', op: 'below', pct: 51 }, ctx())).toBe(true);
    expect(conditionHolds({ kind: 'target_hp', op: 'below', pct: 51 }, ctx({ target: null }))).toBe(
      false,
    );
  });

  it('count the living enemies and tell bosses, elites and normal monsters apart', () => {
    expect(conditionHolds({ kind: 'enemies', op: 'at_least', count: 2 }, ctx())).toBe(true);
    expect(conditionHolds({ kind: 'enemies', op: 'at_least', count: 3 }, ctx())).toBe(false);
    expect(conditionHolds({ kind: 'enemies', op: 'at_most', count: 2 }, ctx())).toBe(true);
    const boss = ctx({ target: monster({ boss: true }) });
    const elite = ctx({ target: monster({ elite: true }) });
    expect(conditionHolds({ kind: 'target', is: 'boss' }, boss)).toBe(true);
    expect(conditionHolds({ kind: 'target', is: 'boss' }, elite)).toBe(false);
    expect(conditionHolds({ kind: 'target', is: 'elite' }, elite)).toBe(true);
    expect(conditionHolds({ kind: 'target', is: 'normal' }, ctx())).toBe(true);
    expect(conditionHolds({ kind: 'target', is: 'normal' }, boss)).toBe(false);
  });

  it('combine with all / any, and no rule always allows', () => {
    const low = { kind: 'hero_hp', op: 'below', pct: 50 } as const;
    const many = { kind: 'enemies', op: 'at_least', count: 3 } as const;
    expect(ruleAllows(undefined, ctx())).toBe(true);
    expect(ruleAllows({ logic: 'all', conditions: [] }, ctx())).toBe(true);
    expect(ruleAllows({ logic: 'all', conditions: [low, many] }, ctx())).toBe(false);
    expect(ruleAllows({ logic: 'any', conditions: [low, many] }, ctx())).toBe(true);
  });
});

describe('skill rules in the hunt', () => {
  it('a skill whose rule never holds is never used, and the hero keeps fighting', () => {
    const free = striker(5);
    expect(strikes(step(free, content, 20_000))).toBeGreaterThan(0);

    const ruled = striker(5);
    setSkillRule(ruled, content, 'heavy_strike', {
      logic: 'all',
      conditions: [{ kind: 'hero_hp', op: 'below', pct: 1 }],
    });
    const events = step(ruled, content, 20_000);
    expect(strikes(events)).toBe(0);
    expect(events.filter((e) => e.type === 'MonsterDied').length).toBeGreaterThan(20);
  });

  it('"at least 2 enemies" only lets the skill out against 2 or more living monsters', () => {
    const s = striker(8);
    setSkillRule(s, content, 'heavy_strike', {
      logic: 'all',
      conditions: [{ kind: 'enemies', op: 'at_least', count: 2 }],
    });
    const alive = new Set<number>();
    let used = 0;
    for (const e of step(s, content, 40_000)) {
      if (e.type === 'GroupSpawned') {
        alive.clear();
        for (const m of e.monsters) alive.add(m.uid);
      }
      if (e.type === 'HeroAttack' && e.skillId === 'heavy_strike') {
        expect(alive.size).toBeGreaterThanOrEqual(2);
        used++;
      }
      if (e.type === 'MonsterDied') alive.delete(e.uid);
    }
    expect(used).toBeGreaterThan(0);
  });

  it('checking a rule draws nothing from the RNG: an always-true rule plays like no rule', () => {
    const a = striker(13);
    const b = striker(13);
    setSkillRule(b, content, 'heavy_strike', {
      logic: 'any',
      conditions: [{ kind: 'enemies', op: 'at_least', count: 1 }],
    });
    expect(canonicalJson(step(a, content, 30_000))).toBe(canonicalJson(step(b, content, 30_000)));
  });

  it('validates rules and clears them with null or no conditions', () => {
    const s = striker(1);
    const bad = (rule: unknown) => () =>
      setSkillRule(s, content, 'heavy_strike', rule as Parameters<typeof setSkillRule>[3]);
    expect(bad({ logic: 'all', conditions: [{ kind: 'hero_hp', op: 'below', pct: 0 }] })).toThrow(
      IntentError,
    );
    expect(
      bad({ logic: 'all', conditions: [{ kind: 'enemies', op: 'at_least', count: 9 }] }),
    ).toThrow(IntentError);
    expect(bad({ logic: 'xor', conditions: [{ kind: 'target', is: 'boss' }] })).toThrow(
      IntentError,
    );
    const four = Array.from({ length: 4 }, () => ({ kind: 'target', is: 'boss' }));
    expect(bad({ logic: 'all', conditions: four })).toThrow(IntentError);
    expect(() => setSkillRule(s, content, 'sword_mastery', null)).toThrow(IntentError);

    setSkillRule(s, content, 'heavy_strike', {
      logic: 'all',
      conditions: [{ kind: 'target', is: 'boss' }],
    });
    expect(s.settings.skillRules.heavy_strike).toBeDefined();
    setSkillRule(s, content, 'heavy_strike', { logic: 'any', conditions: [] });
    expect(s.settings.skillRules.heavy_strike).toBeUndefined();
  });

  it('rules survive a save and load', () => {
    const s = striker(2);
    setSkillRule(s, content, 'heavy_strike', {
      logic: 'any',
      conditions: [
        { kind: 'target', is: 'elite' },
        { kind: 'target_hp', op: 'above', pct: 80 },
      ],
    });
    const loaded = decodeSave(encodeSave(s, 1), content);
    expect(loaded.state.settings.skillRules).toEqual(s.settings.skillRules);
  });
});
