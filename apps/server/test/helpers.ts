import { randomBytes } from 'node:crypto';
import { loadBundledContent } from '@valdren/content';
import { inject } from 'vitest';
import { buildApp, type AppDeps } from '../src/app.ts';
import { createDatabase, type Database } from '../src/db/client.ts';

let database: Database | undefined;

export function testDb(): Database {
  database ??= createDatabase(inject('databaseUrl'));
  return database;
}

export async function testApp(overrides: Partial<AppDeps> = {}) {
  const db = testDb().db;
  return buildApp({
    config: { NODE_ENV: 'test', PORT: 0, HOST: '127.0.0.1', SESSION_DAYS: 30, databaseUrl: '' },
    db,
    content: loadBundledContent(),
    limits: { perIp: 10_000, perAccount: 10_000 },
    ...overrides,
  });
}

/** Unique email and character name per call (test files share one database and run in parallel). */
export function uniqueUser() {
  const tag = randomBytes(5).toString('hex');
  return { email: `user_${tag}@example.com`, password: 'correct horse', name: `H${tag}` };
}
