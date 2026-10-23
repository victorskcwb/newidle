import type { FastifyInstance, FastifyRequest } from 'fastify';
import { newHeroSchema } from '@abismo/protocol';
import { z } from 'zod';
import {
  emailSchema,
  passwordSchema,
  type Accounts,
  type AttemptLimiter,
  type AuthSession,
} from './accounts.ts';
import type { GameServer } from './game.ts';

/** Sends e-mail (password recovery). Development logs the message instead. */
export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

/** Google sign-in (OAuth code flow with PKCE); absent when no credentials are configured. */
export interface GoogleProvider {
  start(): { url: string; state: string; codeVerifier: string };
  exchange(code: string, codeVerifier: string): Promise<{ sub: string; email: string | null }>;
}

export interface AuthDeps {
  accounts: Accounts;
  game: GameServer;
  limiter: AttemptLimiter;
  /** Cloudflare Turnstile (anti-bot) check; always true when no secret is configured. */
  verifyHuman(token: string | undefined, ip: string): Promise<boolean>;
  mailer: Mailer;
  google: GoogleProvider | null;
  /** Where the game client lives (links in e-mails, Google's return). */
  clientUrl: string;
  now(): number;
}

const credentials = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  turnstile: z.string().max(2048).optional(),
});

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

function device(req: FastifyRequest): string {
  return String(req.headers['user-agent'] ?? '').slice(0, 120);
}

/** Google logins in progress: state → PKCE verifier and the account to link, for 10 minutes. */
const GOOGLE_STATE_MS = 10 * 60_000;

