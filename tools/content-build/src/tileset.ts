/**
 * Layout of the final art: the 32 px tileset (assets/sprites/tiles.png, 16 columns) and the
 * 64 px props sheet (assets/sprites/props.png, 8 columns) for trees and large rocks that are
 * drawn above the actors. build-art copies the pixels; gen-maps places the ids. Pure data,
 * no image is read here.
 *
 * Sources: the OpenTibia Sprite Pack (CC BY 4.0, assets/vendor/opentibia-sprite-pack) by
 * sheet index, the placeholder collision marker, and a few tiles drawn by build-art
 * (gravestones, bones, lava).
 */
import { TILE } from './gen-maps-tiles.ts';

export type Sheet = 'otsp_tiles' | 'otsp_nature' | 'placeholder' | 'drawn';
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
/** Props of the 64 px sheet: the top-left cell of a 2×2 block of otsp_nature. */
export const propSlots: number[] = [];

const add = (sheet: Sheet, index: number, drawn?: Drawn) => {
  const found = slots.findIndex((s) => s.sheet === sheet && s.index === index && s.drawn === drawn);
  if (found >= 0) return found;
  slots.push(drawn ? { sheet, index, drawn } : { sheet, index });
  return slots.length - 1;
};
const many = (sheet: Sheet, indices: number[]) => indices.map((i) => add(sheet, i));
const span = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, k) => from + k);
const prop = (index: number) => {
  const found = propSlots.indexOf(index);
  if (found >= 0) return found;
  propSlots.push(index);
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
  greenGrass: many('otsp_tiles', span(21, 36)),
  dirt: many('otsp_tiles', span(147, 150)),
  mud: many('otsp_tiles', span(160, 163)),
  darkRock: many('otsp_tiles', span(164, 171)),
  hexStone: many('otsp_tiles', span(232, 241)),
  darkEarth: many('otsp_tiles', span(172, 179)),
};

/**
 * Grass edges laid over a lower ground: edges (grass on one side), small outer corners
 * (grass only on a diagonal neighbour) and large inner corners (grass on two sides).
 */
export interface BorderSet {
  n: number;
  e: number;
  s: number;
  w: number;
  cornerNW: number;
  cornerNE: number;
  cornerSW: number;
  cornerSE: number;
  diagNW: number;
  diagNE: number;
  diagSW: number;
  diagSE: number;
}
const borderSet = (first: number): BorderSet => {
  const [n, e, s, w, cornerNW, cornerNE, cornerSW, cornerSE, diagNW, diagNE, diagSW, diagSE] = many(
    'otsp_tiles',
    span(first, first + 11),
  ) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return { n, e, s, w, cornerNW, cornerNE, cornerSW, cornerSE, diagNW, diagNE, diagSW, diagSE };
};
export const BORDERS = { dry: borderSet(336), green: borderSet(348) };

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
  deadTrees: [220, 222, 274, 276, 368, 478, 530].map(prop),
  greenTrees: [242, 244, 248, 250, 252, 340, 344, 350, 372, 470, 474, 476, 540, 542].map(prop),
  swampTrees: [274, 276, 282, 348, 370, 478, 536, 538, 560, 562].map(prop),
  giantMushrooms: [592].map(prop),
  rocks: [724, 726, 732].map(prop),
};

export const TILESET_ROWS = Math.ceil(slots.length / TILESET_COLS);
export const PROPS_ROWS = Math.ceil(propSlots.length / PROPS_COLS);
