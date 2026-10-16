import { create } from 'zustand';

/**
 * Per-device presentation preferences (not part of the game state, not in the save).
 * Kept in localStorage; every access is guarded because storage can be unavailable.
 */
export interface Prefs {
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
    eco: false,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    largeText: false,
    sound: true,
    volume: 0.5,
    reminders: false,
  };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) } : defaults;
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
    const { eco, reducedMotion, largeText, sound, volume, reminders } = get();
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ eco, reducedMotion, largeText, sound, volume, reminders }),
      );
    } catch {
      // Storage unavailable (private mode): the preference lasts for this visit only.
    }
  },
}));
