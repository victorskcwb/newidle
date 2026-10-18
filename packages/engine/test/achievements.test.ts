import { describe, expect, it } from 'vitest';
import {
  achievementPoints,
  achievementProgress,
  checkAchievements,
  decodeSave,
  encodeSave,
  IntentError,
  setTitle,
} from '../src/index.ts';
import { content, newGame } from './fixture.ts';

const get = (id: string) => content.achievements.get(id)!;

describe('achievements', () => {
  it('unlock once when reached and stay unlocked', () => {
    const s = newGame();
    expect(checkAchievements(s, content)).toEqual([]);
    s.hero.level = 10;
    s.lifetime.kills = 1_000n;
    expect(checkAchievements(s, content).sort()).toEqual(['kills_1k', 'level_10']);
    expect(checkAchievements(s, content)).toEqual([]);
    s.hero.level = 1;
    expect(s.achievements.unlocked.level_10).toBeDefined();
    expect(achievementPoints(s, content)).toBe(get('level_10').points + get('kills_1k').points);
  });

  it('reads each kind from the state', () => {
    const s = newGame();
    s.hero.resets.count = 1;
    expect(achievementProgress(s, content, get('level_100'))).toBe(100);
    s.lifetime.itemsByRarity.legendary = 2;
    s.lifetime.itemsByRarity.epic = 3;
    expect(achievementProgress(s, content, get('items_epic'))).toBe(5);
    expect(achievementProgress(s, content, get('items_legendary'))).toBe(2);
    s.stash.push({
      uid: 99,
      baseId: s.hero.equipment.weapon!.baseId,
      ilvl: 1,
      rarity: 'common',
      affixes: [],
      refine: 11,
    });
    expect(achievementProgress(s, content, get('refine_10'))).toBe(11);
    s.bestiary.bone_walker = content.bestiaryTiers[2]!.kills;
    s.bestiary.grave_rat = content.bestiaryTiers[0]!.kills;
    expect(achievementProgress(s, content, get('bestiary_10'))).toBe(2);
    expect(achievementProgress(s, content, get('bestiary_t3_5'))).toBe(1);
    s.login.claimed = 7;
    expect(achievementProgress(s, content, get('login_7'))).toBe(7);
  });

  it('a title can be shown only once its achievement is unlocked', () => {
    const s = newGame();
    expect(() => setTitle(s, content, 'resets_1')).toThrow(IntentError);
    expect(() => setTitle(s, content, 'level_10')).toThrow(IntentError);
    s.hero.resets.count = 1;
    checkAchievements(s, content);
    setTitle(s, content, 'resets_1');
    expect(s.achievements.title).toBe('resets_1');
    setTitle(s, content, null);
    expect(s.achievements.title).toBeNull();
  });

  it('content titles and kinds are consistent', () => {
    for (const a of content.achievements.values()) {
      expect(a.target).toBeGreaterThan(0);
      if (a.kind === 'cards') expect(a.target).toBeLessThanOrEqual(content.cards.size);
      if (a.kind === 'bestiary') expect(a.target).toBeLessThanOrEqual(content.monsters.size);
    }
  });

  it('migrates v10 saves with nothing unlocked', () => {
    const s = newGame();
    const raw = JSON.parse(encodeSave(s, 1)) as {
      version: number;
      state: Record<string, unknown>;
    };
    raw.version = 10;
    raw.state.version = 10;
    delete raw.state.achievements;
    expect(decodeSave(JSON.stringify(raw), content).state).toEqual(s);
  });
});
