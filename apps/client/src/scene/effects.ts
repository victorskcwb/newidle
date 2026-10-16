import type { Rarity } from '@abismo/content';
import Phaser from 'phaser';
import { rarityHex } from '../ui/rarity.ts';

export type NumberKind = 'damage' | 'crit' | 'heal' | 'miss' | 'taken';

const NUMBER_STYLE: Record<NumberKind, { color: string; size: number }> = {
  damage: { color: '#ffffff', size: 11 },
  crit: { color: '#ffd84a', size: 15 },
  heal: { color: '#6be06b', size: 11 },
  miss: { color: '#9a9aa6', size: 10 },
  taken: { color: '#ff7a7a', size: 11 },
};

/**
 * Pooled effects: floating numbers and loot drops. Objects are created once and recycled so
 * fights do not allocate game objects on every hit (section 4.4).
 */
export class Effects {
  private numbers: Phaser.GameObjects.Text[] = [];
  private drops: {
    gem: Phaser.GameObjects.Image;
    glow: Phaser.GameObjects.Image;
    beam: Phaser.GameObjects.Image;
  }[] = [];
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  reducedMotion = false;

  constructor(private scene: Phaser.Scene) {
    this.sparks = scene.add.particles(0, 0, 'spark', {
      speed: { min: 30, max: 90 },
      lifespan: 450,
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      emitting: false,
    });
    this.sparks.setDepth(100_000);
  }

  private takeNumber(): Phaser.GameObjects.Text {
    const free = this.numbers.find((t) => !t.active);
    if (free) return free.setActive(true).setVisible(true);
    const t = this.scene.add
      .text(0, 0, '', {
        fontFamily: '"Pixelify Sans", monospace',
        fontSize: '11px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(100_001);
    this.numbers.push(t);
    return t;
  }

  number(x: number, y: number, text: string, kind: NumberKind) {
    const t = this.takeNumber();
    const style = NUMBER_STYLE[kind];
    t.setText(text)
      .setColor(style.color)
      .setFontSize(style.size)
      .setPosition(x + Phaser.Math.Between(-6, 6), y - 14)
      .setAlpha(1)
      .setScale(kind === 'crit' ? 1.3 : 1);
    this.scene.tweens.add({
      targets: t,
      y: t.y - 22,
      alpha: 0,
      scale: 1,
      duration: 750,
      ease: 'Cubic.easeOut',
      onComplete: () => t.setActive(false).setVisible(false),
    });
  }

  burst(x: number, y: number, color: number, count = 10) {
    if (this.reducedMotion) return;
    this.sparks.setParticleTint(color);
    this.sparks.explode(count, x, y);
  }

  ring(x: number, y: number, color: number) {
    const g = this.scene.add
      .circle(x, y, 6, color, 0)
      .setStrokeStyle(2, color, 1)
      .setDepth(100_000);
    this.scene.tweens.add({
      targets: g,
      radius: 30,
      alpha: 0,
      duration: 600,
      onComplete: () => g.destroy(),
    });
  }

  private takeDrop() {
    const free = this.drops.find((d) => !d.gem.active);
    if (free) {
      for (const o of [free.gem, free.glow, free.beam])
        o.setActive(true).setVisible(true).setAlpha(1).setScale(1);
      return free;
    }
    const drop = {
      glow: this.scene.add.image(0, 0, 'glow'),
      beam: this.scene.add.image(0, 0, 'beam').setOrigin(0.5, 1),
      gem: this.scene.add.image(0, 0, 'item_common'),
    };
    this.drops.push(drop);
    return drop;
  }

  /**
   * An item jumps out of a monster, rests 0.5 s on the ground and then flies to the backpack
   * (or dissolves into material when the loot filter salvages it).
   */
  dropItem(
    fromX: number,
    fromY: number,
    rarity: Rarity,
    kept: boolean,
    target: () => { x: number; y: number },
  ) {
    const d = this.takeDrop();
    const color = rarityHex(rarity);
    const landX = fromX + Phaser.Math.Between(-18, 18);
    const landY = fromY + Phaser.Math.Between(4, 16);
    d.gem
      .setTexture(`item_${rarity}`)
      .setPosition(fromX, fromY)
      .setDepth(landY + 1);
    d.glow
      .setTint(color)
      .setPosition(fromX, fromY)
      .setDepth(landY)
      .setAlpha(rarity === 'common' ? 0.25 : 0.8);
    d.beam
      .setTint(color)
      .setPosition(landX, landY)
      .setDepth(landY)
      .setVisible(rarity === 'legendary')
      .setAlpha(0);
    const parts = [d.gem, d.glow];
    // Hop: straight line from the monster to the landing spot plus an 18 px arc.
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 320,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 1;
        const x = fromX + (landX - fromX) * k;
        const y = fromY + (landY - fromY) * k - Math.sin(k * Math.PI) * 18;
        for (const p of parts) p.setPosition(x, y);
      },
    });
    if (rarity === 'legendary') {
      this.scene.tweens.add({
        targets: d.beam,
        alpha: 0.9,
        duration: 250,
        delay: 300,
        yoyo: true,
        hold: 600,
      });
    }
    const release = () => {
      for (const o of [d.gem, d.glow, d.beam]) o.setActive(false).setVisible(false);
    };
    this.scene.time.delayedCall(320 + 500, () => {
      if (!kept) {
        this.burst(d.gem.x, d.gem.y, color, 6);
        this.scene.tweens.add({
          targets: parts,
          scale: 0,
          alpha: 0,
          duration: 200,
          onComplete: release,
        });
        return;
      }
      const to = target();
      this.scene.tweens.add({
        targets: parts,
        x: to.x,
        y: to.y,
        scale: 0.6,
        duration: 450,
        ease: 'Cubic.easeIn',
        onStart: () => {
          d.gem.setDepth(100_002);
          d.glow.setDepth(100_002);
        },
        onComplete: release,
      });
    });
  }

  /** A potion bottle hops out and flies to the backpack. */
  dropPotion(fromX: number, fromY: number, target: () => { x: number; y: number }) {
    const img = this.scene.add.image(fromX, fromY, 'potion').setDepth(fromY + 1);
    this.scene.tweens.add({
      targets: img,
      y: fromY - 16,
      duration: 250,
      yoyo: true,
      onComplete: () => {
        const to = target();
        this.scene.tweens.add({
          targets: img,
          x: to.x,
          y: to.y,
          alpha: 0.4,
          duration: 450,
          delay: 300,
          ease: 'Cubic.easeIn',
          onComplete: () => img.destroy(),
        });
      },
    });
  }
}
