import { describe, expect, it } from 'vitest';
import {
  bestiaryDamagePct,
  bestiaryTier,
  computeRates,
  decodeSave,
  encodeSave,
  resolveOffline,
  stepQuiet,
  TICKS_PER_HOUR,
} from '../src/index.ts';
import { content, HUNT, hunting, newGame } from './fixture.ts';

describe('bestiary', () => {
  it('tiers follow the kills, with smaller numbers for bosses', () => {
    const s = newGame();
    const [t1, t2, t3] = content.bestiaryTiers;
    expect(bestiaryTier(s, content, 'bone_walker')).toBe(0);
    expect(bestiaryDamagePct(s, content, 'bone_walker')).toBe(0);
    s.bestiary.bone_walker = t1!.kills;
    expect(bestiaryTier(s, content, 'bone_walker')).toBe(1);
    expect(bestiaryDamagePct(s, content, 'bone_walker')).toBe(t1!.damagePct);
    s.bestiary.bone_walker = t3!.kills;
    expect(bestiaryDamagePct(s, content, 'bone_walker')).toBe(t3!.damagePct);
    s.bestiary.gravekeeper = t2!.bossKills;
    expect(bestiaryTier(s, content, 'gravekeeper')).toBe(2);
  });

  it('counts every kill while hunting and while away', () => {
    const s = hunting(4);
    stepQuiet(s, content, TICKS_PER_HOUR / 4);
    const counted = Object.values(s.bestiary).reduce((a, b) => a + b, 0);
    expect(BigInt(counted)).toBe(s.lifetime.kills);

    const rates = computeRates(s, content, HUNT);
    const before = { ...s.bestiary };
    const report = resolveOffline(s, content, rates, 2 * TICKS_PER_HOUR);
    const gained = Object.entries(s.bestiary).reduce((n, [id, k]) => n + k - (before[id] ?? 0), 0);
    expect(gained).toBe(report.kills);
  });

  it('a high tier kills faster', () => {
    const fresh = hunting(9);
    const veteran = hunting(9);
    for (const id of ['bone_walker', 'grave_rat', 'gravekeeper']) {
      veteran.bestiary[id] = 1_000_000;
    }
    const a = computeRates(fresh, content, HUNT);
    const b = computeRates(veteran, content, HUNT);
    expect(b.killsPerHour).toBeGreaterThan(a.killsPerHour);
  });

  it('migrates v9 saves with an empty bestiary', () => {
    const s = newGame();
    const raw = JSON.parse(encodeSave(s, 1)) as {
      version: number;
      state: Record<string, unknown>;
    };
    raw.version = 9;
    raw.state.version = 9;
    delete raw.state.bestiary;
    expect(decodeSave(JSON.stringify(raw), content).state).toEqual(s);
  });
});
