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
 * Effect textures of assets/sprites/fx.png (Kenney Particle Pack, CC0), in sheet order:
 * build-art writes the sheet from this list and the scene finds frames by name.
 */
export const FX_FRAMES = [
  'slash_01',
  'slash_02',
  'slash_03',
  'slash_04',
  'magic_01',
  'magic_02',
  'magic_03',
  'magic_04',
  'magic_05',
  'twirl_01',
  'twirl_02',
  'fire_01',
  'flame_01',
  'flame_03',
  'spark_01',
  'spark_04',
  'spark_05',
  'star_01',
  'star_04',
  'star_06',
  'circle_01',
  'circle_03',
  'circle_05',
  'smoke_01',
  'smoke_04',
  'light_01',
  'light_03',
  'scorch_01',
  'symbol_01',
  'trace_01',
  'muzzle_02',
  'flare_01',
] as const;
export type FxFrame = (typeof FX_FRAMES)[number];

/** Milliseconds from the start of an animation to its impact frame (0 if it has none). */
export function impactDelayMs(anim: SpriteAnimation): number {
  return (anim.impactFrame ?? 0) * anim.frameMs;
}
