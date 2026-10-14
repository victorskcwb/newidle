import cookie from '@fastify/cookie';
import type { ContentDb } from '@valdren/content';
import { canonicalJson, fnv1a64 } from '@valdren/engine';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import type { Config } from './config.ts';
import type { Db } from './db/client.ts';
import { AppError, errors } from './errors.ts';
import { AuthService, type SessionInfo } from './services/auth.ts';
import { appearanceSchema, characterNameSchema, CharacterService } from './services/characters.ts';
import { InventoryService } from './services/inventory.ts';
import { RateLimiter } from './services/rateLimit.ts';
import { ShopService } from './services/shop.ts';
import { SlotService } from './services/slots.ts';
import { GameHub } from './ws/hub.ts';

declare module 'fastify' {
  interface FastifyRequest {
    auth: SessionInfo | null;
  }
}

export const SESSION_COOKIE = 'vsid';

export interface AppDeps {
  config: Config;
  db: Db;
  content: ContentDb;
  now?: () => number;
  /** Requests per minute (section 8.2: 120 per IP, 60 per account). */
  limits?: { perIp: number; perAccount: number };
  hub?: { checkpointTicks?: number; autoCheckpoint?: boolean };
}

export interface Services {
  auth: AuthService;
  characters: CharacterService;
  inventory: InventoryService;
  shop: ShopService;
  slots: SlotService;
  hub: GameHub;
}

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw errors.validation(
      result.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
    );
  }
  return result.data;
}

const credentials = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
});

export async function buildApp(
  deps: AppDeps,
): Promise<{ app: FastifyInstance; services: Services }> {
  const { config, db, content } = deps;
  const now = deps.now ?? Date.now;
  const limits = deps.limits ?? { perIp: 120, perAccount: 60 };
  const services: Services = {
    auth: new AuthService(db, config.SESSION_DAYS, now),
    characters: new CharacterService(db, content, now),
    inventory: new InventoryService(db),
    shop: undefined as unknown as ShopService,
    slots: new SlotService(db, content, now),
    hub: undefined as unknown as GameHub,
  };
  services.shop = new ShopService(services.inventory, content);
  const ipLimiter = new RateLimiter(limits.perIp, 60_000, now);
  const accountLimiter = new RateLimiter(limits.perAccount, 60_000, now);
  const contentHash = fnv1a64(canonicalJson(content.raw));

  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: 'info' },
    trustProxy: true,
  });
  await app.register(cookie);
  app.decorateRequest('auth', null);

  services.hub = new GameHub({
    db,
    content,
    auth: services.auth,
    characters: services.characters,
    slots: services.slots,
    log: app.log,
    now,
    parseCookie: (header) => app.parseCookie(header),
    sessionCookie: SESSION_COOKIE,
    ...deps.hub,
  });
  services.hub.attach(app.server);
  // preClose: upgraded sockets would otherwise keep the HTTP server from closing.
  app.addHook('preClose', () => services.hub.close());

  app.addHook('onRequest', async (req) => {
    if (!ipLimiter.hit(`ip:${req.ip}`)) throw errors.rateLimited();
    const token = req.cookies[SESSION_COOKIE];
    req.auth = token ? await services.auth.session(token) : null;
    if (req.auth && !accountLimiter.hit(`acc:${req.auth.accountId}`)) throw errors.rateLimited();
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply
        .status(err.status)
        .send({ code: err.code, messageKey: err.messageKey, details: err.details });
    }
    if (err instanceof ZodError || (err as { validation?: unknown }).validation) {
      return reply.status(400).send({ code: 'validation', messageKey: 'error.validation' });
    }
    if (
      (err as { statusCode?: number }).statusCode === 415 ||
      (err as { statusCode?: number }).statusCode === 400
    ) {
      return reply.status(400).send({ code: 'validation', messageKey: 'error.validation' });
    }
    req.log.error(err);
    return reply.status(500).send({ code: 'internal', messageKey: 'error.internal' });
  });

  const requireAuth = (req: FastifyRequest): SessionInfo => {
    if (!req.auth) throw errors.unauthorized();
    return req.auth;
  };
  const requireCharacter = async (req: FastifyRequest): Promise<string> => {
    const character = await services.characters.byAccount(requireAuth(req).accountId);
    if (!character) throw errors.noCharacter();
    return character.id;
  };
  const setSession = (reply: FastifyReply, token: string, expiresAt: Date) => {
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      expires: expiresAt,
    });
  };
  const client = (req: FastifyRequest) => ({
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });

  app.get('/health', async () => ({ ok: true }));

  app.get('/content/version', async () => ({ hash: contentHash }));

  app.post('/auth/register', async (req, reply) => {
    const body = parse(
      credentials.extend({
        mode: z.enum(['normal', 'self_sufficient', 'hardcore']).default('normal'),
      }),
      req.body,
    );
    const session = await services.auth.register(body.email, body.password, body.mode, client(req));
    setSession(reply, session.token, session.expiresAt);
    return reply.status(201).send({ accountId: session.accountId });
  });

  app.post('/auth/login', async (req, reply) => {
    const body = parse(credentials, req.body);
    const session = await services.auth.login(body.email, body.password, client(req));
    setSession(reply, session.token, session.expiresAt);
    return { accountId: session.accountId };
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await services.auth.logout(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.post('/characters', async (req, reply) => {
    const { accountId } = requireAuth(req);
    const body = parse(
      z.object({ name: characterNameSchema, appearance: appearanceSchema }),
      req.body,
    );
    const id = await services.characters.create(accountId, body.name, body.appearance);
    return reply.status(201).send({ id });
  });

  app.get('/me', async (req) => {
    const { accountId } = requireAuth(req);
    const character = await services.characters.byAccount(accountId);
    return {
      accountId,
      character: character ? await services.characters.profile(character.id) : null,
    };
  });

  app.get('/bank', async (req) => services.characters.bank(await requireCharacter(req)));

  app.post('/bank/sell-to-shop', async (req) => {
    const characterId = await requireCharacter(req);
    const body = parse(
      z.object({
        itemId: z.string().min(1).max(64),
        qty: z.number().int().min(1).max(1_000_000_000),
      }),
      req.body,
    );
    // Resolve the running slot first so the sale sees the up-to-date bank, then tell its clients.
    for (const slot of await services.slots.slotIds(characterId))
      await services.slots.resolve(characterId, slot);
    const coins = await services.shop.sell(characterId, body.itemId, body.qty);
    await services.hub.externalChange(characterId);
    return { coins, bank: await services.characters.bank(characterId) };
  });

  return { app, services };
}
