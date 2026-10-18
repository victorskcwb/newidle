/**
 * Layout of the final art: the 32 px tileset (assets/sprites/tiles.png, 16 columns) and the
 * 64 px props sheet (assets/sprites/props.png, 8 columns) for trees and large rocks that are
 * drawn above the actors. build-art copies the pixels; gen-maps places the ids. Pure data,
 * no image is read here.
 *
 * Sources: the OpenTibia Sprite Pack (CC BY 4.0, assets/vendor/opentibia-sprite-pack) by
 * sheet index (tiles, nature, town and walls sheets), the placeholder collision marker, and a few tiles drawn by build-art
 * (gravestones, bones, lava).
 */
import { TILE } from './gen-maps-tiles.ts';

export type Sheet =
  | 'otsp_tiles'
  | 'otsp_nature'
  | 'otsp_town'
  | 'otsp_walls'
  | 'otsp_doors'
  | 'placeholder'
  | 'drawn';
export type Drawn = 'grave' | 'grave_cross' | 'bones' | 'skull' | 'lava';
export interface Slot {
  sheet: Sheet;
  /** Sheet index (32 px cells, 16 per row) or placeholder id; for drawn tiles, the frame. */
  index: number;
  drawn?: Drawn;
}

export const TILESET_COLS = 16;
export const PROPS_COLS = 8;
/** Tiles of the 32 px tileset, in order (id = position). */
export const slots: Slot[] = [];
/** Props of the 64 px sheet: the top-left cell of a 2×2 block of a pack sheet. */
export const propSlots: { sheet: Sheet; index: number }[] = [];

const add = (sheet: Sheet, index: number, drawn?: Drawn) => {
  const found = slots.findIndex((s) => s.sheet === sheet && s.index === index && s.drawn === drawn);
  if (found >= 0) return found;
  slots.push(drawn ? { sheet, index, drawn } : { sheet, index });
  return slots.length - 1;
};
const many = (sheet: Sheet, indices: number[]) => indices.map((i) => add(sheet, i));
const span = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, k) => from + k);
const prop = (index: number, sheet: Sheet = 'otsp_nature') => {
  const found = propSlots.findIndex((p) => p.sheet === sheet && p.index === index);
  if (found >= 0) return found;
  propSlots.push({ sheet, index });
  return propSlots.length - 1;
};

// Water first: 8 animation frames, each a seamless 4×4 block (tile x,y uses cell x%4, y%4).
/** WATER[frame][cy * 4 + cx] */
export const WATER: number[][] = Array.from({ length: 8 }, (_, f) =>
  Array.from({ length: 16 }, (_, c) => {
    const row = 46 + (f >= 4 ? 4 : 0) + Math.floor(c / 4);
    const col = (f % 4) * 4 + (c % 4);
    return add('otsp_tiles', row * 16 + col);
  }),
);
export const WATER_FRAME_MS = 280;

export const GROUND = {
  dryGrass: many('otsp_tiles', span(1, 12)),
  mossGrass: many('otsp_tiles', span(61, 76)),
  lushGrass: many('otsp_tiles', [99, 100]),
  sand: many('otsp_tiles', span(111, 116)),
  abyss: many('otsp_tiles', span(196, 203)),
  greenGrass: many('otsp_tiles', span(21, 36)),
  dirt: many('otsp_tiles', span(147, 150)),
  mud: many('otsp_tiles', span(160, 163)),
  darkRock: many('otsp_tiles', span(164, 171)),
  hexStone: many('otsp_tiles', span(232, 241)),
  darkEarth: many('otsp_tiles', span(172, 179)),
  cobble: many('otsp_tiles', span(211, 219)),
  plaza: many('otsp_tiles', span(221, 224)),
  woodFloor: many('otsp_tiles', [281]),
  darkWoodFloor: many('otsp_tiles', [282]),
};

/**
 * Grass edges laid over a lower ground: edges (grass on one side), small outer corners
 * (grass only on a diagonal neighbour) and large inner corners (grass on two sides). Each
 * piece may have variants, picked by position.
 */
export interface BorderSet {
  n: number[];
  e: number[];
  s: number[];
  w: number[];
  cornerNW: number[];
  cornerNE: number[];
  cornerSW: number[];
  cornerSE: number[];
  diagNW: number[];
  diagNE: number[];
  diagSW: number[];
  diagSE: number[];
}
const one = (i: number) => [add('otsp_tiles', i)];
/** A set laid out as 12 consecutive cells: N E S W, small corners, large corners. */
const borderSet = (first: number): BorderSet => {
  const c = (k: number) => one(first + k);
  return {
    n: c(0),
    e: c(1),
    s: c(2),
    w: c(3),
    cornerNW: c(4),
    cornerNE: c(5),
    cornerSW: c(6),
    cornerSE: c(7),
    diagNW: c(8),
    diagNE: c(9),
    diagSW: c(10),
    diagSE: c(11),
  };
};
/** A set with `variants` cells per edge (N, E, S, W), then corners and large corners. */
const borderSetVariants = (first: number, variants: number, diagFirst?: number): BorderSet => {
  const edge = (k: number) =>
    many('otsp_tiles', span(first + k * variants, first + (k + 1) * variants - 1));
  const c0 = first + 4 * variants;
  const d0 = diagFirst ?? c0 + 4;
  return {
    n: edge(0),
    e: edge(1),
    s: edge(2),
    w: edge(3),
    cornerNW: one(c0),
    cornerNE: one(c0 + 1),
    cornerSW: one(c0 + 2),
    cornerSE: one(c0 + 3),
    diagNW: one(d0),
    diagNE: one(d0 + 1),
    diagSW: one(d0 + 2),
    diagSE: one(d0 + 3),
  };
};
export const BORDERS = {
  dry: borderSet(336),
  green: borderSet(348),
  /** Dark mossy grass (swamps), over mud. */
  moss: borderSetVariants(396, 3, 384),
  /** Lush green grass (woods). */
  lush: borderSetVariants(428, 2),
  /** Sand (shores). */
  sand: borderSetVariants(460, 2),
};

