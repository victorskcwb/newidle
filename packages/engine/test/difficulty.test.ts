import { describe, expect, it } from 'vitest';
import {
  computeRates,
  decodeSave,
  difficultyUnlocked,
  encodeSave,
  HUNT_DIFFICULTY_RULES,
  huntAt,
  IntentError,
  MAX_GROUP_SIZE,
  SAVE_VERSION,
  startHunt,
  step,
  TICKS_PER_HOUR,
} from '../src/index.ts';
import { content, HUNT, hunting, newGame } from './fixture.ts';

const cemetery = content.hunts.get(HUNT)!;

/** A level-10 hero hunting the cemetery at a difficulty (its boss already beaten). */
function veteran(difficulty: 'easy' | 'normal' | 'hard', seed = 3) {
  const s = newGame(seed);
  s.defeatedBosses.push(cemetery.boss!.monsterId);
  startHunt(s, content, HUNT, difficulty);
  s.activity = { kind: 'to_hunt', untilTick: s.tick };
  return s;
}

function groupSizes(difficulty: 'easy' | 'normal' | 'hard') {
  const sizes = new Set<number>();
  for (const e of step(veteran(difficulty), content, 30_000)) {
    if (e.type === 'GroupSpawned' && !e.monsters.some((m) => m.boss)) sizes.add(e.monsters.length);
  }
  return [...sizes].sort();
}

describe('hunt difficulty', () => {
  it('normal is the hunt exactly as the content writes it', () => {
    expect(huntAt(cemetery, 'normal')).toBe(cemetery);
    expect(hunting(1).hunt!.difficulty).toBe('normal');
  });

  it('easy sends smaller groups, hard bigger ones (never above the cap)', () => {
    const { min, max } = cemetery.groupSize;
    const hard = huntAt(cemetery, 'hard');
    expect(hard.groupSize).toEqual({
      min: Math.min(MAX_GROUP_SIZE, min + 1),
      max: Math.min(MAX_GROUP_SIZE, max + 1),
    });
    expect(huntAt(cemetery, 'easy').groupSize).toEqual({
      min: Math.max(1, min - 1),
      max: Math.max(1, max - 1),
    });
    expect(hard.eliteChancePpm).toBe(
      Math.floor((cemetery.eliteChancePpm * HUNT_DIFFICULTY_RULES.hard.eliteChancePct) / 100),
    );
    for (const n of groupSizes('hard')) expect(n).toBeGreaterThanOrEqual(hard.groupSize.min);
    expect(Math.max(...groupSizes('hard'))).toBe(hard.groupSize.max);
    expect(Math.max(...groupSizes('easy'))).toBe(Math.max(1, max - 1));
  });

  it('hard opens only after the hunt boss has been beaten once', () => {
    const s = newGame(1);
    expect(difficultyUnlocked(s, cemetery, 'hard')).toBe(false);
    expect(() => startHunt(s, content, HUNT, 'hard')).toThrow(IntentError);
    startHunt(s, content, HUNT, 'easy');
    expect(s.hunt!.difficulty).toBe('easy');
    s.defeatedBosses.push(cemetery.boss!.monsterId);
    startHunt(s, content, HUNT, 'hard');
    expect(s.hunt!.difficulty).toBe('hard');
  });

  it('going back to the same hunt keeps the difficulty; another hunt starts at normal', () => {
    const s = veteran('hard');
    startHunt(s, content, HUNT);
    expect(s.hunt!.difficulty).toBe('hard');
    const other = [...content.hunts.keys()].find((id) => id !== HUNT)!;
    s.unlockedHunts.push(other);
    startHunt(s, content, other);
    expect(s.hunt!.difficulty).toBe('normal');
  });

  it('hard is worth more gold per kill than normal, easy no more than normal', () => {
    const rate = (d: 'easy' | 'normal' | 'hard') => {
      const r = computeRates(veteran(d), content, HUNT, TICKS_PER_HOUR / 2, d);
      expect(r.difficulty).toBe(d);
      return r.goldPerHour / r.killsPerHour;
    };
    const normal = rate('normal');
    expect(rate('hard')).toBeGreaterThan(normal * 1.1);
    expect(rate('easy')).toBeLessThanOrEqual(normal);
  });

  it('the difficulty survives a save, and old saves load at normal', () => {
    const s = veteran('easy');
    step(s, content, 2_000);
    expect(decodeSave(encodeSave(s, 1), content).state.hunt!.difficulty).toBe('easy');

    const old = JSON.parse(encodeSave(s, 1)) as {
      version: number;
      state: Record<string, Record<string, unknown>>;
    };
    old.version = 19;
    (old.state as Record<string, unknown>).version = 19;
    delete old.state.hunt!.difficulty;
    delete old.state.settings!.skillRules;
    const loaded = decodeSave(JSON.stringify(old), content);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.state.hunt!.difficulty).toBe('normal');
    expect(loaded.state.settings.skillRules).toEqual({});
  });
});
