/** A hero as stored: save text plus the server time its state's tick corresponds to. */
export interface StoredHero {
  save: string;
  /** Server wall time (ms) at which the saved state's tick ran. */
  savedAtMs: number;
}

/**
 * Where heroes live between sessions. The in-memory store serves tests and local runs; the
 * Postgres store (commit 7 of docs/plan-fase-1.md) implements the same interface.
 */
export interface HeroStore {
  load(accountId: string): Promise<StoredHero | null>;
  save(accountId: string, hero: StoredHero): Promise<void>;
}

export class MemoryStore implements HeroStore {
  readonly heroes = new Map<string, StoredHero>();

  async load(accountId: string) {
    return this.heroes.get(accountId) ?? null;
  }

  async save(accountId: string, hero: StoredHero) {
    this.heroes.set(accountId, { ...hero });
  }
}
