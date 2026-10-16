import { describe, expect, it } from 'vitest';
import {
  BACKPACK_SIZE,
  MAX_CONSECUTIVE_AUTO_RETURNS,
  TICKS_PER_HOUR,
  heroStats,
  returnToTown,
  startHunt,
  step,
  type GameEvent,
  type GameState,
} from '../src/index.ts';
import { HUNT, content, contentWithUnlock, hunting, newGame } from './fixture.ts';

function ofType<T extends GameEvent['type']>(events: GameEvent[], type: T) {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

describe('hunt simulation', () => {
  it('spawns groups, fights, kills and loots', () => {
    const s = hunting(1);
    const events = step(s, content, 10 * 60 * 10);
    const spawned = ofType(events, 'GroupSpawned');
    expect(spawned.length).toBeGreaterThan(10);
    for (const g of spawned) {
      expect(g.monsters.length).toBeGreaterThanOrEqual(1);
      expect(g.monsters.length).toBeLessThanOrEqual(3);
      expect(g.engageTick - g.tick).toBe(30); // 3 s walk
    }
    expect(ofType(events, 'MonsterDied').length).toBeGreaterThan(20);
    expect(ofType(events, 'HeroAttack').length).toBeGreaterThan(50);
    expect(s.hero.level).toBeGreaterThan(1);
    expect(s.lifetime.kills).toBeGreaterThan(20n);
  });

  it('returns to town with a full backpack, deposits and comes back', () => {
    const s = hunting(2);
    for (let i = 0; i < BACKPACK_SIZE - 1; i++) {
      s.backpack.push({
        uid: 10_000 + i,
        baseId: 'boots_worn',
        ilvl: 1,
        rarity: 'common',
        affixes: [],
        refine: 0,
      });
    }
    const events = step(s, content, TICKS_PER_HOUR / 2);
    const trip = ofType(events, 'TownTripStarted')[0];
    expect(trip?.reason).toBe('backpack_full');
    const arrived = ofType(events, 'ArrivedInTown')[0]!;
    expect(arrived.tick).toBe(trip!.arriveTick);
    expect(arrived.deposited).toBe(BACKPACK_SIZE);
    expect(arrived.leaveTick).not.toBeNull();
    expect(ofType(events, 'ReturningToHunt').length).toBeGreaterThan(0);
    expect(s.stash.length).toBeGreaterThanOrEqual(BACKPACK_SIZE);
  });

  it('buys potions in town up to the target', () => {
    const s = hunting(3);
    s.consumables.potion_hp_small = 0;
    s.gold = 1000n;
    s.settings.returnWhenOutOfPotions = true;
    const events = step(s, content, TICKS_PER_HOUR / 4);
    const trip = ofType(events, 'TownTripStarted')[0]!;
    expect(trip.reason).toBe('no_potions');
    const arrived = ofType(events, 'ArrivedInTown')[0]!;
    expect(arrived.potionsBought).toBe(s.settings.potionTarget);
  });

  it('death costs 10% of the level XP, never a level, never items', () => {
    const s = hunting(4);
    s.hero.level = 5;
    s.hero.xp = 100;
    s.consumables = {};
    s.hero.hp = 1;
    const itemsBefore = s.hero.equipment.weapon!.uid;
    let events: GameEvent[] = [];
    for (let i = 0; i < 200 && ofType(events, 'HeroDied').length === 0; i++) {
      s.hero.hp = Math.min(s.hero.hp, 1);
      events = step(s, content, 10);
    }
    const died = ofType(events, 'HeroDied')[0]!;
    expect(died.xpLost).toBe(10);
    expect(s.hero.level).toBe(5);
    expect(s.hero.equipment.weapon!.uid).toBe(itemsBefore);
    expect(s.activity.kind).toBe('dead');
  });

  it(`stops after ${MAX_CONSECUTIVE_AUTO_RETURNS} automatic returns in a row`, () => {
    const s = hunting(5);
    s.consumables = {};
    s.settings.returnWhenOutOfPotions = false;
    s.settings.potionTarget = 0;
    const deaths: GameEvent[] = [];
    let stopped: GameEvent | undefined;
    for (let i = 0; i < 2000 && !stopped; i++) {
      s.hero.hp = Math.min(s.hero.hp, 1);
      const events = step(s, content, 10);
      deaths.push(...ofType(events, 'HeroDied'));
      stopped = ofType(events, 'HuntStopped')[0];
    }
    expect(stopped).toMatchObject({ reason: 'too_many_deaths' });
    expect(deaths.length).toBe(MAX_CONSECUTIVE_AUTO_RETURNS + 1);
    expect(s.activity.kind).toBe('idle_town');
  });

  it('spawns the boss every N kills and unlocks the next hunt on the first win', () => {
    const db = contentWithUnlock();
    const s = hunting(6, db);
    s.hero.level = 30;
    s.hero.allocated.strength = 100;
    s.hero.allocated.vitality = 100;
    const events = step(s, db, TICKS_PER_HOUR / 4);
    const boss = ofType(events, 'GroupSpawned').find((g) => g.monsters.some((m) => m.boss));
    expect(boss?.monsters).toHaveLength(1);
    const defeated = ofType(events, 'BossDefeated');
    expect(defeated[0]?.firstTime).toBe(true);
    expect(defeated[1]?.firstTime).toBe(false);
    expect(ofType(events, 'HuntUnlocked')).toEqual([
      expect.objectContaining({ huntId: 'test_hunt' }),
    ]);
    expect(s.unlockedHunts).toContain('test_hunt');
  });

  it('manual return goes to town and stays there', () => {
    const s = hunting(7);
    step(s, content, 100);
    returnToTown(s, content);
    const events = step(s, content, 400);
    expect(ofType(events, 'HuntStopped')).toEqual([expect.objectContaining({ reason: 'manual' })]);
    expect(s.activity.kind).toBe('idle_town');
    startHunt(s, content, HUNT);
    expect(s.activity.kind).toBe('to_hunt');
  });

  it('rejects locked hunts', () => {
    const db = contentWithUnlock();
    const s: GameState = newGame(1, db);
    expect(() => startHunt(s, db, 'test_hunt')).toThrow('hunt_locked');
  });

  it('level ups refill life and grant points', () => {
    const s = hunting(8);
    s.hero.autoAllocate = 'off';
    const events = step(s, content, TICKS_PER_HOUR / 6);
    const ups = ofType(events, 'LevelUp');
    expect(ups.length).toBeGreaterThan(0);
    const levels = s.hero.level - 1;
    expect(s.hero.unspentAttributePoints).toBe(levels * 5);
    expect(s.hero.unspentSkillPoints).toBe(Math.floor(s.hero.level / 2));
    expect(heroStats(s.hero, content).maxHp).toBeGreaterThan(0);
  });
});
