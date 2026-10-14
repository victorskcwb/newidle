import type { ContentDb } from '@valdren/content';
import type {
  BlockReason,
  GameEvent,
  OfflineSummary,
  SlotState,
  StopCondition,
} from '@valdren/engine';

export interface SimHandlers {
  onEvents?: (events: GameEvent[], state: SlotState) => void;
  onSummary?: (summary: OfflineSummary) => void;
  /** The state was replaced wholesale (reset, resync, reconnect): redraw without replaying. */
  onReset?: (state: SlotState) => void;
}

/**
 * What the UI and the scene need from a simulation driver. Implemented by LocalSim (dev page,
 * no server) and ServerSim (authoritative server over WebSocket).
 */
export interface Sim {
  readonly content: ContentDb;
  readonly state: SlotState;
  subscribe(handlers: SimHandlers): () => void;
  /** Wall-clock time (Date.now domain) at which an event of `tick` is shown in the scene. */
  tickToMs(tick: number): number;
  start(): void;
  dispose(): void;
  /** Resolves to null when the action started, or to the reason it cannot. */
  startAction(actionId: string, stop?: StopCondition): Promise<BlockReason | null>;
  stop(): void;
}
