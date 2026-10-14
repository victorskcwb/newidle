import { and, eq, sql } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '../db/client.ts';
import { bankItems, characters, itemLedger, type ledgerReason } from '../db/schema.ts';
import { errors } from '../errors.ts';
import { newId } from '../ids.ts';

export const COINS = 'coins';

export type LedgerReason = (typeof ledgerReason.enumValues)[number];

export interface ItemDelta {
  itemId: string;
  delta: number;
}

export interface ItemQty {
  itemId: string;
  qty: number;
}

/** Sums duplicates, drops zeros and sorts by itemId (a fixed lock order avoids deadlocks). */
export function normalizeDeltas(deltas: readonly ItemDelta[]): ItemDelta[] {
  const sums = new Map<string, number>();
  for (const d of deltas) {
    if (!Number.isSafeInteger(d.delta)) throw errors.validation({ itemId: d.itemId });
    sums.set(d.itemId, (sums.get(d.itemId) ?? 0) + d.delta);
  }
  return [...sums.entries()]
    .filter(([, delta]) => delta !== 0)
    .map(([itemId, delta]) => ({ itemId, delta }))
    .sort((a, b) => (a.itemId < b.itemId ? -1 : 1));
}

/**
 * The only writer of bank items and coins (section 8). Every change runs in one transaction
 * with the character row locked (so changes to one character are serialized) and writes one
 * item_ledger row per item.
 */
export class InventoryService {
  constructor(private readonly db: Db) {}

  /** Runs `fn` in a transaction holding the character's row lock. */
  async withCharacterLock<T>(characterId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await lockCharacter(tx, characterId);
      return fn(tx);
    });
  }

  /** Applies all deltas atomically; throws insufficientItems (rolling back) if any would go negative. */
  async change(
    characterId: string,
    deltas: readonly ItemDelta[],
    reason: LedgerReason,
    refId?: string,
  ): Promise<void> {
    await this.withCharacterLock(characterId, (tx) =>
      applyDeltas(tx, characterId, deltas, reason, refId),
    );
  }

  bank(characterId: string, db: DbOrTx = this.db): Promise<ItemQty[]> {
    return readBank(db, characterId);
  }
}

export async function lockCharacter(tx: Tx, characterId: string): Promise<void> {
  const rows = await tx
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.id, characterId))
    .for('update');
  if (rows.length === 0) throw errors.noCharacter();
}

/** Applies deltas inside a transaction whose caller already holds the character lock. */
export async function applyDeltas(
  tx: Tx,
  characterId: string,
  deltas: readonly ItemDelta[],
  reason: LedgerReason,
  refId?: string,
): Promise<void> {
  const normalized = normalizeDeltas(deltas);
  if (normalized.length === 0) return;

  for (const { itemId, delta } of normalized) {
    if (itemId === COINS) {
      const updated = await tx
        .update(characters)
        .set({ coins: sql`${characters.coins} + ${delta}` })
        .where(and(eq(characters.id, characterId), sql`${characters.coins} + ${delta} >= 0`))
        .returning({ coins: characters.coins });
      if (updated.length === 0) throw errors.insufficientItems(itemId);
      continue;
    }
    if (delta > 0) {
      await tx
        .insert(bankItems)
        .values({ characterId, itemId, qty: delta })
        .onConflictDoUpdate({
          target: [bankItems.characterId, bankItems.itemId],
          set: { qty: sql`${bankItems.qty} + excluded.qty` },
        });
      continue;
    }
    const where = and(eq(bankItems.characterId, characterId), eq(bankItems.itemId, itemId));
    const [row] = await tx
      .select({ qty: bankItems.qty })
      .from(bankItems)
      .where(where)
      .for('update');
    const remaining = (row?.qty ?? 0) + delta;
    if (remaining < 0) throw errors.insufficientItems(itemId);
    if (remaining === 0) await tx.delete(bankItems).where(where);
    else await tx.update(bankItems).set({ qty: remaining }).where(where);
  }

  await tx.insert(itemLedger).values(
    normalized.map((d) => ({
      id: newId(),
      characterId,
      itemId: d.itemId,
      delta: d.delta,
      reason,
      refId: refId ?? null,
    })),
  );
}

export async function readBank(db: DbOrTx, characterId: string): Promise<ItemQty[]> {
  const rows = await db
    .select({ itemId: bankItems.itemId, qty: bankItems.qty })
    .from(bankItems)
    .where(eq(bankItems.characterId, characterId));
  return rows.sort((a, b) => (a.itemId < b.itemId ? -1 : 1));
}

export interface LedgerMismatch {
  characterId: string;
  itemId: string;
  ledger: number;
  actual: number;
}

/**
 * Consistency check (section 8.1, run nightly): per character and item, the ledger sum must
 * equal the bank quantity (for coins, the character's coins). Returns every mismatch.
 */
export async function findLedgerMismatches(
  db: DbOrTx,
  characterId?: string,
): Promise<LedgerMismatch[]> {
  const byChar = characterId ? sql`WHERE character_id = ${characterId}` : sql``;
  const byId = characterId ? sql`WHERE id = ${characterId}` : sql``;
  const result = await db.execute<{
    character_id: string;
    item_id: string;
    ledger: string;
    actual: string;
  }>(sql`
    WITH ledger AS (
      SELECT character_id, item_id, SUM(delta) AS total FROM item_ledger ${byChar} GROUP BY 1, 2
    ),
    actual AS (
      SELECT character_id, item_id, qty AS total FROM bank_items ${byChar}
      UNION ALL
      SELECT id, ${COINS}, coins FROM characters ${byId}
    )
    SELECT COALESCE(l.character_id, a.character_id) AS character_id,
           COALESCE(l.item_id, a.item_id) AS item_id,
           COALESCE(l.total, 0) AS ledger,
           COALESCE(a.total, 0) AS actual
    FROM ledger l FULL OUTER JOIN actual a
      ON l.character_id = a.character_id AND l.item_id = a.item_id
    WHERE COALESCE(l.total, 0) <> COALESCE(a.total, 0)
  `);
  return result.rows.map((r) => ({
    characterId: r.character_id,
    itemId: r.item_id,
    ledger: Number(r.ledger),
    actual: Number(r.actual),
  }));
}
