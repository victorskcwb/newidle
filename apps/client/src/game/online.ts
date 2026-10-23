import type { ContentDb } from '@abismo/content';
import {
  PROTOCOL_VERSION,
  Replica,
  decodeServerMessage,
  encodeMessage,
  type ClientMessage,
  type ServerMessage,
} from '@abismo/protocol';

/**
 * - `connecting`: first connection, no hero yet on screen.
 * - `online`: welcomed; the replica follows the server.
 * - `reconnecting`: the connection dropped; the replica keeps the last state.
 * - `taken`: the account was opened on another device (no automatic reconnection).
 * - `no_hero`: the account has no hero yet.
 * - `auth`: the session token was refused.
 */
export type LinkStatus = 'connecting' | 'online' | 'reconnecting' | 'taken' | 'no_hero' | 'auth';

/** Local monotonic clock in epoch-like ms (the replica only needs it to be steady). */
export const localNow = () => performance.timeOrigin + performance.now();

const PING_MS = 10_000;
const MAX_BACKOFF_MS = 15_000;

/**
 * The browser's connection to the game server (decision 173): one WebSocket, reconnected with
 * backoff, carrying the Replica's messages. The Replica is created at the first welcome and
 * kept across reconnections (later welcomes replace its state).
 */
export class OnlineLink {
  replica: Replica | null = null;
  status: LinkStatus = 'connecting';
  /** Called when the status changes, when the first welcome creates the replica, and when
   *  a welcome or state replaces the replica's state (the scene must rebuild). */
  onStatus: (s: LinkStatus) => void = () => {};
  onReplica: (r: Replica) => void = () => {};
  onStateReplaced: () => void = () => {};

  private ws: WebSocket | null = null;
  private attempts = 0;
  private pinger: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    private readonly url: string,
    /** The session token, read at each connection (it may change after signing in). */
    private readonly token: () => string,
    private readonly buildId: string,
    private readonly content: ContentDb,
  ) {}

  connect() {
    this.stopped = false;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.send({
        type: 'hello',
        protocol: PROTOCOL_VERSION,
        buildId: this.buildId,
        token: this.token(),
      });
      this.pinger = setInterval(() => this.send({ type: 'ping', t: localNow() }), PING_MS);
    };
    ws.onmessage = (e: MessageEvent<string>) => {
      const m = decodeServerMessage(e.data);
      if (m) this.receive(m);
    };
    ws.onclose = () => {
      if (this.pinger) clearInterval(this.pinger);
      this.pinger = null;
      if (this.ws !== ws || this.stopped) return;
      this.setStatus(this.replica ? 'reconnecting' : 'connecting');
      const delay = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** this.attempts++);
      setTimeout(() => {
        if (!this.stopped) this.connect();
      }, delay);
    };
  }

  /** Closes for good (another device took over, logout). */
  stop() {
    this.stopped = true;
    this.ws?.close();
  }

  private send = (m: ClientMessage) => {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeMessage(m));
  };

  private receive(m: ServerMessage) {
    if (m.type === 'kicked') {
      if (m.reason === 'reload') location.reload();
      if (m.reason === 'other_session') this.setStatus('taken');
      else if (m.reason === 'no_hero') this.setStatus('no_hero');
      else if (m.reason === 'auth') this.setStatus('auth');
      if (m.reason !== 'maintenance') this.stop();
      return;
    }
    if (m.type === 'welcome' && !this.replica) {
      this.replica = new Replica(this.content, m, localNow(), this.send);
      this.setStatus('online');
      this.onReplica(this.replica);
      return;
    }
    if (!this.replica) return;
    if (m.type === 'welcome') this.setStatus('online');
    if (this.replica.receive(m, localNow()) === 'state') this.onStateReplaced();
  }

  private setStatus(s: LinkStatus) {
    if (this.status === s) return;
    this.status = s;
    this.onStatus(s);
  }
}
