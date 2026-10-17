/**
 * Generates the placeholder tiles (our lava and the collision marker, read by build-art) and
 * every hunt map as a regular Tiled map (.tmj) with the tile ids of tileset.ts, so maps can
 * be opened and edited in Tiled afterwards. Deterministic: running it again produces the
 * same files.
 *
 *   pnpm maps:gen
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { TILE } from './gen-maps-tiles.ts';
import { Image } from './png.ts';
import {
  BORDERS,
  COLLISION,
  DECOR,
  GROUND,
  LAVA,
  LAVA_FRAME_MS,
  PROPS,
  PROPS_COLS,
  PROPS_ROWS,
  TILESET_COLS,
  TILESET_ROWS,
  WATER,
  WATER_FRAME_MS,
  type BorderSet,
} from './tileset.ts';

type Rgba = readonly [number, number, number, number];
const T = 32;
const COLS = 8;
const ROWS = 3;

let seed = 0x2545f491;
function rand(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}

const hex = (h: string, a = 255): Rgba => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
  a,
];

function drawTileset(): Image {
  const img = new Image(COLS * T, ROWS * T);
  const at = (id: number) => ({ x: (id % COLS) * T, y: Math.floor(id / COLS) * T });
  const fill = (id: number, color: Rgba, specks: Rgba[], density: number) => {
    const { x, y } = at(id);
    img.rect(x, y, T, T, color);
    for (let i = 0; i < T * T * density; i++) {
      img.set(
        x + Math.floor(rand() * T),
        y + Math.floor(rand() * T),
        specks[Math.floor(rand() * specks.length)]!,
      );
    }
  };
  const grass = hex('#2f3b2a');
  const grassSpecks = [hex('#36452f'), hex('#28331f'), hex('#3c4a33')];
  for (const id of [TILE.grass, TILE.grave, TILE.tree, TILE.bones, TILE.mushrooms]) {
    fill(id, grass, grassSpecks, 0.12);
  }
  fill(TILE.grass2, hex('#2b3626'), [hex('#3b4a31'), hex('#232c1c')], 0.2);
  fill(TILE.path, hex('#5a4a3a'), [hex('#6b5a48'), hex('#4a3c2e'), hex('#7a6a58')], 0.15);
  fill(TILE.gate, hex('#5a4a3a'), [hex('#6b5a48')], 0.1);

  // Stone wall: bricks with mortar.
  {
    const { x, y } = at(TILE.wall);
    img.rect(x, y, T, T, hex('#4b4b55'));
    for (let row = 0; row < 4; row++) {
      img.rect(x, y + row * 8, T, 1, hex('#34343c'));
      const off = row % 2 === 0 ? 0 : 8;
      for (let c = off; c < T; c += 16) img.rect(x + c, y + row * 8, 1, 8, hex('#34343c'));
    }
    img.rect(x, y + T - 2, T, 2, hex('#2a2a30'));
  }
  // Gravestone.
  {
    const { x, y } = at(TILE.grave);
    const stone = hex('#8a8a94');
    const dark = hex('#4a4a52');
    img.rect(x + 9, y + 10, 14, 18, stone);
    img.rect(x + 11, y + 7, 10, 3, stone);
    img.rect(x + 8, y + 10, 1, 18, dark);
    img.rect(x + 23, y + 10, 1, 18, dark);
    img.rect(x + 10, y + 6, 12, 1, dark);
    img.rect(x + 8, y + 28, 16, 1, dark);
    img.rect(x + 15, y + 12, 2, 10, dark);
    img.rect(x + 12, y + 15, 8, 2, dark);
  }
  // Dead tree.
  {
    const { x, y } = at(TILE.tree);
    const bark = hex('#4a3626');
    const dark = hex('#2e2118');
    img.rect(x + 14, y + 10, 5, 20, bark);
    img.rect(x + 13, y + 10, 1, 20, dark);
    img.rect(x + 7, y + 8, 8, 3, bark);
    img.rect(x + 18, y + 5, 7, 3, bark);
    img.rect(x + 5, y + 4, 3, 6, bark);
    img.rect(x + 23, y + 1, 3, 6, bark);
    img.rect(x + 12, y + 29, 9, 2, dark);
  }
  // Water, two frames.
  for (const [id, shift] of [
    [TILE.water1, 0],
    [TILE.water2, 4],
  ] as const) {
    const { x, y } = at(id);
    img.rect(x, y, T, T, hex('#1f3a4f'));
    for (let row = 4; row < T; row += 8) {
      for (let c = 0; c < T; c += 8)
        img.rect(x + ((c + shift + row) % T), y + row, 4, 1, hex('#2c5470'));
    }
  }
  // Gate in the wall.
  {
    const { x, y } = at(TILE.gate);
    img.rect(x, y, T, T, hex('#4b4b55'));
    img.rect(x + 6, y + 4, 20, 28, hex('#1a1a20'));
    img.rect(x + 3, y + 8, 2, 4, hex('#ff9a3c'));
    img.rect(x + 27, y + 8, 2, 4, hex('#ff9a3c'));
  }
  fill(TILE.collision, hex('#ff0000', 90), [hex('#ff0000', 140)], 0.05);
  // Bones.
  {
    const { x, y } = at(TILE.bones);
    const bone = hex('#ddd6c4');
    img.rect(x + 8, y + 18, 10, 2, bone);
    img.rect(x + 7, y + 17, 2, 4, bone);
    img.rect(x + 17, y + 17, 2, 4, bone);
    img.rect(x + 19, y + 9, 5, 4, bone);
    img.rect(x + 20, y + 13, 3, 1, hex('#9a927f'));
  }
  // Pale mushrooms.
  {
    const { x, y } = at(TILE.mushrooms);
    for (const [mx, my] of [
      [8, 12],
      [20, 20],
      [14, 24],
    ] as const) {
      img.rect(x + mx, y + my, 5, 2, hex('#c9c2d6'));
      img.rect(x + mx + 2, y + my + 2, 1, 3, hex('#8e879a'));
    }
  }
  // Stone floor (crypt, citadel).
  fill(TILE.stone, hex('#3a3842'), [hex('#45434f'), hex('#2f2d36'), hex('#4f4c58')], 0.18);
  {
    const { x, y } = at(TILE.stone);
    for (let k = 0; k < T; k += 16) img.rect(x, y + k, T, 1, hex('#2a2830'));
    img.rect(x + 16, y, 1, 16, hex('#2a2830'));
    img.rect(x + 8, y + 16, 1, 16, hex('#2a2830'));
  }
  // Swamp mud.
  fill(TILE.mud, hex('#3b3a26'), [hex('#4a4830'), hex('#2e2d1c'), hex('#556b2f')], 0.2);
  fill(TILE.ash, hex('#3a2a26'), [hex('#4a3430'), hex('#2a1e1c')], 0.15);
  fill(TILE.ash2, hex('#3a2a26'), [hex('#6a5a50'), hex('#2a1e1c')], 0.25);
  // Lava, two frames.
  for (const [id, shift] of [
    [TILE.lava1, 0],
    [TILE.lava2, 5],
  ] as const) {
    const { x, y } = at(id);
    img.rect(x, y, T, T, hex('#8a2a10'));
    for (let row = 3; row < T; row += 7) {
      for (let c = 0; c < T; c += 9)
        img.rect(x + ((c + shift + row) % T), y + row, 5, 2, hex('#e0701a'));
    }
    img.rect(x + ((shift * 3) % T), y + 14, 3, 3, hex('#ffd04a'));
  }
  return img;
}

interface MapObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  point?: boolean;
  gid?: number;
  rotation: number;
  visible: boolean;
}

export type Theme = 'cemetery' | 'woods' | 'crypt' | 'swamp' | 'village' | 'ash' | 'molten';

interface Litter {
  tiles: number[];
  chance: number;
}

interface ThemeSpec {
  /** Main ground, and the occasional other ground mixed into it. */
  field: number[];
  speck?: Litter;
  /** Route ground; also the ground the field's borders lie on. */
  path: number[];
  /** Field edges drawn over the path and the hazards (none for paved maps). */
  border: BorderSet | null;
  hazard: 'water' | 'lava';
  pond: boolean;
  inner: 'graves' | 'trees' | 'rocks' | 'ruins' | 'hazard';
  /** Props along the map edge and outside the route loop. */
  edgeProps: number[];
  outerProps: number[];
  outerPropChance: number;
  /** Blocking 32 px objects outside the loop. */
  outerBlocks: number[];
  outerBlockChance: number;
  outerHazard: number;
  /** Small objects anywhere off the path (no collision). */
  litter: Litter[];
}

