import type { GameState } from '@abismo/engine';

/**
 * XP history for the statistics chart (GDD 9): lifetime totals every 10 minutes, the last
 * 24 hours, kept on this device. Not game state: losing it loses only the chart.
 */
const KEY = 'abismo.history';
export const HISTORY_STEP_MS = 10 * 60_000;
const KEEP = 24 * 6 + 1;

export interface HistorySample {
  /** Epoch ms. */
  at: number;
  xp: number;
}

interface Stored {
  hero: string;
  samples: HistorySample[];
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

/** The hero's samples (another hero's history on this device is ignored). */
export function loadHistory(state: GameState): HistorySample[] {
  const stored = read();
  return stored && stored.hero === state.hero.name ? stored.samples : [];
}

/** Adds a sample when the last one is at least a step old. */
export function recordHistory(state: GameState, now = Date.now()) {
  const samples = loadHistory(state);
  const last = samples[samples.length - 1];
  if (last && now - last.at < HISTORY_STEP_MS) return;
  samples.push({ at: now, xp: Number(state.lifetime.xpEarned) });
  const kept = samples.filter((s) => now - s.at <= 24 * 3_600_000 + HISTORY_STEP_MS).slice(-KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify({ hero: state.hero.name, samples: kept }));
  } catch {
    // Storage full or blocked: the chart just stays empty.
  }
}

/** XP per hour between consecutive samples, stamped at the end of each stretch. */
export function xpPerHour(samples: HistorySample[]): { at: number; value: number }[] {
  const out: { at: number; value: number }[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const hours = (b.at - a.at) / 3_600_000;
    if (hours > 0) out.push({ at: b.at, value: Math.max(0, (b.xp - a.xp) / hours) });
  }
  return out;
}
