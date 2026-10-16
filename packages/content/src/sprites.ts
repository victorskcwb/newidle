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

export const spriteManifestSchema = z.strictObject({
  atlases: z.record(
    z.string(),
    z.strictObject({
      placeholder: z.boolean(),
      sprites: z.record(
        z.string(),
        z.strictObject({ animations: z.record(z.string(), animation) }),
      ),
    }),
  ),
});
export type SpriteManifest = z.infer<typeof spriteManifestSchema>;

/** Milliseconds from the start of an animation to its impact frame (0 if it has none). */
export function impactDelayMs(anim: SpriteAnimation): number {
  return (anim.impactFrame ?? 0) * anim.frameMs;
}
