import { create } from 'zustand';
import { useUi } from './store.ts';

/**
 * Where the floating windows sit and which are open, with layout presets. Kept on this
 * device (localStorage, guarded); positions are pixels from the top left.
 */
export interface WinPos {
  x: number;
  y: number;
}

export type WindowId = 'inventory' | 'log' | 'analyzer';

export interface Layout {
  pos: Partial<Record<WindowId, WinPos>>;
  open: { inventory: boolean; log: boolean; analyzer?: boolean };
}

const POS_KEY = 'abismo.windows';
const MINE_KEY = 'abismo.windows.mine';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the layout lasts for this visit only.
  }
}

/** Built-in layouts, computed for the current screen size. */
export const PRESETS = ['default', 'hunt', 'loot', 'clean'] as const;
export type PresetId = (typeof PRESETS)[number];

export function presetLayout(id: PresetId): Layout {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const right = { x: Math.max(8, w - 668), y: 64 };
  const bottomLeft = { x: 8, y: Math.max(64, h - 280) };
  switch (id) {
    case 'default':
      return {
        pos: { inventory: right, log: bottomLeft, analyzer: { x: Math.max(8, w - 308), y: 64 } },
        open: { inventory: false, log: true, analyzer: false },
      };
    case 'hunt':
      return {
        pos: {
          log: { x: 8, y: Math.max(64, h - 230) },
          analyzer: { x: Math.max(8, w - 308), y: 64 },
        },
        open: { inventory: false, log: true, analyzer: true },
      };
    case 'loot':
      return {
        pos: { inventory: right, log: { x: 8, y: 170 } },
        open: { inventory: true, log: true, analyzer: false },
      };
    case 'clean':
      return { pos: {}, open: { inventory: false, log: false, analyzer: false } };
  }
}

interface WindowsState {
  pos: Partial<Record<WindowId, WinPos>>;
  move: (id: WindowId, p: WinPos) => void;
  apply: (layout: Layout) => void;
  /** Saves the current positions and open windows as "my layout". */
  saveMine: () => void;
  mine: () => Layout | null;
}

export const useWindows = create<WindowsState>((set, get) => ({
  pos: read<Partial<Record<WindowId, WinPos>>>(POS_KEY) ?? {},
  move: (id, p) => {
    set((s) => ({ pos: { ...s.pos, [id]: p } }));
    write(POS_KEY, get().pos);
  },
  apply: (layout) => {
    set((s) => ({ pos: { ...s.pos, ...layout.pos } }));
    write(POS_KEY, get().pos);
    const ui = useUi.getState();
    if (ui.backpackOpen !== layout.open.inventory) ui.toggleBackpack();
    if (ui.logWindow !== layout.open.log) ui.toggleLogWindow();
    // Layouts saved before the analyzer existed leave it as it is.
    if (layout.open.analyzer !== undefined) ui.setAnalyzerWindow(layout.open.analyzer);
  },
  saveMine: () => {
    const ui = useUi.getState();
    write(MINE_KEY, {
      pos: get().pos,
      open: { inventory: ui.backpackOpen, log: ui.logWindow, analyzer: ui.analyzerWindow },
    } satisfies Layout);
  },
  mine: () => read<Layout>(MINE_KEY),
}));
