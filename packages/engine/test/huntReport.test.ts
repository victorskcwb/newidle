import { describe, expect, it } from 'vitest';
import {
  addToReport,
  newHuntReport,
  reportRates,
  returnToTown,
  startHunt,
  step,
  TICKS_PER_HOUR,
} from '../src/index.ts';
import { content, HUNT, newGame } from './fixture.ts';

describe('hunt report', () => {
  it('adds up the same kills, XP and gold as the lifetime totals', () => {
    const s = newGame(3);
    s.consumables.potion_hp_small = 1_000;
    const kills0 = s.lifetime.kills;
    const xp0 = s.lifetime.xpEarned;
    let r = addToReport(null, startHunt(s, content, HUNT), content);
    r = addToReport(r, step(s, content, TICKS_PER_HOUR / 2), content)!;
    expect(r.huntId).toBe(HUNT);
    expect(r.kills).toBeGreaterThan(0);
    expect(BigInt(r.kills)).toBe(s.lifetime.kills - kills0);
    expect(BigInt(r.xp)).toBe(s.lifetime.xpEarned - xp0);
    expect(r.gold).toBeGreaterThan(0);
    const used = Object.values(r.potionsUsed).reduce((a, b) => a + b, 0);
    expect(r.supplies).toBe(used * content.consumables.get('potion_hp_small')!.price!);
    const rates = reportRates(r);
    expect(rates.profit).toBe(r.gold - r.supplies);
    expect(rates.xpPerHour).toBeGreaterThan(r.xp);
  });

  it('freezes when the hero goes back on purpose, and restarts with the next hunt', () => {
    const s = newGame(4);
    let r = addToReport(null, startHunt(s, content, HUNT), content);
    r = addToReport(r, step(s, content, 3_000), content);
    r = addToReport(r, returnToTown(s, content), content)!;
    expect(r.stoppedTick).toBe(s.tick);
    const frozen = r.kills;
    r = addToReport(r, step(s, content, 3_000), content)!;
    expect(r.kills).toBe(frozen);
    r = addToReport(r, startHunt(s, content, HUNT), content)!;
    expect(r.kills).toBe(0);
    expect(r.stoppedTick).toBeNull();
  });

  it('has no rates for its first minute', () => {
    const r = newHuntReport(HUNT, 0);
    r.lastTick = 100;
    r.xp = 50;
    expect(reportRates(r).xpPerHour).toBeNull();
  });

  it('does not change the report it was given', () => {
    const r = newHuntReport(HUNT, 0);
    const next = addToReport(
      r,
      [{ type: 'MonsterDied', tick: 5, uid: 1, monsterId: 'x', xp: 10, gold: 3 }],
      content,
    )!;
    expect(next.kills).toBe(1);
    expect(r.kills).toBe(0);
  });
});
