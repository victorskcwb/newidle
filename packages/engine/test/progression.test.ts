import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BACKPACK_SIZE,
  SAVE_VERSION,
  IntentError,
  OFFLINE_CAP_TICKS,
  TICKS_PER_HOUR,
  backpackSize,
  buyUpgrade,
  computeHeroStats,
  debugSetLevel,
  decodeSave,
  encodeSave,
  learnBlock,
  learnSkill,
  offlineCapTicks,
  performReset,
  potionAmount,
  refineChancePpm,
  refineCost,
  refineItem,
  resetCost,
  resetPointsEarned,
  respecCost,
  respecSkills,
  salvageUpTo,
  setActiveSkill,
  setLootFilter,
  skillSlots,
  step,
  type GameEvent,
  type GameState,
  type ItemInstance,
} from '../src/index.ts';
import { content, hunting, newGame, ownedItemUids } from './fixture.ts';

function intentCode(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof IntentError) return e.code;
    throw e;
  }
  return 'ok';
}

describe('skill tree', () => {
  it('learns with points and prerequisites; actives fill the first free slot', () => {
    const s = newGame();
    expect(intentCode(() => learnSkill(s, content, 'heavy_strike'))).toBe('cannot_learn_no_points');
    s.hero.unspentSkillPoints = 10;
    learnSkill(s, content, 'heavy_strike');
    expect(s.hero.activeSkills[0]).toBe('heavy_strike');
    expect(learnBlock(s.hero, content.skills.get('whirlwind')!)).toEqual({
      kind: 'requires',
      skillId: 'heavy_strike',
      level: 3,
    });
    learnSkill(s, content, 'heavy_strike');
    learnSkill(s, content, 'heavy_strike');
    learnSkill(s, content, 'whirlwind');
    expect(s.hero.activeSkills.slice(0, 2)).toEqual(['heavy_strike', 'whirlwind']);
    expect(s.hero.unspentSkillPoints).toBe(6);
  });

  it('passives change stats', () => {
    const s = newGame();
    const before = computeHeroStats(s.hero, content);
    s.hero.skillLevels = { toughness: 5, sword_mastery: 2 };
    const after = computeHeroStats(s.hero, content);
    expect(after.maxHp).toBe(Math.floor((before.maxHp * 120) / 100));
    expect(after.damageMax).toBeGreaterThan(before.damageMax);
  });

  it('slot order is the priority; moving a skill swaps the slots', () => {
    const s = newGame();
    s.hero.skillLevels = { heavy_strike: 3, whirlwind: 1 };
    s.hero.activeSkills = ['heavy_strike', 'whirlwind', null, null];
    setActiveSkill(s, content, 0, 'whirlwind');
    expect(s.hero.activeSkills).toEqual(['whirlwind', 'heavy_strike', null, null]);
    expect(intentCode(() => setActiveSkill(s, content, 2, 'charge'))).toBe('skill_not_learned');
    expect(intentCode(() => setActiveSkill(s, content, 2, 'toughness'))).toBe(
      'not_an_active_skill',
    );
  });

  it('redistribution refunds all points; the price grows and is free after a reset', () => {
    const s = newGame();
    s.hero.skillLevels = { heavy_strike: 3, toughness: 2 };
    s.hero.activeSkills = ['heavy_strike', null, null, null];
    expect(respecCost(s.hero)).toBe(200n);
    expect(intentCode(() => respecSkills(s))).toBe('not_enough_gold');
    s.gold = 1000n;
    respecSkills(s);
    expect(s.hero.unspentSkillPoints).toBe(5);
    expect(s.hero.skillLevels).toEqual({});
    expect(s.hero.activeSkills).toEqual([null, null, null, null]);
    expect(respecCost(s.hero)).toBe(800n);
    s.hero.freeRespec = true;
    expect(respecCost(s.hero)).toBe(0n);
  });

  it('war cry buffs damage; charge stuns its target', () => {
    const s = hunting(3);
    s.hero.level = 20;
    s.hero.skillLevels = { heavy_strike: 1, war_cry: 1, whirlwind: 1, charge: 1 };
    s.hero.activeSkills = ['war_cry', 'charge', null, null];
    s.hero.mana = 500;
    s.hero.allocated.energy = 100;
    const events = step(s, content, 600);
    const attacks = events.filter(
      (e): e is Extract<GameEvent, { type: 'HeroAttack' }> => e.type === 'HeroAttack',
    );
    const cry = attacks.find((a) => a.skillId === 'war_cry');
    expect(cry?.hits).toEqual([]);
    expect(attacks.some((a) => a.skillId === 'charge')).toBe(true);
    expect(s.combat.buffUntil.war_cry).toBeGreaterThan(0);
  });

  it('a 5th skill slot opens at the 3rd reset', () => {
    const s = newGame();
    expect(skillSlots(s.hero)).toBe(4);
    s.hero.resets.count = 3;
    expect(skillSlots(s.hero)).toBe(5);
  });
});

