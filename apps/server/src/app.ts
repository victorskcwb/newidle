import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { MAX_FRAME_BYTES } from '@abismo/protocol';
import type { GameServer } from './game.ts';

/**
 * HTTP and WebSocket front of the game server. Each socket is handed to the GameServer, which
 * owns all the rules; this file only moves frames.
 */
export async function buildApp(game: GameServer): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  await app.register(websocket, { options: { maxPayload: MAX_FRAME_BYTES } });

  app.get('/health', async () => ({ ok: true, online: game.online }));

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
