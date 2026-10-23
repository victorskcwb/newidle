import { loadContent } from '@abismo/content';
import { TICK_MS } from '@abismo/engine';
import { buildApp } from './app.ts';
import { brasiliaDay } from '@abismo/protocol';
import { GameServer } from './game.ts';
import { RatesPool } from './ratesPool.ts';
import { connectPglite, connectPostgres } from './db/db.ts';
import { migrate } from './db/migrations.ts';
import { PgStore } from './store.ts';

const content = loadContent();
const rates = new RatesPool();
// Postgres when DATABASE_URL is set (production, docker-compose); otherwise PGlite in a local
// folder, so development needs no database server.
const db = process.env.DATABASE_URL
  ? connectPostgres(process.env.DATABASE_URL)
  : await connectPglite(process.env.PGLITE_DIR ?? '.data/pglite');
await migrate(db);
const store = new PgStore(db);
const dev = process.env.NODE_ENV !== 'production';
/** Replaced by the HTTP app's logger once it exists. */
let log: (event: string, data?: Record<string, unknown>) => void = () => {};

// Until accounts exist (commit 8 of docs/plan-fase-1.md): development tokens "dev:<account>".
const authenticate = async (token: string) =>
  dev && /^dev:[a-z0-9-]{1,40}$/.test(token) ? token.slice(4) : null;

const game = new GameServer({
  content,
  store,
  authenticate,
  rates: (state, huntId) => rates.compute(state, huntId),
  now: () => Date.now(),
  dayOf: brasiliaDay,
  buildId: process.env.BUILD_ID ?? 'dev',
  log: (event, data) => log(event, data),
});

const app = await buildApp(game, { dev, authenticate });
log = (event, data) => app.log.info({ event, ...data });

let ticking = false;
const loop = setInterval(() => {
  if (ticking) return;
  ticking = true;
  game
    .tick()
    .catch((e: unknown) => app.log.error(e))
    .finally(() => (ticking = false));
}, TICK_MS);

async function shutdown() {
  clearInterval(loop);
  await game.saveAll();
  await rates.close();
  await app.close();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ port: Number(process.env.PORT ?? 8787), host: process.env.HOST ?? '0.0.0.0' });
