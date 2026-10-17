/**
 * Character and effect sheets, built by `pnpm art`:
 *   assets/sprites/actors.png  animated characters and weapons from 0x72's DungeonTileset II
 *                              (CC0), one frame per 32×36 cell, feet on the cell's bottom
 *   assets/sprites/fx.png      spell and hit textures from Kenney's Particle Pack (CC0),
 *                              128×128 cells, white on transparent (tinted in the game)
 * and the frame numbers in assets/sprites/manifest.json, so the scene finds them by name.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { FX_FRAMES as FX } from '@abismo/content';
import { PNG } from 'pngjs';

export const CELL_W = 32;
export const CELL_H = 36;
export const ACTOR_COLS = 16;
export const FX_SIZE = 128;
export const FX_COLS = 8;

/** Characters of the pack used by the game (each has idle and run, some a hit frame). */
const CHARACTERS = [
  'knight_m',
  'knight_f',
  'dwarf_m',
  'lizard_m',
  'skelet',
  'zombie',
  'tiny_zombie',
  'big_zombie',
  'ice_zombie',
  'wogol',
  'chort',
  'necromancer',
  'swampy',
  'muddy',
  'tiny_slug',
  'orc_shaman',
  'ogre',
  'imp',
  'masked_orc',
  'orc_warrior',
  'angel',
  'big_demon',
] as const;
type Character = (typeof CHARACTERS)[number];

export const WEAPONS = [
  'weapon_knight_sword',
  'weapon_regular_sword',
  'weapon_axe',
  'weapon_mace',
  'weapon_big_hammer',
  'weapon_double_axe',
] as const;

/** Which character draws each monster of the manifest, and its size relative to 2×. */
const MONSTER_LOOK: Record<string, { char: Character; scale?: number }> = {
  bone_walker: { char: 'skelet' },
  grave_rat: { char: 'tiny_zombie' },
  gravekeeper: { char: 'big_zombie', scale: 0.6 },
  grey_wolf: { char: 'wogol' },
  pale_spider: { char: 'chort' },
  spider_matriarch: { char: 'chort' },
  skeleton_archer: { char: 'skelet' },
  ghoul: { char: 'zombie' },
  lord_vharok: { char: 'necromancer' },
  bog_toad: { char: 'swampy' },
  leech_swarm: { char: 'tiny_slug' },
  mire_mother: { char: 'muddy' },
  drowned_villager: { char: 'ice_zombie' },
  marsh_hag: { char: 'orc_shaman' },
  old_drowned: { char: 'big_zombie', scale: 0.6 },
  rot_walker: { char: 'zombie' },
  swamp_horror: { char: 'ogre', scale: 0.6 },
  morvel_root: { char: 'swampy' },
  ember_hound: { char: 'imp' },
  ash_soldier: { char: 'masked_orc' },
  ashen_captain: { char: 'orc_warrior' },
  magma_golem: { char: 'ogre', scale: 0.6 },
  flame_cultist: { char: 'orc_shaman' },
  ember_priestess: { char: 'angel' },
  cinder_knight: { char: 'orc_warrior' },
  inferno_wraith: { char: 'chort' },
  charred_king: { char: 'big_demon', scale: 0.6 },
};
/** The hero's 4 looks, chosen at creation. */
const HERO_LOOKS: Character[] = ['knight_m', 'knight_f', 'dwarf_m', 'lizard_m'];

interface FrameSet {
  idle: number[];
  run: number[];
  hit?: number[];
}

