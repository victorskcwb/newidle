import { createContext, useContext, useEffect } from 'react';
import type { GameSim } from '../game/sim.ts';
import { useUi } from '../state/store.ts';

export const SimContext = createContext<GameSim | null>(null);

/**
 * The running sim. Components read `sim.state` directly while rendering; subscribing to
 * `simVersion` re-renders them whenever inventory, equipment or rates change.
 */
export function useSim(): GameSim {
  const sim = useContext(SimContext);
  if (!sim) throw new Error('useSim outside SimContext');
  useUi((s) => s.simVersion);
  return sim;
}

/** Bridges sim change notifications into the UI store. Mount once. */
export function useSimBridge(sim: GameSim) {
  useEffect(() => sim.onChange(() => useUi.getState().bump()), [sim]);
}
