import { describe, expect, it } from 'vitest';
import { Accounts, AttemptLimiter } from '../src/accounts.ts';
import { buildApp } from '../src/app.ts';
import type { GoogleProvider } from '../src/authRoutes.ts';
import { connectPglite } from '../src/db/db.ts';
import { migrate } from '../src/db/migrations.ts';
import { PgStore } from '../src/store.ts';
import { World } from './harness.ts';

/** The JSON bodies the account routes answer with. */
interface Body {
  token?: string;
  accountId?: string;
  error?: string;
  url?: string;
  hasHero?: boolean;
  identities?: unknown[];
  sessions?: unknown[];
}

/** A server with accounts on PGlite, a fake mailer and a fake Google. */
async function setup(o: { human?: boolean } = {}) {
  const db = await connectPglite();
  await migrate(db);
  const world = new World(new PgStore(db));
  const accounts = new Accounts(db);
  const mail: { to: string; text: string }[] = [];
  const google: GoogleProvider = {
    start: () => ({ url: 'https://google.example/auth?state=s1', state: 's1', codeVerifier: 'v1' }),
    exchange: async (code) => ({ sub: `google-${code}`, email: `${code}@gmail.example` }),
  };
  const app = await buildApp(
    world.server,
    {
      accounts,
      limiter: new AttemptLimiter(),
      verifyHuman: async () => o.human ?? true,
      mailer: { send: async (to, _subject, text) => void mail.push({ to, text }) },
      google,
      clientUrl: 'https://game.example',
      now: () => Date.now(),
    },
    { logger: false },
  );
  const call = async (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    body?: unknown,
    token?: string,
  ) => {
    const res = await app.inject({
      method,
      url,
      ...(body !== undefined ? { payload: body as object } : {}),
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return {
      status: res.statusCode,
      body: (res.body ? res.json() : {}) as Body,
      headers: res.headers,
    };
  };
  return { db, world, accounts, app, mail, call };
}

const hero = { name: 'Conta Nova', appearance: { hair: 0, outfit: 1 } };

describe('accounts', () => {
  it('a guest plays at once, creates one hero, and links an e-mail later keeping it', async () => {
    const { call } = await setup();
    const guest = await call('POST', '/api/auth/guest', {});
    expect(guest.status).toBe(201);
    const token = guest.body.token as string;
    expect((await call('GET', '/api/auth/me', undefined, token)).body).toMatchObject({
      hasHero: false,
      identities: [{ provider: 'guest' }],
    });
    expect((await call('POST', '/api/heroes', hero, token)).status).toBe(201);
    expect((await call('POST', '/api/heroes', hero, token)).status).toBe(409);
    expect((await call('POST', '/api/heroes', { ...hero, name: '!' }, token)).status).toBe(400);

    const linked = await call(
      'POST',
      '/api/auth/register',
      { email: 'Ana@Example.com ', password: 'segredo123' },
      token,
    );
    expect(linked.status).toBe(200);
    expect(linked.body.accountId).toBe(guest.body.accountId);
    const me = (await call('GET', '/api/auth/me', undefined, token)).body;
    expect(me.hasHero).toBe(true);
    expect(me.identities).toEqual([
      { provider: 'guest', email: null },
      { provider: 'password', email: 'ana@example.com' },
    ]);

    // On another device: sign in with the e-mail and find the same account.
    const login = await call('POST', '/api/auth/login', {
      email: 'ana@example.com',
      password: 'segredo123',
    });
    expect(login.status).toBe(200);
    expect(login.body.accountId).toBe(guest.body.accountId);
  });

  it('an e-mail belongs to one account; wrong passwords lock the e-mail for a while', async () => {
    const { call } = await setup();
    const a = await call('POST', '/api/auth/register', {
      email: 'bia@ex.com',
      password: 'abcdefgh',
    });
    expect(a.status).toBe(201);
    expect(
      (await call('POST', '/api/auth/register', { email: 'bia@ex.com', password: 'zzzzzzzz' }))
        .body,
    ).toEqual({ error: 'email_taken' });
    for (let i = 0; i < 5; i++) {
      const r = await call('POST', '/api/auth/login', {
        email: 'bia@ex.com',
        password: 'errada123',
      });
      expect(r.status).toBe(401);
    }
    const locked = await call('POST', '/api/auth/login', {
      email: 'bia@ex.com',
      password: 'abcdefgh',
    });
    expect(locked.status).toBe(429);
    expect(
      (await call('POST', '/api/auth/register', { email: 'x', password: 'abcdefgh' })).status,
    ).toBe(400);
    expect(
      (await call('POST', '/api/auth/register', { email: 'c@ex.com', password: 'curta' })).status,
    ).toBe(400);
  });

  it('lists sessions and ends one from another device', async () => {
    const { call, accounts } = await setup();
    const reg = await call('POST', '/api/auth/register', {
      email: 'caio@ex.com',
      password: 'abcdefgh',
    });
    const phone = reg.body.token as string;
    const pc = (
      await call('POST', '/api/auth/login', { email: 'caio@ex.com', password: 'abcdefgh' })
    ).body.token as string;
    const list = (await call('GET', '/api/auth/sessions', undefined, pc)).body.sessions as {
      id: string;
      current: boolean;
    }[];
    expect(list).toHaveLength(2);
    const other = list.find((s) => !s.current)!;
    expect((await call('DELETE', `/api/auth/sessions/${other.id}`, undefined, pc)).status).toBe(
      204,
    );
    expect(await accounts.authenticate(phone)).toBeNull();
    expect(await accounts.authenticate(pc)).not.toBeNull();
    expect((await call('POST', '/api/auth/logout', undefined, pc)).status).toBe(204);
    expect(await accounts.authenticate(pc)).toBeNull();
  });

  it('password recovery: a one-time link by e-mail; the new password ends old sessions', async () => {
    const { call, mail, accounts } = await setup();
    const reg = await call('POST', '/api/auth/register', {
      email: 'davi@ex.com',
      password: 'antiga123',
    });
    expect(
      (await call('POST', '/api/auth/password/forgot', { email: 'ninguem@ex.com' })).status,
    ).toBe(204);
    expect(mail).toEqual([]);
    expect((await call('POST', '/api/auth/password/forgot', { email: 'davi@ex.com' })).status).toBe(
      204,
    );
    expect(mail).toHaveLength(1);
    const token = new URL(mail[0]!.text).searchParams.get('reset')!;
    expect(mail[0]!.text.startsWith('https://game.example/?reset=')).toBe(true);
    expect(
      (await call('POST', '/api/auth/password/reset', { token, password: 'nova12345' })).status,
    ).toBe(204);
    expect(
      (await call('POST', '/api/auth/password/reset', { token, password: 'outra1234' })).status,
    ).toBe(400);
    expect(await accounts.authenticate(reg.body.token as string)).toBeNull();
    expect(
      (await call('POST', '/api/auth/login', { email: 'davi@ex.com', password: 'nova12345' }))
        .status,
    ).toBe(200);
  });

  it('Google signs in, and links to the current account when signed in', async () => {
    const { call } = await setup();
    const guest = await call('POST', '/api/auth/guest', {});
    const start = await call('POST', '/api/auth/google/start', {}, guest.body.token as string);
    expect(start.body.url).toContain('google.example');
    const back = await call('GET', '/api/auth/google/callback?code=eva&state=s1');
    expect(back.status).toBe(302);
    const token = /#session=(.+)$/.exec(String(back.headers.location))![1]!;
    const me = (await call('GET', '/api/auth/me', undefined, token)).body;
    expect(me.accountId).toBe(guest.body.accountId);
    expect(me.identities).toContainEqual({ provider: 'google', email: 'eva@gmail.example' });
    // A replayed or unknown state fails.
    const again = await call('GET', '/api/auth/google/callback?code=eva&state=s1');
    expect(String(again.headers.location)).toContain('#auth_error=google');
  });

  it('refuses guests that fail the anti-bot check', async () => {
    const { call } = await setup({ human: false });
    expect((await call('POST', '/api/auth/guest', {})).status).toBe(403);
  });

  it('ending a sign-in session closes its game connection', async () => {
    const w = new World();
    await w.newHero('ana');
    const c = w.connect('ana');
    await w.run(500);
    expect(c.of('welcome')).toHaveLength(1);
    w.server.dropAuthSession('auth-ana');
    await w.run(200);
    expect(c.of('kicked')).toEqual([{ type: 'kicked', reason: 'auth' }]);
  });
});
