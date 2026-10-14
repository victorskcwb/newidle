import { loadBundledContent } from '@valdren/content';
import Fastify from 'fastify';

/**
 * Server skeleton. Auth, Postgres (Drizzle), Redis and the WebSocket protocol come next
 * in milestone 1 (see docs/plan-marco-1.md).
 */
const content = loadBundledContent();
const app = Fastify({ logger: true });

app.get('/health', async () => ({
  ok: true,
  content: { items: content.items.size, actions: content.actions.size },
}));

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: '0.0.0.0' }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
