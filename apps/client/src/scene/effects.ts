import {
  FX_FRAMES,
  HIT_FX,
  hitFxFirstFrame,
  type Element,
  type FxFrame,
  type HitFxName,
  type Rarity,
} from '@abismo/content';
import Phaser from 'phaser';
import { usePrefs } from '../state/prefs.ts';
import { rarityHex } from '../ui/rarity.ts';

/** Spell and hit effects, drawn with the particle textures of sprites/fx.png. */
export type SpellFx =
  | 'slash'
  | 'heavy'
  | 'whirl'
  | 'warcry'
  | 'charge'
  | 'crit'
  | 'death'
  | 'potion'
  | 'levelup'
  | 'teleport'
  | 'aimed'
  | 'arrowRain'
  | 'pin'
  | 'focus'
  | 'arcane'
  | 'empower'
  | 'fireball'
  | 'frost';

/** Skill effect ids from content (skills.json `effect`) to the scene's effects. */
export const SKILL_FX: Record<string, SpellFx> = {
  'fx/heavy_strike': 'heavy',
  'fx/war_cry': 'warcry',
  'fx/whirlwind': 'whirl',
  'fx/charge': 'charge',
  'fx/aimed_shot': 'aimed',
  'fx/arrow_rain': 'arrowRain',
  'fx/pinning_shot': 'pin',
  'fx/focus': 'focus',
  'fx/arcane_bolt': 'arcane',
  'fx/empower': 'empower',
  'fx/fireball': 'fireball',
  'fx/frost_prison': 'frost',
};

/** Effects drawn on the hero (buffs and spins); the others land on the target. */
export const SELF_FX: ReadonlySet<SpellFx> = new Set(['whirl', 'warcry', 'focus', 'empower']);

/** Colour of each damage element, for the numbers and the effect tints. */
export const ELEMENT_COLOR: Record<Element, string> = {
  physical: '#ffffff',
  fire: '#ff9a3c',
  ice: '#8fe3ff',
  arcane: '#c58bff',
  poison: '#a6e05a',
  dark: '#e070c8',
};
export const elementTint = (e: Element) => parseInt(ELEMENT_COLOR[e].slice(1), 16);

const frameOf = (name: FxFrame) => FX_FRAMES.indexOf(name);

/** Phaser animations for the pixel effects of hitfx.png (created once per game). */
export function createHitFxAnimations(scene: Phaser.Scene) {
  for (const [name, a] of Object.entries(HIT_FX) as [HitFxName, (typeof HIT_FX)[HitFxName]][]) {
    const key = `hitfx:${name}`;
    if (scene.anims.exists(key)) continue;
    const first = hitFxFirstFrame(name);
    scene.anims.create({
      key,
      frames: a.cells.map((_, i) => ({ key: 'hitfx', frame: first + i })),
      frameRate: 1000 / a.frameMs,
      repeat: 0,
    });
  }
}

export type NumberKind = 'damage' | 'crit' | 'heal' | 'mana' | 'miss' | 'taken';

