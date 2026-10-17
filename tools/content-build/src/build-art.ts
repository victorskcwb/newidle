/**
 * Builds the map art from the layout in tileset.ts:
 *   assets/sprites/tiles.png  32 px ground, borders, water and small decor
 *   assets/sprites/props.png  64 px trees and rocks, drawn above the actors
 * Sources: the OpenTibia Sprite Pack (CC BY 4.0; magenta is its transparent colour), our
 * placeholder collision marker, and gravestones, bones and lava drawn here.
 *
 *   pnpm art   (after pnpm maps:gen, which writes the placeholder tiles)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { buildActors, buildFx } from './actors.ts';
import { buildUiIcons } from './ui-icons.ts';
import {
  LAVA_FRAMES,
  PROPS_COLS,
  PROPS_ROWS,
  propSlots,
  slots,
  TILESET_COLS,
  TILESET_ROWS,
  type Drawn,
  type Sheet,
} from './tileset.ts';

const assets = new URL('../../../assets/', import.meta.url);
const read = (rel: string) => PNG.sync.read(readFileSync(new URL(rel, assets)));

const T = 32;
const sheets: Record<Exclude<Sheet, 'drawn'>, PNG> = {
  otsp_tiles: read('vendor/opentibia-sprite-pack/otsp_tiles_01.png'),
  otsp_nature: read('vendor/opentibia-sprite-pack/otsp_nature_01.png'),
  placeholder: read('sprites/placeholder_tiles.png'),
};
const PLACEHOLDER_COLS = 8;

const isMagenta = (png: PNG, i: number) =>
  png.data[i]! > 240 && png.data[i + 1]! < 20 && png.data[i + 2]! > 240;

/** Copies a w×h pixel block, magenta and transparent pixels left out. */
function blit(
  src: PNG,
  sx: number,
  sy: number,
  dst: PNG,
  dx: number,
  dy: number,
  w: number,
  h: number,
) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((sy + y) * src.width + sx + x) * 4;
      if (src.data[si + 3] === 0 || isMagenta(src, si)) continue;
      const di = ((dy + y) * dst.width + dx + x) * 4;
      for (let c = 0; c < 4; c++) dst.data[di + c] = src.data[si + c]!;
    }
  }
}

type Rgb = readonly [number, number, number];
const hex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/**
 * A 32×32 drawing of our own: shapes are painted on a grid, then every empty pixel next to a
 * painted one becomes the outline, the way the pack's objects are drawn.
 */
class Sketch {
  readonly px: (Rgb | null)[] = new Array<Rgb | null>(T * T).fill(null);
  set(x: number, y: number, c: Rgb) {
    if (x >= 0 && y >= 0 && x < T && y < T) this.px[y * T + x] = c;
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < T && y < T ? this.px[y * T + x] : null;
  }
  rect(x: number, y: number, w: number, h: number, c: Rgb) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Rgb) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, c);
      }
    }
  }
  outline(c: Rgb) {
    const add: [number, number][] = [];
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) {
          add.push([x, y]);
        }
      }
    }
    for (const [x, y] of add) this.set(x, y, c);
  }
  drawTo(dst: PNG, dx: number, dy: number) {
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const c = this.get(x, y);
        if (!c) continue;
        const di = ((dy + y) * dst.width + dx + x) * 4;
        dst.data[di] = c[0];
        dst.data[di + 1] = c[1];
        dst.data[di + 2] = c[2];
        dst.data[di + 3] = 255;
      }
    }
  }
}

const OUTLINE = hex('#14121a');
const STONE = {
  light: hex('#a9a7b2'),
  mid: hex('#86848f'),
  dark: hex('#5d5b67'),
  deep: hex('#3e3c47'),
};
const MOSS = [hex('#4f6b2c'), hex('#3e5624')];
const BONE = { light: hex('#e8e2cf'), mid: hex('#c4bca5'), dark: hex('#8f8770') };

/** Light from the top left, as in the pack: lighter left edge, darker right edge. */
function shadeStone(s: Sketch, x0: number, x1: number) {
  for (let y = 0; y < T; y++) {
    for (let x = x0; x <= x1; x++) {
      if (s.get(x, y) !== STONE.mid) continue;
      if (!s.get(x - 1, y) || !s.get(x, y - 1)) s.set(x, y, STONE.light);
      else if (!s.get(x + 1, y) || !s.get(x + 2, y)) s.set(x, y, STONE.dark);
    }
  }
}

function drawGrave(cross: boolean): Sketch {
  const s = new Sketch();
  // Base slab and headstone with a rounded top, leaning nowhere: old but standing.
  s.rect(7, 24, 19, 5, STONE.mid);
  if (cross) {
    s.rect(14, 5, 5, 20, STONE.mid);
    s.rect(9, 10, 15, 5, STONE.mid);
  } else {
    s.rect(10, 11, 13, 14, STONE.mid);
    s.ellipse(16, 11, 6.5, 6, STONE.mid);
  }
  shadeStone(s, 0, T - 1);
  if (!cross) {
    // Engraved cross and a crack.
    s.rect(15, 11, 2, 9, STONE.deep);
    s.rect(13, 13, 6, 2, STONE.deep);
    s.set(20, 17, STONE.deep);
    s.set(19, 18, STONE.deep);
    s.set(20, 19, STONE.deep);
  }
  s.rect(7, 27, 19, 2, STONE.dark);
  // Moss at the foot.
  for (const [x, y, k] of [
    [8, 26, 0],
    [9, 26, 1],
    [10, 25, 0],
    [22, 26, 1],
    [23, 26, 0],
    [24, 25, 1],
    [12, 24, 1],
  ] as const) {
    s.set(x, y, MOSS[k]!);
  }
  s.outline(OUTLINE);
  return s;
}