function pick<V>(list: readonly V[]): V {
  return list[Math.floor(rand() * list.length)]!;
}

const swamp: ThemeSpec = {
  field: GROUND.dryGrass,
  path: GROUND.mud,
  border: BORDERS.dry,
  hazard: 'water',
  pond: true,
  inner: 'hazard',
  edgeProps: PROPS.swampTrees,
  outerProps: [...PROPS.swampTrees, ...PROPS.giantMushrooms],
  outerPropChance: 0.12,
  outerBlocks: DECOR.bushes,
  outerBlockChance: 0.03,
  outerHazard: 0.1,
  litter: [
    { tiles: DECOR.toadstools, chance: 0.02 },
    { tiles: DECOR.mushrooms, chance: 0.02 },
    { tiles: DECOR.plants, chance: 0.05 },
    { tiles: DECOR.bones, chance: 0.01 },
  ],
};

const ash: ThemeSpec = {
  field: GROUND.darkEarth,
  path: GROUND.darkRock,
  border: null,
  hazard: 'lava',
  pond: true,
  inner: 'rocks',
  edgeProps: PROPS.rocks,
  outerProps: PROPS.rocks,
  outerPropChance: 0.06,
  outerBlocks: DECOR.boulders,
  outerBlockChance: 0.08,
  outerHazard: 0.06,
  litter: [
    { tiles: DECOR.bones, chance: 0.03 },
    { tiles: DECOR.pebbles, chance: 0.02 },
  ],
};

