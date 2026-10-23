import { loadContent } from '@abismo/content';
import { TICK_MS } from '@abismo/engine';
import { buildApp } from './app.ts';
import { brasiliaDay } from '@abismo/protocol';
import { GameServer } from './game.ts';
import { RatesPool } from './ratesPool.ts';
import { connectPglite, connectPostgres } from './db/db.ts';
import { migrate } from './db/migrations.ts';
import { PgStore } from './store.ts';
import { Accounts, AttemptLimiter } from './accounts.ts';
import { turnstileVerifier } from './authRoutes.ts';
import { googleProvider } from './google.ts';

const content = loadContent();
const rates = new RatesPool();
// Postgres when DATABASE_URL is set (production, docker-compose); otherwise PGlite in a local
// folder, so development needs no database server.
const db = process.env.DATABASE_URL
  ? connectPostgres(process.env.DATABASE_URL)
  : await connectPglite(process.env.PGLITE_DIR ?? '.data/pglite');
await migrate(db);
const store = new PgStore(db);
const accounts = new Accounts(db);
/** Replaced by the HTTP app's logger once it exists. */
let log: (event: string, data?: Record<string, unknown>) => void = () => {};
const env = process.env;

const game = new GameServer({
  content,
  store,
  authenticate: (token) => accounts.authenticate(token),
  rates: (state, huntId) => rates.compute(state, huntId),
  now: () => Date.now(),
  dayOf: brasiliaDay,
  buildId: env.BUILD_ID ?? 'dev',
  log: (event, data) => log(event, data),
});

const clientUrl = env.CLIENT_URL ?? 'http://localhost:5173';
const app = await buildApp(game, {
  accounts,
  limiter: new AttemptLimiter(),
  verifyHuman: turnstileVerifier(env.TURNSTILE_SECRET),
  // No e-mail provider chosen yet (docs/plan-fase-1.md): the recovery link goes to the log.
  mailer: { send: async (to, subject, text) => log('mail', { to, subject, text }) },
  google:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? googleProvider(
          env.GOOGLE_CLIENT_ID,
          env.GOOGLE_CLIENT_SECRET,
          env.GOOGLE_REDIRECT_URI ?? 'http://localhost:5173/api/auth/google/callback',
        )
      : null,
  clientUrl,
  now: () => Date.now(),
});
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
