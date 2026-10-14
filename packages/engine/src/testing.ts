/** Test fixtures shared by the engine tests and the browser determinism page. Not game content. */
import { buildContentDb, type ContentDb } from '@valdren/content';
import { canonicalJson, fnv1a64, hashState } from './hash.ts';
import { setQueue } from './intents.ts';
import { step } from './step.ts';
import { deriveSeed } from './seed.ts';
import { newCharacterSkills, newSlotState } from './state.ts';
import type { ItemStack, SlotState } from './types.ts';

const scene = { prop: 'props/test', anim: 'mine', particles: 'chips' } as const;
const item = (id: string, extra: object = {}) => ({
  id,
  nameKey: `item.${id}`,
  type: 'resource',
  rarity: 'common',
  baseValue: 1,
  tradeable: true,
  icon: `items/${id}`,
  ...extra,
});

/** Small content set independent from the game's balance data. */
export const fixtureContent: ContentDb = buildContentDb({
  items: [
    item('ore'),
    item('tin'),
    item('gem', { rarity: 'uncommon' }),
    item('star', { rarity: 'rare' }),
    item('bar'),
    item('pick', { type: 'tool', tool: { type: 'pickaxe', speedBonusPpm: 0 } }),
    item('fast_pick', { type: 'tool', tool: { type: 'pickaxe', speedBonusPpm: 200_000 } }),
  ],
  actions: [
    {
      id: 'mine_ore',
      nameKey: 'action.mine_ore',
      skill: 'mining',
      level: 1,
      durationMs: 3000,
      xpTenths: 25,
      inputs: [],
      outputs: [{ itemId: 'ore', qty: 1, chancePpm: 1_000_000 }],
      tool: 'pickaxe',
      regionId: 'r',
      scene,
    },
    {
      id: 'mine_tin',
      nameKey: 'action.mine_tin',
      skill: 'mining',
      level: 1,
      durationMs: 3000,
      xpTenths: 25,
      inputs: [],
      outputs: [{ itemId: 'tin', qty: 1, chancePpm: 1_000_000 }],
      tool: 'pickaxe',
      regionId: 'r',
      scene,
    },
    {
      id: 'mine_gems',
      nameKey: 'action.mine_gems',
      skill: 'mining',
      level: 1,
      durationMs: 3000,
      xpTenths: 40,
      inputs: [],
      outputs: [
        { itemId: 'ore', qty: 1, chancePpm: 1_000_000 },
        { itemId: 'gem', qty: 2, chancePpm: 50_000 },
        { itemId: 'star', qty: 1, chancePpm: 5_000 },
      ],
      tool: 'pickaxe',
      regionId: 'r',
      scene,
    },
    {
      id: 'mine_deep',
      nameKey: 'action.mine_deep',
      skill: 'mining',
      level: 15,
      durationMs: 3000,
      xpTenths: 70,
      inputs: [],
      outputs: [{ itemId: 'ore', qty: 1, chancePpm: 1_000_000 }],
      tool: 'pickaxe',
      regionId: 'r',
      scene,
    },
    {
      id: 'smelt',
      nameKey: 'action.smelt',
      skill: 'smithing',
      level: 1,
      durationMs: 2400,
      xpTenths: 30,
      inputs: [
        { itemId: 'ore', qty: 1 },
        { itemId: 'tin', qty: 1 },
      ],
      outputs: [{ itemId: 'bar', qty: 1, chancePpm: 1_000_000 }],
      regionId: 'r',
      scene,
    },
  ],
  regions: [{ id: 'r', nameKey: 'region.r', skyColor: '#000000', background: 'bg/r' }],
  monsters: [],
  lootTables: [],
  huntingAreas: [],
});

export function fixtureState(
  bank: ItemStack[] = [{ itemId: 'pick', qty: 1 }],
  seedKey = 'char-1',
  tick = 1000,
): SlotState {
  return newSlotState({
    slot: 'main',
    tick,
    seed: deriveSeed(seedKey, 'main', 0),
    skills: newCharacterSkills(),
    bank,
  });
}

/**
 * Shared determinism scenario: Node (vitest) and the browser (Playwright) both run it and must
 * reach the same golden hashes. Mine tin, smelt until the 200 ore run out, then mine gems
 * (chance outputs) for the rest of the run.
 */
export function determinismScenario(): SlotState {
  const q = setQueue(
    fixtureState(
      [
        { itemId: 'ore', qty: 200 },
        { itemId: 'pick', qty: 1 },
      ],
      'determinism',
    ),
    [
      { actionId: 'mine_tin', stop: { kind: 'count', count: 250 } },
      { actionId: 'smelt', stop: { kind: 'materials' } },
      { actionId: 'mine_gems', stop: { kind: 'materials' } },
    ],
    fixtureContent,
  );
  if (!q.ok) throw new Error('scenario queue rejected');
  return q.state;
}

export interface DeterminismResult {
  hash: string;
  eventsHash: string;
  eventCount: number;
}

/** Runs the scenario for `ticks`, stepping `chunk` ticks at a time. */
export function runDeterminism(ticks: number, chunk = ticks): DeterminismResult {
  let state = determinismScenario();
  let eventsHash = '';
  let eventCount = 0;
  for (let done = 0; done < ticks; done += chunk) {
    const r = step(state, Math.min(chunk, ticks - done), fixtureContent);
    state = r.state;
    for (const event of r.events) eventsHash = fnv1a64(eventsHash + canonicalJson(event));
    eventCount += r.events.length;
  }
  return { hash: hashState(state), eventsHash, eventCount };
}

/**
 * Golden result of runDeterminism(100_000). Asserted in Node (vitest) and in Chromium (Playwright).
 * Changing engine rules changes it on purpose: update it in the same commit and say why.
 */
export const DETERMINISM_GOLDEN_100K: DeterminismResult = {
  hash: 'b0e2d403cb8374be',
  eventsHash: '4732e97bf8466f88',
  eventCount: 60575,
};
