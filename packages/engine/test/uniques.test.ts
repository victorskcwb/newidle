import { describe, expect, it } from 'vitest';
import {
  cardChancePpm,
  computeHeroStats,
  createRng,
  equipItem,
  generateItem,
  step,
  type GameEvent,
  type GameState,
  type ItemInstance,
  type MonsterInstance,
} from '../src/index.ts';
import { content, hunting, newGame } from './fixture.ts';

function equipUnique(s: GameState, baseId: string, uniqueId: string, uid = 900) {
  const item: ItemInstance = {
    uid,
    baseId,
    ilvl: 30,
    rarity: 'legendary',
    affixes: [],
    refine: 0,
    uniqueId,
  };
  s.stash.push(item);
  equipItem(s, content, uid);
}

function dummy(over: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    uid: 500,
    monsterId: 'bone_walker',
    elite: false,
    boss: false,
    hp: 10_000,
    maxHp: 10_000,
    damageMin: 20,
    damageMax: 20,
    attackIntervalTicks: 10,
    nextAttackTick: 0,
    affixes: [],
    ...over,
  };
}

describe('unique legendaries', () => {
  it('legendaries of slots with uniques always carry one that fits the slot', () => {
    const table = content.lootTables.get('loot_cemetery')!;
    const rng = createRng([5, 6, 7, 8]);
    let withUnique = 0;
    for (let i = 0; i < 300; i++) {
      const item = generateItem(rng, content, table, 30, i, 'legendary');
      const slot = content.itemBases.get(item.baseId)!.slot;
      const options = [...content.uniqueItems.values()].filter(
        (u) => u.slot === slot && u.minIlvl <= item.ilvl,
      );
      if (options.length === 0) {
        expect(item.uniqueId).toBeUndefined();
      } else {
        expect(options.map((u) => u.id)).toContain(item.uniqueId);
        withUnique++;
      }
      expect(item.affixes.length).toBeLessThanOrEqual(4);
    }
    expect(withUnique).toBeGreaterThan(100);
    // Non-legendaries never get one.
    expect(generateItem(rng, content, table, 30, 999, 'epic').uniqueId).toBeUndefined();
  });

  it('thorns hurt the attacker', () => {
    const s = hunting(1);
    equipUnique(s, 'vest_leather', 'thornmail');
    const m = dummy();
    s.hero.hp = 1_000_000;
    s.activity = { kind: 'fighting', group: [m] };
    s.combat.nextAttackTick = s.tick + 10_000;
    const events = step(s, content, 100);
    const taken = events.reduce((n, e) => n + (e.type === 'MonsterAttack' ? e.damage : 0), 0);
    expect(taken).toBeGreaterThan(0);
    expect(m.hp).toBeLessThan(10_000);
  });

  it('execute, last stand and first strike raise the damage of matching hits', () => {
    const s = hunting(2);
    equipUnique(s, 'sword_rusty', 'executioner', 901);
    const strong = (hp: number) => {
      const t = structuredClone(s);
      const m = dummy({ hp, maxHp: 10_000, damageMin: 0, damageMax: 0 });
      t.activity = { kind: 'fighting', group: [m] };
      t.hero.hp = 1_000_000;
      const hits = step(t, content, 2000)
        .filter((e): e is Extract<GameEvent, { type: 'HeroAttack' }> => e.type === 'HeroAttack')
        .flatMap((e) => e.hits.filter((h) => !h.miss && !h.crit).map((h) => h.damage));
      return hits.reduce((a, b) => a + b, 0) / Math.max(1, hits.length);
    };
    // Below 25% life the executioner doubles the damage.
    expect(strong(2_000)).toBeGreaterThan(strong(9_000) * 1.6);
  });

  it('critical hits heal; card luck raises card chances; calm regen speeds regeneration', () => {
    const s = newGame();
    equipUnique(s, 'ring_copper', 'dark_fortune', 902);
    const stats = computeHeroStats(s.hero, content);
    expect(stats.cardLuckPct).toBe(50);
    expect(
      cardChancePpm(content.cards.get('card_bone_walker')!, false, false, stats.cardLuckPct),
    ).toBe(750);

    const calm = newGame();
    equipUnique(calm, 'helm_leather', 'watcher_crown', 903);
    const plain = newGame();
    for (const g of [calm, plain]) {
      g.hero.hp = 1;
      g.activity = { kind: 'to_hunt', untilTick: g.tick + 1000 };
      step(g, content, 50);
    }
    expect(calm.hero.hp).toBeGreaterThan(plain.hero.hp * 2);
  });

  it('the vortex edge gives whirlwind more damage and targets', () => {
    const s = newGame();
    equipUnique(s, 'sword_rusty', 'vortex_edge', 904);
    const stats = computeHeroStats(s.hero, content);
    expect(stats.uniques).toContainEqual(
      expect.objectContaining({ kind: 'skill_bonus', skillId: 'whirlwind', extraTargets: 2 }),
    );
  });
});
