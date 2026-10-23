import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { MAX_FRAME_BYTES } from '@abismo/protocol';
import { registerAuthRoutes, type AuthDeps } from './authRoutes.ts';
import type { GameServer } from './game.ts';

/**
 * HTTP and WebSocket front of the game server. Each socket is handed to the GameServer, which
 * owns all the rules; this file only moves frames and mounts the account routes.
 */
export async function buildApp(
  game: GameServer,
  auth: Omit<AuthDeps, 'game'>,
  o: { logger?: boolean } = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: o.logger === false ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    // Behind the hosting proxy, the client's IP comes in X-Forwarded-For.
    trustProxy: process.env.TRUST_PROXY === '1',
  });
  await app.register(websocket, { options: { maxPayload: MAX_FRAME_BYTES } });
  // Every HTTP route: 120 requests a minute per IP; the sign-in routes add their own limits.
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.get('/health', async () => ({ ok: true, online: game.online }));
  await registerAuthRoutes(app, { ...auth, game });

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
