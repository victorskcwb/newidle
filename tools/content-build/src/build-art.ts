/**
 * Builds the game's tileset (assets/sprites/tiles.png, 32×32 tiles) from the CC0 Kenney packs
 * in assets/vendor, keeping the tile ids of the generated placeholder tileset so every map
 * stays valid. Tiles the packs do not have (water, mud, lava, bones, the collision marker)
 * come from the placeholder tileset, reduced to the same 16-pixel density.
 *
 *   pnpm art   (after pnpm maps:gen)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { TILE } from './gen-maps-tiles.ts';

const assets = new URL('../../../assets/', import.meta.url);
const read = (rel: string) => PNG.sync.read(readFileSync(new URL(rel, assets)));

const dungeon = read('vendor/kenney-tiny-dungeon/tilemap_packed.png');
const town = read('vendor/kenney-tiny-town/tilemap_packed.png');
const placeholder = read('sprites/placeholder_tiles.png');

const OUT = 32;
const COLS = 8;
const ROWS = 3;
const out = new PNG({ width: COLS * OUT, height: ROWS * OUT });

type Source = { sheet: PNG; index: number; size: number };
const kenney = (sheet: PNG, index: number): Source => ({ sheet, index, size: 16 });

/** Copies a source tile into a 32×32 slot, scaled with nearest neighbour, alpha-blended. */
function draw(slot: number, src: Source, pixelate = false) {
  const cols = src.sheet.width / src.size;
  const sx0 = (src.index % cols) * src.size;
  const sy0 = Math.floor(src.index / cols) * src.size;
  const dx0 = (slot % COLS) * OUT;
  const dy0 = Math.floor(slot / COLS) * OUT;
  // Pixelate: sample the 32 px placeholder at 16 px so its detail matches the packs.
  const step = pixelate ? 2 : 1;
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      const sx = sx0 + Math.floor((Math.floor(x / step) * step * src.size) / OUT);
      const sy = sy0 + Math.floor((Math.floor(y / step) * step * src.size) / OUT);
      const si = (sy * src.sheet.width + sx) * 4;
      const di = ((dy0 + y) * out.width + dx0 + x) * 4;
      const a = src.sheet.data[si + 3]! / 255;
      if (a === 0) continue;
      for (let c = 0; c < 3; c++) {
        out.data[di + c] = Math.round(src.sheet.data[si + c]! * a + out.data[di + c]! * (1 - a));
      }
      out.data[di + 3] = Math.max(out.data[di + 3]!, src.sheet.data[si + 3]!);
    }
  }
}

type Rgb = readonly [number, number, number];

/** Sets one pixel of a 16 px grid inside a 32 px slot (a 2×2 block). */
function pixel16(slot: number, x: number, y: number, rgb: Rgb) {
  const dx0 = (slot % COLS) * OUT + x * 2;
  const dy0 = Math.floor(slot / COLS) * OUT + y * 2;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const di = ((dy0 + j) * out.width + dx0 + i) * 4;
      out.data[di] = rgb[0];
      out.data[di + 1] = rgb[1];
      out.data[di + 2] = rgb[2];
      out.data[di + 3] = 255;
    }
  }
}

const own = (index: number): Source => ({ sheet: placeholder, index, size: 32 });
const grass = kenney(town, 0);

// Ground
draw(TILE.grass, grass);
draw(TILE.grass2, kenney(town, 1));
draw(TILE.path, kenney(town, 25));
draw(TILE.stone, kenney(town, 109));
draw(TILE.mud, own(TILE.mud), true);
draw(TILE.ash, kenney(dungeon, 0));
draw(TILE.ash2, kenney(dungeon, 12));
// Walls and gate
draw(TILE.wall, kenney(town, 126));
draw(TILE.gate, kenney(town, 126));
draw(TILE.gate, kenney(dungeon, 46));
// Objects on the decor layer: transparent background, the ground layer shows through.
draw(TILE.grave, kenney(dungeon, 65));
draw(TILE.tree, kenney(town, 16));
draw(TILE.mushrooms, kenney(town, 29));
// Our own tiles (no equivalent in the packs)
for (const slot of [TILE.water1, TILE.water2, TILE.lava1, TILE.lava2]) {
  draw(slot, own(slot), true);
}
// Bones (decor layer, transparent background), drawn at 16 px with the pack's outline colour.
{
  const outline: Rgb = [63, 38, 49];
  const bone: Rgb = [232, 226, 208];
  const shade: Rgb = [176, 168, 150];
  // A long bone with knobs at both ends, and a small skull.
  for (let x = 3; x <= 9; x++) pixel16(TILE.bones, x, 10, bone);
  for (let x = 3; x <= 9; x++) pixel16(TILE.bones, x, 11, outline);
  for (const x of [2, 10]) {
    pixel16(TILE.bones, x, 9, bone);
    pixel16(TILE.bones, x, 11, bone);
    pixel16(TILE.bones, x, 12, outline);
  }
  for (let y = 3; y <= 6; y++) for (let x = 10; x <= 13; x++) pixel16(TILE.bones, x, y, bone);
  for (let x = 10; x <= 13; x++) pixel16(TILE.bones, x, 7, outline);
  pixel16(TILE.bones, 11, 5, outline);
  pixel16(TILE.bones, 12, 5, outline);
  pixel16(TILE.bones, 13, 6, shade);
}
draw(TILE.collision, own(TILE.collision));

writeFileSync(new URL('sprites/tiles.png', assets), PNG.sync.write(out));
console.log('wrote assets/sprites/tiles.png from the Kenney packs and our own tiles');
