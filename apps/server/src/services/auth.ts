import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db/client.ts';
import { accounts, eventLog, sessions, type accountMode } from '../db/schema.ts';
import { errors, isUniqueViolation } from '../errors.ts';
import { newId } from '../ids.ts';

export type AccountMode = (typeof accountMode.enumValues)[number];

export interface SessionInfo {
  sessionId: string;
  accountId: string;
  role: 'player' | 'admin';
}

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

const DAY_MS = 86_400_000;

/** Session tokens are 256 random bits; only their SHA-256 is stored. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Argon2id with the library defaults (m=19 MiB, t=2, p=1, OWASP baseline). */
const hashPassword = (password: string) => hash(password);

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly sessionDays: number,
    private readonly now: () => number = Date.now,
  ) {}

  async register(
    email: string,
    password: string,
    mode: AccountMode,
    client: ClientInfo,
  ): Promise<{ accountId: string; token: string; expiresAt: Date }> {
    const accountId = newId();
    const passwordHash = await hashPassword(password);
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .insert(accounts)
          .values({ id: accountId, email: email.toLowerCase(), passwordHash, mode });
        await tx
          .insert(eventLog)
          .values({ id: newId(), accountId, type: 'account.registered', data: { mode } });
      });
    } catch (err) {
      if (isUniqueViolation(err, 'accounts_email_key')) throw errors.emailTaken();
      throw err;
    }
    return { accountId, ...(await this.createSession(accountId, client)) };
  }

  async login(
    email: string,
    password: string,
    client: ClientInfo,
  ): Promise<{ accountId: string; token: string; expiresAt: Date }> {
    const [account] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.email, email.toLowerCase()));
    // Verify against a dummy hash when the account does not exist, so timing does not reveal it.
    const ok = await verify(account?.passwordHash ?? (await dummyHash()), password).catch(
      () => false,
    );
    if (!account || !ok) throw errors.invalidCredentials();
    if (account.bannedAt) throw errors.banned();
    await this.db.insert(eventLog).values({
      id: newId(),
      accountId: account.id,
      type: 'account.login',
      data: { ip: client.ip },
    });
    return { accountId: account.id, ...(await this.createSession(account.id, client)) };
  }

  async logout(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }

  /** Resolves a session token; null when missing, expired or the account is banned. */
  async session(token: string): Promise<SessionInfo | null> {
    const [row] = await this.db
      .select({
        sessionId: sessions.id,
        accountId: accounts.id,
        role: accounts.role,
        bannedAt: accounts.bannedAt,
      })
      .from(sessions)
      .innerJoin(accounts, eq(accounts.id, sessions.accountId))
      .where(
        and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date(this.now()))),
      );
    if (!row || row.bannedAt) return null;
    return { sessionId: row.sessionId, accountId: row.accountId, role: row.role };
  }

  private async createSession(
    accountId: string,
    client: ClientInfo,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.now() + this.sessionDays * DAY_MS);
    await this.db.insert(sessions).values({
      id: newId(),
      accountId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: client.ip,
      userAgent: client.userAgent?.slice(0, 256) ?? null,
    });
    return { token, expiresAt };
  }
}

let dummy: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  return dummy;
}
