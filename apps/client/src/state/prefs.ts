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
}

const KEY = 'abismo.prefs';

function load(): Prefs {
  const defaults: Prefs = {
    eco: false,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    largeText: false,
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
    const { eco, reducedMotion, largeText } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ eco, reducedMotion, largeText }));
    } catch {
      // Storage unavailable (private mode): the preference lasts for this visit only.
    }
  },
}));