function drawBones(skull: boolean): Sketch {
  const s = new Sketch();
  const bone = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= steps; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / steps);
      const y = Math.round(y0 + ((y1 - y0) * k) / steps);
      s.rect(x, y, 2, 2, BONE.mid);
    }
    for (const [x, y] of [
      [x0, y0],
      [x1, y1],
    ] as const) {
      s.rect(x - 1, y - 1, 2, 2, BONE.light);
      s.rect(x + 1, y + 1, 2, 2, BONE.light);
    }
  };
  if (skull) {
    s.ellipse(16, 15, 6, 5.5, BONE.light);
    s.rect(12, 19, 8, 4, BONE.mid);
    s.rect(12, 14, 3, 3, OUTLINE);
    s.rect(17, 14, 3, 3, OUTLINE);
    s.set(16, 18, OUTLINE);
    s.rect(13, 22, 1, 1, BONE.dark);
    s.rect(15, 22, 1, 1, BONE.dark);
    s.rect(17, 22, 1, 1, BONE.dark);
    bone(6, 26, 13, 24);
  } else {
    bone(7, 21, 23, 13);
    bone(9, 12, 22, 23);
    bone(18, 26, 26, 25);
  }
  s.outline(OUTLINE);
  return s;
}

/**
 * Lava, seamless from tile to tile: every wave repeats each 64 pixels, and the frames shift
 * the phase so the crust drifts.
 */
function drawLava(index: number): Sketch {
  const s = new Sketch();
  const crust = hex('#2a0d08');
  const palette: [number, Rgb][] = [
    [-1.1, crust],
    [-0.2, hex('#6e1a0c')],
    [0.6, hex('#b8380f')],
    [1.3, hex('#e8701c')],
    [Infinity, hex('#ffc04a')],
  ];
  const phase = Math.floor(index / 4) / LAVA_FRAMES;
  // Each tile is one cell of a 64 px pattern.
  const ox = (index % 2) * T;
  const oy = Math.floor((index % 4) / 2) * T;
  const wave = (v: number) => Math.sin(2 * Math.PI * v);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const u = (x + ox) / (2 * T);
      const w = (y + oy) / (2 * T);
      const v =
        wave(u * 2 + phase) +
        wave(w * 2 + u + phase * 2) * 0.9 +
        wave((u - w) * 3 - phase) * 0.5 +
        wave(u * 5 + w * 4) * 0.25;
      s.set(x, y, palette.find(([limit]) => v < limit)![1]);
    }
  }
  return s;
}

const DRAWN: Record<Drawn, (frame: number) => Sketch> = {
  grave: () => drawGrave(false),
  grave_cross: () => drawGrave(true),
  bones: () => drawBones(false),
  skull: () => drawBones(true),
  lava: drawLava,
};

const tiles = new PNG({ width: TILESET_COLS * T, height: TILESET_ROWS * T });
slots.forEach((slot, id) => {
  const dx = (id % TILESET_COLS) * T;
  const dy = Math.floor(id / TILESET_COLS) * T;
  if (slot.sheet === 'drawn') {
    DRAWN[slot.drawn!](slot.index).drawTo(tiles, dx, dy);
    return;
  }
  const cols = slot.sheet === 'placeholder' ? PLACEHOLDER_COLS : 16;
  const src = sheets[slot.sheet];
  blit(src, (slot.index % cols) * T, Math.floor(slot.index / cols) * T, tiles, dx, dy, T, T);
});

const P = 2 * T;
const props = new PNG({ width: PROPS_COLS * P, height: PROPS_ROWS * P });
propSlots.forEach((index, id) => {
  const sx = (index % 16) * T;
  const sy = Math.floor(index / 16) * T;
  blit(
    sheets.otsp_nature,
    sx,
    sy,
    props,
    (id % PROPS_COLS) * P,
    Math.floor(id / PROPS_COLS) * P,
    P,
    P,
  );
});

writeFileSync(new URL('sprites/tiles.png', assets), PNG.sync.write(tiles));
const actorFrames = buildActors(assets);
const fxCount = buildFx(assets);
const iconCount = buildUiIcons(
  assets,
  new URL('../../../apps/client/src/ui/icons.generated.ts', import.meta.url),
);
console.log(`wrote ${iconCount} interface icons`);
console.log(`wrote assets/sprites/actors.png (${actorFrames} frames) and fx.png (${fxCount})`);
writeFileSync(new URL('sprites/props.png', assets), PNG.sync.write(props));
console.log(
  `wrote assets/sprites/tiles.png (${slots.length} tiles) and props.png (${propSlots.length} props)`,
);
