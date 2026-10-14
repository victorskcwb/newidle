import { Container, Graphics } from 'pixi.js';
import {
  HERO_ANIMS,
  HERO_POSES,
  type ActorState,
  type GatherAnim,
  type HeroAnim,
} from './anims.ts';
import { OUTLINE } from './placeholders.ts';

export interface HeroAppearance {
  skin: number;
  hair: number;
  outfit: number;
}

export type HeldItem = 'none' | 'pickaxe' | 'hammer' | 'dagger_bronze';

const TOOL_FOR_ANIM: Partial<Record<GatherAnim, HeldItem>> = { mine: 'pickaxe', smith: 'hammer' };

/**
 * Modular hero (section 6.2): synchronised layers — cape, legs, torso, head, weapon, shield.
 * Changing equipment redraws only that layer. Placeholder animation = per-frame pose offsets.
 */
export class Hero extends Container {
  state: ActorState = 'idle';
  private readonly body = new Container();
  private readonly cape = new Graphics();
  private readonly legBack = new Graphics();
  private readonly legFront = new Graphics();
  private readonly torso = new Graphics();
  private readonly head = new Graphics();
  private readonly arm = new Container();
  private readonly weapon = new Graphics();
  private readonly shield = new Graphics();

  private anim: HeroAnim = 'idle';
  private animStart = 0;
  private gatherAnchor = 0;
  private gatherCycleMs = 750;
  private lastImpactIndex = Number.NEGATIVE_INFINITY;
  private oneShotUntil = 0;
  private held: HeldItem = 'none';
  private equipped: HeldItem = 'none';
  /** Called at the impact frame of each gather swing. */
  onImpact: (() => void) | null = null;

  constructor(private appearance: HeroAppearance) {
    super();
    this.addChild(this.body);
    this.body.addChild(
      this.cape,
      this.legBack,
      this.legFront,
      this.torso,
      this.head,
      this.shield,
      this.arm,
    );
    this.arm.addChild(this.weapon);
    this.arm.position.set(1, -19);
    this.drawBody();
    this.drawWeapon();
  }

  setAppearance(appearance: HeroAppearance): void {
    this.appearance = appearance;
    this.drawBody();
  }

  /** Equipment change: swaps the weapon layer immediately. */
  setEquippedWeapon(item: HeldItem): void {
    this.equipped = item;
    if (this.state !== 'gather') this.setHeld(item);
  }

  idle(now: number): void {
    this.state = 'idle';
    this.play('idle', now);
    this.setHeld(this.equipped);
  }

  walk(now: number): void {
    this.state = 'walk';
    this.play('walk', now);
    this.setHeld(this.equipped);
  }

  /**
   * Gather loop whose impact frames land on `anchorMs + k × cycleMs`. Anchor it on the
   * completion time of the current execution so the last swing coincides with the event.
   */
  gather(anim: GatherAnim, anchorMs: number, cycleMs: number, now: number): void {
    this.state = 'gather';
    this.anim = anim;
    this.gatherAnchor = anchorMs;
    this.gatherCycleMs = cycleMs;
    this.lastImpactIndex = Math.floor((now - anchorMs) / cycleMs);
    this.setHeld(TOOL_FOR_ANIM[anim] ?? this.equipped);
  }

  /** Plays a one-shot animation over the current state, then resumes it. */
  oneShot(anim: HeroAnim, now: number): void {
    const clip = HERO_ANIMS[anim];
    this.oneShotUntil = now + clip.frames * clip.frameMs;
    this.animStart = now;
    this.oneShotAnim = anim;
  }
  private oneShotAnim: HeroAnim | null = null;

  update(now: number): void {
    let anim: HeroAnim = this.anim;
    let frame: number;
    if (this.oneShotAnim && now < this.oneShotUntil) {
      anim = this.oneShotAnim;
      const clip = HERO_ANIMS[anim];
      frame = Math.min(clip.frames - 1, Math.floor((now - this.animStart) / clip.frameMs));
    } else {
      this.oneShotAnim = null;
      const clip = HERO_ANIMS[anim];
      if (this.state === 'gather' && 'impactFrame' in clip) {
        const cycles = (now - this.gatherAnchor) / this.gatherCycleMs;
        const index = Math.floor(cycles);
        frame =
          (((Math.floor(cycles * clip.frames) + clip.impactFrame) % clip.frames) + clip.frames) %
          clip.frames;
        if (index > this.lastImpactIndex) {
          this.lastImpactIndex = index;
          this.onImpact?.();
        }
      } else {
        frame = Math.floor((now - this.animStart) / clip.frameMs) % clip.frames;
      }
    }
    this.applyPose(anim, frame);
  }

  private play(anim: HeroAnim, now: number): void {
    this.anim = anim;
    this.animStart = now;
  }

  private applyPose(anim: HeroAnim, frame: number): void {
    const pose = HERO_POSES[anim][frame] ?? HERO_POSES.idle[0]!;
    this.body.y = pose.bodyY;
    this.body.rotation = pose.lean;
    this.body.scale.set(1 - pose.squash, 1 + pose.squash);
    this.arm.rotation = pose.armRot;
    this.legBack.x = -pose.legSpread;
    this.legFront.x = pose.legSpread;
  }

  private setHeld(item: HeldItem): void {
    if (item === this.held) return;
    this.held = item;
    this.drawWeapon();
  }

  private drawBody(): void {
    const { skin, hair, outfit } = this.appearance;
    this.cape.clear().rect(-6, -20, 5, 14).fill(0x6a2e3e).stroke({ width: 1, color: OUTLINE });
    this.legBack.clear().rect(-4, -8, 3, 8).fill(0x3a3446).stroke({ width: 1, color: OUTLINE });
    this.legFront.clear().rect(1, -8, 3, 8).fill(0x4a4458).stroke({ width: 1, color: OUTLINE });
    this.torso.clear().rect(-5, -20, 10, 13).fill(outfit).stroke({ width: 1, color: OUTLINE });
    this.torso.rect(-5, -10, 10, 2).fill(0x5b3a24);
    this.head.clear().rect(-4, -28, 8, 8).fill(skin).stroke({ width: 1, color: OUTLINE });
    this.head.rect(-4, -29, 8, 3).fill(hair);
    this.head.rect(-5, -28, 2, 5).fill(hair);
    this.head.rect(2, -25, 1, 2).fill(OUTLINE);
  }

  private drawWeapon(): void {
    const g = this.weapon.clear();
    // Hand at the arm origin; the item points "up" at rotation 0.
    g.rect(-1, -1, 3, 3).fill(this.appearance.skin).stroke({ width: 1, color: OUTLINE });
    switch (this.held) {
      case 'pickaxe':
        g.rect(0, -14, 2, 15).fill(0x7a5230);
        g.poly([-6, -12, 1, -16, 8, -12, 1, -14])
          .fill(0xb0763a)
          .stroke({ width: 1, color: OUTLINE });
        break;
      case 'hammer':
        g.rect(0, -10, 2, 11).fill(0x7a5230);
        g.rect(-3, -14, 8, 5).fill(0x8a8f99).stroke({ width: 1, color: OUTLINE });
        break;
      case 'dagger_bronze':
        g.rect(-1, -3, 4, 2).fill(0x5b3a24);
        g.poly([0, -3, 2, -3, 2, -11, 1, -13, 0, -11])
          .fill(0xd09a5a)
          .stroke({ width: 1, color: OUTLINE });
        break;
      case 'none':
        break;
    }
    this.shield.clear();
  }
}
