import { startEmbeddedPostgres } from '@valdren/dev-db';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
import { createDatabase, runMigrations } from '../src/db/client.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/** One throwaway Postgres for the whole run; tests isolate themselves with unique accounts. */
export default async function setup(project: TestProject) {
  const dataDir = join(mkdtempSync(join(tmpdir(), 'valdren-test-')), 'pg');
  const port = 55_000 + Math.floor(Math.random() * 5_000);
  const pg = await startEmbeddedPostgres({
    dataDir,
    port,
    persistent: false,
    database: 'valdren_test',
  });
  const database = createDatabase(pg.url);
  await runMigrations(database.db);
  await database.close();
  project.provide('databaseUrl', pg.url);
  return async () => {
    await pg.stop();
    rmSync(dataDir, { recursive: true, force: true });
  };
}
