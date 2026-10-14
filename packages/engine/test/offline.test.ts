import { describe, expect, it } from 'vitest';
import {
  deriveSeed,
  createRng,
  qtyOf,
  resolveOffline,
  setQueue,
  skillXp,
  startAction,
  step,
  type SlotState,
} from '../src/index.ts';
import { fixtureContent as content, fixtureState } from './fixture.ts';

const TWO_HOURS = 12_000;

function gemsScenario(seedKey: string): SlotState {
  const s = fixtureState([{ itemId: 'pick', qty: 1 }], seedKey);
  const r = startAction(s, 'mine_gems', { kind: 'materials' }, content);
  if (!r.ok) throw new Error('start rejected');
  return r.state;
}

interface Totals {
  xp: number;
  ore: number;
  gem: number;
  star: number;
}

function totals(state: SlotState): Totals {
  const all = (id: string) => qtyOf(state.bank, id) + qtyOf(state.inventory, id);
  return { xp: skillXp(state, 'mining'), ore: all('ore'), gem: all('gem'), star: all('star') };
}

function mean(list: Totals[]): Totals {
  const sum = list.reduce(
    (acc, t) => ({
      xp: acc.xp + t.xp,
      ore: acc.ore + t.ore,
      gem: acc.gem + t.gem,
      star: acc.star + t.star,
    }),
    { xp: 0, ore: 0, gem: 0, star: 0 },
  );
  const n = list.length;
  return { xp: sum.xp / n, ore: sum.ore / n, gem: sum.gem / n, star: sum.star / n };
}

describe('offline resolution vs tick by tick', () => {
  it('mean of 10,000 offline resolutions is within ±3% of the tick-by-tick simulation', () => {
    const offline: Totals[] = [];
    for (let i = 0; i < 10_000; i++) {
      offline.push(totals(resolveOffline(gemsScenario(`off-${i}`), TWO_HOURS, content).state));
    }
    const ticked: Totals[] = [];
    for (let i = 0; i < 2_000; i++) {
      ticked.push(totals(step(gemsScenario(`tick-${i}`), TWO_HOURS, content).state));
    }
    const a = mean(offline);
    const b = mean(ticked);
    for (const key of ['xp', 'ore', 'gem', 'star'] as const) {
      expect(Math.abs(a[key] - b[key]) / b[key], key).toBeLessThanOrEqual(0.03);
    }
    // 2,400 executions in 2 h: deterministic parts match exactly.
    expect(a.ore).toBe(2400);
    expect(a.xp).toBe(2400 * 40);
  });

  it('deterministic actions give exactly the same state as step (queue, materials, levels)', () => {
    const bank = [
      { itemId: 'ore', qty: 500 },
      { itemId: 'pick', qty: 1 },
    ];
    const q = setQueue(
      fixtureState(bank),
      [
        { actionId: 'mine_tin', stop: { kind: 'count', count: 120 } },
        { actionId: 'smelt', stop: { kind: 'materials' } },
        { actionId: 'mine_ore', stop: { kind: 'level', level: 20 } },
      ],
      content,
    );
    if (!q.ok) throw new Error('queue rejected');
    for (const ticks of [1, 4, 599, 1_000, 5_000, 72_000]) {
      const off = resolveOffline(q.state, ticks, content).state;
      const tick = step(q.state, ticks, content).state;
      // Offline deposits everything into the bank; compare bank + inventory.
      for (const id of ['ore', 'tin', 'bar']) {
        expect(qtyOf(off.bank, id) + qtyOf(off.inventory, id), `${id} @${ticks}`).toBe(
          qtyOf(tick.bank, id) + qtyOf(tick.inventory, id),
        );
      }
      expect(off.skills).toEqual(tick.skills);
      expect(off.activity).toEqual(tick.activity);
      expect(off.queue).toEqual(tick.queue);
      expect(off.tick).toBe(tick.tick);
    }
  });

  it('builds a summary with XP, levels, items and the stop reason', () => {
    const bank = [
      { itemId: 'ore', qty: 230 },
      { itemId: 'tin', qty: 200 },
      { itemId: 'pick', qty: 1 },
    ];
    const s = startAction(fixtureState(bank), 'smelt', { kind: 'materials' }, content);
    if (!s.ok) throw new Error('start rejected');
    const { summary } = resolveOffline(s.state, TWO_HOURS, content);
    expect(summary.executions).toEqual([{ actionId: 'smelt', count: 200 }]);
    expect(summary.xp).toEqual([{ skill: 'smithing', xpTenths: 6000 }]);
    expect(summary.levels).toEqual([{ skill: 'smithing', from: 1, to: 7 }]);
    expect(summary.gained).toEqual([{ itemId: 'bar', qty: 200 }]);
    expect(summary.consumed).toEqual([
      { itemId: 'ore', qty: 200 },
      { itemId: 'tin', qty: 200 },
    ]);
    expect(summary.stopped).toBe('outOfMaterials');
    expect(summary.highlights).toContainEqual({ kind: 'levelUp', skill: 'smithing', level: 7 });
  });

  it('flags rare drops as highlights', () => {
    const { summary } = resolveOffline(gemsScenario('rare'), TWO_HOURS, content);
    const star = summary.gained.find((g) => g.itemId === 'star')?.qty ?? 0;
    expect(star).toBeGreaterThan(0);
    expect(summary.highlights).toContainEqual({ kind: 'rareItem', itemId: 'star', qty: star });
  });

  it('is deterministic for the same state', () => {
    const s = gemsScenario('same');
    expect(resolveOffline(s, 72_000, content)).toEqual(resolveOffline(s, 72_000, content));
    expect(createRng(deriveSeed('a', 'main', 0))).not.toEqual(
      createRng(deriveSeed('a', 'main', 1)),
    );
  });
});
