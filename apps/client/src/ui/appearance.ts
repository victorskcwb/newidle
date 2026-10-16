/** Hero appearance options, shared by the creation screen and the placeholder textures. */
export const HAIR_COLORS = [0x3b2a1e, 0xc9a25a, 0x8c2f1e, 0xd8d8d8] as const;
export const OUTFIT_COLORS = [0x6b4a2f, 0x2f4f6b, 0x4f2f5a, 0x3d5a2f] as const;

export const cssColor = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

/** 3–16 letters, digits, spaces, "-" or "_", starting and ending with a letter or digit. */
export const HERO_NAME = /^[\p{L}\p{N}](?:[\p{L}\p{N} _-]{1,14})[\p{L}\p{N}]$/u;

export function isValidHeroName(name: string): boolean {
  return HERO_NAME.test(name) && !name.includes('  ');
}
