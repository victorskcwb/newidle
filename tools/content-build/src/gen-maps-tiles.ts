/**
 * Tile ids inside the tileset (Tiled gid = id + 1), shared by the map generator
 * (placeholder tileset) and build-art (final tileset from the Kenney packs).
 */
export const TILE = {
  grass: 0,
  grass2: 1,
  path: 2,
  wall: 3,
  grave: 4,
  tree: 5,
  water1: 6,
  water2: 7,
  gate: 8,
  collision: 9,
  bones: 10,
  mushrooms: 11,
  stone: 12,
  mud: 13,
  lava1: 14,
  lava2: 15,
  ash: 16,
  ash2: 17,
} as const;
