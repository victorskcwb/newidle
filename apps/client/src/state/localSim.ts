import { loadBundledContent, type ContentDb } from '@valdren/content';
import {
  GAME_EPOCH_MS,
  OFFLINE_CAP_TICKS,
  STEP_RESOLVE_MAX_TICKS,
  TICK_MS,
  deriveSeed,
  newCharacterSkills,
  newSlotState,
  resolveOffline,
  startAction,
  step,
  stopSlot,
  tickAt,
  type BlockReason,
  type GameEvent,
  type OfflineSummary,
  type SlotState,
  type StopCondition,
} from '@valdren/engine';

/** The scene renders one tick behind the simulation to absorb latency (and, later, the network). */
export const RENDER_DELAY_MS = TICK_MS;
const SAVE_KEY = 'valdren.localSim.v1';

interface SaveData {
  state: SlotState;
  /** Debug offset (ticks) added by "simulate time away". */
  offset: number;
  restarts: number;
}

export interface SimHandlers {
  onEvents?: (events: GameEvent[], state: SlotState) => void;
  onSummary?: (summary: OfflineSummary) => void;
  onReset?: (state: SlotState) => void;
}

/**
 * Test-page driver: runs the engine locally against the wall clock, the way the client will
 * mirror the server's simulation. No server yet, so the client also owns the state here.
 */
export class LocalSim {
  readonly content: ContentDb = loadBundledContent();
  state: SlotState;
  private offset = 0;
  private restarts = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly handlers = new Set<SimHandlers>();

  constructor() {
    const saved = this.load();
    if (saved) {
      this.state = saved.state;
      this.offset = saved.offset;
      this.restarts = saved.restarts;
    } else {
      this.state = this.freshState();
    }
  }

  subscribe(h: SimHandlers): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  nowTick(): number {
    return tickAt(Date.now()) + this.offset;
  }

  /** Wall-clock time (Date.now domain) at which an event of `tick` is shown in the scene. */
  tickToMs(tick: number): number {
    return GAME_EPOCH_MS + (tick - this.offset) * TICK_MS + RENDER_DELAY_MS;
  }

  start(): void {
    if (this.timer) return;
    this.advance();
    this.timer = setInterval(() => this.advance(), 100);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.save);
  }

  dispose(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.save);
    this.save();
  }

  /** Brings the state up to the current tick: tick by tick for short gaps, in bulk for long ones. */
  advance(): void {
    const gap = this.nowTick() - this.state.tick;
    if (gap <= 0) return;
    if (gap > STEP_RESOLVE_MAX_TICKS) {
      const { state, summary } = resolveOffline(
        this.state,
        Math.min(gap, OFFLINE_CAP_TICKS),
        this.content,
      );
      // Time beyond the offline cap is lost: jump the clock forward.
      state.tick = this.nowTick();
      this.state = state;
      this.save();
      this.handlers.forEach((h) => h.onSummary?.(summary));
      this.emit([]);
      return;
    }
    const { state, events } = step(this.state, gap, this.content);
    this.state = state;
    if (events.length > 0) this.emit(events);
  }

  startAction(actionId: string, stop: StopCondition = { kind: 'materials' }): BlockReason | null {
    this.advance();
    const result = startAction(this.state, actionId, stop, this.content);
    if (!result.ok) return result.reason;
    this.state = result.state;
    this.emit(result.events);
    this.save();
    return null;
  }

  stop(): void {
    this.advance();
    const { state, events } = stopSlot(this.state);
    this.state = state;
    this.emit(events);
    this.save();
  }

  /** Debug: pretend the player was away for `ticks` ticks. */
  simulateAway(ticks: number): void {
    this.save();
    this.offset += ticks;
    this.advance();
  }

  reset(): void {
    this.restarts += 1;
    this.offset = 0;
    this.state = this.freshState();
    this.save();
    this.handlers.forEach((h) => h.onReset?.(this.state));
  }

  private freshState(): SlotState {
    return newSlotState({
      slot: 'main',
      tick: this.nowTick(),
      seed: deriveSeed('local-test-character', 'main', this.restarts),
      skills: newCharacterSkills(),
      bank: [
        { itemId: 'hammer', qty: 1 },
        { itemId: 'pickaxe_bronze', qty: 1 },
      ],
    });
  }

  private emit(events: GameEvent[]): void {
    this.handlers.forEach((h) => h.onEvents?.(events, this.state));
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') this.save();
    else this.advance();
  };

  private save = () => {
    try {
      const data: SaveData = { state: this.state, offset: this.offset, restarts: this.restarts };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // Storage may be unavailable (private mode); the page still works without it.
    }
  };

  private load(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      return data.state?.v === 1 ? data : null;
    } catch {
      return null;
    }
  }
}
