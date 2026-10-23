import { loadContent } from '@abismo/content';
import { createGame, decodeSave, encodeSave, resolveOffline } from '@abismo/engine';
import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_TICKS,
  CONTENT_VERSION,
  PROTOCOL_VERSION,
  brasiliaDay,
  decodeClientMessage,
  isCheckpoint,
  nextCheckpoint,
  decodeServerMessage,
  encodeMessage,
  tickAt,
  type ClientMessage,
  type ServerMessage,
} from '../src/index.ts';

const content = loadContent();

describe('protocol', () => {
  it('client messages survive the codec', () => {
    const messages: ClientMessage[] = [
      { type: 'hello', protocol: PROTOCOL_VERSION, buildId: 'dev', token: 't0k3n' },
      { type: 'intent', seq: 1, atTick: 120, intent: { type: 'equip', uid: 4 } },
      {
        type: 'intent',
        seq: 2,
        atTick: 125,
        intent: { type: 'refine', uid: 4, useProtection: true, useTempering: false },
      },
      { type: 'resync' },
      { type: 'ping', t: 1234.5 },
    ];
    for (const m of messages) expect(decodeClientMessage(encodeMessage(m))).toEqual(m);
  });

  it('the welcome carries the state as save text and a report with bigints', () => {
    const s = createGame(content, { name: 'Rede', seed: [1, 2, 3, 4] });
    const report = resolveOffline(s, content, null, 100);
    report.gold = 12_345_678_901_234_567_890n;
    const welcome: ServerMessage = {
      type: 'welcome',
      serverNow: 1_700_000_000_000,
      clock: { tick: s.tick, atMs: 1_700_000_000_000 },
      save: encodeSave(s, 1_700_000_000_000),
      lastSeq: 0,
      offlineReport: report,
      contentVersion: CONTENT_VERSION,
      checkpointPhase: 17,
    };
    const back = decodeServerMessage(encodeMessage(welcome));
    expect(back).toEqual(welcome);
    if (back?.type !== 'welcome') throw new Error('expected a welcome');
    expect(decodeSave(back.save, content).state).toEqual(s);
    expect(back.offlineReport?.gold).toBe(12_345_678_901_234_567_890n);
  });

  it('refuses garbage, unknown messages, forged fields and bad intents', () => {
    const bad = [
      'not json',
      '{}',
      JSON.stringify({ type: 'hello', protocol: 999, buildId: 'dev', token: 'x' }),
      JSON.stringify({ type: 'state', save: '{}' }),
      JSON.stringify({ type: 'intent', seq: 0, atTick: 1, intent: { type: 'equip', uid: 1 } }),
      JSON.stringify({ type: 'intent', seq: 1, atTick: -1, intent: { type: 'equip', uid: 1 } }),
      JSON.stringify({ type: 'intent', seq: 1, atTick: 1, intent: { type: 'give_gold' } }),
      JSON.stringify({ type: 'resync', state: { gold: 1e9 } }),
      'x'.repeat(1_000_001),
    ];
    for (const text of bad) expect(decodeClientMessage(text), text.slice(0, 80)).toBeNull();
  });

  it('server messages are not accepted as client messages and vice versa', () => {
    const ack = encodeMessage({ type: 'ack', seq: 1, appliedAt: 10 });
    expect(decodeClientMessage(ack)).toBeNull();
    expect(decodeServerMessage(ack)).toEqual({ type: 'ack', seq: 1, appliedAt: 10 });
    expect(decodeServerMessage(encodeMessage({ type: 'resync' }))).toBeNull();
  });

  it('tickAt follows the server clock and never goes back', () => {
    const c = { tick: 1_000, atMs: 50_000 };
    expect(tickAt(c, 50_000)).toBe(1_000);
    expect(tickAt(c, 50_099)).toBe(1_000);
    expect(tickAt(c, 50_100)).toBe(1_001);
    expect(tickAt(c, 60_000)).toBe(1_100);
    expect(tickAt(c, 40_000)).toBe(1_000);
  });

  it('the game day turns at midnight in Brasília (03:00 UTC), all year round', () => {
    const at = (iso: string) => brasiliaDay(Date.parse(iso));
    expect(at('2026-10-24T02:59:59Z')).toBe(at('2026-10-23T03:00:00Z'));
    expect(at('2026-10-24T03:00:00Z')).toBe(at('2026-10-23T03:00:00Z') + 1);
    // January (southern summer): still 03:00 UTC, no daylight saving time since 2019.
    expect(at('2027-01-15T03:00:00Z') - at('2027-01-15T02:59:59Z')).toBe(1);
  });

  it('checkpoints fall every CHECKPOINT_TICKS on the hero phase', () => {
    const C = CHECKPOINT_TICKS;
    expect(isCheckpoint(17, 17)).toBe(true);
    expect(isCheckpoint(C + 17, 17)).toBe(true);
    expect(isCheckpoint(C, 17)).toBe(false);
    expect(nextCheckpoint(0, 17)).toBe(17);
    expect(nextCheckpoint(17, 17)).toBe(C + 17);
    expect(nextCheckpoint(C - 1, 0)).toBe(C);
    expect(nextCheckpoint(C, 0)).toBe(2 * C);
  });
});
