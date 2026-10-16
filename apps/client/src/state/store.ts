import { create } from 'zustand';
import type { Rarity } from '@abismo/content';
import type { Snapshot } from '../game/sim.ts';

export interface LogLine {
  id: number;
  text: string;
  rarity?: Rarity;
  tone?: 'good' | 'bad' | 'info';
}

export type TownView = null | 'depositing' | 'idle';

interface UiState {
  /** HUD values at the tick the scene is showing (not the engine's latest tick). */
  presented: Snapshot | null;
  log: LogLine[];
  logExpanded: boolean;
  backpackOpen: boolean;
  tab: 'backpack' | 'stash';
  selectedUid: number | null;
  town: TownView;
  zoom: number;
  /** Bumped by the sim when inventory, equipment or rates change. */
  simVersion: number;
  setPresented: (s: Snapshot) => void;
  pushLog: (line: Omit<LogLine, 'id'>) => void;
  toggleLog: () => void;
  openBackpack: (open: boolean) => void;
  setTab: (tab: 'backpack' | 'stash') => void;
  select: (uid: number | null) => void;
  setTown: (town: TownView) => void;
  setZoom: (zoom: number) => void;
  bump: () => void;
}

const LOG_LIMIT = 60;
let logId = 0;

export const useUi = create<UiState>((set) => ({
  presented: null,
  log: [],
  logExpanded: false,
  backpackOpen: false,
  tab: 'backpack',
  selectedUid: null,
  town: null,
  zoom: 2,
  simVersion: 0,
  setPresented: (presented) => set({ presented }),
  pushLog: (line) =>
    set((s) => ({ log: [...s.log.slice(-(LOG_LIMIT - 1)), { ...line, id: ++logId }] })),
  toggleLog: () => set((s) => ({ logExpanded: !s.logExpanded })),
  openBackpack: (backpackOpen) => set({ backpackOpen, selectedUid: null }),
  setTab: (tab) => set({ tab, selectedUid: null }),
  select: (selectedUid) => set({ selectedUid }),
  setTown: (town) => set({ town }),
  setZoom: (zoom) => set({ zoom }),
  bump: () => set((s) => ({ simVersion: s.simVersion + 1 })),
}));
