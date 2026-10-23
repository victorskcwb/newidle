import type { Db } from './db.ts';

/**
 * Schema migrations, applied in order, each in its own transaction, and recorded in
 * `schema_migrations`. Never edit a migration that shipped: add the next one. Each statement
 * ends with a semicolon at the end of its line.
 */
export const MIGRATIONS: readonly { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE heroes (
        account_id     text PRIMARY KEY,
        name           text NOT NULL,
        save           text NOT NULL,
        save_version   integer NOT NULL,
        tick           bigint NOT NULL,
        saved_at_ms    bigint NOT NULL,
        origin         text NOT NULL DEFAULT 'new' CHECK (origin IN ('new', 'imported')),
        -- The game session that holds the hero; a newer session takes it over (decision 178).
        owner_session  text,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE hero_snapshots (
        account_id  text NOT NULL REFERENCES heroes (account_id) ON DELETE CASCADE,
        day         integer NOT NULL,
        save        text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (account_id, day)
      );
    `,
  },
];

export async function migrate(db: Db): Promise<number[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version integer PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const done = new Set(
    (await db.query<{ version: number }>('SELECT version FROM schema_migrations')).map(
      (r) => r.version,
    ),
  );
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    await db.tx(async (t) => {
      // Statements end with ";" at the end of a line (comments may contain semicolons).
      for (const statement of m.sql.split(/;\s*$/m).map((x) => x.trim())) {
        if (statement) await t.query(statement);
      }
      await t.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
    });
    applied.push(m.version);
  }
  return applied;
}
