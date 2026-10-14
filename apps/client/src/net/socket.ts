import {
  CLOSE_UNAUTHORIZED,
  serverMessageSchema,
  type ClientPayload,
  type ServerMessage,
} from '@valdren/protocol';

export type SocketStatus = 'connecting' | 'online' | 'offline' | 'unauthorized';

export interface SocketHandlers {
  onMessage: (msg: ServerMessage) => void;
  onOpen: () => void;
  onStatus: (status: SocketStatus) => void;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const PING_SAMPLES = 5;

/**
 * WebSocket with exponential-backoff reconnection (1 s, 2 s, 4 s … 30 s) and server clock
 * estimation: the offset is the mean of the last 5 ping samples (section 7.3).
 */
export class GameSocket {
  private ws: WebSocket | null = null;
  private seq = 0;
  private attempt = 0;
  private closedByUs = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private offsets: number[] = [];

  constructor(private readonly handlers: SocketHandlers) {}

  /** Estimated server time minus local time, in ms. */
  get clockOffset(): number {
    if (this.offsets.length === 0) return 0;
    return this.offsets.reduce((a, b) => a + b, 0) / this.offsets.length;
  }

  /** Seeds the clock from a server timestamp received just now (half the RTT unknown). */
  seedClock(serverTime: number): void {
    if (this.offsets.length === 0) this.offsets.push(serverTime - Date.now());
  }

  connect(): void {
    this.closedByUs = false;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`;
    this.handlers.onStatus('connecting');
    const ws = new WebSocket(url);
    this.ws = ws;
    this.seq = 0;
    ws.onopen = () => {
      this.attempt = 0;
      this.handlers.onStatus('online');
      this.handlers.onOpen();
      this.startPings();
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = serverMessageSchema.parse(JSON.parse(String(ev.data)));
      } catch (err) {
        console.error('invalid server message', err);
        return;
      }
      if (msg.type === 'pong') {
        const now = Date.now();
        this.offsets.push(msg.serverTime - (msg.clientTime + now) / 2);
        if (this.offsets.length > PING_SAMPLES) this.offsets.shift();
      }
      this.handlers.onMessage(msg);
    };
    ws.onclose = (ev) => {
      clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closedByUs) return;
      if (ev.code === CLOSE_UNAUTHORIZED) {
        this.handlers.onStatus('unauthorized');
        return;
      }
      this.handlers.onStatus('offline');
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
      this.attempt += 1;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  /** Returns the message seq (used to match `replyTo`), or null when not connected. */
  send(payload: ClientPayload): number | null {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return null;
    const seq = this.seq++;
    this.ws.send(JSON.stringify({ ...payload, seq }));
    return seq;
  }

  close(): void {
    this.closedByUs = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
  }

  private startPings(): void {
    clearInterval(this.pingTimer);
    let sent = 0;
    const ping = () => {
      this.send({ type: 'ping', clientTime: Date.now() });
      sent += 1;
      // Five quick samples after connecting, then one every 30 s.
      if (sent === PING_SAMPLES) {
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(ping, 30_000);
      }
    };
    ping();
    this.pingTimer = setInterval(ping, 1000);
  }
}
