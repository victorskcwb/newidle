import { z } from 'zod';

/** Embedded Postgres started by tools/dev-db. */
export const DEV_DATABASE_URL = 'postgres://valdren:valdren@localhost:5433/valdren';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  /** Unset in development: use the embedded Postgres that `pnpm dev` starts (tools/dev-db). */
  DATABASE_URL: z.string().url().optional(),
  SESSION_DAYS: z.coerce.number().int().positive().default(30),
});

export type Config = z.infer<typeof schema> & { databaseUrl: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.parse(env);
  const databaseUrl =
    parsed.DATABASE_URL ?? (parsed.NODE_ENV === 'development' ? DEV_DATABASE_URL : undefined);
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  return { ...parsed, databaseUrl };
}