const THEMES: Record<Theme, ThemeSpec> = {
  cemetery: {
    field: GROUND.dryGrass,
    path: GROUND.dirt,
    border: BORDERS.dry,
    hazard: 'water',
    pond: true,
    inner: 'graves',
    edgeProps: PROPS.deadTrees,
    outerProps: PROPS.deadTrees,
    outerPropChance: 0.12,
    outerBlocks: [...DECOR.deadBushes, ...DECOR.graves],
    outerBlockChance: 0.06,
    outerHazard: 0,
    litter: [
      { tiles: DECOR.bones, chance: 0.03 },
      { tiles: DECOR.mushrooms, chance: 0.015 },
      { tiles: DECOR.plants, chance: 0.03 },
      { tiles: DECOR.pebbles, chance: 0.01 },
    ],
  },
  woods: {
    field: GROUND.greenGrass,
    path: GROUND.dirt,
    border: BORDERS.green,
    hazard: 'water',
    pond: true,
    inner: 'trees',
    edgeProps: PROPS.greenTrees,
    outerProps: PROPS.greenTrees,
    outerPropChance: 0.3,
    outerBlocks: DECOR.bushes,
    outerBlockChance: 0.06,
    outerHazard: 0,
    litter: [
      { tiles: DECOR.flowers, chance: 0.03 },
      { tiles: DECOR.plants, chance: 0.05 },
      { tiles: DECOR.mushrooms, chance: 0.015 },
      { tiles: DECOR.bones, chance: 0.01 },
    ],
  },
  crypt: {
    field: GROUND.darkRock,
    path: GROUND.hexStone,
    border: null,
    hazard: 'water',
    pond: false,
    inner: 'ruins',
    edgeProps: PROPS.rocks,
    outerProps: PROPS.rocks,
    outerPropChance: 0.08,
    outerBlocks: [...DECOR.boulders, ...DECOR.graves],
    outerBlockChance: 0.12,
    outerHazard: 0,
    litter: [
      { tiles: DECOR.bones, chance: 0.04 },
      { tiles: DECOR.pebbles, chance: 0.03 },
    ],
  },
  swamp,
  village: {
    ...swamp,
    inner: 'ruins',
    outerPropChance: 0.06,
    outerBlocks: [...DECOR.boulders, ...DECOR.bushes],
    outerBlockChance: 0.05,
    outerHazard: 0.08,
  },
  ash,
  molten: { ...ash, inner: 'hazard', outerHazard: 0.12 },
};

