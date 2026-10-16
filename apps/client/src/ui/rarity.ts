import type { Rarity } from '@abismo/content';

/** Rarity is always shown by colour and by a distinct glyph (accessibility, section 7.2). */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#e6e3dc',
  magic: '#5aa0ff',
  rare: '#ffd84a',
  epic: '#b86cff',
  legendary: '#ff8c1a',
};

export const RARITY_GLYPH: Record<Rarity, string> = {
  common: '●',
  magic: '◆',
  rare: '★',
  epic: '✦',
  legendary: '✸',
};

export function rarityHex(r: Rarity): number {
  return parseInt(RARITY_COLOR[r].slice(1), 16);
}