export function buildActors(assets: URL) {
  const sheet = PNG.sync.read(
    readFileSync(new URL('vendor/0x72-dungeontileset-ii/sheet.png', assets)),
  );
  const list = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const line of readFileSync(
    new URL('vendor/0x72-dungeontileset-ii/tile_list.txt', assets),
    'utf8',
  ).split(/\r?\n/)) {
    const [name, x, y, w, h] = line.trim().split(/\s+/);
    if (name && h) list.set(name, { x: +x!, y: +y!, w: +w!, h: +h! });
  }

  const names: string[] = [];
  const frames = new Map<Character, FrameSet>();
  // The pack's frame list names one frame "zombie_anim_f10" (for f0).
  const typo = list.get('zombie_anim_f10');
  if (typo && !list.has('zombie_anim_f0')) list.set('zombie_anim_f0', typo);
  const add = (name: string) => {
    if (!list.has(name)) throw new Error(`0x72 sheet has no frame ${name}`);
    names.push(name);
    return names.length - 1;
  };
  const anim = (char: string, kind: string) => {
    // Most characters name their loops "<char>_idle_anim"; a few have only "<char>_anim".
    const base = list.has(`${char}_${kind}_anim_f0`) ? `${char}_${kind}_anim` : `${char}_anim`;
    return [0, 1, 2, 3].map((f) => add(`${base}_f${f}`));
  };
  for (const char of CHARACTERS) {
    const set: FrameSet = { idle: anim(char, 'idle'), run: anim(char, 'run') };
    if (list.has(`${char}_hit_anim_f0`)) set.hit = [add(`${char}_hit_anim_f0`)];
    frames.set(char, set);
  }
  const weapons = Object.fromEntries(WEAPONS.map((w) => [w, add(w)]));

  const rows = Math.ceil(names.length / ACTOR_COLS);
  const out = new PNG({ width: ACTOR_COLS * CELL_W, height: rows * CELL_H });
  names.forEach((name, i) => {
    const f = list.get(name)!;
    // Centred horizontally, feet on the bottom of the cell.
    const dx = (i % ACTOR_COLS) * CELL_W + Math.floor((CELL_W - f.w) / 2);
    const dy = Math.floor(i / ACTOR_COLS) * CELL_H + CELL_H - f.h;
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const si = ((f.y + y) * sheet.width + f.x + x) * 4;
        if (sheet.data[si + 3] === 0) continue;
        const di = ((dy + y) * out.width + dx + x) * 4;
        for (let c = 0; c < 4; c++) out.data[di + c] = sheet.data[si + c]!;
      }
    }
  });
  writeFileSync(new URL('sprites/actors.png', assets), PNG.sync.write(out));

  // Frame numbers into the manifest; animation timings there stay as authored.
  const manifestUrl = new URL('sprites/manifest.json', assets);
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8')) as {
    atlases: Record<
      string,
      Record<string, unknown> & { sprites: Record<string, Record<string, unknown>> }
    >;
  };
  for (const atlas of Object.values(manifest.atlases)) {
    atlas.image = 'sprites/actors.png';
    delete atlas.frameSize;
    atlas.frameWidth = CELL_W;
    atlas.frameHeight = CELL_H;
    atlas.columns = ACTOR_COLS;
    for (const [key, sprite] of Object.entries(atlas.sprites)) {
      delete sprite.frame;
      delete sprite.variants;
      delete sprite.scale;
      delete sprite.looks;
      delete sprite.weapon;
      if (key === 'warrior') {
        sprite.looks = HERO_LOOKS.map((c) => frames.get(c)!);
        sprite.weapon = weapons.weapon_knight_sword;
        continue;
      }
      const look = MONSTER_LOOK[key];
      if (!look) throw new Error(`no character for sprite ${key}`);
      sprite.frames = frames.get(look.char)!;
      if (look.scale) sprite.scale = look.scale;
    }
  }
  writeFileSync(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
  return names.length;
}

export function buildFx(assets: URL) {
  const rows = Math.ceil(FX.length / FX_COLS);
  const out = new PNG({ width: FX_COLS * FX_SIZE, height: rows * FX_SIZE });
  FX.forEach((name, i) => {
    const src = PNG.sync.read(
      readFileSync(new URL(`vendor/kenney-particle-pack/${name}.png`, assets)),
    );
    const dx = (i % FX_COLS) * FX_SIZE;
    const dy = Math.floor(i / FX_COLS) * FX_SIZE;
    for (let y = 0; y < FX_SIZE; y++) {
      for (let x = 0; x < FX_SIZE; x++) {
        const si = (y * src.width + x) * 4;
        const di = ((dy + y) * out.width + dx + x) * 4;
        // White texture: brightness becomes alpha, so tints and additive blending work.
        const a = Math.round((src.data[si]! * src.data[si + 3]!) / 255);
        out.data[di] = 255;
        out.data[di + 1] = 255;
        out.data[di + 2] = 255;
        out.data[di + 3] = a;
      }
    }
  });
  writeFileSync(new URL('sprites/fx.png', assets), PNG.sync.write(out));
  return FX.length;
}
