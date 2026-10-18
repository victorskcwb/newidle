import { create } from 'zustand';

/**
 * Per-device presentation preferences (not part of the game state, not in the save).
 * Kept in localStorage; every access is guarded because storage can be unavailable.
 */
/** Graphics, one switch each, for slow phones or a calmer screen. */
export interface Gfx {
  /** Slashes, blasts and skill effects on hits. */
  hitFx: boolean;
  /** Floating damage and healing numbers. */
  numbers: boolean;
  /** Drifting dust, fireflies or embers over the map. */
  atmosphere: boolean;
  /** Names and life bars over monsters and townsfolk (the hero's always show). */
  names: boolean;
  /** Items hopping out of monsters and flying to the backpack. */
  lootFx: boolean;
  /** Screen flashes on level up, bosses and deaths. */
  flashes: boolean;
}

export const GFX_KEYS = ['hitFx', 'numbers', 'atmosphere', 'names', 'lootFx', 'flashes'] as const;

export interface Prefs {
  gfx: Gfx;
  /** 30 fps and no particles (section 4.4). */
  eco: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  sound: boolean;
  /** 0..1 */
  volume: number;
  /** Background reminders (needs the browser's permission). */
  reminders: boolean;
}

const KEY = 'abismo.prefs';

function load(): Prefs {
  const defaults: Prefs = {
    gfx: { hitFx: true, numbers: true, atmosphere: true, names: true, lootFx: true, flashes: true },
    eco: false,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    largeText: false,
    sound: true,
    volume: 0.5,
    reminders: false,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as Partial<Prefs>;
    return { ...defaults, ...saved, gfx: { ...defaults.gfx, ...saved.gfx } };
  } catch {
    return defaults;
  }
}

interface PrefsState extends Prefs {
  set: (patch: Partial<Prefs>) => void;
}

export const usePrefs = create<PrefsState>((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch);
    const { gfx, eco, reducedMotion, largeText, sound, volume, reminders } = get();
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ gfx, eco, reducedMotion, largeText, sound, volume, reminders }),
      );
    } catch {
      // Storage unavailable (private mode): the preference lasts for this visit only.
    }
  },
}));
