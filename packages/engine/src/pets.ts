import type { ContentDb } from '@abismo/content';
import { IntentError } from './progression.ts';
import { rngBinomial, type RngState } from './rng.ts';
import type { StatMods } from './stats.ts';
import type { GameEvent, GameState, Hero } from './types.ts';

/**
 * Pets (GDD 3.4): each hunt boss may bring its pet when defeated. Repeated finds raise it to
 * its maximum stars; the active pet gives its bonus per star and follows the hero.
 */

export function petStars(hero: Hero, petId: string): number {
  return hero.pets[petId] ?? 0;
}

/** Bonus of the active pet. */
export function petMods(hero: Hero, content: ContentDb): StatMods {
  const pet = hero.activePet ? content.pets.get(hero.activePet) : undefined;
  const stars = pet ? petStars(hero, pet.id) : 0;
  return pet && stars > 0 ? { [pet.bonus.stat]: pet.bonus.value * stars } : {};
}

/** Adds a found copy (up to the pet's maximum stars). Returns the new stars, or null if maxed. */
function addPet(s: GameState, content: ContentDb, petId: string): number | null {
  const pet = content.pets.get(petId);
  if (!pet) return null;
  const stars = petStars(s.hero, petId);
  if (stars >= pet.maxStars) return null;
  s.hero.pets[petId] = stars + 1;
  // The first pet found becomes the active one, so it is seen at once.
  s.hero.activePet ??= petId;
  return stars + 1;
}

/** One boss kill's chance at its pet (one RNG draw per pet that boss can bring). */
export function rollPetDrop(
  s: GameState,
  content: ContentDb,
  monsterId: string,
  draw: (ppm: number) => boolean,
  t: number,
  out: GameEvent[] | null,
) {
  for (const pet of content.pets.values()) {
    if (pet.bossId !== monsterId || petStars(s.hero, pet.id) >= pet.maxStars) continue;
    if (!draw(pet.chancePpm)) continue;
    const stars = addPet(s, content, pet.id);
    if (stars !== null) out?.push({ type: 'PetFound', tick: t, petId: pet.id, stars });
  }
}

/** Offline: `kills` of a boss at once. Returns the pets found (id → copies). */
export function rollOfflinePets(
  s: GameState,
  content: ContentDb,
  rng: RngState,
  monsterId: string,
  kills: number,
): Record<string, number> {
  const found: Record<string, number> = {};
  for (const pet of content.pets.values()) {
    if (pet.bossId !== monsterId) continue;
    const copies = rngBinomial(rng, kills, pet.chancePpm);
    for (let i = 0; i < copies; i++) {
      if (addPet(s, content, pet.id) === null) break;
      found[pet.id] = (found[pet.id] ?? 0) + 1;
    }
  }
  return found;
}

/** Chooses the pet that follows the hero (null: none). */
export function setActivePet(s: GameState, petId: string | null) {
  if (petId !== null && petStars(s.hero, petId) <= 0) throw new IntentError('pet_not_found');
  s.hero.activePet = petId;
}
