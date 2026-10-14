import type { OfflineSummary, SlotState } from '@valdren/engine';
import { create } from 'zustand';
import type { Profile } from '../net/api.ts';
import type { SocketStatus } from '../net/socket.ts';
import type { Sim } from './sim.ts';

/** The active simulation driver (LocalSim on the dev page, ServerSim otherwise). */
export let sim: Sim;

interface GameStore {
  slot: SlotState | null;
  summary: OfflineSummary | null;
  profile: Profile | null;
  status: SocketStatus;
  closeSummary: () => void;
}

export const useGame = create<GameStore>((set) => ({
  slot: null,
  summary: null,
  profile: null,
  status: 'online',
  closeSummary: () => set({ summary: null }),
}));

/** The current slot state; only call from components rendered after installSim. */
export function useSlot(): SlotState {
  const slot = useGame((s) => s.slot);
  if (!slot) throw new Error('useSlot before installSim');
  return slot;
}

let unsubscribe = () => {};

export function installSim(next: Sim, summary: OfflineSummary | null = null): void {
  unsubscribe();
  sim = next;
  unsubscribe = next.subscribe({
    onEvents: (_events, state) => useGame.setState({ slot: state }),
    onSummary: (s) => useGame.setState({ summary: s }),
    onReset: (state) => useGame.setState({ slot: state }),
  });
  useGame.setState({ slot: next.state, summary });
}