/** Objects on the decor layer (transparent background). */
export const DECOR = {
  plants: many('otsp_nature', [2, 3, 5, 7, 8, 9, 48, 52, 53, 55, 56, 57, 130, 131, 132, 144]),
  flowers: many('otsp_nature', [1, 25, 27, 73, 74]),
  mushrooms: many('otsp_nature', [88, 89, 90]),
  toadstools: many('otsp_nature', [92, 93]),
  pebbles: many('otsp_nature', [630, 631, 634, 636]),
  /** Blocking. */
  bushes: many('otsp_nature', [169, 170, 171, 172, 146, 148]),
  deadBushes: many('otsp_nature', [173]),
  boulders: many('otsp_nature', [688, 690, 691, 692, 693, 696, 697, 698, 700, 701, 706]),
  graves: [add('drawn', 0, 'grave'), add('drawn', 1, 'grave_cross')],
  /** Ground detail: small tufts, flowers, leaves and stones drawn over the ground. */
  tuftsGreen: many('otsp_nature', span(112, 119)),
  tuftsDry: many('otsp_nature', span(120, 124)),
  moss: many('otsp_nature', [125, 126]),
  berries: many('otsp_nature', [16, 17, 18, 19, 20, 41, 42]),
  violets: many('otsp_nature', [43, 44, 45, 46, 24]),
  leaves: many('otsp_nature', [21, 22, 23, 40, 82, 83, 85]),
  twigs: many('otsp_nature', [127, 128, 129]),
  gravel: many('otsp_nature', [625, 626, 627, 628, 629, 632, 633]),
  /** Town furniture (32 px). */
  crates: many('otsp_town', [22]),
  barrels: many('otsp_town', [23]),
  well: many('otsp_town', [129]),
  sign: many('otsp_town', [130]),
  benches: many('otsp_town', [11, 12, 13, 14]),
  chairs: many('otsp_town', [7, 8, 9, 10]),
  pots: many('otsp_town', [1, 2, 99]),
  /** A bowl of fire (blocking). */
  brazier: many('otsp_town', [128]),
  bones: [add('drawn', 2, 'bones'), add('drawn', 3, 'skull')],
};

/** The pack has no lava: 4 frames drawn by build-art. */
export const LAVA_FRAMES = 4;
/** LAVA[frame][cy * 2 + cx]: the pattern repeats every 2×2 tiles (tile x,y uses x%2, y%2). */
export const LAVA: number[][] = Array.from({ length: LAVA_FRAMES }, (_, f) =>
  Array.from({ length: 4 }, (_, c) => add('drawn', f * 4 + c, 'lava')),
);
export const LAVA_FRAME_MS = 300;
export const COLLISION = add('placeholder', TILE.collision);

/** 64 px props by kind (indices into the props sheet). */
export const PROPS = {
  deadTrees: [220, 222, 274, 276, 368, 478, 530].map((i) => prop(i)),
  greenTrees: [242, 244, 248, 250, 252, 340, 344, 350, 372, 470, 474, 476, 540, 542].map((i) =>
    prop(i),
  ),
  swampTrees: [274, 276, 282, 348, 370, 478, 536, 538, 560, 562].map((i) => prop(i)),
  giantMushrooms: [592].map((i) => prop(i)),
  rocks: [724, 726, 732].map((i) => prop(i)),
  /** Stone walls: placed on a tile, drawn up and to the left of it (as in the pack). */
  wallVertical: prop(0, 'otsp_walls'),
  wallHorizontal: prop(2, 'otsp_walls'),
  wallPole: prop(4, 'otsp_walls'),
  wallCorner: prop(6, 'otsp_walls'),
  /** A stone wall piece with an arched wooden door. */
  archDoor: prop(12, 'otsp_doors'),
  forge: prop(230, 'otsp_town'),
  fountain: prop(232, 'otsp_town'),
  woodpile: prop(200, 'otsp_town'),
  statue: prop(256, 'otsp_town'),
  hoodedStatue: prop(288, 'otsp_town'),
  chestGold: prop(48, 'otsp_town'),
  chestIron: prop(52, 'otsp_town'),
  crate: prop(56, 'otsp_town'),
  darkCrate: prop(58, 'otsp_town'),
  bigCrate: prop(60, 'otsp_town'),
  barrels: prop(392, 'otsp_town'),
  bigTable: prop(394, 'otsp_town'),
  table: prop(396, 'otsp_town'),
  bed: prop(420, 'otsp_town'),
  stove: prop(426, 'otsp_town'),
  bookshelf: prop(430, 'otsp_town'),
  displayCase: prop(450, 'otsp_town'),
  cabinet: prop(452, 'otsp_town'),
};

export const TILESET_ROWS = Math.ceil(slots.length / TILESET_COLS);
export const PROPS_ROWS = Math.ceil(propSlots.length / PROPS_COLS);
