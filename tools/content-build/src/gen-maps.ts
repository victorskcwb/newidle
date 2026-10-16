/**
 * Generates the placeholder tileset and the test map of the Forgotten Cemetery as a regular
 * Tiled map (.tmj), so it can be opened and edited in Tiled afterwards. Deterministic:
 * running it again produces the same files.
 *
 *   pnpm maps:gen
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Image } from './png.ts';

type Rgba = readonly [number, number, number, number];
const T = 32;
const COLS = 8;
const ROWS = 2;

/** Tile ids inside the tileset (Tiled gid = id + 1). */
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
} as const;

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
  rotation: number;
  visible: boolean;
}

function buildCemetery() {
  const W = 40;
  const H = 30;
  const ground = new Array<number>(W * H).fill(0);
  const decor = new Array<number>(W * H).fill(0);
  const collision = new Array<number>(W * H).fill(0);
  const gid = (id: number) => id + 1;
  const idx = (x: number, y: number) => y * W + x;
  const block = (x: number, y: number) => (collision[idx(x, y)] = gid(TILE.collision));
  const isPath = new Set<number>();

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) ground[idx(x, y)] = gid(rand() < 0.25 ? TILE.grass2 : TILE.grass);
  }
  const path = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        ground[idx(x, y)] = gid(TILE.path);
        isPath.add(idx(x, y));
      }
    }
  };
  // Route loop (2 tiles wide) and the path to the town gate.
  path(6, 6, 33, 7);
  path(6, 22, 33, 23);
  path(6, 6, 7, 23);
  path(32, 6, 33, 23);
  path(1, 14, 7, 15);

  // Border wall with the gate on the left.
  for (let x = 0; x < W; x++) {
    for (const y of [0, H - 1]) {
      decor[idx(x, y)] = gid(TILE.wall);
      block(x, y);
    }
  }
  for (let y = 0; y < H; y++) {
    for (const x of [0, W - 1]) {
      decor[idx(x, y)] = gid(y === 14 || y === 15 ? (x === 0 ? TILE.gate : TILE.wall) : TILE.wall);
      block(x, y);
    }
  }
  // Pond.
  for (let y = 25; y <= 27; y++) {
    for (let x = 34; x <= 37; x++) {
      ground[idx(x, y)] = gid(TILE.water1);
      block(x, y);
    }
  }
  // Graves in rows in the middle of the loop.
  for (let y = 12; y <= 18; y += 3) {
    for (let x = 12; x <= 27; x += 3) {
      if (rand() < 0.85) {
        decor[idx(x, y)] = gid(TILE.grave);
        block(x, y);
      }
    }
  }
  // Dead trees outside the loop, bones and mushrooms anywhere free.
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = idx(x, y);
      if (isPath.has(i) || decor[i] || collision[i]) continue;
      const outsideLoop = x < 5 || x > 34 || y < 5 || y > 24;
      const nearExit = y >= 12 && y <= 17 && x <= 5;
      if (outsideLoop && !nearExit && rand() < 0.22) {
        decor[i] = gid(TILE.tree);
        block(x, y);
      } else if (rand() < 0.03) {
        decor[i] = gid(TILE.bones);
      } else if (rand() < 0.02) {
        decor[i] = gid(TILE.mushrooms);
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

  const tileLayer = (id: number, name: string, data: number[], visible = true) => ({
    id,
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
  const objectLayer = (id: number, name: string, objects: MapObject[]) => ({
    id,
    name,
    type: 'objectgroup',
    draworder: 'index',
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    objects,
  });
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
    nextlayerid: 7,
    nextobjectid: nextId,
    layers: [
      tileLayer(1, 'ground', ground),
      tileLayer(2, 'decor', decor),
      tileLayer(3, 'collision', collision, false),
      objectLayer(4, 'route', route),
      objectLayer(5, 'spawns', spawns),
      objectLayer(6, 'town_exit', [exit]),
    ],
    tilesets: [
      {
        firstgid: 1,
        name: 'placeholder_tiles',
        image: '../sprites/placeholder_tiles.png',
        imagewidth: COLS * T,
        imageheight: ROWS * T,
        columns: COLS,
        tilecount: COLS * ROWS,
        tilewidth: T,
        tileheight: T,
        margin: 0,
        spacing: 0,
        tiles: [
          {
            id: TILE.water1,
            animation: [
              { tileid: TILE.water1, duration: 600 },
              { tileid: TILE.water2, duration: 600 },
            ],
          },
        ],
      },
    ],
  };
}

const root = new URL('../../../assets/', import.meta.url);
mkdirSync(new URL('sprites/', root), { recursive: true });
mkdirSync(new URL('maps/', root), { recursive: true });
writeFileSync(new URL('sprites/placeholder_tiles.png', root), drawTileset().toPng());
writeFileSync(new URL('maps/forgotten_cemetery.tmj', root), JSON.stringify(buildCemetery()) + '\n');
console.log('wrote assets/sprites/placeholder_tiles.png and assets/maps/forgotten_cemetery.tmj');
