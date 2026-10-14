import type { SlotId } from './types.ts';

function fnv1a32(text: string, offset: number): number {
  let h = offset >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Final avalanche (murmur3 fmix32). */
function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Seed words for a slot's RNG, derived on the server from (character, slot, restart counter).
 * The client never picks a seed.
 */
export function deriveSeed(
  characterId: string,
  slot: SlotId,
  restarts: number,
): [number, number, number, number] {
  const text = `${characterId}|${slot}|${restarts}`;
  return [
    mix(fnv1a32(text, 0x811c9dc5)),
    mix(fnv1a32(text, 0x9e3779b9)),
    mix(fnv1a32(text, 0x7f4a7c15)),
    mix(fnv1a32(text, 0x2545f491)),
  ];
}
