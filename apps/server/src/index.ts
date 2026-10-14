import { loadBundledContent } from '@valdren/content';
import { existsSync } from 'node:fs';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDatabase, runMigrations } from './db/client.ts';

const envFile = new URL('../../../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadConfig();
const database = createDatabase(config.databaseUrl);

/** In development the database may still be starting (pnpm dev starts both at once). */
async function waitForDatabase(attempts = 60): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await database.pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

await waitForDatabase();
if (config.NODE_ENV !== 'production') await runMigrations(database.db);

const { app } = await buildApp({ config, db: database.db, content: loadBundledContent() });

const shutdown = async () => {
  await app.close();
  await database.close();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
