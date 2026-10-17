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
import { buildHuntMap, type Theme } from './gen-hunt.ts';
import { TOWN_REGIONS, buildTownMap } from './gen-town.ts';

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
TOWN_REGIONS.forEach((region, i) => {
  writeFileSync(
    new URL(`maps/town_${region}.tmj`, root),
    JSON.stringify(buildTownMap(region, 0x9e3779b9 + i * 7919)) + '\n',
  );
});
console.log(
  `wrote the placeholder tiles, ${MAPS.length} hunt maps and ${TOWN_REGIONS.length} towns`,
);
