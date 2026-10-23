import type { ContentDb } from '@abismo/content';
import {
  applyIntent,
  decodeSave,
  hashState,
  step,
  type GameEvent,
  type GameState,
  type Intent,
  type IntentOutcome,
  type OfflineReport,
} from '@abismo/engine';
import {
  CHECKPOINT_TICKS,
  CLIENT_LEAD_TICKS,
  tickAt,
  type ClientMessage,
  type ServerMessage,
} from './index.ts';

/** Most ticks the replica steps in one call; beyond that it jumps quietly (and the scene resyncs). */
const MAX_STEP_PER_CALL = 600;
/** Checkpoint hashes kept to compare with the server's (the replica runs a little ahead). */
const HASHES_KEPT = 8;

interface Sent {
  seq: number;
  atTick: number;
  intent: Intent;
}

/**
 * The client's side of the protocol (decision 173), free of any transport: a copy of the hero
 * that runs a few ticks ahead of the server's clock, applies the player's intents at once and
 * sends them stamped with that tick, and asks for the whole state when anything disagrees with
 * the server (late intent, refusal, checkpoint hash). Used by the browser client, the server
 * tests and the load test.
 */
export class Replica {
  state: GameState;
  /** The last offline summary the server sent (cleared by the UI). */
  offlineReport: OfflineReport | null;
  private clock: { tick: number; atMs: number };
  /** Server time minus local time. */
  private offsetMs: number;
  private nextSeq: number;
  private unacked: Sent[] = [];
  private hashes = new Map<number, string>();
  /** A checkpoint that arrived before the replica reached its tick. */
  private expected = new Map<number, string>();
  private resyncAsked = false;
  /** Counts for diagnostics (divergences should be zero). */
  readonly stats = { resyncs: 0, lateIntents: 0, checkpointMismatches: 0, checkpointsVerified: 0 };

  constructor(
    private readonly content: ContentDb,
    welcome: Extract<ServerMessage, { type: 'welcome' }>,
    localNowMs: number,
    private readonly send: (m: ClientMessage) => void,
  ) {
    this.state = decodeSave(welcome.save, content).state;
    this.clock = welcome.clock;
    this.offsetMs = welcome.serverNow - localNowMs;
    this.nextSeq = welcome.lastSeq + 1;
    this.offlineReport = welcome.offlineReport;
  }

  /** The tick the replica should be at now: the server's, plus the lead. */
  targetTick(localNowMs: number): number {
    return tickAt(this.clock, localNowMs + this.offsetMs) + CLIENT_LEAD_TICKS;
  }

  /**
   * Steps up to the target tick. Returns the events for the scene, or null when the gap was
   * so large that it jumped without them (the scene must rebuild from the state).
   */
  advance(localNowMs: number): GameEvent[] | null {
    const target = this.targetTick(localNowMs);
    if (target - this.state.tick > MAX_STEP_PER_CALL) {
      while (this.state.tick < target) this.stepTo(Math.min(target, this.nextCheckpoint()), null);
      return null;
    }
    const events: GameEvent[] = [];
    while (this.state.tick < target) this.stepTo(Math.min(target, this.nextCheckpoint()), events);
    return events;
  }

  private nextCheckpoint(): number {
    return (Math.floor(this.state.tick / CHECKPOINT_TICKS) + 1) * CHECKPOINT_TICKS;
  }

  /** Steps to `until` (at most the next checkpoint), recording the hash of a checkpoint tick. */
  private stepTo(until: number, events: GameEvent[] | null) {
    if (this.state.tick % CHECKPOINT_TICKS === 0) this.recordHash(this.state.tick);
    const out = step(this.state, this.content, until - this.state.tick);
    if (events) for (const e of out) events.push(e);
  }

  private recordHash(tick: number) {
    const hash = hashState(this.state);
    this.hashes.set(tick, hash);
    if (this.hashes.size > HASHES_KEPT) this.hashes.delete(this.hashes.keys().next().value!);
    const expected = this.expected.get(tick);
    if (expected !== undefined) {
      this.expected.delete(tick);
      this.stats.checkpointsVerified++;
      if (expected !== hash) this.diverged('checkpoint');
    }
  }

  /**
   * Applies a player intent now and sends it. Throws IntentError when the rules refuse it, in
   * which case nothing is sent (the server would refuse it too).
   */
  act(intent: Intent): IntentOutcome {
    const outcome = applyIntent(this.state, this.content, intent);
    const sent: Sent = { seq: this.nextSeq++, atTick: this.state.tick, intent };
    this.unacked.push(sent);
    this.send({ type: 'intent', ...sent });
    return outcome;
  }

  /**
   * Handles a server message. Returns 'state' when the replica's state was replaced (the
   * scene and UI must rebuild), otherwise null.
   */
  receive(m: ServerMessage, localNowMs: number): 'state' | null {
    switch (m.type) {
      case 'ack': {
        const sent = this.unacked.find((u) => u.seq === m.seq);
        this.unacked = this.unacked.filter((u) => u.seq !== m.seq);
        if (sent && sent.atTick !== m.appliedAt) {
          this.stats.lateIntents++;
          this.diverged('late');
        }
        return null;
      }
      case 'reject': {
        const sent = this.unacked.some((u) => u.seq === m.seq);
        this.unacked = this.unacked.filter((u) => u.seq !== m.seq);
        // The replica applied it; the server did not.
        if (sent) this.diverged(m.code);
        return null;
      }
      case 'checkpoint': {
        const mine = this.hashes.get(m.tick);
        if (mine !== undefined) {
          this.stats.checkpointsVerified++;
          if (mine !== m.hash) this.diverged('checkpoint');
        } else if (m.tick >= this.state.tick) {
          this.expected.set(m.tick, m.hash);
        }
        return null;
      }
      case 'state':
      case 'welcome': {
        this.state = decodeSave(m.save, this.content).state;
        this.clock = m.clock;
        if (m.type === 'welcome') {
          this.offsetMs = m.serverNow - localNowMs;
          this.offlineReport = m.offlineReport;
        }
        this.nextSeq = Math.max(this.nextSeq, m.lastSeq + 1);
        this.hashes.clear();
        this.expected.clear();
        this.resyncAsked = false;
        // Intents the server has not applied yet are sent again; they will land late, and the
        // next state brings them in.
        this.unacked = this.unacked.filter((u) => u.seq > m.lastSeq);
        for (const u of this.unacked) this.send({ type: 'intent', ...u });
        return 'state';
      }
      case 'pong':
        // Half the round trip is the usual estimate of the one-way delay.
        this.offsetMs = m.serverNow - (m.t + localNowMs) / 2;
        return null;
      case 'kicked':
        return null;
    }
  }

  private diverged(reason: string) {
    if (reason === 'checkpoint') this.stats.checkpointMismatches++;
    if (this.resyncAsked) return;
    this.resyncAsked = true;
    this.stats.resyncs++;
    this.send({ type: 'resync' });
  }
}
