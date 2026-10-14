import type { ContentDb } from '@valdren/content';
import {
  OFFLINE_CAP_TICKS,
  OFFLINE_CAP_TICKS_SUBSCRIBER,
  STEP_RESOLVE_MAX_TICKS,
  normalizeSkills,
  resolveOffline,
  skipTo,
  step,
  tickAt,
  type GameEvent,
  type ItemStack,
  type OfflineSummary,
  type SkillXp,
  type SlotId,
  type SlotState,
} from '@valdren/engine';
import { and, eq } from 'drizzle-orm';
import type { Db, Tx } from '../db/client.ts';
import { accounts, characters, skills, slots } from '../db/schema.ts';
import { errors } from '../errors.ts';
import { applyDeltas, lockCharacter, readBank, type ItemDelta } from './inventory.ts';

export interface Resolved {
  state: SlotState;
  /** Events of a short gap resolved tick by tick (empty for bulk resolution). */
  events: GameEvent[];
  /** Present when the gap was long enough for bulk (offline) resolution. */
  summary: OfflineSummary | null;
}

interface Loaded {
  state: SlotState;
  bankBefore: ItemStack[];
  skillsBefore: SkillXp[];
  subscriber: boolean;
}

/** Brings a slot state up to `nowTick`: tick by tick for short gaps, in bulk for long ones. */
export function advance(
  state: SlotState,
  nowTick: number,
  content: ContentDb,
  subscriber: boolean,
): Resolved {
  const gap = nowTick - state.tick;
  if (gap <= 0) return { state, events: [], summary: null };
  if (gap <= STEP_RESOLVE_MAX_TICKS) {
    const r = step(state, gap, content);
    return { state: r.state, events: r.events, summary: null };
  }
  const cap = subscriber ? OFFLINE_CAP_TICKS_SUBSCRIBER : OFFLINE_CAP_TICKS;
  const r = resolveOffline(state, Math.min(gap, cap), content);
  // Time beyond the cap is lost: the slot resumes where it paused.
  return { state: skipTo(r.state, nowTick), events: [], summary: r.summary };
}

function diffBank(before: readonly ItemStack[], after: readonly ItemStack[]): ItemDelta[] {
  const deltas = new Map<string, number>();
  for (const s of before) deltas.set(s.itemId, -s.qty);
  for (const s of after) deltas.set(s.itemId, (deltas.get(s.itemId) ?? 0) + s.qty);
  return [...deltas.entries()].map(([itemId, delta]) => ({ itemId, delta }));
}

/**
 * Lazy, authoritative slot resolution (section 7.3). The server never simulates continuously:
 * every read or intent resolves the slot up to the current tick inside one transaction holding
 * the character lock, then persists the state and the bank/XP deltas (with ledger rows).
 *
 * Skills and bank live in their own tables (the source of truth); the stored slot state keeps
 * them empty and is hydrated from the tables on load.
 */
export class SlotService {
  constructor(
    private readonly db: Db,
    private readonly content: ContentDb,
    private readonly now: () => number = Date.now,
  ) {}

  nowTick(): number {
    return tickAt(this.now());
  }

  /**
   * Resolves the slot to now, lets `fn` transform the resolved state (an intent), and persists.
   * `fn` returns the final state plus anything the caller needs.
   */
  async withSlot<T>(
    characterId: string,
    slot: SlotId,
    fn: (resolved: Resolved) => { state: SlotState; result: T },
  ): Promise<{ resolved: Resolved; state: SlotState; result: T }> {
    return this.db.transaction(async (tx) => {
      await lockCharacter(tx, characterId);
      const loaded = await this.load(tx, characterId, slot);
      const resolved = advance(loaded.state, this.nowTick(), this.content, loaded.subscriber);
      const { state, result } = fn(resolved);
      await this.persist(tx, characterId, loaded, state);
      return { resolved, state, result };
    });
  }

  /** Resolves to now and persists (checkpoints, reconnects, reads by other systems). */
  async resolve(characterId: string, slot: SlotId): Promise<Resolved & { finalState: SlotState }> {
    const r = await this.withSlot(characterId, slot, (resolved) => ({
      state: resolved.state,
      result: null,
    }));
    return { ...r.resolved, finalState: r.state };
  }

  /** Slots the character has (main always; secondary once unlocked). */
  async slotIds(characterId: string): Promise<SlotId[]> {
    const rows = await this.db
      .select({ slot: slots.slot })
      .from(slots)
      .where(eq(slots.characterId, characterId));
    return rows.map((r) => r.slot).sort();
  }

  private async load(tx: Tx, characterId: string, slot: SlotId): Promise<Loaded> {
    const [row] = await tx
      .select({ state: slots.state, subscriptionUntil: accounts.subscriptionUntil })
      .from(slots)
      .innerJoin(characters, eq(characters.id, slots.characterId))
      .innerJoin(accounts, eq(accounts.id, characters.accountId))
      .where(and(eq(slots.characterId, characterId), eq(slots.slot, slot)));
    if (!row) throw errors.notFound();
    const skillRows = await tx
      .select({ skill: skills.skillId, xpTenths: skills.xpTenths })
      .from(skills)
      .where(eq(skills.characterId, characterId));
    const skillsBefore = normalizeSkills(skillRows as SkillXp[]);
    const bankBefore = await readBank(tx, characterId);
    const stored = row.state as SlotState;
    return {
      state: { ...stored, skills: skillsBefore, bank: bankBefore.map((b) => ({ ...b })) },
      bankBefore,
      skillsBefore,
      subscriber: row.subscriptionUntil !== null && row.subscriptionUntil.getTime() > this.now(),
    };
  }

  private async persist(
    tx: Tx,
    characterId: string,
    loaded: Loaded,
    state: SlotState,
  ): Promise<void> {
    await applyDeltas(tx, characterId, diffBank(loaded.bankBefore, state.bank), 'action');
    for (const s of state.skills) {
      const before = loaded.skillsBefore.find((b) => b.skill === s.skill)?.xpTenths ?? 0;
      if (s.xpTenths !== before) {
        await tx
          .update(skills)
          .set({ xpTenths: s.xpTenths })
          .where(and(eq(skills.characterId, characterId), eq(skills.skillId, s.skill)));
      }
    }
    const stored: SlotState = { ...state, skills: [], bank: [] };
    await tx
      .update(slots)
      .set({ state: stored, resolvedTick: state.tick, updatedAt: new Date(this.now()) })
      .where(and(eq(slots.characterId, characterId), eq(slots.slot, state.slot)));
  }
}
