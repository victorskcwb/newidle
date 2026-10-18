import { impactDelayMs, type SpriteAnimation, type TilePoint } from '@abismo/content';
import type Phaser from 'phaser';
import type { Direction } from './textures.ts';

export const TILE = 32;
/** Where an actor's feet stand, below the tile centre. */
const FEET = 13;

export function tileCenter(t: TilePoint) {
  return { x: t.tx * TILE + TILE / 2, y: t.ty * TILE + TILE / 2 };
}

export function toTile(x: number, y: number): TilePoint {
  return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
}

export type Animations = Record<string, SpriteAnimation>;

/** How an actor is drawn when facing a direction. */
export interface Look {
  texture: string;
  frame?: number;
  flipX: boolean;
  /** Base scale (sheets of 16 px characters are drawn at 2× on the 32 px map). */
  scale: number;
  tint?: number;
  /** Height of the drawing in map pixels (sheet cells have room above it). */
  height?: number;
  /** Frame animations of the sheet (Phaser animation keys), looping while idle or running. */
  loops?: { idle: string; run: string; hit?: string };
  /** The same per facing, for sheets drawn in four directions (then nothing is mirrored). */
  dirLoops?: Record<Direction, { idle: string; run: string }>;
  /** A weapon held in front of the body, swung on attacks. */
  weapon?: { texture: string; frame: number };
}

export type LookFor = (dir: Direction) => Look;

/**
 * A hero or monster on the map: animated sprite (idle and run loops from the sheet), an
 * optional weapon, shadow, name/level label and life bar. Attacks, hits, spawns and deaths
 * are tweens timed from the sprite manifest (frames × frameMs, impact frame).
 */
export class Actor {
  readonly container: Phaser.GameObjects.Container;
  /** Sprite and weapon; tweens move this, the container stays on the tile. */
  private body: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private weapon: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;
  private bob = 0;
  private hpRatio = 1;
  private baseScale = 1;
  private tint: number | undefined;
  private look!: Look;
  private facingLeft = false;
  private hitUntil = 0;
  path: TilePoint[] = [];
  dir: Direction = 'down';
  /** Tiles per second at time scale 1. */
  speed = 3.5;
  moving = false;

