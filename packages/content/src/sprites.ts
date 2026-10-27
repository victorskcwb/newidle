import { z } from 'zod';

/**
 * Sprite manifest (assets/sprites/manifest.json): per sprite, each animation's frame count,
 * frame duration and, for attacks, the frame at which the blow lands (used to show damage
 * numbers on impact). Placeholder atlases are drawn by code with the same names, so swapping
 * in final art only changes the atlas.
 */
export const DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
export const HERO_ANIMATIONS = ['idle', 'walk', 'attack', 'cast', 'hurt', 'die'] as const;
export const MONSTER_ANIMATIONS = ['idle', 'walk', 'attack', 'hurt', 'die', 'spawn'] as const;

const animation = z
  .strictObject({
    frames: z.number().int().min(1),
    frameMs: z.number().int().min(16),
    impactFrame: z.number().int().min(0).optional(),
    loop: z.boolean().optional(),
  })
  .refine(
    (a) => a.impactFrame === undefined || a.impactFrame < a.frames,
    'impactFrame out of range',
  );
export type SpriteAnimation = z.infer<typeof animation>;

const frameList = z.array(z.number().int().min(0)).min(1);
/** Frames of the looping animations drawn by the sheet (the others are tweens). */
const frameSet = z.strictObject({
  idle: frameList,
  run: frameList,
  hit: frameList.optional(),
  /** Height of the drawing inside the cell, in sheet pixels (labels sit above it). */
  height: z.number().int().min(1).optional(),
  /** Frames per facing, for sheets drawn in four directions (no mirroring). */
  dirs: z
    .strictObject({
      up: z.strictObject({ idle: frameList, run: frameList }),
      right: z.strictObject({ idle: frameList, run: frameList }),
      down: z.strictObject({ idle: frameList, run: frameList }),
      left: z.strictObject({ idle: frameList, run: frameList }),
    })
    .optional(),
});
export type FrameSet = z.infer<typeof frameSet>;

export const spriteManifestSchema = z.strictObject({
  atlases: z.record(
    z.string(),
    z.strictObject({
      placeholder: z.boolean(),
      /** Sprite sheet under assets/ (absent: shapes drawn by code). */
      image: z.string().min(1).optional(),
      /** Frame size in the sheet, in pixels. */
      frameWidth: z.number().int().min(8).optional(),
      frameHeight: z.number().int().min(8).optional(),
      /** Frames per row of the sheet (for CSS sprites in the interface). */
      columns: z.number().int().min(1).optional(),
      sprites: z.record(
        z.string(),
        z.strictObject({
          /** Sheet frames (drawn facing right; left is mirrored). */
          frames: frameSet.optional(),
          /** The hero's looks, chosen by the outfit at creation. */
          looks: z.array(frameSet).min(1).optional(),
          /** Weapon frame held in front of the sprite. */
          weapon: z.number().int().min(0).optional(),
          /** Size relative to the sheet's 2× drawing (large sheet frames are scaled down). */
          scale: z.number().positive().optional(),
          animations: z.record(z.string(), animation),
        }),
      ),
    }),
  ),
});
export type SpriteManifest = z.infer<typeof spriteManifestSchema>;

/**
 * Animated effects of assets/sprites/hitfx.png (OpenTibia Sprite Pack misc sheet): source
 * cells in play order. Frames are laid out in this order, so an animation's first frame is
 * the sum of the cells of the ones before it.
 */
export const HIT_FX = {
  /** Fiery blast: heavy strike, critical hits. */
  blast: { cells: [406, 407, 408, 409, 410, 411, 412, 413], frameMs: 45 },
  /** Claw marks: monster hits on the hero. */
  claw: { cells: [208, 209, 210, 211, 212, 213, 214, 215], frameMs: 40 },
  /** Blue energy burst: skills, level up. */
  energy: { cells: [188, 189, 190, 191, 192, 193, 194, 195], frameMs: 45 },
  /** Sweeping flame: whirlwind. */
  sweep: { cells: [164, 165, 166, 167, 168, 169, 170, 171], frameMs: 45 },
  /** Red ring: war cry. */
  ring: { cells: [224, 225, 226, 227], frameMs: 70 },
  /** Gold sparks: loot. */
  sparks: { cells: [228, 229, 230], frameMs: 80 },
  /** Ice shards: stun. */
  shards: { cells: [400, 401, 402, 403], frameMs: 80 },
  /** Blood splash: kills. */
  splash: { cells: [217, 218, 219], frameMs: 70 },
} as const;
export type HitFxName = keyof typeof HIT_FX;

/** First frame of each effect inside hitfx.png. */
export function hitFxFirstFrame(name: HitFxName): number {
  let n = 0;
  for (const [k, a] of Object.entries(HIT_FX)) {
    if (k === name) return n;
    n += a.cells.length;
  }
  return n;
}

