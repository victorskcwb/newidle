import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InventoryService } from '../src/services/inventory.ts';
import { COINS, findLedgerMismatches, normalizeDeltas } from '../src/services/inventory.ts';
import { testApp, testDb, uniqueUser } from './helpers.ts';

let inventory: InventoryService;
let createCharacter: () => Promise<string>;

beforeAll(async () => {
  const { services } = await testApp();
  inventory = services.inventory;
  createCharacter = async () => {
    const u = uniqueUser();
    const { accountId } = await services.auth.register(u.email, u.password, 'normal', {
      ip: null,
      userAgent: null,
    });
    return services.characters.create(accountId, u.name, { skin: 1, hair: 2, outfit: 3 });
  };
});

afterAll(async () => {
  await testDb().close();
});

const qty = async (characterId: string, itemId: string) =>
  (await inventory.bank(characterId)).find((i) => i.itemId === itemId)?.qty ?? 0;

describe('normalizeDeltas', () => {
  it('merges duplicates, drops zeros and sorts', () => {
    expect(
      normalizeDeltas([
        { itemId: 'b', delta: 2 },
        { itemId: 'a', delta: 1 },
        { itemId: 'b', delta: -2 },
        { itemId: 'a', delta: 3 },
      ]),
    ).toEqual([{ itemId: 'a', delta: 4 }]);
  });
});

describe('InventoryService', () => {
  it('starts with the starter kit and a matching ledger', async () => {
    const id = await createCharacter();
    expect(await inventory.bank(id)).toEqual([
      { itemId: 'hammer', qty: 1 },
      { itemId: 'pickaxe_bronze', qty: 1 },
    ]);
    expect(await findLedgerMismatches(testDb().db, id)).toEqual([]);
  });

  it('adds, removes and deletes empty stacks; coins live on the character', async () => {
    const id = await createCharacter();
    await inventory.change(
      id,
      [
        { itemId: 'ore_copper', delta: 10 },
        { itemId: COINS, delta: 50 },
      ],
      'admin',
    );
    await inventory.change(
      id,
      [
        { itemId: 'ore_copper', delta: -10 },
        { itemId: COINS, delta: -20 },
      ],
      'admin',
    );
    expect(await qty(id, 'ore_copper')).toBe(0);
    expect((await inventory.bank(id)).some((i) => i.itemId === 'ore_copper')).toBe(false);
    expect(await findLedgerMismatches(testDb().db, id)).toEqual([]);
  });

  it('is all-or-nothing: one insufficient item rolls back the whole change', async () => {
    const id = await createCharacter();
    await inventory.change(id, [{ itemId: 'ore_tin', delta: 3 }], 'admin');
    await expect(
      inventory.change(
        id,
        [
          { itemId: 'ore_tin', delta: -3 },
          { itemId: 'bar_bronze', delta: 5 },
          { itemId: 'ore_copper', delta: -1 },
        ],
        'admin',
      ),
    ).rejects.toMatchObject({ code: 'insufficientItems' });
    expect(await qty(id, 'ore_tin')).toBe(3);
    expect(await qty(id, 'bar_bronze')).toBe(0);
    await expect(
      inventory.change(id, [{ itemId: COINS, delta: -1 }], 'admin'),
    ).rejects.toMatchObject({
      code: 'insufficientItems',
    });
    expect(await findLedgerMismatches(testDb().db, id)).toEqual([]);
  });

  it('never duplicates or over-spends under concurrency', async () => {
    const id = await createCharacter();
    await inventory.change(id, [{ itemId: 'ore_copper', delta: 10 }], 'admin');
    // 40 concurrent attempts to spend 1 ore each, while 40 others add a brand-new item.
    const spends = Array.from({ length: 40 }, () =>
      inventory.change(
        id,
        [
          { itemId: 'ore_copper', delta: -1 },
          { itemId: COINS, delta: 1 },
        ],
        'shop',
      ),
    );
    const gains = Array.from({ length: 40 }, () =>
      inventory.change(id, [{ itemId: 'bar_bronze', delta: 1 }], 'admin'),
    );
    const results = await Promise.allSettled([...spends, ...gains]);
    const spent = results.slice(0, 40).filter((r) => r.status === 'fulfilled').length;
    expect(spent).toBe(10);
    expect(results.slice(40).every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await qty(id, 'ore_copper')).toBe(0);
    expect(await qty(id, 'bar_bronze')).toBe(40);
    expect(await findLedgerMismatches(testDb().db, id)).toEqual([]);
  });
});
