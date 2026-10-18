import { create } from 'zustand';
import type { Rarity } from '@abismo/content';
import type { ItemInstance } from '@abismo/engine';
import type { Snapshot } from '../game/sim.ts';

export interface LogLine {
  id: number;
  text: string;
  rarity?: Rarity;
  tone?: 'good' | 'bad' | 'info';
}

/** Town shown over the hunt: a supply visit, a rest, or the walk out while travelling. */
export type TownView = null | 'depositing' | 'idle' | 'leaving';

/** Full-panel screens reachable from the HUD (at most 2 taps away, section 11). */
export type Screen =
  | 'character'
  | 'skills'
  | 'cards'
  | 'journal'
  | 'professions'
  | 'quests'
  | 'hunts'
  | 'smith'
  | 'altar'
  | 'filter'
  | 'settings'
  | 'save';

interface UiState {
  /** HUD values at the tick the scene is showing (not the engine's latest tick). */
  presented: Snapshot | null;
  log: LogLine[];
  backpackOpen: boolean;
  screen: Screen | null;
  tab: 'backpack' | 'stash';
  selectedUid: number | null;
  town: TownView;
  /** The boss being fought, for the big life bar at the top (section 4.3). */
  boss: { name: string; hp: number; maxHp: number } | null;
  zoom: number;
  /** The last level reached, for the level-up banner (id changes on every level up). */
  levelUp: { level: number; id: number } | null;
  /** Item under the mouse, for the tooltip (desktop). */
  hover: { item: ItemInstance; x: number; y: number } | null;
  /** Town keeper whose dialog is open. */
  npc: string | null;
  /** Bumped by the sim when inventory, equipment or rates change. */
  simVersion: number;
  setPresented: (s: Snapshot) => void;
  pushLog: (line: Omit<LogLine, 'id'>) => void;
  openBackpack: (open: boolean) => void;
  openScreen: (screen: Screen | null) => void;
  setTab: (tab: 'backpack' | 'stash') => void;
  select: (uid: number | null) => void;
  setTown: (town: TownView) => void;
  setBoss: (boss: { name: string; hp: number; maxHp: number } | null) => void;
  setZoom: (zoom: number) => void;
  showLevelUp: (level: number) => void;
  openNpc: (npc: string | null) => void;
  /** The log window (it starts open). */
  logWindow: boolean;
  toggleLogWindow: () => void;
  toggleBackpack: () => void;
  setHover: (hover: { item: ItemInstance; x: number; y: number } | null) => void;
  hideLevelUp: () => void;
  bump: () => void;
}

const LOG_LIMIT = 60;
let logId = 0;

export const useUi = create<UiState>((set) => ({
  presented: null,
  log: [],
  backpackOpen: false,
  screen: null,
  tab: 'backpack',
  selectedUid: null,
  town: null,
  boss: null,
  zoom: 2,
  levelUp: null,
  npc: null,
  logWindow: typeof window === 'undefined' || window.innerWidth > 700,
  hover: null,
  simVersion: 0,
  setPresented: (presented) => set({ presented }),
  pushLog: (line) =>
    set((s) => ({ log: [...s.log.slice(-(LOG_LIMIT - 1)), { ...line, id: ++logId }] })),
  openBackpack: (backpackOpen) => set({ backpackOpen, selectedUid: null, hover: null }),
  openScreen: (screen) => set({ screen, selectedUid: null }),
  setTab: (tab) => set({ tab, selectedUid: null }),
  select: (selectedUid) => set({ selectedUid }),
  setTown: (town) => set(town ? { town } : { town, npc: null }),
  setBoss: (boss) => set({ boss }),
  setZoom: (zoom) => set({ zoom }),
  showLevelUp: (level) => set((s) => ({ levelUp: { level, id: (s.levelUp?.id ?? 0) + 1 } })),
  hideLevelUp: () => set({ levelUp: null }),
  openNpc: (npc) => set({ npc, screen: null, backpackOpen: false, hover: null }),
  setHover: (hover) => set({ hover }),
  toggleLogWindow: () => set((s) => ({ logWindow: !s.logWindow })),
  toggleBackpack: () =>
    set((s) => ({ backpackOpen: !s.backpackOpen, selectedUid: null, hover: null })),
  bump: () => set((s) => ({ simVersion: s.simVersion + 1 })),
}));
