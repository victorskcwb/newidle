import { describe, expect, it } from 'vitest';
import {
  claimLogin,
  decodeSave,
  encodeSave,
  IntentError,
  loginDue,
  loginSlot,
} from '../src/index.ts';
import { content, newGame } from './fixture.ts';

describe('login calendar', () => {
  it('pays one entry per day, in order, and never twice on the same day', () => {
    const s = newGame();
    expect(loginDue(s, 100)).toBe(true);
    const first = content.loginRewards[0]!.reward;
    expect(claimLogin(s, content, 100)).toEqual(first);
    for (const [id, qty] of Object.entries(first)) {
      const owned = content.consumables.has(id) ? s.consumables[id] : Number(s.materials[id]);
      expect(owned).toBeGreaterThanOrEqual(qty);
    }
    expect(loginDue(s, 100)).toBe(false);
    expect(() => claimLogin(s, content, 100)).toThrow(IntentError);
    // A clock turned back does not pay again.
    expect(loginDue(s, 99)).toBe(false);
  });

  it('counts days instead of streaks: a missed week takes the next entry', () => {
    const s = newGame();
    claimLogin(s, content, 10);
    claimLogin(s, content, 11);
    claimLogin(s, content, 30);
    expect(s.login).toEqual({ lastDay: 30, claimed: 3 });
    expect(loginSlot(s, content)).toBe(3);
  });

  it('wraps around after the last day of the calendar', () => {
    const s = newGame();
    const n = content.loginRewards.length;
    for (let d = 0; d < n; d++) claimLogin(s, content, d);
    expect(loginSlot(s, content)).toBe(0);
    expect(claimLogin(s, content, n)).toEqual(content.loginRewards[0]!.reward);
  });

  it('every seventh day is a big one', () => {
    content.loginRewards.forEach((day, i) => expect(!!day.big).toBe((i + 1) % 7 === 0));
  });

  it('migrates v8 saves with nothing claimed', () => {
    const s = newGame();
    const raw = JSON.parse(encodeSave(s, 1)) as {
      version: number;
      state: Record<string, unknown>;
    };
    raw.version = 8;
    raw.state.version = 8;
    delete raw.state.login;
    expect(decodeSave(JSON.stringify(raw), content).state).toEqual(s);
  });
});