export async function registerAuthRoutes(app: FastifyInstance, d: AuthDeps) {
  const session = async (req: FastifyRequest): Promise<AuthSession | null> => {
    const token = bearer(req);
    return token ? d.accounts.authenticate(token) : null;
  };
  const googleStates = new Map<
    string,
    { codeVerifier: string; linkTo: string | null; at: number }
  >();

  app.post('/api/auth/guest', async (req, reply) => {
    const body = z
      .strictObject({ turnstile: z.string().max(2048).optional() })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    if (!(await d.verifyHuman(body.data.turnstile, req.ip))) {
      return reply.code(403).send({ error: 'not_human' });
    }
    const guest = await d.accounts.createGuest(device(req));
    return reply.code(201).send({ token: guest.token, accountId: guest.accountId });
  });

  app.post('/api/auth/register', async (req, reply) => {
    const body = credentials.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    if (!(await d.verifyHuman(body.data.turnstile, req.ip))) {
      return reply.code(403).send({ error: 'not_human' });
    }
    const current = await session(req);
    const result = await d.accounts.register(
      body.data.email,
      body.data.password,
      current?.accountId ?? null,
    );
    if ('error' in result) return reply.code(409).send({ error: result.error });
    // Linking keeps the current session; a new account gets its first one.
    if (current) return reply.code(200).send({ accountId: result.accountId });
    const s = await d.accounts.newSession(result.accountId, device(req));
    return reply.code(201).send({ accountId: result.accountId, token: s.token });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = credentials.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const keys = [`email:${body.data.email}`, `ip:${req.ip}`];
    if (keys.some((k) => d.limiter.locked(k))) {
      return reply.code(429).send({ error: 'too_many_attempts' });
    }
    const accountId = await d.accounts.login(body.data.email, body.data.password);
    if (!accountId) {
      for (const k of keys) d.limiter.fail(k);
      return reply.code(401).send({ error: 'wrong_credentials' });
    }
    d.limiter.clear(`email:${body.data.email}`);
    const s = await d.accounts.newSession(accountId, device(req));
    return reply.send({ accountId, token: s.token });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const s = await session(req);
    if (!s) return reply.code(401).send({ error: 'auth' });
    await d.accounts.revokeSession(s.accountId, s.sessionId);
    d.game.dropAuthSession(s.sessionId);
    return reply.code(204).send();
  });

  app.get('/api/auth/me', async (req, reply) => {
    const s = await session(req);
    if (!s) return reply.code(401).send({ error: 'auth' });
    return reply.send({
      accountId: s.accountId,
      identities: await d.accounts.identities(s.accountId),
      hasHero: await d.game.hasHero(s.accountId),
    });
  });

  app.get('/api/auth/sessions', async (req, reply) => {
    const s = await session(req);
    if (!s) return reply.code(401).send({ error: 'auth' });
    return reply.send({ sessions: await d.accounts.sessions(s.accountId, s.sessionId) });
  });

  app.delete<{ Params: { id: string } }>('/api/auth/sessions/:id', async (req, reply) => {
    const s = await session(req);
    if (!s) return reply.code(401).send({ error: 'auth' });
    if (!(await d.accounts.revokeSession(s.accountId, req.params.id))) {
      return reply.code(404).send({ error: 'not_found' });
    }
    d.game.dropAuthSession(req.params.id);
    return reply.code(204).send();
  });

  app.post('/api/auth/password/forgot', async (req, reply) => {
    const body = z.strictObject({ email: emailSchema }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const key = `reset:${body.data.email}`;
    if (d.limiter.locked(key)) return reply.code(204).send();
    d.limiter.fail(key);
    const token = await d.accounts.requestPasswordReset(body.data.email);
    if (token) {
      await d.mailer.send(
        body.data.email,
        'Abismo Idle: nova senha / new password',
        `${d.clientUrl}/?reset=${token}`,
      );
    }
    // The same answer whether or not the e-mail exists.
    return reply.code(204).send();
  });

  app.post('/api/auth/password/reset', async (req, reply) => {
    const body = z
      .strictObject({ token: z.string().min(20).max(100), password: passwordSchema })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const ok = await d.accounts.resetPassword(body.data.token, body.data.password);
    return ok ? reply.code(204).send() : reply.code(400).send({ error: 'invalid_token' });
  });

  app.post('/api/auth/google/start', async (req, reply) => {
    if (!d.google) return reply.code(501).send({ error: 'google_disabled' });
    const current = await session(req);
    const { url, state, codeVerifier } = d.google.start();
    for (const [k, v] of googleStates) if (d.now() - v.at > GOOGLE_STATE_MS) googleStates.delete(k);
    googleStates.set(state, { codeVerifier, linkTo: current?.accountId ?? null, at: d.now() });
    return reply.send({ url });
  });

  app.get<{ Querystring: { code?: string; state?: string } }>(
    '/api/auth/google/callback',
    async (req, reply) => {
      const fail = () => reply.redirect(`${d.clientUrl}/#auth_error=google`);
      const { code, state } = req.query;
      const pending = state ? googleStates.get(state) : undefined;
      if (!d.google || !code || !state || !pending) return fail();
      googleStates.delete(state);
      if (d.now() - pending.at > GOOGLE_STATE_MS) return fail();
      try {
        const who = await d.google.exchange(code, pending.codeVerifier);
        const accountId = await d.accounts.loginGoogle(who.sub, who.email, pending.linkTo);
        const s = await d.accounts.newSession(accountId, device(req));
        // In the fragment: never sent to any server, read once by the client.
        return reply.redirect(`${d.clientUrl}/#session=${s.token}`);
      } catch {
        return fail();
      }
    },
  );

  app.post('/api/heroes', async (req, reply) => {
    const s = await session(req);
    if (!s) return reply.code(401).send({ error: 'auth' });
    const body = newHeroSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_hero' });
    const result = await d.game.newHero(s.accountId, body.data);
    return reply.code(result === 'created' ? 201 : 409).send({ result });
  });
}

/** Cloudflare Turnstile server check (https://developers.cloudflare.com/turnstile/). */
export function turnstileVerifier(secret: string | undefined) {
  return async (token: string | undefined, ip: string): Promise<boolean> => {
    if (!secret) return true;
    if (!token) return false;
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  };
}
