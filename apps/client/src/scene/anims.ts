/**
 * Animation manifest. Mirrors what the Aseprite export will provide per animation
 * (frame count, ms per frame, impact frame), so swapping placeholders for final art
 * only replaces the atlas, not the choreography.
 */
export interface AnimClip {
  frames: number;
  frameMs: number;
  loop: boolean;
  /** Frame at which a swing or hit lands; the scene aligns it to the event's tick. */
  impactFrame?: number;
}

export const HERO_ANIMS = {
  idle: { frames: 4, frameMs: 260, loop: true },
  walk: { frames: 6, frameMs: 100, loop: true },
  hurt: { frames: 2, frameMs: 100, loop: false },
  block: { frames: 2, frameMs: 120, loop: false },
  eat: { frames: 4, frameMs: 150, loop: false },
  die: { frames: 6, frameMs: 120, loop: false },
  celebrate: { frames: 6, frameMs: 130, loop: false },
  mine: { frames: 4, frameMs: 150, loop: true, impactFrame: 2 },
  chop: { frames: 4, frameMs: 150, loop: true, impactFrame: 2 },
  fish: { frames: 4, frameMs: 200, loop: true, impactFrame: 2 },
  smith: { frames: 4, frameMs: 150, loop: true, impactFrame: 2 },
  cook: { frames: 4, frameMs: 200, loop: true, impactFrame: 2 },
  craft: { frames: 4, frameMs: 150, loop: true, impactFrame: 2 },
} as const satisfies Record<string, AnimClip>;

export type HeroAnim = keyof typeof HERO_ANIMS;
export type GatherAnim = 'mine' | 'chop' | 'fish' | 'smith' | 'cook' | 'craft';

/** Actor state machine states (section 6.2). Transitions come from engine events only. */
export type ActorState =
  'idle' | 'walk' | 'attack' | 'hurt' | 'block' | 'eat' | 'gather' | 'die' | 'spawn' | 'celebrate';

/** Body pose for one frame of a placeholder animation (squash/stretch and offsets). */
export interface Pose {
  bodyY: number;
  lean: number;
  armRot: number;
  legSpread: number;
  squash: number;
}

const P = (bodyY: number, lean: number, armRot: number, legSpread = 0, squash = 0): Pose => ({
  bodyY,
  lean,
  armRot,
  legSpread,
  squash,
});

const SWING: Pose[] = [
  P(0, -0.05, -0.9),
  P(-1, -0.12, -1.7, 0, -0.04),
  P(1, 0.15, 1.25, 1, 0.06),
  P(0, 0.06, 0.5),
];

export const HERO_POSES: Record<HeroAnim, Pose[]> = {
  idle: [P(0, 0, -0.25), P(0, 0, -0.25), P(1, 0, -0.2, 0, 0.03), P(1, 0, -0.2, 0, 0.03)],
  walk: [
    P(0, 0.05, -0.5, 2),
    P(-1, 0.05, -0.3, 1),
    P(0, 0.05, -0.1, -2),
    P(0, 0.05, -0.3, -2),
    P(-1, 0.05, -0.5, -1),
    P(0, 0.05, -0.6, 2),
  ],
  hurt: [P(0, -0.2, -0.6, 0, -0.05), P(0, -0.1, -0.4)],
  block: [P(0, -0.1, -1.2), P(0, -0.05, -1.0)],
  eat: [P(0, 0, -2.2), P(-1, 0, -2.4), P(0, 0, -2.2), P(-1, 0, -2.4)],
  die: [
    P(0, -0.2, 0),
    P(1, -0.5, 0.3),
    P(3, -0.9, 0.6),
    P(6, -1.3, 0.9),
    P(8, -1.5, 1),
    P(8, -1.57, 1),
  ],
  celebrate: [
    P(0, 0, -2.6, 0, 0.08),
    P(-4, 0, -2.9, 1, -0.06),
    P(-7, 0, -3.0, 1),
    P(-7, 0, -3.0, 1),
    P(-4, 0, -2.9),
    P(0, 0, -2.6, 0, 0.08),
  ],
  mine: SWING,
  chop: SWING,
  smith: SWING,
  craft: SWING,
  fish: [P(0, 0.05, 0.6), P(0, 0.05, 0.7), P(0, 0.12, 0.2), P(0, 0.05, 0.5)],
  cook: [P(0, 0.1, 0.8), P(-1, 0.1, 0.6), P(0, 0.15, 1.0), P(0, 0.1, 0.8)],
};