  constructor(
    private scene: Phaser.Scene,
    private lookFor: LookFor,
    private anims: Animations,
    opts: { name: string; color: string; bar: boolean; barWidth?: number },
  ) {
    const shadow = scene.add.image(0, FEET - 2, 'shadow');
    this.sprite = scene.add.sprite(0, 0, '__DEFAULT').setOrigin(0.5, 1);
    this.weapon = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 0.92).setVisible(false);
    this.body = scene.add.container(0, FEET, [this.sprite, this.weapon]);
    this.label = scene.add
      .text(0, 0, opts.name, {
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
        fontStyle: 'bold',
        fontSize: '9px',
        color: opts.color,
        stroke: '#000000',
        strokeThickness: 3,
        resolution: 4,
      })
      .setOrigin(0.5, 1);
    this.bar = scene.add.graphics();
    this.bar.setVisible(opts.bar);
    this.barWidth = opts.barWidth ?? 24;
    this.container = scene.add.container(0, 0, [shadow, this.body, this.bar, this.label]);
    this.applyLook();
  }

  private barWidth: number;

  get x() {
    return this.container.x;
  }
  get y() {
    return this.container.y;
  }
  get tile(): TilePoint {
    return toTile(this.container.x, this.container.y);
  }

  /** Top of the drawn sprite, relative to the actor's position. */
  private get top() {
    return FEET - (this.look?.height ?? this.sprite.displayHeight) * this.body.scaleY;
  }

  private applyLook() {
    this.look = this.lookFor(this.dir);
    const look = this.look;
    this.sprite.setTexture(look.texture, look.frame);
    this.baseScale = look.scale;
    this.body.setScale(1);
    this.sprite.setScale(look.scale);
    this.tint = look.tint;
    if (look.tint !== undefined) this.sprite.setTint(look.tint);
    else this.sprite.clearTint();
    if (look.weapon) {
      this.weapon.setTexture(look.weapon.texture, look.weapon.frame).setScale(look.scale * 0.7);
    }
    this.weapon.setVisible(look.weapon !== undefined);
    this.playLoop(this.moving ? 'run' : 'idle', true);
    this.setFacing(this.facingLeft);
    this.label.setY(this.top - 7);
    this.drawBar();
  }

  private playLoop(kind: 'idle' | 'run', force = false) {
    const key = this.look.dirLoops?.[this.dir][kind] ?? this.look.loops?.[kind];
    if (!key) return;
    if (!force && this.sprite.anims.currentAnim?.key === key) return;
    if (this.scene.time.now < this.hitUntil) return;
    this.sprite.play({ key, startFrame: force ? 0 : undefined }, !force);
  }

  /** The sheets face right; left is mirrored, and up/down keep the last side. */
  private setFacing(left: boolean) {
    this.facingLeft = left;
    this.sprite.setFlipX(left && !this.look.dirLoops);
    const side = left ? -1 : 1;
    this.weapon
      .setFlipX(left)
      .setPosition(side * 5, -6)
      .setAngle(side * 25);
  }

  /** Hides the name and life bar (graphics option); the hero keeps them. */
  setOverhead(visible: boolean) {
    this.overhead = visible;
    this.label.setVisible(visible);
    if (!visible) this.bar.setVisible(false);
  }

  private overhead = true;

  setName(name: string, color: string) {
    this.label.setText(name).setColor(color);
  }

  setLook(lookFor: LookFor, anims: Animations) {
    this.lookFor = lookFor;
    this.anims = anims;
    this.applyLook();
  }

  place(t: TilePoint) {
    const p = tileCenter(t);
    this.container.setPosition(p.x, p.y);
    this.container.setDepth(p.y);
    this.path = [];
  }

  face(x: number, y: number) {
    const dx = x - this.container.x;
    const dy = y - this.container.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const dir: Direction =
      Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    const turned = dir !== this.dir;
    this.dir = dir;
    if (Math.abs(dx) >= 1 && dx < 0 !== this.facingLeft) this.setFacing(dx < 0);
    // Four-direction sheets switch to the animation of the new facing.
    if (turned && this.look.dirLoops) this.playLoop(this.moving ? 'run' : 'idle');
  }

  setHp(ratio: number) {
    this.hpRatio = Math.max(0, Math.min(1, ratio));
    this.drawBar();
  }

  private drawBar() {
    const w = this.barWidth;
    const y = this.top - 5;
    this.bar.clear();
    this.bar.fillStyle(0x000000, 0.8);
    this.bar.fillRect(-w / 2 - 1, y - 1, w + 2, 5);
    const color = this.hpRatio > 0.5 ? 0x4fc04f : this.hpRatio > 0.25 ? 0xe0b030 : 0xd84040;
    this.bar.fillStyle(color, 1);
    this.bar.fillRect(-w / 2, y, Math.round(w * this.hpRatio), 3);
  }

  /** Moves along `path` (tile by tile). Returns true while moving. */
  update(dtMs: number, timeScale: number): boolean {
    const next = this.path[0];
    if (!next) {
      if (this.moving) this.playLoop('idle');
      this.moving = false;
      this.body.setY(FEET);
      return false;
    }
    if (!this.moving) this.playLoop('run');
    this.moving = true;
    const target = tileCenter(next);
    const dx = target.x - this.container.x;
    const dy = target.y - this.container.y;
    const dist = Math.hypot(dx, dy);
    const stepPx = (this.speed * TILE * dtMs * timeScale) / 1000;
    this.face(target.x, target.y);
    if (dist <= stepPx) {
      this.container.setPosition(target.x, target.y);
      this.path.shift();
    } else {
      this.container.setPosition(
        this.container.x + (dx / dist) * stepPx,
        this.container.y + (dy / dist) * stepPx,
      );
    }
    this.container.setDepth(this.container.y);
    // Sheets with a run loop animate their own steps; still frames get a small hop.
    if (!this.look.loops) {
      const walk = this.anims.walk;
      const cycle = walk ? walk.frames * walk.frameMs : 480;
      this.bob = (this.bob + dtMs * timeScale) % cycle;
      this.body.setY(FEET - Math.abs(Math.sin((this.bob / cycle) * Math.PI * 2)) * 2);
    }
    return true;
  }

  /** Lunge towards a point and swing the weapon; `onImpact` fires at the impact frame. */
  attack(x: number, y: number, animName: 'attack' | 'cast', onImpact: () => void) {
    const anim = this.anims[animName] ?? this.anims.attack!;
    this.face(x, y);
    const total = anim.frames * anim.frameMs;
    const impact = impactDelayMs(anim) || total / 2;
    const dx = x - this.container.x;
    const dy = y - this.container.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.scene.tweens.add({
      targets: this.body,
      x: (dx / d) * 7,
      y: FEET + (dy / d) * 7,
      duration: impact,
      yoyo: true,
      hold: 20,
      ease: 'Quad.easeIn',
      onComplete: () => this.body.setPosition(0, FEET),
    });
    if (this.look.weapon) {
      // Wind up behind the shoulder, then strike through to the front.
      const side = this.facingLeft ? -1 : 1;
      this.scene.tweens.killTweensOf(this.weapon);
      this.weapon.setAngle(side * -70);
      this.scene.tweens.add({
        targets: this.weapon,
        angle: side * 110,
        duration: impact,
        ease: 'Back.easeIn',
        onComplete: () =>
          this.scene.tweens.add({
            targets: this.weapon,
            angle: side * 25,
            duration: Math.max(80, total - impact),
          }),
      });
    }
    if (animName === 'cast') {
      this.scene.tweens.add({
        targets: this.body,
        scale: 1.2,
        duration: total / 2,
        yoyo: true,
      });
    }
    this.scene.time.delayedCall(impact, onImpact);
  }

  hurt() {
    const hit = this.look.loops?.hit;
    if (hit) {
      this.sprite.play(hit);
      this.hitUntil = this.scene.time.now + 160;
      this.scene.time.delayedCall(170, () => this.playLoop(this.moving ? 'run' : 'idle', true));
    }
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => {
      if (this.tint !== undefined) this.sprite.setTint(this.tint);
      else this.sprite.clearTint();
    });
  }

  /** A happy jump with a golden flash (level up). */
  celebrate() {
    this.scene.tweens.add({
      targets: this.body,
      y: FEET - 14,
      scale: 1.2,
      duration: 220,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => this.body.setPosition(this.body.x, FEET).setScale(1),
    });
    this.sprite.setTintFill(0xffe08a);
    this.scene.time.delayedCall(160, () => {
      if (this.tint !== undefined) this.sprite.setTint(this.tint);
      else this.sprite.clearTint();
    });
  }

  spawn() {
    const anim = this.anims.spawn;
    const duration = anim ? anim.frames * anim.frameMs : 300;
    this.body.setScale(1, 0.1).setAlpha(0);
    this.scene.tweens.add({
      targets: this.body,
      scaleY: 1,
      alpha: 1,
      duration,
      ease: 'Back.easeOut',
    });
  }

  die(onDone?: () => void) {
    const anim = this.anims.die;
    const duration = anim ? anim.frames * anim.frameMs : 400;
    this.bar.setVisible(false);
    this.sprite.anims.pause();
    this.scene.tweens.add({
      targets: this.body,
      scaleY: 0.2,
      alpha: 0,
      angle: this.facingLeft ? -60 : 60,
      duration,
      ease: 'Quad.easeIn',
      onComplete: () => onDone?.(),
    });
    this.scene.tweens.add({ targets: this.label, alpha: 0, duration });
  }

  reset(showBar: boolean) {
    this.scene.tweens.killTweensOf(this.body);
    this.scene.tweens.killTweensOf(this.weapon);
    this.scene.tweens.killTweensOf(this.label);
    this.body.setAlpha(1).setAngle(0).setScale(1).setPosition(0, FEET);
    this.hitUntil = 0;
    this.applyLook();
    this.label.setAlpha(1);
    this.bar.setVisible(showBar && this.overhead);
    this.hpRatio = 1;
    this.drawBar();
    this.path = [];
    this.container.setVisible(true).setAlpha(1);
  }
}
