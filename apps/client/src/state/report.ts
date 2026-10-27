import type { ContentDb } from '@abismo/content';
import { addToReport, newHuntReport, type GameEvent, type HuntReport } from '@abismo/engine';
import { create } from 'zustand';
import { useUi } from './store.ts';

interface ReportState {
  /** The current hunting session, or the last one until the next starts. */
  report: HuntReport | null;
  add: (events: GameEvent[], content: ContentDb) => void;
  /** Starts counting again from `tick` (the player's reset button, or a reload mid-hunt). */
  restart: (huntId: string | null, tick: number) => void;
}

export const useReport = create<ReportState>((set, get) => ({
  report: null,
  add: (events, content) => {
    const before = get().report;
    const report = addToReport(before, events, content);
    set({ report });
    // The session's results show when it ends, as in the reference games (not on phones,
    // where the window would take the log's place at the bottom).
    const ended = before?.stoppedTick === null && report?.stoppedTick != null;
    if (ended && report.kills > 0 && window.innerWidth > 700) {
      useUi.getState().setAnalyzerWindow(true);
    }
  },
  restart: (huntId, tick) => set({ report: newHuntReport(huntId, tick) }),
}));
