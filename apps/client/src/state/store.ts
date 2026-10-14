import type { OfflineSummary, SlotState } from '@valdren/engine';
import { create } from 'zustand';
import { LocalSim } from './localSim.ts';

export const sim = new LocalSim();

interface GameStore {
  slot: SlotState;
  summary: OfflineSummary | null;
  closeSummary: () => void;
}

export const useGame = create<GameStore>((set) => ({
  slot: sim.state,
  summary: null,
  closeSummary: () => set({ summary: null }),
}));

sim.subscribe({
  onEvents: (_events, state) => useGame.setState({ slot: state }),
  onSummary: (summary) => useGame.setState({ summary }),
  onReset: (state) => useGame.setState({ slot: state, summary: null }),
});