/**
 * One hunt map: the same 2-tile route loop and town exit for every hunt (so routes and
 * spawns are known to work), with ground, obstacles and hazards from the theme. Grass edges
 * are laid automatically wherever the field meets the path or water.
 */
function buildHuntMap(theme: Theme, mapSeed: number) {
  seed = mapSeed;
  const spec = THEMES[theme];
  const W = 40;
  const H = 30;
  const ground = new Array<number>(W * H).fill(0);
  const decor = new Array<number>(W * H).fill(0);
  const collision = new Array<number>(W * H).fill(0);
  const props: { prop: number; tx: number; ty: number }[] = [];
  const gid = (id: number) => id + 1;
  const idx = (x: number, y: number) => y * W + x;
  const block = (x: number, y: number) => (collision[idx(x, y)] = gid(COLLISION));
  const isPath = new Set<number>();
  const isField = new Set<number>();

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tiles = spec.speck && rand() < spec.speck.chance ? spec.speck.tiles : spec.field;
      ground[idx(x, y)] = gid(pick(tiles));
      isField.add(idx(x, y));
    }
  }
  const path = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        ground[idx(x, y)] = gid(pick(spec.path));
        isPath.add(idx(x, y));
        isField.delete(idx(x, y));
      }
    }
  };
  // Route loop (2 tiles wide) and the path out to the town on the left edge.
  path(6, 6, 33, 7);
  path(6, 22, 33, 23);
  path(6, 6, 7, 23);
  path(32, 6, 33, 23);
  path(0, 14, 7, 15);

  const free = (x: number, y: number) =>
    !isPath.has(idx(x, y)) && !decor[idx(x, y)] && !collision[idx(x, y)];
  const hazardAt = (x: number, y: number) => {
    if (!free(x, y)) return;
    ground[idx(x, y)] =
      spec.hazard === 'lava'
        ? gid(LAVA[0]![(y % 2) * 2 + (x % 2)]!)
        : gid(WATER[0]![(y % 4) * 4 + (x % 4)]!);
    isField.delete(idx(x, y));
    block(x, y);
  };
  /** Hazards come in 2×2 pools: grass edges would cover a lone tile almost entirely. */
  const poolAt = (x: number, y: number) => {
    if (x + 1 >= W - 1 || y + 1 >= H - 1) return;
    if (!free(x, y) || !free(x + 1, y) || !free(x, y + 1) || !free(x + 1, y + 1)) return;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) hazardAt(x + i, y + j);
  };
  const blockWith = (x: number, y: number, tiles: number[]) => {
    if (!free(x, y)) return;
    decor[idx(x, y)] = gid(pick(tiles));
    block(x, y);
  };
  /** A 64 px prop standing on tile (x, y); its top-left part hangs over the tiles behind. */
  const propAt = (x: number, y: number, list: number[]) => {
    if (!free(x, y)) return;
    props.push({ prop: pick(list), tx: x, ty: y });
    block(x, y);
  };

  // The map edge: dense trees or rocks, open only where the path leaves for town.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x !== 0 && y !== 0 && x !== W - 1 && y !== H - 1) continue;
      if (!isPath.has(idx(x, y))) {
        if (rand() < 0.7) propAt(x, y, spec.edgeProps);
        else blockWith(x, y, spec.outerBlocks);
      }
      block(x, y);
    }
  }
  if (spec.pond) {
    for (let y = 25; y <= 27; y++) for (let x = 34; x <= 37; x++) hazardAt(x, y);
  }
  // Obstacles in the middle of the loop (the spawn strips next to the path stay clear).
  for (let y = 12; y <= 18; y += 3) {
    for (let x = 12; x <= 27; x += 3) {
      if (rand() >= 0.85) continue;
      switch (spec.inner) {
        case 'graves':
          blockWith(x, y, DECOR.graves);
          if (rand() < 0.5) blockWith(x + 1, y, DECOR.graves);
          break;
        case 'trees':
          propAt(x, y, PROPS.greenTrees);
          if (rand() < 0.5) propAt(x + 1, y, PROPS.greenTrees);
          break;
        case 'rocks':
          propAt(x, y, PROPS.rocks);
          if (rand() < 0.5) blockWith(x + 1, y, DECOR.boulders);
          break;
        case 'ruins':
          for (let k = 0; k < 2; k++) {
            blockWith(x + k, y, rand() < 0.3 ? DECOR.graves : DECOR.boulders);
          }
          if (spec.pond && rand() < 0.5) poolAt(x, y + 1);
          break;
        case 'hazard':
          poolAt(x, y);
          break;
      }
    }
  }
  // Outside the loop: props, blocking objects and hazards by theme; litter anywhere free.
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!free(x, y)) continue;
      const outsideLoop = x < 5 || x > 34 || y < 5 || y > 24;
      const nearExit = y >= 12 && y <= 17 && x <= 5;
      const r = rand();
      if (outsideLoop && !nearExit && r < spec.outerPropChance) {
        propAt(x, y, spec.outerProps);
      } else if (outsideLoop && !nearExit && r < spec.outerPropChance + spec.outerBlockChance) {
        blockWith(x, y, spec.outerBlocks);
      } else if (
        outsideLoop &&
        !nearExit &&
        r < spec.outerPropChance + spec.outerBlockChance + spec.outerHazard
      ) {
        poolAt(x, y);
      } else {
        for (const l of spec.litter) {
          if (rand() < l.chance) {
            decor[idx(x, y)] = gid(pick(l.tiles));
            break;
          }
        }
      }
    }
  }

  // Grass edges: on every tile outside the field, the pieces for its field neighbours. Two
  // sides that meet take one large inner corner; a lone diagonal neighbour, a small corner.
  const borderLayers: number[][] = [];
  if (spec.border) {
    const b = spec.border;
    const field = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < W && y < H && isField.has(idx(x, y));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (field(x, y)) continue;
        const n = field(x, y - 1);
        const e = field(x + 1, y);
        const s = field(x, y + 1);
        const w = field(x - 1, y);
        const pieces: number[] = [];
        // On water the large inner corners would cover a small pool: straight edges only.
        const diag = !collision[idx(x, y)];
        if (diag && n && w) pieces.push(b.diagNW);
        if (diag && n && e) pieces.push(b.diagNE);
        if (diag && s && w) pieces.push(b.diagSW);
        if (diag && s && e) pieces.push(b.diagSE);
        if (n && (!diag || (!w && !e))) pieces.push(b.n);
        if (s && (!diag || (!w && !e))) pieces.push(b.s);
        if (w && (!diag || (!n && !s))) pieces.push(b.w);
        if (e && (!diag || (!n && !s))) pieces.push(b.e);
        if (!n && !w && field(x - 1, y - 1)) pieces.push(b.cornerNW);
        if (!n && !e && field(x + 1, y - 1)) pieces.push(b.cornerNE);
        if (!s && !w && field(x - 1, y + 1)) pieces.push(b.cornerSW);
        if (!s && !e && field(x + 1, y + 1)) pieces.push(b.cornerSE);
        pieces.forEach((piece, k) => {
          borderLayers[k] ??= new Array<number>(W * H).fill(0);
          borderLayers[k]![idx(x, y)] = gid(piece);
        });
      }
    }
  }

  let nextId = 1;
  const point = (name: string, type: string, tx: number, ty: number): MapObject => ({
    id: nextId++,
    name,
    type,
    x: tx * T + T / 2,
    y: ty * T + T / 2,
    width: 0,
    height: 0,
    point: true,
    rotation: 0,
    visible: true,
  });
  const area = (name: string, tx: number, ty: number, tw: number, th: number): MapObject => ({
    id: nextId++,
    name,
    type: 'spawn',
    x: tx * T,
    y: ty * T,
    width: tw * T,
    height: th * T,
    rotation: 0,
    visible: true,
  });
  const route = [
    [7, 7],
    [20, 7],
    [32, 7],
    [32, 15],
    [32, 22],
    [20, 22],
    [7, 22],
    [7, 15],
  ].map(([tx, ty], i) => point(`wp_${i + 1}`, 'waypoint', tx!, ty!));
  const spawns = [
    area('north', 9, 8, 22, 2),
    area('east', 29, 10, 2, 11),
    area('south', 9, 20, 22, 2),
    area('west', 9, 10, 2, 11),
  ];
  const exit = point('town_exit', 'town_exit', 1, 14);
  const propsFirstGid = 1 + TILESET_COLS * TILESET_ROWS;
  // Tile objects are anchored at their bottom-left corner (Tiled's convention).
  const propObjects = props.map((p): MapObject => ({
    id: nextId++,
    name: '',
    type: 'prop',
    gid: propsFirstGid + p.prop,
    x: (p.tx - 1) * T,
    y: (p.ty + 1) * T,
    width: 2 * T,
    height: 2 * T,
    rotation: 0,
    visible: true,
  }));

  let layerId = 1;
  const tileLayer = (name: string, data: number[], visible = true) => ({
    id: layerId++,
    name,
    type: 'tilelayer',
    width: W,
    height: H,
    x: 0,
    y: 0,
    opacity: 1,
    visible,
    data,
  });
  const objectLayer = (name: string, objects: MapObject[]) => ({
    id: layerId++,
    name,
    type: 'objectgroup',
    draworder: 'index',
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    objects,
  });
  const layers = [
    tileLayer('ground', ground),
    ...borderLayers.map((data, k) => tileLayer(`border${k + 1}`, data)),
    tileLayer('decor', decor),
    tileLayer('collision', collision, false),
    objectLayer('props', propObjects),
    objectLayer('route', route),
    objectLayer('spawns', spawns),
    objectLayer('town_exit', [exit]),
  ];
  return {
    compressionlevel: -1,
    width: W,
    height: H,
    infinite: false,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.11.2',
    version: '1.10',
    type: 'map',
    tilewidth: T,
    tileheight: T,
    nextlayerid: layerId,
    nextobjectid: nextId,
    layers,
    tilesets: [
      {
        firstgid: 1,
        name: 'tiles',
        image: '../sprites/tiles.png',
        imagewidth: TILESET_COLS * T,
        imageheight: TILESET_ROWS * T,
        columns: TILESET_COLS,
        tilecount: TILESET_COLS * TILESET_ROWS,
        tilewidth: T,
        tileheight: T,
        margin: 0,
        spacing: 0,
        tiles: [
          ...WATER[0]!.map((id, c) => ({
            id,
            animation: WATER.map((frame) => ({ tileid: frame[c]!, duration: WATER_FRAME_MS })),
          })),
          ...LAVA[0]!.map((id, c) => ({
            id,
            animation: LAVA.map((frame) => ({ tileid: frame[c]!, duration: LAVA_FRAME_MS })),
          })),
        ],
      },
      {
        firstgid: propsFirstGid,
        name: 'props',
        image: '../sprites/props.png',
        imagewidth: PROPS_COLS * 2 * T,
        imageheight: PROPS_ROWS * 2 * T,
        columns: PROPS_COLS,
        tilecount: PROPS_COLS * PROPS_ROWS,
        tilewidth: 2 * T,
        tileheight: 2 * T,
        margin: 0,
        spacing: 0,
      },
    ],
  };
}

