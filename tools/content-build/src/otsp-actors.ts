/**
 * Characters from the OpenTibia Sprite Pack's client files (otsp.dat/otsp.spr, CC BY 4.0,
 * Tibia 10.41 format: extended sprite ids, no alpha): the hero, the town folk and every
 * monster walk in four directions with their own frames, at the map's native 32 px scale.
 *
 * Writes assets/sprites/creatures.png (64 px cells; each look cropped to the union of its
 * frames, centred, feet on the bottom) and the frame numbers into the sprite manifest.
 * Outfits with a colour mask (players) are coloured here, Tibia style: the mask's yellow,
 * red, green and blue mark head, body, legs and feet, which multiply the chosen colours.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const CELL = 64;
const COLS = 16;
const DIRS = ['up', 'right', 'down', 'left'] as const;
type Dir = (typeof DIRS)[number];

interface Thing {
  w: number;
  h: number;
  layers: number;
  px: number;
  py: number;
  pz: number;
  frames: number;
  sprites: number[];
}

class Reader {
  p = 0;
  constructor(readonly b: Buffer) {}
  u8() {
    return this.b[this.p++]!;
  }
  u16() {
    const v = this.b.readUInt16LE(this.p);
    this.p += 2;
    return v;
  }
  u32() {
    const v = this.b.readUInt32LE(this.p);
    this.p += 4;
    return v;
  }
}

/** Skips an object's attribute flags (10.10+ layout) up to the 0xFF end marker. */
function skipAttributes(r: Reader) {
  for (;;) {
    const f = r.u8();
    if (f === 0xff) return;
    if ([0, 8, 9, 26, 29, 30, 33, 35].includes(f)) r.u16();
    else if (f === 22 || f === 25) {
      r.u16();
      r.u16();
    } else if (f === 34) {
      r.u16();
      r.u16();
      r.u16();
      r.p += r.u16();
      r.u16();
      r.u16();
    } else if (f > 38 && f !== 254) throw new Error(`otsp.dat: unknown flag ${f} at ${r.p}`);
  }
}

function readThing(r: Reader): Thing {
  skipAttributes(r);
  const w = r.u8();
  const h = r.u8();
  if (w > 1 || h > 1) r.u8();
  const [layers, px, py, pz, frames] = [r.u8(), r.u8(), r.u8(), r.u8(), r.u8()];
  const sprites = Array.from({ length: w * h * layers * px * py * pz * frames }, () => r.u32());
  return { w, h, layers, px, py, pz, frames, sprites };
}

/** Outfits of otsp.dat by look type (items come first and are skipped). */
function readOutfits(dat: Buffer): Map<number, Thing> {
  const r = new Reader(dat);
  r.u32();
  const items = r.u16();
  const outfits = r.u16();
  r.u16();
  r.u16();
  for (let i = 100; i <= items; i++) readThing(r);
  const out = new Map<number, Thing>();
  for (let i = 1; i <= outfits; i++) out.set(i, readThing(r));
  return out;
}

type Rgba = Uint8ClampedArray;

/** One 32×32 sprite of otsp.spr as RGBA (run-length: transparent count, coloured count). */
function readSprite(spr: Buffer, id: number): Rgba {
  const px = new Uint8ClampedArray(32 * 32 * 4);
  const count = spr.readUInt32LE(4);
  if (id === 0 || id > count) return px;
  const off = spr.readUInt32LE(8 + (id - 1) * 4);
  if (off === 0) return px;
  let p = off + 3;
  const end = p + 2 + spr.readUInt16LE(p);
  p += 2;
  let i = 0;
  while (p < end) {
    i += spr.readUInt16LE(p);
    const coloured = spr.readUInt16LE(p + 2);
    p += 4;
    for (let k = 0; k < coloured; k++, i++, p += 3) {
      px[i * 4] = spr[p]!;
      px[i * 4 + 1] = spr[p + 1]!;
      px[i * 4 + 2] = spr[p + 2]!;
      px[i * 4 + 3] = 255;
    }
  }
  return px;
}

