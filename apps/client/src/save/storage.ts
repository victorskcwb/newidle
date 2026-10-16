import type { ContentDb } from '@abismo/content';
import { SaveError, decodeSave, encodeSave, type GameState, type SaveFile } from '@abismo/engine';
import { del, get, set } from 'idb-keyval';

/** IndexedDB key of the single local save (one hero for now). */
const SAVE_KEY = 'abismo.save';
const AUTOSAVE_MS = 5_000;

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; file: SaveFile }
  | { kind: 'broken'; error: SaveError; text: string };

export async function loadSave(content: ContentDb): Promise<LoadResult> {
  const text = await get<string>(SAVE_KEY);
  if (text === undefined) return { kind: 'empty' };
  try {
    return { kind: 'ok', file: decodeSave(text, content) };
  } catch (e) {
    if (e instanceof SaveError) return { kind: 'broken', error: e, text };
    throw e;
  }
}

export function writeSave(state: GameState): Promise<void> {
  return set(SAVE_KEY, encodeSave(state, Date.now()));
}

export function deleteSave(): Promise<void> {
  return del(SAVE_KEY);
}

/** Validates an exported save and stores it (the page reloads afterwards). */
export async function importSave(text: string, content: ContentDb): Promise<void> {
  decodeSave(text.trim(), content);
  await set(SAVE_KEY, text.trim());
}

/**
 * Saves every few seconds, when the page is hidden or closed, and whenever `onChange`
 * fires (equip, salvage…). Writes are serialized so an older state never overwrites a newer.
 */
export function startAutosave(
  getState: () => GameState,
  onChange: (cb: () => void) => () => void,
  enabled: () => boolean,
) {
  let writing: Promise<void> = Promise.resolve();
  let dirty = false;
  const save = () => {
    dirty = false;
    if (!enabled()) return;
    // Encode now: the state keeps changing while earlier writes finish.
    const text = encodeSave(getState(), Date.now());
    writing = writing
      .then(() => set(SAVE_KEY, text))
      .catch((e: unknown) => console.error('save failed', e));
  };
  const timer = setInterval(save, AUTOSAVE_MS);
  const onHide = () => {
    if (document.visibilityState === 'hidden') save();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', save);
  const offChange = onChange(() => {
    if (dirty) return;
    dirty = true;
    setTimeout(save, 300);
  });
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', save);
    offChange();
  };
}
