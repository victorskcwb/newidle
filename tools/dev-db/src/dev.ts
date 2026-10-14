/**
 * `pnpm dev` database: a persistent embedded Postgres on port 5433 (data in tools/dev-db/.pgdata).
 * Skipped when DATABASE_URL is set (e.g. Docker Compose from `pnpm dev:infra`).
 * DEV_DB_PORT and DEV_DB_DIR override the port and data directory (the e2e tests use their own).
 */
import { fileURLToPath } from 'node:url';
import { startEmbeddedPostgres } from './embedded.ts';

if (process.env.DATABASE_URL) {
  console.log('dev-db: DATABASE_URL is set, not starting the embedded Postgres');
} else {
  const db = await startEmbeddedPostgres({
    dataDir: process.env.DEV_DB_DIR ?? fileURLToPath(new URL('../.pgdata', import.meta.url)),
    port: Number(process.env.DEV_DB_PORT ?? 5433),
    persistent: true,
  });
  console.log(`dev-db: Postgres ready at ${db.url}`);
  const stop = async () => {
    await db.stop();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  // Keep the process alive while turbo runs the other dev tasks.
  setInterval(() => {}, 1 << 30);
}
