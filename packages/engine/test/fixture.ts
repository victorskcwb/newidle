import {
  buildContentDb,
  CONTENT_FILES,
  loadContent,
  mergeContentFiles,
  type ContentDb,
} from '@abismo/content';
import { createGame, startHunt, type GameState } from '../src/index.ts';

export const content = loadContent();
export const HUNT = 'forgotten_cemetery';

export function newGame(seed = 1, db: ContentDb = content): GameState {
  return createGame(db, { name: 'Teste', seed: [seed, 0x9e3779b9, 0x85ebca6b, seed * 7 + 1] });
}

/** A hero already walking in the starting hunt (travel skipped). */
export function hunting(seed = 1, db: ContentDb = content): GameState {
  const s = newGame(seed, db);
  startHunt(s, db, HUNT);
  s.activity = { kind: 'to_hunt', untilTick: s.tick };
  return s;
}

/**
 * Bundled content plus a second hunt unlocked by the cemetery boss, and a boss every
 * 5 kills, so tests can reach the boss quickly.
 */
export function contentWithUnlock(): ContentDb {
  const merged = mergeContentFiles(Object.values(CONTENT_FILES));
  const cemetery = merged.hunts.find((h) => h.id === HUNT)!;
  merged.hunts = [
    { ...cemetery, boss: { monsterId: 'gravekeeper', everyKills: 5 }, unlocks: 'test_hunt' },
    { ...cemetery, id: 'test_hunt', startUnlocked: false, unlocks: undefined },
  ];
  return buildContentDb(merged);
}

/** Total count of items anywhere the hero owns them. */
export function ownedItemUids(s: GameState): number[] {
  return [
    ...s.backpack.map((i) => i.uid),
    ...s.stash.map((i) => i.uid),
    ...Object.values(s.hero.equipment).map((i) => i!.uid),
  ].sort((a, b) => a - b);
}
