import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';
import type { Db } from './db/db.ts';

/**
 * Accounts and sessions (decision 175): a guest account tied to the device, e-mail and
 * password (argon2id), and Google. A session is a random token the client keeps; the server
 * stores only its SHA-256, so a database leak does not hand out sessions.
 */

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const passwordSchema = z.string().min(8).max(128);

export interface SessionInfo {
  id: string;
  device: string;
  createdAt: string;
  lastSeen: string;
  current: boolean;
}

export interface AuthSession {
  accountId: string;
  sessionId: string;
}

const SESSION_DAYS = 90;
const RESET_MINUTES = 30;
/** Days a deleted account's hero is kept before it is purged. */
export const DELETE_AFTER_DAYS = 30;
/** last_seen is written at most this often per session. */
const SEEN_EVERY_MS = 60_000;

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** A hash to verify against when the e-mail is unknown, so timing does not reveal accounts. */
let dummyHash: Promise<string> | null = null;

export class Accounts {
  private seen = new Map<string, number>();

  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  private async createAccount(db: Db): Promise<string> {
    const id = randomUUID();
    await db.query('INSERT INTO accounts (id) VALUES ($1)', [id]);
    return id;
  }

  /** A new session for an account. The token is returned once and never stored in clear. */
  async newSession(
    accountId: string,
    device: string,
  ): Promise<{ token: string; sessionId: string }> {
    const token = newToken();
    const sessionId = randomUUID();
    await this.db.query(
      `INSERT INTO sessions (id, token_hash, account_id, device, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        sessionId,
        sha256(token),
        accountId,
        device.slice(0, 120),
        new Date(this.now() + SESSION_DAYS * 86_400_000).toISOString(),
      ],
    );
    return { token, sessionId };
  }

  /** Plays at once: a guest account and its first session. */
  async createGuest(device: string) {
    const accountId = await this.db.tx(async (t) => {
      const id = await this.createAccount(t);
      await t.query(
        `INSERT INTO identities (account_id, provider, subject) VALUES ($1, 'guest', $1)`,
        [id],
      );
      return id;
    });
    return { accountId, ...(await this.newSession(accountId, device)) };
  }

  /** The session of a token, if it is valid; refreshes its last use now and then. */
  async authenticate(token: string): Promise<AuthSession | null> {
    if (token.length < 20 || token.length > 100) return null;
    const rows = await this.db.query<{ id: string; account_id: string }>(
      `SELECT s.id, s.account_id FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2
         AND a.deleted_at IS NULL`,
      [sha256(token), new Date(this.now()).toISOString()],
    );
    const row = rows[0];
    if (!row) return null;
    const last = this.seen.get(row.id) ?? 0;
    if (this.now() - last >= SEEN_EVERY_MS) {
      this.seen.set(row.id, this.now());
      await this.db.query('UPDATE sessions SET last_seen = $2 WHERE id = $1', [
        row.id,
        new Date(this.now()).toISOString(),
      ]);
    }
    return { accountId: row.account_id, sessionId: row.id };
  }

  /**
   * E-mail and password. With `linkTo`, adds them to that (guest) account, keeping its hero;
   * otherwise creates an account. Fails when the e-mail is taken or the account already has one.
   */
  async register(
    email: string,
    password: string,
    linkTo: string | null,
  ): Promise<{ accountId: string } | { error: 'email_taken' | 'already_has_password' }> {
    const passwordHash = await hash(password);
    return this.db.tx(async (t) => {
      const taken = await t.query(
        `SELECT 1 FROM identities WHERE provider = 'password' AND subject = $1`,
        [email],
      );
      if (taken.length > 0) return { error: 'email_taken' as const };
      if (linkTo) {
        const has = await t.query(
          `SELECT 1 FROM identities WHERE provider = 'password' AND account_id = $1`,
          [linkTo],
        );
        if (has.length > 0) return { error: 'already_has_password' as const };
      }
      const accountId = linkTo ?? (await this.createAccount(t));
      await t.query(
        `INSERT INTO identities (account_id, provider, subject, email, password_hash)
         VALUES ($1, 'password', $2, $2, $3)`,
        [accountId, email, passwordHash],
      );
      return { accountId };
    });
  }

  /** The account of an e-mail and password, or null. Unknown e-mails cost the same time. */
  async login(email: string, password: string): Promise<string | null> {
    const rows = await this.db.query<{ account_id: string; password_hash: string }>(
      `SELECT i.account_id, i.password_hash FROM identities i JOIN accounts a ON a.id = i.account_id
       WHERE i.provider = 'password' AND i.subject = $1 AND a.deleted_at IS NULL`,
      [email],
    );
    const row = rows[0];
    if (!row) {
      dummyHash ??= hash('not-a-real-password');
      await verify(await dummyHash, password);
      return null;
    }
    return (await verify(row.password_hash, password)) ? row.account_id : null;
  }

  /**
   * Google: the account that has this Google id, or (with `linkTo`) links it to that account,
   * or creates one.
   */
  async loginGoogle(sub: string, email: string | null, linkTo: string | null): Promise<string> {
    return this.db.tx(async (t) => {
      const known = await t.query<{ account_id: string }>(
        `SELECT account_id FROM identities WHERE provider = 'google' AND subject = $1`,
        [sub],
      );
      if (known[0]) return known[0].account_id;
      const accountId = linkTo ?? (await this.createAccount(t));
      await t.query(
        `INSERT INTO identities (account_id, provider, subject, email) VALUES ($1, 'google', $2, $3)`,
        [accountId, sub, email],
      );
      return accountId;
    });
  }

  /** Whether a save from a device may still become this account's hero (once per account). */
  async canImport(accountId: string): Promise<boolean> {
    const rows = await this.db.query<{ imported_at: unknown }>(
      'SELECT imported_at FROM accounts WHERE id = $1',
      [accountId],
    );
    return rows[0]?.imported_at === null;
  }

  /** Uses up the account's one import; false when it was already used. */
  async markImported(accountId: string): Promise<boolean> {
    const rows = await this.db.query(
      'UPDATE accounts SET imported_at = $2 WHERE id = $1 AND imported_at IS NULL RETURNING id',
      [accountId, new Date(this.now()).toISOString()],
    );
    return rows.length === 1;
  }

  /**
   * Deletes the account (LGPD): the sign-ins (e-mail, Google id) and sessions go at once, so
   * the e-mail can be used again; the account row and its hero stay for 30 days (backups,
   * mistakes) and are then purged by `purgeDeleted`.
   */
  async deleteAccount(accountId: string) {
    await this.db.tx(async (t) => {
      await t.query('UPDATE accounts SET deleted_at = $2 WHERE id = $1', [
        accountId,
        new Date(this.now()).toISOString(),
      ]);
      await t.query('DELETE FROM identities WHERE account_id = $1', [accountId]);
      await t.query('DELETE FROM sessions WHERE account_id = $1', [accountId]);
      await t.query('DELETE FROM password_resets WHERE account_id = $1', [accountId]);
    });
  }

  /** Removes accounts deleted more than 30 days ago, with their heroes. Returns how many. */
  async purgeDeleted(): Promise<number> {
    const cutoff = new Date(this.now() - DELETE_AFTER_DAYS * 86_400_000).toISOString();
    return this.db.tx(async (t) => {
      const gone = await t.query<{ id: string }>(
        'SELECT id FROM accounts WHERE deleted_at IS NOT NULL AND deleted_at < $1',
        [cutoff],
      );
      for (const { id } of gone) {
        await t.query('DELETE FROM heroes WHERE account_id = $1', [id]);
        await t.query('DELETE FROM accounts WHERE id = $1', [id]);
      }
      return gone.length;
    });
  }

  /** Everything the game keeps about the account (LGPD export), without secrets. */
  async exportData(accountId: string) {
    const [account] = await this.db.query('SELECT id, created_at FROM accounts WHERE id = $1', [
      accountId,
    ]);
    const identities = await this.db.query(
      'SELECT provider, email, created_at FROM identities WHERE account_id = $1',
      [accountId],
    );
    const sessions = await this.db.query(
      `SELECT device, created_at, last_seen, expires_at, revoked_at FROM sessions
       WHERE account_id = $1`,
      [accountId],
    );
    const heroes = await this.db.query(
      'SELECT name, origin, created_at, updated_at, save FROM heroes WHERE account_id = $1',
      [accountId],
    );
    return { account, identities, sessions, heroes };
  }

  /** How the account signs in (for the account screen). */
  async identities(accountId: string) {
    return this.db.query<{ provider: string; email: string | null }>(
      'SELECT provider, email FROM identities WHERE account_id = $1 ORDER BY created_at',
      [accountId],
    );
  }

  async sessions(accountId: string, currentId: string): Promise<SessionInfo[]> {
    const rows = await this.db.query<{
      id: string;
      device: string;
      created_at: Date | string;
      last_seen: Date | string;
    }>(
      `SELECT id, device, created_at, last_seen FROM sessions
       WHERE account_id = $1 AND revoked_at IS NULL AND expires_at > $2
       ORDER BY last_seen DESC`,
      [accountId, new Date(this.now()).toISOString()],
    );
    return rows.map((r) => ({
      id: r.id,
      device: r.device,
      createdAt: new Date(r.created_at).toISOString(),
      lastSeen: new Date(r.last_seen).toISOString(),
      current: r.id === currentId,
    }));
  }

  /** Ends one of the account's sessions; true when there was one to end. */
  async revokeSession(accountId: string, sessionId: string): Promise<boolean> {
    const rows = await this.db.query(
      `UPDATE sessions SET revoked_at = $3
       WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL RETURNING id`,
      [sessionId, accountId, new Date(this.now()).toISOString()],
    );
    return rows.length === 1;
  }

  /** A one-time reset token for an e-mail with a password, or null (the caller says nothing). */
  async requestPasswordReset(email: string): Promise<string | null> {
    const rows = await this.db.query<{ account_id: string }>(
      `SELECT account_id FROM identities WHERE provider = 'password' AND subject = $1`,
      [email],
    );
    const row = rows[0];
    if (!row) return null;
    const token = newToken();
    await this.db.query(
      'INSERT INTO password_resets (token_hash, account_id, expires_at) VALUES ($1, $2, $3)',
      [sha256(token), row.account_id, new Date(this.now() + RESET_MINUTES * 60_000).toISOString()],
    );
    return token;
  }

  /** Sets a new password with a reset token and ends every session of the account. */
  async resetPassword(token: string, password: string): Promise<boolean> {
    const passwordHash = await hash(password);
    return this.db.tx(async (t) => {
      const nowIso = new Date(this.now()).toISOString();
      const rows = await t.query<{ account_id: string }>(
        `UPDATE password_resets SET used_at = $2
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2
         RETURNING account_id`,
        [sha256(token), nowIso],
      );
      const row = rows[0];
      if (!row) return false;
      await t.query(
        `UPDATE identities SET password_hash = $2 WHERE account_id = $1 AND provider = 'password'`,
        [row.account_id, passwordHash],
      );
      await t.query(
        'UPDATE sessions SET revoked_at = $2 WHERE account_id = $1 AND revoked_at IS NULL',
        [row.account_id, nowIso],
      );
      return true;
    });
  }
}

/**
 * Failed sign-in attempts per key (e-mail, IP): after `max` failures in the window, the key is
 * locked until the window passes. In memory: one game server process for now.
 */
export class AttemptLimiter {
  private failures = new Map<string, number[]>();

  constructor(
    private readonly max = 5,
    private readonly windowMs = 15 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  locked(key: string): boolean {
    const recent = (this.failures.get(key) ?? []).filter((t) => this.now() - t < this.windowMs);
    // Old keys are dropped, so the map does not grow with every e-mail and IP ever seen.
    if (recent.length === 0) this.failures.delete(key);
    else this.failures.set(key, recent);
    return recent.length >= this.max;
  }

  fail(key: string) {
    const list = this.failures.get(key) ?? [];
    list.push(this.now());
    this.failures.set(key, list);
  }

  clear(key: string) {
    this.failures.delete(key);
  }
}