/** Every hunt map: id, theme and seed (the seed keeps each map stable between runs). */
const MAPS: [string, Theme, number][] = [
  ['forgotten_cemetery', 'cemetery', 0x2545f491],
  ['pale_woods', 'woods', 0x1b873593],
  ['cracked_crypt', 'crypt', 0x85ebca6b],
  ['murky_bog', 'swamp', 0xc2b2ae35],
  ['drowned_village', 'village', 0x27d4eb2f],
  ['rotting_heart', 'swamp', 0x165667b1],
  ['ash_gates', 'ash', 0xd3a2646c],
  ['molten_halls', 'molten', 0xfd7046c5],
  ['burning_throne', 'ash', 0xb55a4f09],
];

const root = new URL('../../../assets/', import.meta.url);
mkdirSync(new URL('sprites/', root), { recursive: true });
mkdirSync(new URL('maps/', root), { recursive: true });
writeFileSync(new URL('sprites/placeholder_tiles.png', root), drawTileset().toPng());
for (const [id, theme, mapSeed] of MAPS) {
  writeFileSync(
    new URL(`maps/${id}.tmj`, root),
    JSON.stringify(buildHuntMap(theme, mapSeed)) + '\n',
  );
}
console.log(`wrote the tileset and ${MAPS.length} maps`);