/** A frame of an outfit in a direction, composed from its w×h sprites (64×64 canvas). */
function composeFrame(spr: Buffer, t: Thing, frame: number, dir: number, layer: number): Rgba {
  const img = new Uint8ClampedArray(CELL * CELL * 4);
  for (let hh = 0; hh < t.h; hh++) {
    for (let ww = 0; ww < t.w; ww++) {
      const index =
        ((((frame * t.pz + 0) * t.py + 0) * t.px + dir) * t.layers + layer) * t.h * t.w +
        hh * t.w +
        ww;
      const s = readSprite(spr, t.sprites[index]!);
      // Tibia draws from the bottom right: sprite (0,0) is the bottom-right 32 px square.
      const ox = CELL - 32 * (ww + 1);
      const oy = CELL - 32 * (hh + 1);
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const si = (y * 32 + x) * 4;
          if (s[si + 3] === 0) continue;
          const di = ((oy + y) * CELL + ox + x) * 4;
          for (let c = 0; c < 4; c++) img[di + c] = s[si + c]!;
        }
      }
    }
  }
  return img;
}

type Rgb = readonly [number, number, number];
/** Colours of a player outfit: head, body, legs, feet. */
type Colors = readonly [Rgb, Rgb, Rgb, Rgb];

/** Multiplies the outfit by the colours where its mask is yellow, red, green or blue. */
function colorize(base: Rgba, mask: Rgba, colors: Colors) {
  for (let i = 0; i < base.length; i += 4) {
    if (mask[i + 3] === 0) continue;
    const [r, g, b] = [mask[i]!, mask[i + 1]!, mask[i + 2]!];
    const part =
      r > 200 && g > 200 && b < 60
        ? 0
        : r > 200 && g < 60 && b < 60
          ? 1
          : r < 60 && g > 200 && b < 60
            ? 2
            : r < 60 && g < 60 && b > 200
              ? 3
              : -1;
    if (part < 0) continue;
    const c = colors[part as 0 | 1 | 2 | 3];
    for (let k = 0; k < 3; k++) base[i + k] = (base[i + k]! * c[k]!) / 255;
  }
}

interface Look {
  /** Look type in otsp.dat. */
  outfit: number;
  colors?: Colors;
  /** Creatures that hover (ghosts, insects) animate even when still. */
  hover?: boolean;
}

const hex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const paint = (head: string, body: string, legs: string, feet: string): Colors => [
  hex(head),
  hex(body),
  hex(legs),
  hex(feet),
];

/** The Huntress (hooded archer) and the Sorcerer (robed mage), in the same four looks. */
const HUNTRESS_LOOKS: Look[] = [
  { outfit: 26 },
  { outfit: 26, colors: paint('#e0c070', '#3c6a3a', '#4a3a2a', '#3a2a1a') },
  { outfit: 26, colors: paint('#c8ccd8', '#6a3a2a', '#3a3a48', '#2a2a30') },
  { outfit: 26, colors: paint('#f0d080', '#2a4a6a', '#5a4a3a', '#4a3a2a') },
];
const SORCERER_LOOKS: Look[] = [
  { outfit: 32 },
  { outfit: 32, colors: paint('#e0c070', '#5a3a8a', '#3a2a5a', '#2a1a3a') },
  { outfit: 32, colors: paint('#c8ccd8', '#8a2a2a', '#4a1a1a', '#2a1a1a') },
  { outfit: 32, colors: paint('#f0d080', '#2a5a8a', '#1a3a5a', '#1a2a3a') },
];

/** The hero's four looks at creation. */
const HERO_LOOKS: Look[] = [
  { outfit: 18, colors: paint('#c8ccd8', '#3f6fc8', '#5a4a3a', '#4a3a2a') },
  { outfit: 18, colors: paint('#e0c070', '#b8302a', '#3a3a48', '#3a2a20') },
  { outfit: 17, colors: paint('#f0d080', '#3c8a46', '#6a5030', '#4a3020') },
  { outfit: 19 },
];