function withMaterials(s: GameState) {
  s.gold = 1_000_000_000n;
  s.materials = {
    fragment: 10_000_000n,
    essence: 10_000_000n,
    crystal: 10_000_000n,
    core: 10_000_000n,
  };
}

describe('refine (section 7.5)', () => {
  it('chances follow the table', () => {
    const table = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15].map(refineChancePpm);
    expect(table).toEqual([1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 8e5, 7e5, 6e5, 5e5, 4e5, 2e5]);
  });

  it('costs gold and materials, growing with the level', () => {
    expect(refineCost(1)).toEqual({ gold: 150n, materials: { fragment: 3 } });
    expect(refineCost(12)).toEqual({
      gold: 21_600n,
      materials: { fragment: 36, essence: 7, crystal: 6, core: 4 },
    });
    // High item levels cost more gold.
    expect(refineCost(15, 93)).toEqual({
      gold: 627_750n,
      materials: { fragment: 45, essence: 10, crystal: 15, core: 10 },
    });
    const s = newGame();
    expect(intentCode(() => refineItem(s, content, 1))).toBe('refine_gold');
  });

  it('+1 to +6 always succeed; the item is never destroyed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.integer({ min: 1, max: 60 }),
        (seed, attempts) => {
          const s = newGame(seed);
          withMaterials(s);
          const uids = ownedItemUids(s);
          for (let i = 0; i < attempts; i++) {
            const before = s.hero.equipment.weapon!.refine;
            if (before >= 15) break;
            const r = refineItem(s, content, 1);
            if (before < 6) expect(r.success).toBe(true);
            if (!r.success && before + 1 < 10) expect(r.to).toBe(before);
            if (!r.success && before + 1 >= 10) expect(r.to).toBe(before - 1);
          }
          expect(ownedItemUids(s)).toEqual(uids);
          const refine = s.hero.equipment.weapon!.refine;
          expect(refine).toBeGreaterThanOrEqual(0);
          expect(refine).toBeLessThanOrEqual(15);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('success rates match the table and protection prevents the level loss', () => {
    const s = newGame();
    withMaterials(s);
    const item = s.hero.equipment.weapon!;
    let wins = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      item.refine = 9;
      if (refineItem(s, content, 1).success) wins++;
    }
    expect(wins / N).toBeCloseTo(0.5, 1);
    s.consumables.refine_charm = 1000;
    for (let i = 0; i < 200; i++) {
      item.refine = 12;
      const r = refineItem(s, content, 1, true);
      expect(r.to).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('reset (section 8.1)', () => {
  function maxed(): GameState {
    const s = hunting(9);
    debugSetLevel(s, content, 100);
    s.gold = 250_000n;
    s.hero.skillLevels = { heavy_strike: 5 };
    s.hero.unspentSkillPoints = 0;
    s.stash.push({
      uid: 900,
      baseId: 'helm_leather',
      ilvl: 5,
      rarity: 'rare',
      affixes: [],
      refine: 3,
    });
    s.materials.fragment = 77n;
    s.defeatedBosses.push('gravekeeper');
    s.hero.resets.newBossesThisCycle = 1;
    return s;
  }

  it('needs level 100 and 100,000 × n gold', () => {
    const s = newGame();
    expect(intentCode(() => performReset(s, content))).toBe('reset_level');
    expect(resetCost(s.hero)).toBe(100_000n);
    s.hero.resets.count = 2;
    expect(resetCost(s.hero)).toBe(300_000n);
  });

  it('resets level, attributes and skills; keeps items, materials, hunts and bosses', () => {
    const s = maxed();
    const items = ownedItemUids(s);
    expect(resetPointsEarned(s.hero)).toBe(12);
    // Later cycles are worth more: + 2 × resets already done.
    expect(resetPointsEarned({ ...s.hero, resets: { ...s.hero.resets, count: 3 } })).toBe(18);
    const { points } = performReset(s, content);
    expect(points).toBe(12);
    expect(s.hero.level).toBe(1);
    expect(s.hero.xp).toBe(0);
    expect(s.hero.allocated).toEqual({ strength: 0, dexterity: 0, vitality: 0, energy: 0 });
    expect(s.hero.skillLevels).toEqual({});
    expect(s.hero.freeRespec).toBe(true);
    expect(s.hero.resets).toMatchObject({ count: 1, points: 12, newBossesThisCycle: 0 });
    expect(ownedItemUids(s)).toEqual(items);
    expect(s.materials.fragment).toBe(77n);
    expect(s.defeatedBosses).toContain('gravekeeper');
    expect(s.gold).toBe(150_000n);
    // High-level gear stays equipped but inactive until the hero reaches its level.
    expect(computeHeroStats(s.hero, content).inactiveSlots).toEqual([]);
  });

  it('reset never deletes an item (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.integer({ min: 0, max: 30_000 }),
        (seed, ticks) => {
          const s = hunting(seed);
          step(s, content, ticks);
          debugSetLevel(s, content, 100);
          s.gold += 1_000_000n;
          const items = ownedItemUids(s);
          performReset(s, content);
          expect(ownedItemUids(s)).toEqual(items);
        },
      ),
      { numRuns: 15 },
    );
  });

  it('the reset shop opens after the first reset and applies its effects', () => {
    const s = maxed();
    expect(intentCode(() => buyUpgrade(s, content, 'wisdom'))).toBe('shop_locked');
    performReset(s, content);
    s.hero.resets.points = 100;
    const xpBefore = computeHeroStats(s.hero, content).xpPct;
    buyUpgrade(s, content, 'wisdom');
    buyUpgrade(s, content, 'wisdom');
    expect(s.hero.resets.points).toBe(100 - 4 - 4);
    expect(computeHeroStats(s.hero, content).xpPct).toBe(xpBefore + 20);
    buyUpgrade(s, content, 'deep_pack');
    expect(backpackSize(s.hero, content)).toBe(BACKPACK_SIZE + 5);
    buyUpgrade(s, content, 'patience');
    expect(offlineCapTicks(s.hero, content)).toBe(OFFLINE_CAP_TICKS + TICKS_PER_HOUR);
    const strength = computeHeroStats(s.hero, content).attributes.strength;
    buyUpgrade(s, content, 'ancestral_power');
    expect(computeHeroStats(s.hero, content).attributes.strength).toBe(strength + 5);
    buyUpgrade(s, content, 'master');
    expect(s.hero.unspentSkillPoints).toBe(1);
    buyUpgrade(s, content, 'automation');
    expect(intentCode(() => buyUpgrade(s, content, 'automation'))).toBe('upgrade_maxed');
  });

  it('"always keep affix" loot rules need Automação', () => {
    const s = newGame();
    const filter = { keepFromRarity: 'rare' as const, alwaysKeepAffixes: ['inc_xp'] };
    expect(intentCode(() => setLootFilter(s, content, filter))).toBe('needs_automation');
    s.hero.resets.upgrades.automation = 1;
    setLootFilter(s, content, filter);
    expect(s.settings.lootFilter).toEqual(filter);
  });
});

describe('first ten minutes and economy', () => {
  it('the 5th kill of a new hero always drops a magic item', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = hunting(seed);
      const events = step(s, content, TICKS_PER_HOUR / 6);
      let kills = 0;
      let found = false;
      for (const e of events) {
        if (e.type === 'MonsterDied') kills++;
        if (kills === 5 && e.type === 'ItemDropped' && e.item.rarity === 'magic') found = true;
        if (kills > 5) break;
      }
      expect(found, `seed ${seed}`).toBe(true);
      expect(s.flags).toContain('first_magic');
    }
  });

  it('potions restore a flat amount plus a share of the maximum', () => {
    const potion = content.consumables.get('potion_hp_small')!;
    expect(potionAmount(potion, 1000)).toBe(40 + 250);
  });

  it('bulk salvage takes everything up to a rarity, never equipped items', () => {
    const s = newGame();
    const mk = (uid: number, rarity: ItemInstance['rarity']): ItemInstance => ({
      uid,
      baseId: 'boots_worn',
      ilvl: 1,
      rarity,
      affixes: [],
      refine: 0,
    });
    s.backpack.push(mk(10, 'common'), mk(11, 'rare'));
    s.stash.push(mk(12, 'magic'), mk(13, 'epic'));
    const r = salvageUpTo(s, content, 'magic');
    expect(r.count).toBe(2);
    expect(ownedItemUids(s)).toEqual([1, 11, 13]);
    expect(s.materials.fragment).toBeGreaterThan(0n);
    expect(s.materials.essence).toBeGreaterThan(0n);
  });
});

describe('save migration v1 → v2', () => {
  it('loads a version 1 save with every v2 field defaulted', () => {
    const s = hunting(4);
    step(s, content, 5_000);
    // Build what a version 1 save looked like (before the skill tree and resets).
    const v1 = JSON.parse(encodeSave(s, 123)) as {
      version: number;
      state: Record<string, Record<string, unknown>>;
    };
    v1.version = 1;
    v1.state.version = 1 as unknown as Record<string, unknown>;
    delete v1.state.hero!.respecs;
    delete v1.state.hero!.freeRespec;
    delete v1.state.hero!.resets;
    delete v1.state.combat!.buffUntil;
    delete (v1.state as Record<string, unknown>).flags;
    const loaded = decodeSave(JSON.stringify(v1), content);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.state.hero.resets).toEqual({
      count: 0,
      points: 0,
      upgrades: {},
      newBossesThisCycle: 0,
    });
    expect(loaded.state.flags).toEqual(s.lifetime.kills >= 5n ? ['first_magic'] : []);
    expect(loaded.state.hero.level).toBe(s.hero.level);
    expect(loaded.state.stash).toEqual(s.stash);
  });
});
