import { loadContent } from '@abismo/content';
import { TICK_MS } from '@abismo/engine';
import { buildApp } from './app.ts';
import { GameServer, brasiliaDay } from './game.ts';
import { RatesPool } from './ratesPool.ts';
import { MemoryStore } from './store.ts';

const content = loadContent();
const rates = new RatesPool();
const store = new MemoryStore();
const dev = process.env.NODE_ENV !== 'production';
/** Replaced by the HTTP app's logger once it exists. */
let log: (event: string, data?: Record<string, unknown>) => void = () => {};

const game = new GameServer({
  content,
  store,
  // Until accounts exist (commit 8 of docs/plan-fase-1.md): development tokens "dev:<account>".
  authenticate: async (token) => (dev && token.startsWith('dev:') ? token.slice(4) : null),
  rates: (state, huntId) => rates.compute(state, huntId),
  now: () => Date.now(),
  dayOf: brasiliaDay,
  buildId: process.env.BUILD_ID ?? 'dev',
  log: (event, data) => log(event, data),
});

const app = await buildApp(game);
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
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ port: Number(process.env.PORT ?? 8787), host: process.env.HOST ?? '0.0.0.0' });
