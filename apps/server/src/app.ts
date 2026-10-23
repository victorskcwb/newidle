import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { MAX_FRAME_BYTES, newHeroSchema } from '@abismo/protocol';
import { z } from 'zod';
import type { GameServer } from './game.ts';

export interface AppOptions {
  /** Development routes (hero creation by token) until accounts exist. */
  dev: boolean;
  authenticate(token: string): Promise<string | null>;
}

const devHeroBody = newHeroSchema.extend({ token: z.string().min(1).max(256) });

/**
 * HTTP and WebSocket front of the game server. Each socket is handed to the GameServer, which
 * owns all the rules; this file only moves frames.
 */
export async function buildApp(game: GameServer, o: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  await app.register(websocket, { options: { maxPayload: MAX_FRAME_BYTES } });

  app.get('/health', async () => ({ ok: true, online: game.online }));

  if (o.dev) {
    app.post('/api/dev/heroes', async (req, reply) => {
      const body = devHeroBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'invalid_hero' });
      const accountId = await o.authenticate(body.data.token);
      if (!accountId) return reply.code(401).send({ error: 'auth' });
      const { name, appearance } = body.data;
      const result = await game.newHero(accountId, { name, appearance });
      return reply.code(result === 'created' ? 201 : 409).send({ result });
    });
  }

  app.get('/ws', { websocket: true }, (socket) => {
    const link = game.connect({
      send: (text) => {
        if (socket.readyState === socket.OPEN) socket.send(text);
      },
      close: () => socket.close(),
    });
    socket.on('message', (data, isBinary) => {
      if (isBinary) return socket.close(1003);
      link.receive(data.toString());
    });
    socket.on('close', () => link.closed());
  });

  return app;
}