/** Town folk by NPC id. */
const NPC_LOOKS: Record<string, Look> = {
  smith: { outfit: 19 },
  merchant: { outfit: 16, colors: paint('#c03030', '#e0b040', '#3a6a3a', '#5a3a20') },
  banker: { outfit: 17, colors: paint('#8a8a96', '#2a3a6a', '#2a2a30', '#2a2a30') },
  priestess: { outfit: 20 },
  elder: { outfit: 21 },
  guard: { outfit: 18, colors: paint('#9aa0aa', '#6a6a72', '#4a4a52', '#3a3a3a') },
  villager_a: { outfit: 44 },
  villager_b: { outfit: 26 },
};

/** Which creature draws each monster sprite key of the manifest. */
const MONSTER_LOOKS: Record<string, Look> = {
  bone_walker: { outfit: 22 },
  grave_rat: { outfit: 1 },
  gravekeeper: { outfit: 4 },
  grey_wolf: { outfit: 6 },
  pale_spider: { outfit: 13 },
  spider_matriarch: { outfit: 14, hover: true },
  skeleton_archer: { outfit: 23 },
  ghoul: { outfit: 7 },
  lord_vharok: { outfit: 10 },
  bog_toad: { outfit: 8 },
  leech_swarm: { outfit: 29 },
  mire_mother: { outfit: 25 },
  drowned_villager: { outfit: 45 },
  marsh_hag: { outfit: 34 },
  old_drowned: { outfit: 41, hover: true },
  rot_walker: { outfit: 37 },
  swamp_horror: { outfit: 30 },
  morvel_root: { outfit: 46 },
  ember_hound: { outfit: 11 },
  ash_soldier: { outfit: 3 },
  ashen_captain: { outfit: 39 },
  magma_golem: { outfit: 12 },
  flame_cultist: { outfit: 36 },
  ember_priestess: { outfit: 2 },
  cinder_knight: { outfit: 28, hover: true },
  inferno_wraith: { outfit: 43, hover: true },
  charred_king: { outfit: 15 },
  carrion_crow: { outfit: 9, hover: true },
  wailing_soul: { outfit: 5, hover: true },
  mire_worm: { outfit: 24 },
  drowned_lament: { outfit: 42, hover: true },
  rotting_druid: { outfit: 33 },
  ash_succubus: { outfit: 38 },
  ember_herald: { outfit: 35 },
  cinder_worm: { outfit: 31 },
};

interface DirFrames {
  idle: number[];
  run: number[];
}

export interface OtspFrameSet {
  idle: number[];
  run: number[];
  dirs: Record<Dir, DirFrames>;
  height: number;
}

