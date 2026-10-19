import { describe, expect, it } from 'vitest';
import {
  createRng,
  decodeSave,
  encodeSave,
  heroStats,
  IntentError,
  rollOfflinePets,
  rollPetDrop,
  setActivePet,
  type GameEvent,
} from '../src/index.ts';
import { content, newGame } from './fixture.ts';

const RAT = 'pet_grave_rat'; // from the Gravekeeper, +3% gold per star

describe('pets', () => {
  it('a boss brings its pet; repeats add stars up to the maximum', () => {
    const s = newGame();
    const events: GameEvent[] = [];
    rollPetDrop(s, content, 'gravekeeper', () => true, 0, events);
    expect(s.hero.pets[RAT]).toBe(1);
    expect(s.hero.activePet).toBe(RAT); // the first pet is put to work at once
    expect(events).toEqual([{ type: 'PetFound', tick: 0, petId: RAT, stars: 1 }]);
    for (let i = 0; i < 5; i++) rollPetDrop(s, content, 'gravekeeper', () => true, 0, null);
    expect(s.hero.pets[RAT]).toBe(content.pets.get(RAT)!.maxStars);
    // Other bosses bring other pets.
    rollPetDrop(s, content, 'lord_vharok', () => true, 0, null);
    expect(s.hero.pets.pet_vharok_crow).toBe(1);
    expect(s.hero.activePet).toBe(RAT);
  });

  it('only the active pet gives its bonus, per star', () => {
    const s = newGame();
    const base = heroStats(s.hero, content).goldPct;
    expect(() => setActivePet(s, RAT)).toThrow(IntentError);
    s.hero.pets[RAT] = 2;
    setActivePet(s, RAT);
    expect(heroStats(s.hero, content).goldPct).toBe(base + 6);
    setActivePet(s, null);
    expect(heroStats(s.hero, content).goldPct).toBe(base);
  });

  it('offline boss kills roll for the pet in bulk', () => {
    const s = newGame();
    const found = rollOfflinePets(s, content, createRng([1, 2, 3, 4]), 'gravekeeper', 400);
    // 2% per kill: about 8 expected, capped by the 3 stars.
    expect(found[RAT]).toBe(3);
    expect(s.hero.pets[RAT]).toBe(3);
  });

  it('migrates v18 saves with no pets', () => {
    const s = newGame();
    const raw = JSON.parse(encodeSave(s, 1)) as {
      version: number;
      state: { version: number; hero: Record<string, unknown> };
    };
    raw.version = 18;
    raw.state.version = 18;
    delete raw.state.hero.pets;
    delete raw.state.hero.activePet;
    expect(decodeSave(JSON.stringify(raw), content).state).toEqual(s);
  });
});
