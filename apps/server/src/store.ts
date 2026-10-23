import { brasiliaDay } from '@abismo/protocol';
import type { Db } from './db/db.ts';

/** A hero as stored: save text plus what the database indexes. */
export interface HeroRecord {
  save: string;
  /** Server wall time (ms) at which the saved state's tick ran. */
  savedAtMs: number;
  name: string;
  tick: number;
  saveVersion: number;
}

/**
 * Where heroes live between sessions (decision 178). A game session claims the hero when it
 * opens; a newer claim always wins (the newest device plays), and a save from a session that
 * lost the hero is refused, so an old process can never overwrite newer progress.
 */
export interface HeroStore {
  /** Creates the account's hero; false when it already has one. */
  create(accountId: string, hero: HeroRecord, origin?: 'new' | 'imported'): Promise<boolean>;
  /** Loads the hero and makes `sessionId` its owner, or null when the account has none. */
  claim(accountId: string, sessionId: string): Promise<HeroRecord | null>;
  /** Saves if `sessionId` still owns the hero; false when another session took it over. */
  save(accountId: string, sessionId: string, hero: HeroRecord): Promise<boolean>;
  /** Lets go of the hero (the session closed). */
  release(accountId: string, sessionId: string): Promise<void>;
}

/** Days of daily snapshots kept per hero (recovery after a bug). */
export const SNAPSHOT_DAYS = 7;

export class MemoryStore implements HeroStore {
  readonly heroes = new Map<string, HeroRecord & { owner: string | null }>();

  async create(accountId: string, hero: HeroRecord) {
    if (this.heroes.has(accountId)) return false;
    this.heroes.set(accountId, { ...hero, owner: null });
    return true;
  }

  async claim(accountId: string, sessionId: string) {
    const h = this.heroes.get(accountId);
    if (!h) return null;
    h.owner = sessionId;
    return { ...h };
  }

  async save(accountId: string, sessionId: string, hero: HeroRecord) {
    const h = this.heroes.get(accountId);
    if (!h || h.owner !== sessionId) return false;
    this.heroes.set(accountId, { ...hero, owner: sessionId });
    return true;
  }

  async release(accountId: string, sessionId: string) {
    const h = this.heroes.get(accountId);
    if (h?.owner === sessionId) h.owner = null;
  }
}

export class PgStore implements HeroStore {
  /** Last day a snapshot was taken per account, so most saves skip the snapshot query. */
  private snapshotDay = new Map<string, number>();

  constructor(private readonly db: Db) {}

  async create(accountId: string, hero: HeroRecord, origin: 'new' | 'imported' = 'new') {
    const rows = await this.db.query(
      `INSERT INTO heroes (account_id, name, save, save_version, tick, saved_at_ms, origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (account_id) DO NOTHING
       RETURNING account_id`,
      [accountId, hero.name, hero.save, hero.saveVersion, hero.tick, hero.savedAtMs, origin],
    );
    return rows.length === 1;
  }

  async claim(accountId: string, sessionId: string) {
    const rows = await this.db.query<{
      save: string;
      saved_at_ms: string | number;
      name: string;
      tick: string | number;
      save_version: number;
    }>(
      `UPDATE heroes SET owner_session = $2, updated_at = now()
       WHERE account_id = $1
       RETURNING save, saved_at_ms, name, tick, save_version`,
      [accountId, sessionId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      save: r.save,
      savedAtMs: Number(r.saved_at_ms),
      name: r.name,
      tick: Number(r.tick),
      saveVersion: r.save_version,
    };
  }

  async save(accountId: string, sessionId: string, hero: HeroRecord) {
    const rows = await this.db.query(
      `UPDATE heroes
       SET save = $3, save_version = $4, tick = $5, saved_at_ms = $6, name = $7, updated_at = now()
       WHERE account_id = $1 AND owner_session = $2
       RETURNING account_id`,
      [accountId, sessionId, hero.save, hero.saveVersion, hero.tick, hero.savedAtMs, hero.name],
    );
    if (rows.length === 0) return false;
    const day = brasiliaDay(hero.savedAtMs);
    if (this.snapshotDay.get(accountId) !== day) {
      this.snapshotDay.set(accountId, day);
      await this.db.query(
        `INSERT INTO hero_snapshots (account_id, day, save) VALUES ($1, $2, $3)
         ON CONFLICT (account_id, day) DO NOTHING`,
        [accountId, day, hero.save],
      );
      await this.db.query('DELETE FROM hero_snapshots WHERE account_id = $1 AND day <= $2', [
        accountId,
        day - SNAPSHOT_DAYS,
      ]);
    }
    return true;
  }

  async release(accountId: string, sessionId: string) {
    await this.db.query(
      'UPDATE heroes SET owner_session = NULL WHERE account_id = $1 AND owner_session = $2',
      [accountId, sessionId],
    );
  }
}