/** `null` colour: the element's. Physical hits keep white, gold crits and red damage taken. */
const NUMBER_STYLE: Record<NumberKind, { color: string | null; size: number }> = {
  damage: { color: null, size: 12 },
  crit: { color: null, size: 16 },
  heal: { color: '#7cf07c', size: 12 },
  mana: { color: '#6fb6ff', size: 12 },
  miss: { color: '#c8c4d4', size: 11 },
  taken: { color: null, size: 12 },
};
const PHYSICAL_COLOR: Partial<Record<NumberKind, string>> = { crit: '#ffd84a', taken: '#ff6b5e' };

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
  private glows: Phaser.GameObjects.Image[] = [];
  private anims: Phaser.GameObjects.Sprite[] = [];
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
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
        fontStyle: 'bold',
        fontSize: '11px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        resolution: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(100_001);
    this.numbers.push(t);
    return t;
  }

  number(x: number, y: number, text: string, kind: NumberKind, element: Element = 'physical') {
    if (!usePrefs.getState().gfx.numbers) return;
    const t = this.takeNumber();
    const style = NUMBER_STYLE[kind];
    const color =
      style.color ??
      (element === 'physical' ? PHYSICAL_COLOR[kind] : undefined) ??
      ELEMENT_COLOR[element];
    t.setText(text)
      .setColor(color)
      // Damage taken has a dark red outline, so a fire hit on the hero never reads as one
      // dealt by the hero.
      .setStroke(kind === 'taken' ? '#4a0000' : '#000000', 3)
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

  private takeGlow(): Phaser.GameObjects.Image {
    const free = this.glows.find((g) => !g.active);
    const g = free ?? this.scene.add.image(0, 0, 'fx', 0);
    if (!free) this.glows.push(g);
    this.scene.tweens.killTweensOf(g);
    return g
      .setActive(true)
      .setVisible(true)
      .setAlpha(1)
      .setAngle(0)
      .setScale(1)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  /** Plays a pixel effect animation once at (x, y), from a pool of sprites. */
  pixelFx(name: HitFxName, x: number, y: number, scale = 1.5, flipX = false) {
    if (!usePrefs.getState().gfx.hitFx && name !== 'energy') return;
    const free = this.anims.find((a) => !a.active);
    const sprite = free ?? this.scene.add.sprite(0, 0, 'hitfx', 0);
    if (!free) {
      this.anims.push(sprite);
      sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
        sprite.setActive(false).setVisible(false),
      );
    }
    sprite
      .setActive(true)
      .setVisible(true)
      .setPosition(x, y)
      .setScale(scale)
      .setFlipX(flipX)
      .setDepth(100_001)
      .play(`hitfx:${name}`);
  }

  /** One textured flash: grows or shrinks, turns, fades, then returns to the pool. */
  private glow(
    name: FxFrame,
    x: number,
    y: number,
    o: {
      tint: number;
      from: number;
      to: number;
      ms: number;
      angle?: number;
      spin?: number;
      rise?: number;
      alpha?: number;
      delay?: number;
      normal?: boolean;
    },
  ) {
    const g = this.takeGlow()
      .setFrame(frameOf(name))
      .setPosition(x, y)
      .setTint(o.tint)
      .setScale(o.from)
      .setAngle(o.angle ?? 0)
      .setAlpha(o.alpha ?? 1)
      .setDepth(100_000);
    if (o.normal) g.setBlendMode(Phaser.BlendModes.NORMAL);
    if (o.delay) g.setVisible(false);
    this.scene.tweens.add({
      targets: g,
      scale: o.to,
      alpha: 0,
      angle: (o.angle ?? 0) + (this.reducedMotion ? 0 : (o.spin ?? 0)),
      y: y - (o.rise ?? 0),
      duration: o.ms,
      delay: o.delay ?? 0,
      ease: 'Cubic.easeOut',
      onStart: () => g.setVisible(true),
      onComplete: () => g.setActive(false).setVisible(false),
    });
  }

  /**
   * A spell or hit effect at (x, y); `to` is the target of effects that travel (charge).
   * The textures are 128 px, so a scale of 0.25 covers one tile.
   */
  spell(kind: SpellFx, x: number, y: number, to?: { x: number; y: number }) {
    // Level up keeps its effect: it is news, not noise.
    if (!usePrefs.getState().gfx.hitFx && kind !== 'levelup' && kind !== 'teleport') return;
    const dir = to ? Phaser.Math.RadToDeg(Math.atan2(to.y - y, to.x - x)) : 0;
    switch (kind) {
      case 'slash': {
        const angle = dir + Phaser.Math.Between(-30, 30);
        this.glow('slash_03', x, y - 4, { tint: 0xffffff, from: 0.26, to: 0.36, ms: 180, angle });
        this.glow('slash_02', x, y - 4, {
          tint: 0xffe2a0,
          from: 0.2,
          to: 0.3,
          ms: 220,
          angle: angle + 180,
          alpha: 0.7,
        });
        this.glow('star_04', x, y - 6, { tint: 0xffffff, from: 0.12, to: 0.02, ms: 160 });
        if (!this.reducedMotion) {
          this.sparks.setParticleTint(0xffe2a0);
          this.sparks.explode(4, x, y - 6);
        }
        break;
      }
      case 'crit':
        this.pixelFx('blast', x, y - 8, 1.6);
        this.glow('star_06', x, y - 6, { tint: 0xffd84a, from: 0.15, to: 0.45, ms: 280, spin: 45 });
        break;
      case 'heavy':
        this.pixelFx('blast', x, y - 8, 2);
        this.glow('slash_04', x, y, { tint: 0xffb050, from: 0.3, to: 0.55, ms: 300, angle: dir });
        this.glow('star_06', x, y, { tint: 0xffe2a0, from: 0.2, to: 0.5, ms: 260, spin: 30 });
        this.glow('scorch_01', x, y + 8, {
          tint: 0xff7030,
          from: 0.2,
          to: 0.35,
          ms: 500,
          alpha: 0.7,
        });
        break;
      case 'whirl':
        this.pixelFx('sweep', x - 14, y - 6, 1.6, true);
        this.pixelFx('sweep', x + 14, y - 6, 1.6);
        this.glow('twirl_01', x, y, { tint: 0xbfe4ff, from: 0.45, to: 0.6, ms: 450, spin: 540 });
        this.glow('twirl_02', x, y, {
          tint: 0xbfe4ff,
          from: 0.45,
          to: 0.6,
          ms: 450,
          spin: 540,
          delay: 120,
        });
        this.glow('circle_05', x, y, { tint: 0x7fb8ff, from: 0.3, to: 0.7, ms: 400, alpha: 0.6 });
        break;
      case 'warcry':
        this.pixelFx('ring', x, y - 8, 2.4);
        this.glow('circle_03', x, y, { tint: 0xff5a40, from: 0.1, to: 0.9, ms: 550 });
        this.glow('magic_03', x, y - 18, {
          tint: 0xffd060,
          from: 0.2,
          to: 0.35,
          ms: 600,
          spin: 90,
        });
        this.glow('flame_01', x, y - 8, {
          tint: 0xff7a30,
          from: 0.25,
          to: 0.35,
          ms: 500,
          rise: 14,
        });
        break;
      case 'charge': {
        if (!to) break;
        const len = Math.hypot(to.x - x, to.y - y);
        const trail = this.takeGlow()
          .setFrame(frameOf('trace_01'))
          .setPosition((x + to.x) / 2, (y + to.y) / 2)
          .setTint(0x9fe0ff)
          .setAngle(dir + 90)
          .setScale(0.35, Math.max(0.2, len / 128))
          .setDepth(100_000);
        this.scene.tweens.add({
          targets: trail,
          alpha: 0,
          duration: 300,
          onComplete: () => trail.setActive(false).setVisible(false),
        });
        this.glow('muzzle_02', to.x, to.y, {
          tint: 0x9fe0ff,
          from: 0.2,
          to: 0.4,
          ms: 260,
          angle: dir + 90,
        });
        this.pixelFx('shards', to.x, to.y - 8, 1.4);
        // Stunned: little stars over the target.
        for (let k = 0; k < 3; k++) {
          this.glow('star_04', to.x - 10 + k * 10, to.y - 26, {
            tint: 0xfff07a,
            from: 0.12,
            to: 0.08,
            ms: 1200,
            spin: 180,
            delay: 150 + k * 60,
          });
        }
        break;
      }
      case 'death':
        this.pixelFx('splash', x, y - 4, 1.3);
        this.glow('smoke_04', x, y, {
          tint: 0x8a8494,
          from: 0.2,
          to: 0.45,
          ms: 650,
          rise: 10,
          alpha: 0.75,
          normal: true,
        });
        break;
      case 'potion':
        this.glow('magic_05', x, y - 6, {
          tint: 0x7aff8a,
          from: 0.15,
          to: 0.35,
          ms: 500,
          rise: 14,
        });
        break;
      case 'teleport':
        this.pixelFx('energy', x, y - 10, 2);
        this.glow('light_03', x, y - 8, { tint: 0x8fd8ff, from: 0.2, to: 0.8, ms: 600 });
        this.glow('circle_03', x, y + 4, { tint: 0x8fd8ff, from: 0.1, to: 0.6, ms: 500 });
        break;
      case 'aimed':
        // A precise shot: a bright flash where the arrow lands and a spinning gold star.
        this.pixelFx('blast', x, y - 8, 1.2);
        this.glow('muzzle_02', x, y - 8, {
          tint: 0xfff0c0,
          from: 0.25,
          to: 0.45,
          ms: 240,
          angle: dir + 90,
        });
        this.glow('star_06', x, y - 8, { tint: 0xffd84a, from: 0.12, to: 0.4, ms: 320, spin: 90 });
        break;
      case 'arrowRain':
        this.arrowRain(x, y);
        break;
      case 'pin':
        // Pinned to the ground: a ring of roots at the feet and stun stars over the head.
        this.pixelFx('shards', x, y - 8, 1.1);
        this.glow('circle_01', x, y + 6, {
          tint: 0x9bd36a,
          from: 0.35,
          to: 0.2,
          ms: 900,
          alpha: 0.8,
        });
        for (let k = 0; k < 3; k++) {
          this.glow('star_04', x - 10 + k * 10, y - 26, {
            tint: 0xfff07a,
            from: 0.12,
            to: 0.08,
            ms: 1100,
            spin: 180,
            delay: 120 + k * 60,
          });
        }
        break;
      case 'focus':
        this.glow('circle_03', x, y + 4, { tint: 0x8cff9a, from: 0.1, to: 0.7, ms: 550 });
        this.glow('symbol_01', x, y - 20, {
          tint: 0x8cff9a,
          from: 0.18,
          to: 0.26,
          ms: 800,
          rise: 16,
        });
        this.glow('light_01', x, y - 8, {
          tint: 0xc8ffd0,
          from: 0.2,
          to: 0.5,
          ms: 450,
          alpha: 0.6,
        });
        break;
      case 'arcane':
        this.pixelFx('energy', x, y - 8, 1.6);
        this.glow('magic_04', x, y - 8, {
          tint: 0xc58bff,
          from: 0.2,
          to: 0.45,
          ms: 420,
          spin: 120,
        });
        this.glow('star_06', x, y - 8, {
          tint: 0xe6d0ff,
          from: 0.15,
          to: 0.35,
          ms: 260,
          spin: -60,
        });
        this.burst(x, y - 8, 0xc58bff, 8);
        break;
      case 'empower':
        this.glow('magic_02', x, y + 8, {
          tint: 0xc58bff,
          from: 0.3,
          to: 0.5,
          ms: 1000,
          spin: 200,
        });
        this.glow('light_03', x, y - 8, { tint: 0xb07cff, from: 0.2, to: 0.7, ms: 700 });
        for (let k = 0; k < 2; k++) {
          this.glow('flame_01', x - 8 + k * 16, y - 4, {
            tint: 0xc58bff,
            from: 0.18,
            to: 0.26,
            ms: 600,
            rise: 18,
            delay: k * 120,
          });
        }
        break;
      case 'fireball':
        this.pixelFx('blast', x, y - 8, 2.2);
        this.glow('fire_01', x, y - 8, { tint: 0xff8a30, from: 0.25, to: 0.6, ms: 420, spin: 40 });
        this.glow('flame_03', x, y - 10, {
          tint: 0xffb050,
          from: 0.25,
          to: 0.35,
          ms: 600,
          rise: 18,
        });
        this.glow('scorch_01', x, y + 8, {
          tint: 0xff5a20,
          from: 0.25,
          to: 0.4,
          ms: 700,
          alpha: 0.8,
        });
        this.burst(x, y - 8, 0xff9a3c, 12);
        break;
      case 'frost':
        this.pixelFx('shards', x, y - 8, 2);
        this.glow('circle_05', x, y + 2, { tint: 0x8fe3ff, from: 0.25, to: 0.6, ms: 500 });
        this.glow('light_03', x, y - 8, { tint: 0xd8f6ff, from: 0.2, to: 0.5, ms: 600 });
        for (let k = 0; k < 4; k++) {
          this.glow('star_04', x + Phaser.Math.Between(-14, 14), y + Phaser.Math.Between(-4, 6), {
            tint: 0xbff0ff,
            from: 0.12,
            to: 0.04,
            ms: 900,
            rise: 22,
            delay: k * 80,
          });
        }
        break;
      case 'levelup': {
        this.pixelFx('energy', x, y - 10, 2.4);
        // A column of golden light, a rune turning under the feet, rings and rising stars.
        const pillar = this.takeGlow()
          .setFrame(frameOf('trace_01'))
          .setPosition(x, y - 30)
          .setTint(0xffd36a)
          .setScale(0.9, 0.2)
          .setDepth(100_000);
        this.scene.tweens.add({
          targets: pillar,
          scaleY: 1.4,
          alpha: { from: 1, to: 0 },
          duration: 1100,
          ease: 'Cubic.easeOut',
          onComplete: () => pillar.setActive(false).setVisible(false),
        });
        this.glow('magic_02', x, y + 10, {
          tint: 0xffe9a0,
          from: 0.35,
          to: 0.55,
          ms: 1400,
          spin: 220,
        });
        this.glow('light_03', x, y - 8, { tint: 0xffd36a, from: 0.2, to: 1.1, ms: 1000 });
        for (let k = 0; k < 3; k++) {
          this.glow('circle_03', x, y + 4, {
            tint: 0xffc04a,
            from: 0.1,
            to: 0.8,
            ms: 700,
            delay: k * 220,
          });
        }
        for (let k = 0; k < 8; k++) {
          this.glow('star_04', x + Phaser.Math.Between(-18, 18), y + Phaser.Math.Between(-6, 10), {
            tint: 0xfff3b0,
            from: 0.14,
            to: 0.05,
            ms: 1100,
            rise: 40,
            spin: 180,
            delay: 150 + k * 90,
          });
        }
        break;
      }
    }
  }

  /** Arrows falling from the sky around (x, y), each landing with a few sparks. */
  private arrowRain(x: number, y: number) {
    for (let k = 0; k < 6; k++) {
      const tx = x + Phaser.Math.Between(-20, 20);
      const ty = y + Phaser.Math.Between(-10, 8);
      const arrow = this.scene.add
        .rectangle(tx - 10, ty - 90, 2, 14, 0xe8d8b0)
        .setAngle(-8)
        .setDepth(100_000)
        .setVisible(false);
      this.scene.tweens.add({
        targets: arrow,
        x: tx,
        y: ty - 6,
        duration: 220,
        delay: k * 55,
        ease: 'Quad.easeIn',
        onStart: () => arrow.setVisible(true),
        onComplete: () => {
          arrow.destroy();
          this.burst(tx, ty - 4, 0xffe2a0, 3);
        },
      });
    }
    this.glow('circle_05', x, y + 4, {
      tint: 0xffe2a0,
      from: 0.3,
      to: 0.6,
      ms: 400,
      delay: 300,
      alpha: 0.6,
    });
  }

  /**
   * A monster's blow landing on the hero, by element: claw marks, a burst of fire, a green
   * puff of poison, ice shards, a dark swirl or an arcane flash. Bosses add a shockwave.
   */
  monsterHit(element: Element, x: number, y: number, boss: boolean) {
    if (!usePrefs.getState().gfx.hitFx) return;
    switch (element) {
      case 'physical':
        this.pixelFx('claw', x, y - 6, 1.2, Math.random() < 0.5);
        break;
      case 'fire':
        this.pixelFx('blast', x, y - 8, 1.2);
        this.glow('flame_01', x, y - 6, { tint: 0xff8a30, from: 0.2, to: 0.28, ms: 450, rise: 14 });
        break;
      case 'poison':
        this.glow('smoke_04', x, y - 6, {
          tint: 0x8fd34a,
          from: 0.18,
          to: 0.38,
          ms: 650,
          rise: 10,
          alpha: 0.85,
          normal: true,
        });
        this.burst(x, y - 8, 0xa6e05a, 6);
        break;
      case 'ice':
        this.pixelFx('shards', x, y - 8, 1.2);
        this.glow('circle_05', x, y, { tint: 0x8fe3ff, from: 0.15, to: 0.35, ms: 350 });
        break;
      case 'dark':
        this.pixelFx('claw', x, y - 6, 1.2, Math.random() < 0.5);
        this.glow('magic_03', x, y - 8, {
          tint: 0xe070c8,
          from: 0.15,
          to: 0.35,
          ms: 450,
          spin: -90,
        });
        break;
      case 'arcane':
        this.pixelFx('energy', x, y - 8, 1.2);
        break;
    }
    if (boss) {
      this.glow('circle_03', x, y + 6, {
        tint: elementTint(element === 'physical' ? 'fire' : element),
        from: 0.15,
        to: 0.75,
        ms: 450,
      });
    }
  }

  burst(x: number, y: number, color: number, count = 10) {
    if (this.reducedMotion) return;
    this.sparks.setParticleTint(color);
    this.sparks.explode(count, x, y);
  }

  /**
   * An arrow (a thin shaft) or a magic bolt (a glowing orb, in the element's colour, with a
   * trail of sparks) flying from `from` to `to`; `onHit` runs on arrival (the damage numbers
   * and effects show then). `big` is for skills such as the fireball.
   */
  projectile(
    from: { x: number; y: number },
    to: { x: number; y: number },
    kind: 'arrow' | 'bolt',
    onHit: () => void,
    o: { element?: Element; big?: boolean } = {},
  ) {
    const sx = from.x;
    const sy = from.y - 14;
    const tx = to.x;
    const ty = to.y - 12;
    const dist = Math.hypot(tx - sx, ty - sy);
    const duration = Math.max(90, Math.min(o.big ? 340 : 260, dist * (o.big ? 2.8 : 2.2)));
    const tint = elementTint(o.element ?? 'arcane');
    const shot =
      kind === 'arrow'
        ? this.scene.add
            .rectangle(sx, sy, o.big ? 18 : 14, o.big ? 3 : 2, 0xe8d8b0)
            .setRotation(Math.atan2(ty - sy, tx - sx))
        : this.scene.add
            .image(sx, sy, 'glow')
            .setTint(tint)
            .setScale(o.big ? 0.85 : 0.5)
            .setBlendMode(Phaser.BlendModes.ADD);
    shot.setDepth(100_000);
    let trail = 0;
    this.scene.tweens.add({
      targets: shot,
      x: tx,
      y: ty,
      duration,
      onUpdate: () => {
        if (kind !== 'bolt' || this.reducedMotion || ++trail % 3 !== 0) return;
        this.sparks.setParticleTint(tint);
        this.sparks.explode(1, shot.x, shot.y);
      },
      onComplete: () => {
        shot.destroy();
        if (kind === 'bolt') this.burst(tx, ty, tint, 6);
        onHit();
      },
    });
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
    if (!usePrefs.getState().gfx.lootFx) return;
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
