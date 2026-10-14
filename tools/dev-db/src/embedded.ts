import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';

export interface EmbeddedDb {
  url: string;
  stop: () => Promise<void>;
}

/**
 * Real Postgres binaries run as a child process (no Docker needed). Used by `pnpm dev`
 * when DATABASE_URL is unset, and by the integration tests.
 */
export async function startEmbeddedPostgres(opts: {
  dataDir: string;
  port: number;
  persistent: boolean;
  database?: string;
}): Promise<EmbeddedDb> {
  const user = 'valdren';
  const password = 'valdren';
  const database = opts.database ?? 'valdren';
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dataDir,
    user,
    password,
    port: opts.port,
    persistent: opts.persistent,
    onLog: () => {},
  });
  if (!existsSync(opts.dataDir)) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(database);
  } catch {
    // Already exists (persistent data dir).
  }
  return {
    url: `postgres://${user}:${password}@localhost:${opts.port}/${database}`,
    stop: () => pg.stop(),
  };
}