export function buildOtspActors(assets: URL): { cells: number; looks: Record<string, unknown> } {
  const vendor = (f: string) => readFileSync(new URL(`vendor/opentibia-sprite-pack/${f}`, assets));
  const outfits = readOutfits(vendor('otsp.dat'));
  const spr = vendor('otsp.spr');
  const cells: Rgba[] = [];

  const lookFrames = (look: Look): OtspFrameSet => {
    const t = outfits.get(look.outfit);
    if (!t) throw new Error(`otsp.dat has no outfit ${look.outfit}`);
    // Every frame of every direction, coloured; then one crop box for all of them.
    const raw: Rgba[][] = [];
    for (let d = 0; d < 4; d++) {
      const dir = Math.min(d, t.px - 1);
      const row: Rgba[] = [];
      for (let f = 0; f < t.frames; f++) {
        const img = composeFrame(spr, t, f, dir, 0);
        if (look.colors && t.layers > 1)
          colorize(img, composeFrame(spr, t, f, dir, 1), look.colors);
        row.push(img);
      }
      raw.push(row);
    }
    let x0 = CELL;
    let x1 = -1;
    let y1 = -1;
    let top = CELL;
    for (const img of raw.flat()) {
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          if (img[(y * CELL + x) * 4 + 3] === 0) continue;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
          top = Math.min(top, y);
        }
      }
    }
    // Centre horizontally, feet on the bottom row.
    const dx = Math.round((CELL - (x1 - x0 + 1)) / 2) - x0;
    const dy = CELL - 1 - y1;
    const place = (img: Rgba) => {
      const out = new Uint8ClampedArray(CELL * CELL * 4);
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const si = (y * CELL + x) * 4;
          if (img[si + 3] === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= CELL || ny >= CELL) continue;
          out.set(img.subarray(si, si + 4), (ny * CELL + nx) * 4);
        }
      }
      cells.push(out);
      return cells.length - 1;
    };
    const dirs = {} as Record<Dir, DirFrames>;
    DIRS.forEach((name, d) => {
      const ids = raw[d]!.map(place);
      // Frame 0 is standing; the others are the walk (or the hover of flying creatures).
      const walk = ids.length > 1 ? ids.slice(1) : ids;
      dirs[name] = { idle: look.hover ? ids : [ids[0]!], run: walk };
    });
    return { idle: dirs.down.idle, run: dirs.down.run, dirs, height: y1 - top + 1 };
  };

  const looks: Record<string, unknown> = {
    hero: HERO_LOOKS.map(lookFrames),
    huntress: HUNTRESS_LOOKS.map(lookFrames),
    sorcerer: SORCERER_LOOKS.map(lookFrames),
    npcs: Object.fromEntries(Object.entries(NPC_LOOKS).map(([k, l]) => [k, lookFrames(l)])),
    monsters: Object.fromEntries(Object.entries(MONSTER_LOOKS).map(([k, l]) => [k, lookFrames(l)])),
  };

  // The hero's sword (0x72's pack, CC0) gets a cell of its own.
  const sheet0x72 = PNG.sync.read(
    readFileSync(new URL('vendor/0x72-dungeontileset-ii/sheet.png', assets)),
  );
  const sword = new Uint8ClampedArray(CELL * CELL * 4);
  const [sx, sy, sw, sh] = [339, 98, 10, 29];
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const si = ((sy + y) * sheet0x72.width + sx + x) * 4;
      if (sheet0x72.data[si + 3] === 0) continue;
      const di = ((CELL - sh + y) * CELL + (CELL - sw) / 2 + x) * 4;
      for (let c = 0; c < 4; c++) sword[di + c] = sheet0x72.data[si + c]!;
    }
  }
  cells.push(sword);
  const weapon = cells.length - 1;

  const rows = Math.ceil(cells.length / COLS);
  const png = new PNG({ width: COLS * CELL, height: rows * CELL });
  cells.forEach((img, i) => {
    const ox = (i % COLS) * CELL;
    const oy = Math.floor(i / COLS) * CELL;
    for (let y = 0; y < CELL; y++) {
      png.data.set(img.subarray(y * CELL * 4, (y + 1) * CELL * 4), ((oy + y) * png.width + ox) * 4);
    }
  });
  writeFileSync(new URL('sprites/creatures.png', assets), PNG.sync.write(png));

  // Frame numbers into the manifest: every atlas now points at creatures.png.
  const manifestUrl = new URL('sprites/manifest.json', assets);
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8')) as {
    atlases: Record<
      string,
      Record<string, unknown> & { sprites: Record<string, Record<string, unknown>> }
    >;
  };
  // One hero sprite per class, sharing the warrior's animation timings.
  const heroAtlas = manifest.atlases.hero!;
  for (const cls of ['huntress', 'sorcerer']) {
    heroAtlas.sprites[cls] ??= { animations: heroAtlas.sprites.warrior!.animations };
  }
  for (const [name, atlas] of Object.entries(manifest.atlases)) {
    atlas.image = 'sprites/creatures.png';
    atlas.frameWidth = CELL;
    atlas.frameHeight = CELL;
    atlas.columns = COLS;
    for (const [key, sprite] of Object.entries(atlas.sprites)) {
      delete sprite.scale;
      if (name === 'hero') {
        // Only the warrior holds the drawn sword; bows and staves are part of the outfits.
        sprite.looks = key === 'warrior' ? looks.hero : looks[key];
        if (key === 'warrior') sprite.weapon = weapon;
        else delete sprite.weapon;
      } else if (name === 'npcs') {
        sprite.frames = (looks.npcs as Record<string, unknown>)[key];
      } else {
        const set = (looks.monsters as Record<string, unknown>)[key];
        if (!set) throw new Error(`no creature for sprite ${key}`);
        sprite.frames = set;
      }
    }
  }
  writeFileSync(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
  return { cells: cells.length, looks };
}
