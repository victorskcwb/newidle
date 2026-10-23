import { SAVE_VERSION, createGame, encodeSave } from '@abismo/engine';
import { brasiliaDay } from '@abismo/protocol';
import { describe, expect, it } from 'vitest';
import { connectPglite, type Db } from '../src/db/db.ts';
import { MIGRATIONS, migrate } from '../src/db/migrations.ts';
import { PgStore, SNAPSHOT_DAYS, type HeroRecord } from '../src/store.ts';
import { World, content } from './harness.ts';

async function freshDb(): Promise<Db> {
  const db = await connectPglite();
  await migrate(db);
  return db;
}

function record(name: string, atMs: number, gold = 0n): HeroRecord {
  const s = createGame(content, { name, seed: [1, 2, 3, 4] });
  s.gold = gold;
  return {
    save: encodeSave(s, atMs),
    savedAtMs: atMs,
    name,
    tick: s.tick,
    saveVersion: SAVE_VERSION,
  };
}

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;

describe('Postgres store (PGlite)', () => {
  it('migrations run once and are recorded', async () => {
    const db = await connectPglite();
    expect(await migrate(db)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await migrate(db)).toEqual([]);
    await db.close();
  });

  it('creates once, claims, saves while owning, and refuses a save after a takeover', async () => {
    const db = await freshDb();
    const store = new PgStore(db);
    expect(await store.create('a', record('Ana', T0))).toBe(true);
    expect(await store.create('a', record('Outra', T0))).toBe(false);
    expect(await store.claim('nobody', 's0')).toBeNull();

    const first = await store.claim('a', 's1');
    expect(first?.name).toBe('Ana');
    expect(await store.save('a', 's1', record('Ana', T0 + 1_000, 50n))).toBe(true);

    // Another device (another process) opens the hero: the older session can no longer save.
    const second = await store.claim('a', 's2');
    expect(second?.savedAtMs).toBe(T0 + 1_000);
    expect(second?.save).toContain('"gold":{"$bigint":"50"}');
    expect(await store.save('a', 's1', record('Ana', T0 + 2_000, 999n))).toBe(false);
    expect(await store.save('a', 's2', record('Ana', T0 + 3_000, 60n))).toBe(true);

    await store.release('a', 's1'); // not the owner: no effect
    const [row] = await db.query<{ owner_session: string }>(
      'SELECT owner_session FROM heroes WHERE account_id = $1',
      ['a'],
    );
    expect(row?.owner_session).toBe('s2');
    await store.release('a', 's2');
    const [after] = await db.query<{ owner_session: string | null }>(
      'SELECT owner_session FROM heroes WHERE account_id = $1',
      ['a'],
    );
    expect(after?.owner_session).toBeNull();
    await db.close();
  });

  it('keeps one snapshot per day for the last days', async () => {
    const db = await freshDb();
    const store = new PgStore(db);
    await store.create('b', record('Bia', T0));
    await store.claim('b', 's');
    for (let d = 0; d < SNAPSHOT_DAYS + 3; d++) {
      for (let k = 0; k < 3; k++)
        await store.save('b', 's', record('Bia', T0 + d * DAY + k * 1000));
    }
    const days = (
      await db.query<{ day: number }>('SELECT day FROM hero_snapshots ORDER BY day', [])
    ).map((r) => r.day);
    const last = brasiliaDay(T0 + (SNAPSHOT_DAYS + 2) * DAY);
    expect(days).toEqual(
      Array.from({ length: SNAPSHOT_DAYS }, (_, i) => last - SNAPSHOT_DAYS + 1 + i),
    );
    await db.close();
  });

  it('the game server plays on Postgres: progress survives closing and reopening', async () => {
    const db = await freshDb();
    const w = new World(new PgStore(db));
    await w.newHero('caio');
    const c = w.connect('caio');
    await w.run(500);
    c.act({ type: 'start_hunt', huntId: 'forgotten_cemetery' });
    await w.run(120_000);
    c.disconnect();
    await w.run(500);
    const [saved] = await db.query<{ tick: string; owner_session: string | null }>(
      'SELECT tick, owner_session FROM heroes WHERE account_id = $1',
      ['caio'],
    );
    expect(Number(saved!.tick)).toBeGreaterThanOrEqual(1_200);
    expect(saved!.owner_session).toBeNull();
    const back = w.connect('caio');
    await w.run(1_000);
    expect(back.replica!.state.tick).toBeGreaterThanOrEqual(Number(saved!.tick));
    expect(back.replica!.state.lifetime.kills).toBeGreaterThan(0n);
    await db.close();
  });
});
