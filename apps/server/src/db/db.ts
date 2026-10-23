import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';

/**
 * The little the server needs from Postgres (decision 174): parameterized queries and
 * transactions. Two implementations run the same SQL: the `postgres` client against a real
 * server (production, `DATABASE_URL`), and PGlite, Postgres compiled to WebAssembly, in the
 * process (tests, and local development without Docker).
 */
export interface Db {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<R[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function connectPostgres(url: string): Db {
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  const wrap = (q: postgres.Sql | postgres.TransactionSql): Db => ({
    query: async <R>(text: string, params: unknown[] = []) =>
      (await q.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as R[],
    tx: (fn) => sql.begin((t) => fn(wrap(t))) as never,
    close: () => sql.end(),
  });
  return wrap(sql);
}

/** PGlite in memory (no `dir`) or persisted in a folder. */
export async function connectPglite(dir?: string): Promise<Db> {
  if (dir) mkdirSync(dir, { recursive: true });
  const pg = dir ? new PGlite(dir) : new PGlite();
  await pg.waitReady;
  const wrap = (q: Pick<PGlite, 'query'>): Db => ({
    query: async <R>(text: string, params: unknown[] = []) => (await q.query<R>(text, params)).rows,
    tx: (fn) => pg.transaction((t) => fn(wrap(t))),
    close: () => pg.close(),
  });
  return wrap(pg);
}
