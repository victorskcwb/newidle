import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/app.ts';
import { findLedgerMismatches } from '../src/services/inventory.ts';
import { testApp, testDb, uniqueUser } from './helpers.ts';

let app: FastifyInstance;

beforeAll(async () => {
  app = (await testApp()).app;
});

afterAll(async () => {
  await app.close();
  await testDb().close();
});

function sessionCookie(res: LightMyRequestResponse): string {
  const c = res.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!c) throw new Error('no session cookie');
  return `${SESSION_COOKIE}=${c.value}`;
}

async function registered() {
  const u = uniqueUser();
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: u.email, password: u.password },
  });
  expect(res.statusCode).toBe(201);
  return { ...u, cookie: sessionCookie(res) };
}

async function withCharacter() {
  const user = await registered();
  const res = await app.inject({
    method: 'POST',
    url: '/characters',
    headers: { cookie: user.cookie },
    payload: { name: user.name, appearance: { skin: 0xe0b48a, hair: 0x4a2f22, outfit: 0x3f6db0 } },
  });
  expect(res.statusCode).toBe(201);
  return { ...user, characterId: res.json<{ id: string }>().id };
}

describe('auth', () => {
  it('registers with an HttpOnly session cookie and rejects duplicate emails', async () => {
    const u = uniqueUser();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: u.email, password: u.password },
    });
    expect(res.statusCode).toBe(201);
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    const again = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: u.email.toUpperCase(), password: u.password },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'emailTaken', messageKey: 'error.emailTaken' });
  });

  it('validates input and returns { code, messageKey }', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'nope', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'validation', messageKey: 'error.validation' });
  });

  it('logs in, rejects wrong passwords and logs out', async () => {
    const user = await registered();
    const bad = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'wrong password' },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().code).toBe('invalidCredentials');
    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'whatever1' },
    });
    expect(unknown.json().code).toBe('invalidCredentials');

    const ok = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: user.password },
    });
    expect(ok.statusCode).toBe(200);
    const cookie = sessionCookie(ok);
    expect((await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).statusCode).toBe(
      200,
    );
    await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
    const after = await app.inject({ method: 'GET', url: '/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
    expect(after.json().code).toBe('unauthorized');
  });
});

describe('characters', () => {
  it('creates a character with skills, starter kit and a main slot', async () => {
    const user = await withCharacter();
    const me = await app.inject({ method: 'GET', url: '/me', headers: { cookie: user.cookie } });
    const body = me.json();
    expect(body.character).toMatchObject({
      name: user.name,
      coins: 0,
      hp: 100,
      regionId: 'brumaporto',
    });
    expect(body.character.skills).toHaveLength(21);
    expect(body.character.skills.find((s: { skill: string }) => s.skill === 'vitality').level).toBe(
      10,
    );
    const bank = await app.inject({
      method: 'GET',
      url: '/bank',
      headers: { cookie: user.cookie },
    });
    expect(bank.json()).toEqual({
      coins: 0,
      items: [
        { itemId: 'hammer', qty: 1 },
        { itemId: 'pickaxe_bronze', qty: 1 },
      ],
    });
  });

  it('enforces one character per account and unique names (case-insensitive)', async () => {
    const first = await withCharacter();
    const second = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { cookie: first.cookie },
      payload: { name: 'Outro', appearance: { skin: 1, hair: 1, outfit: 1 } },
    });
    expect(second.json().code).toBe('characterExists');

    const other = await registered();
    const clash = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { cookie: other.cookie },
      payload: { name: first.name.toUpperCase(), appearance: { skin: 1, hair: 1, outfit: 1 } },
    });
    expect(clash.statusCode).toBe(409);
    expect(clash.json().code).toBe('nameTaken');
  });

  it('rejects invalid names', async () => {
    const user = await registered();
    for (const name of ['ab', 'nome muito longo', ' espaço', 'a<script>']) {
      const res = await app.inject({
        method: 'POST',
        url: '/characters',
        headers: { cookie: user.cookie },
        payload: { name, appearance: { skin: 1, hair: 1, outfit: 1 } },
      });
      expect(res.statusCode, name).toBe(400);
    }
  });
});

describe('shop', () => {
  it('sells at 40% of base value, atomically', async () => {
    const user = await withCharacter();
    const res = await app.inject({
      method: 'POST',
      url: '/bank/sell-to-shop',
      headers: { cookie: user.cookie },
      payload: { itemId: 'pickaxe_bronze', qty: 1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      coins: 4,
      bank: { coins: 4, items: [{ itemId: 'hammer', qty: 1 }] },
    });

    const tooMany = await app.inject({
      method: 'POST',
      url: '/bank/sell-to-shop',
      headers: { cookie: user.cookie },
      payload: { itemId: 'hammer', qty: 2 },
    });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json()).toMatchObject({
      code: 'insufficientItems',
      details: { itemId: 'hammer' },
    });
    expect(await findLedgerMismatches(testDb().db, user.characterId)).toEqual([]);
  });

  it('requires a session and a character', async () => {
    expect((await app.inject({ method: 'GET', url: '/bank' })).statusCode).toBe(401);
    const user = await registered();
    const res = await app.inject({ method: 'GET', url: '/bank', headers: { cookie: user.cookie } });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('noCharacter');
  });
});

describe('limits and metadata', () => {
  it('rate-limits per IP', async () => {
    const limited = (await testApp({ limits: { perIp: 3, perAccount: 100 } })).app;
    const codes = [];
    for (let i = 0; i < 5; i++)
      codes.push((await limited.inject({ method: 'GET', url: '/health' })).statusCode);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    await limited.close();
  });

  it('exposes the content version', async () => {
    const res = await app.inject({ method: 'GET', url: '/content/version' });
    expect(res.json().hash).toMatch(/^[0-9a-f]{16}$/);
  });
});
