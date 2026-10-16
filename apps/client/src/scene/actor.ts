import { impactDelayMs, type SpriteAnimation, type TilePoint } from '@abismo/content';
import type Phaser from 'phaser';
import type { Direction } from './textures.ts';

export const TILE = 32;

export function tileCenter(t: TilePoint) {
  return { x: t.tx * TILE + TILE / 2, y: t.ty * TILE + TILE / 2 };
}

export function toTile(x: number, y: number): TilePoint {
  return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
}

export type Animations = Record<string, SpriteAnimation>;

/**
 * A hero or monster on the map: sprite, shadow, name/level label and life bar. Placeholder
 * animations are tweens timed from the sprite manifest (frames × frameMs, impact frame).
 */
export class Actor {
  readonly container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;
  private bob = 0;
  private hpRatio = 1;
  path: TilePoint[] = [];
  dir: Direction = 'down';
  /** Tiles per second at time scale 1. */
  speed = 3.5;
  moving = false;

  constructor(
    private scene: Phaser.Scene,
    private textureFor: (dir: Direction) => string,
    private anims: Animations,
    opts: { name: string; color: string; bar: boolean; barWidth?: number },
  ) {
    const shadow = scene.add.image(0, 10, 'shadow');
    this.sprite = scene.add.image(0, 0, textureFor('down'));
    this.label = scene.add
      .text(0, -this.sprite.height / 2 - 12, opts.name, {
        fontFamily: '"Pixelify Sans", monospace',
        fontSize: '8px',
        color: opts.color,
        stroke: '#000000',
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5, 1);
    this.bar = scene.add.graphics();
    this.bar.setVisible(opts.bar);
    this.barWidth = opts.barWidth ?? 24;
    this.container = scene.add.container(0, 0, [shadow, this.sprite, this.bar, this.label]);
    this.drawBar();
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

  setName(name: string, color: string) {
    this.label.setText(name).setColor(color);
  }

  setTexture(textureFor: (dir: Direction) => string, anims: Animations) {
    this.textureFor = textureFor;
    this.anims = anims;
    this.sprite.setTexture(textureFor(this.dir));
    this.label.setY(-this.sprite.height / 2 - 12);
  }

  place(t: TilePoint) {
    const p = tileCenter(t);
    this.container.setPosition(p.x, p.y);
    this.container.setDepth(p.y);
    this.path = [];
  }

  setVisible(v: boolean) {
    this.container.setVisible(v);
    this.container.setAlpha(1);
    this.sprite.setScale(1).setAlpha(1).setAngle(0);
  }

  face(x: number, y: number) {
    const dx = x - this.container.x;
    const dy = y - this.container.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const dir: Direction =
      Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    if (dir !== this.dir) {
      this.dir = dir;
      this.sprite.setTexture(this.textureFor(dir));
    }
  }

  setHp(ratio: number) {
    this.hpRatio = Math.max(0, Math.min(1, ratio));
    this.drawBar();
  }

  private drawBar() {
    const w = this.barWidth;
    const y = -this.sprite.height / 2 - 8;
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
      this.moving = false;
      this.sprite.setY(0);
      return false;
    }
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
    const walk = this.anims.walk;
    const cycle = walk ? walk.frames * walk.frameMs : 480;
    this.bob = (this.bob + dtMs * timeScale) % cycle;
    this.sprite.setY(-Math.abs(Math.sin((this.bob / cycle) * Math.PI * 2)) * 2);
    return true;
  }

  /** Lunge towards a point; `onImpact` fires at the animation's impact frame. */
  attack(x: number, y: number, animName: 'attack' | 'cast', onImpact: () => void) {
    const anim = this.anims[animName] ?? this.anims.attack!;
    this.face(x, y);
    const total = anim.frames * anim.frameMs;
    const dx = x - this.container.x;
    const dy = y - this.container.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.scene.tweens.add({
      targets: this.sprite,
      x: (dx / d) * 7,
      y: (dy / d) * 7,
      duration: impactDelayMs(anim) || total / 2,
      yoyo: true,
      hold: 20,
      ease: 'Quad.easeIn',
      onComplete: () => this.sprite.setPosition(0, 0),
    });
    if (animName === 'cast') {
      this.scene.tweens.add({ targets: this.sprite, scale: 1.2, duration: total / 2, yoyo: true });
    }
    this.scene.time.delayedCall(impactDelayMs(anim), onImpact);
  }

  hurt() {
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => this.sprite.clearTint());
  }

  spawn() {
    const anim = this.anims.spawn;
    const duration = anim ? anim.frames * anim.frameMs : 300;
    this.sprite.setScale(1, 0.1).setAlpha(0);
    this.scene.tweens.add({
      targets: this.sprite,
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
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: 0.2,
      alpha: 0,
      angle: this.dir === 'left' ? -60 : 60,
      duration,
      ease: 'Quad.easeIn',
      onComplete: () => onDone?.(),
    });
    this.scene.tweens.add({ targets: this.label, alpha: 0, duration });
  }

  reset(showBar: boolean) {
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.label);
    this.sprite.setScale(1).setAlpha(1).setAngle(0).setPosition(0, 0).clearTint();
    this.label.setAlpha(1);
    this.bar.setVisible(showBar);
    this.hpRatio = 1;
    this.drawBar();
    this.path = [];
    this.container.setVisible(true).setAlpha(1);
  }
}
