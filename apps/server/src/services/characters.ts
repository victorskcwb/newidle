import { SKILL_IDS, type ContentDb } from '@valdren/content';
import {
  VITALITY_START_LEVEL,
  deriveSeed,
  levelForXp,
  newCharacterSkills,
  newSlotState,
  tickAt,
} from '@valdren/engine';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.ts';
import { characters, equipment, eventLog, skills, slots } from '../db/schema.ts';
import { errors, isUniqueViolation } from '../errors.ts';
import { newId } from '../ids.ts';
import { applyDeltas, readBank } from './inventory.ts';

/** Starter kit: tools for the first gathering and smithing actions. */
export const STARTER_ITEMS = [
  { itemId: 'pickaxe_bronze', delta: 1 },
  { itemId: 'hammer', delta: 1 },
];

const HP_PER_VITALITY_LEVEL = 10;
const color = z.number().int().min(0).max(0xffffff);

export const appearanceSchema = z.strictObject({ skin: color, hair: color, outfit: color });
export type Appearance = z.infer<typeof appearanceSchema>;

/** 3–12 letters, digits, spaces or underscores; no leading/trailing or double spaces. */
export const characterNameSchema = z
  .string()
  .min(3)
  .max(12)
  .regex(/^[\p{L}\p{N}_]+( [\p{L}\p{N}_]+)*$/u);

export class CharacterService {
  constructor(
    private readonly db: Db,
    private readonly content: ContentDb,
    private readonly now: () => number = Date.now,
  ) {}

  async create(accountId: string, name: string, appearance: Appearance): Promise<string> {
    const id = newId();
    const tick = tickAt(this.now());
    const startSkills = newCharacterSkills();
    for (const item of STARTER_ITEMS) {
      if (!this.content.items.has(item.itemId)) throw errors.unknownItem(item.itemId);
    }
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(characters).values({
          id,
          accountId,
          name,
          appearance,
          hp: VITALITY_START_LEVEL * HP_PER_VITALITY_LEVEL,
        });
        await tx
          .insert(skills)
          .values(
            startSkills.map((s) => ({ characterId: id, skillId: s.skill, xpTenths: s.xpTenths })),
          );
        const seed = deriveSeed(id, 'main', 0);
        // Skills and bank live in their own tables; the stored slot state leaves them empty
        // and is hydrated from those tables when the slot is resolved.
        const state = {
          ...newSlotState({ slot: 'main', tick, seed, skills: [], bank: [] }),
          skills: [],
        };
        await tx.insert(slots).values({
          characterId: id,
          slot: 'main',
          state,
          resolvedTick: tick,
          seed: seed.map((w) => w | 0),
        });
        await applyDeltas(tx, id, STARTER_ITEMS, 'starter');
        await tx.insert(eventLog).values({
          id: newId(),
          accountId,
          characterId: id,
          type: 'character.created',
          data: { name },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err, 'characters_account_key')) throw errors.characterExists();
      if (isUniqueViolation(err, 'characters_name_key')) throw errors.nameTaken();
      throw err;
    }
    return id;
  }

  async byAccount(accountId: string) {
    const [row] = await this.db
      .select()
      .from(characters)
      .where(eq(characters.accountId, accountId));
    return row ?? null;
  }

  /** Everything GET /me returns about the character. */
  async profile(characterId: string) {
    const [character] = await this.db
      .select()
      .from(characters)
      .where(eq(characters.id, characterId));
    if (!character) throw errors.noCharacter();
    const skillRows = await this.db
      .select()
      .from(skills)
      .where(eq(skills.characterId, characterId));
    const xpBySkill = new Map(skillRows.map((s) => [s.skillId, s.xpTenths]));
    const equipped = await this.db
      .select({ slot: equipment.slot, itemId: equipment.itemId })
      .from(equipment)
      .where(eq(equipment.characterId, characterId));
    return {
      id: character.id,
      name: character.name,
      regionId: character.regionId,
      hp: character.hp,
      appearance: character.appearance as Appearance,
      coins: character.coins,
      skills: SKILL_IDS.map((skill) => {
        const xpTenths = xpBySkill.get(skill) ?? 0;
        return { skill, xpTenths, level: levelForXp(xpTenths) };
      }),
      equipment: equipped.sort((a, b) => (a.slot < b.slot ? -1 : 1)),
    };
  }

  async bank(characterId: string) {
    const [character] = await this.db
      .select({ coins: characters.coins })
      .from(characters)
      .where(eq(characters.id, characterId));
    if (!character) throw errors.noCharacter();
    return { coins: character.coins, items: await readBank(this.db, characterId) };
  }
}
