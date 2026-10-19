import { describe, expect, it } from 'vitest';
import {
  automationUnlocked,
  bestHuntFor,
  computeRates,
  decodeSave,
  encodeSave,
  IntentError,
  resolveOffline,
  setAutomation,
  stepQuiet,
  TICKS_PER_HOUR,
  type ItemInstance,
} from '../src/index.ts';
import { content, HUNT, hunting, newGame } from './fixture.ts';

/** A sword clearly better than the starting one, waiting in the stash. */
function betterSword(s: ReturnType<typeof newGame>): ItemInstance {
  const item: ItemInstance = {
    uid: 9_999,
    baseId: s.hero.equipment.weapon!.baseId,
    ilvl: 5,
    rarity: 'rare',
    affixes: [],
    refine: 10,
  };
  s.stash.push(item);
  return item;
}

describe('automations', () => {
  it('unlock with progress and cannot be switched on before', () => {
    const s = newGame();
    expect(automationUnlocked(s, 'equipBest')).toBe(false);
    expect(() => setAutomation(s, 'equipBest', true)).toThrow(IntentError);
    s.hero.level = 10;
    setAutomation(s, 'equipBest', true);
    expect(automationUnlocked(s, 'bestHunt')).toBe(false);
    s.defeatedBosses = ['a', 'b', 'c'];
    setAutomation(s, 'bestHunt', true);
    expect(s.settings.automation).toEqual({ equipBest: true, bestHunt: true });
  });

  it('auto-equip puts on a better item at the next town visit', () => {
    const s = hunting(3);
    s.hero.level = 10;
    setAutomation(s, 'equipBest', true);
    const sword = betterSword(s);
    for (let i = 0; i < 40 && s.hero.equipment.weapon?.uid !== sword.uid; i++) {
      stepQuiet(s, content, TICKS_PER_HOUR / 4);
    }
    expect(s.hero.equipment.weapon?.uid).toBe(sword.uid);
  });

  it('the best hunt is the highest unlocked one the level allows', () => {
    const s = newGame();
    s.unlockedHunts = [...content.hunts.keys()];
    s.hero.level = 1;
    expect(bestHuntFor(s, content)?.id).toBe(HUNT);
    s.hero.level = 100;
    expect(bestHuntFor(s, content)?.id).toBe('burning_throne');
    s.unlockedHunts = [HUNT, 'pale_woods'];
    expect(bestHuntFor(s, content)?.id).toBe('pale_woods');
  });

  it('after time away, the automations run once', () => {
    const s = hunting(4);
    s.consumables.potion_hp_small = 10_000;
    s.hero.level = 20;
    s.unlockedHunts.push('pale_woods');
    s.defeatedBosses = ['a', 'b', 'c'];
    setAutomation(s, 'equipBest', true);
    setAutomation(s, 'bestHunt', true);
    const starter = s.hero.equipment.weapon!.uid;
    betterSword(s);
    resolveOffline(s, content, computeRates(s, content, HUNT), TICKS_PER_HOUR);
    // The sword, or something even better found while away.
    expect(s.hero.equipment.weapon?.uid).not.toBe(starter);
    expect(s.hunt?.huntId).toBe('pale_woods');
  });

  it('migrates v14 saves with automations off', () => {
    const s = newGame();
    const raw = JSON.parse(encodeSave(s, 1)) as {
      version: number;
      state: { version: number; settings: Record<string, unknown> };
    };
    raw.version = 14;
    raw.state.version = 14;
    delete raw.state.settings.automation;
    expect(decodeSave(JSON.stringify(raw), content).state).toEqual(s);
  });
});