/**
 * Magic effects of the OpenTibia Sprite Pack's client files (otsp.dat, CC BY 4.0), copied into
 * assets/sprites/otspfx.png in this order, 64 px cells. `effect` is the effect id in otsp.dat
 * and `frames` its frame count there (the build checks it). An effect covers one 32 px tile
 * drawn at the cell's bottom right; the 2×2 ones also spill up and to the left, as in the pack.
 */
export const OTSP_FX = {
  /** Red ring opening up: war cry. */
  redRing: { effect: 1, frames: 4, frameMs: 80 },
  /** Blue sparkle: teleport, arcane hits, level up. */
  sparkle: { effect: 2, frames: 9, frameMs: 55 },
  /** Purple puff: poison. */
  poison: { effect: 3, frames: 4, frameMs: 90 },
  /** Yellow sparks: a blow stopped by armour (misses). */
  block: { effect: 4, frames: 3, frameMs: 90 },
  /** Tiny golden glints: loot, buffs. */
  glitter: { effect: 5, frames: 18, frameMs: 45 },
  /** Fire burst: fire hits. */
  fire: { effect: 6, frames: 13, frameMs: 45 },
  /** Blue bubbles swirling: ice and mana. */
  bubbles: { effect: 7, frames: 12, frameMs: 50 },
  /** Pale dust cloud: earth and stone. */
  dust: { effect: 9, frames: 6, frameMs: 70 },
  /** Dark smoke: death, dark hits. */
  smoke: { effect: 10, frames: 6, frameMs: 80 },
  /** Small flame: burning ground. */
  flame: { effect: 11, frames: 9, frameMs: 60 },
  /** Red drops: physical hits that draw blood. */
  blood: { effect: 12, frames: 9, frameMs: 40 },
  /** Big fiery explosion (2×2): heavy strikes, fireball. */
  explosion: { effect: 13, frames: 14, frameMs: 45 },
  /** Rock bursting from the ground (2×2): charge, stuns. */
  rock: { effect: 14, frames: 6, frameMs: 70 },
  /** Ice whirl rising (2×2): frost. */
  ice: { effect: 15, frames: 7, frameMs: 70 },
} as const;
export type OtspFxName = keyof typeof OTSP_FX;

/**
 * Missiles of otsp.dat, after the effects in otspfx.png: 9 cells each (3×3 directions, row by
 * row from the top left; the middle one is empty), the missile drawn at the cell's bottom right.
 */
export const OTSP_MISSILES = {
  spear: 1,
  bolt: 2,
  arrow: 3,
  fire: 4,
  poison: 5,
  star: 6,
  knife: 9,
  orb: 10,
  stone: 12,
  snowball: 13,
} as const;
export type OtspMissileName = keyof typeof OTSP_MISSILES;

/**
 * Splash items of otsp.dat (fluid stains on the floor), after the missiles in otspfx.png: one
 * cell per shape and colour, shapes in this order, each in the colours of OTSP_SPLASH_COLORS.
 * `item` is the item id in otsp.dat; the colour is its pattern (4×2, one per fluid).
 */
export const OTSP_SPLASHES = { pool: 2221, drops: 2222, spray: 2224 } as const;
export type OtspSplashName = keyof typeof OTSP_SPLASHES;
/** Pattern of each fluid colour in the splash items. */
export const OTSP_SPLASH_COLORS = { red: 2, orange: 3, green: 4, purple: 7 } as const;
export type OtspSplashColor = keyof typeof OTSP_SPLASH_COLORS;

/** First frame of an effect inside otspfx.png. */
export function otspFxFirstFrame(name: OtspFxName): number {
  let n = 0;
  for (const [k, a] of Object.entries(OTSP_FX)) {
    if (k === name) return n;
    n += a.frames;
  }
  return n;
}

/** First frame (the top-left direction) of a missile inside otspfx.png. */
export function otspMissileFirstFrame(name: OtspMissileName): number {
  const effects = Object.values(OTSP_FX).reduce((n, a) => n + a.frames, 0);
  return effects + Object.keys(OTSP_MISSILES).indexOf(name) * 9;
}

/** Frame of a splash shape in a colour inside otspfx.png. */
export function otspSplashFrame(shape: OtspSplashName, color: OtspSplashColor): number {
  const missiles = otspMissileFirstFrame('spear') + Object.keys(OTSP_MISSILES).length * 9;
  const colors = Object.keys(OTSP_SPLASH_COLORS);
  return (
    missiles + Object.keys(OTSP_SPLASHES).indexOf(shape) * colors.length + colors.indexOf(color)
  );
}

/** Milliseconds from the start of an animation to its impact frame (0 if it has none). */
export function impactDelayMs(anim: SpriteAnimation): number {
  return (anim.impactFrame ?? 0) * anim.frameMs;
}
