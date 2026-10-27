import {
  HIT_FX,
  OTSP_FX,
  hitFxFirstFrame,
  otspFxFirstFrame,
  otspMissileFirstFrame,
  otspSplashFrame,
  type Element,
  type HitFxName,
  type OtspFxName,
  type OtspMissileName,
  type OtspSplashColor,
  type OtspSplashName,
  type Rarity,
} from '@abismo/content';
import Phaser from 'phaser';
import { usePrefs } from '../state/prefs.ts';
import { rarityHex } from '../ui/rarity.ts';
import { TILE } from './actor.ts';

/** Spell and hit effects, drawn with the pixel effects of sprites/otspfx.png and hitfx.png. */
export type SpellFx =
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

/** Magic missile of each element that has its own (arcane and dark use a tinted orb). */
const BOLT: Record<'physical' | 'fire' | 'ice' | 'poison', OtspMissileName> = {
  physical: 'stone',
  fire: 'fire',
  ice: 'snowball',
  poison: 'poison',
};

/** Phaser animations for the pixel effects of hitfx.png and otspfx.png (created once). */
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
  for (const [name, a] of Object.entries(OTSP_FX) as [OtspFxName, (typeof OTSP_FX)[OtspFxName]][]) {
    const key = `otspfx:${name}`;
    if (scene.anims.exists(key)) continue;
    const first = otspFxFirstFrame(name);
    scene.anims.create({
      key,
      frames: Array.from({ length: a.frames }, (_, i) => ({ key: 'otspfx', frame: first + i })),
      frameRate: 1000 / a.frameMs,
      repeat: 0,
    });
  }
}

export type NumberKind = 'damage' | 'crit' | 'heal' | 'mana' | 'miss' | 'taken' | 'xp';

/** `null` colour: the element's. Physical hits keep white, gold crits and red damage taken. */
const NUMBER_STYLE: Record<NumberKind, { color: string | null; size: number }> = {
  damage: { color: null, size: 14 },
  crit: { color: null, size: 18 },
  heal: { color: '#7cf07c', size: 14 },
  mana: { color: '#6fb6ff', size: 14 },
  miss: { color: '#c8c4d4', size: 11 },
  taken: { color: null, size: 14 },
  xp: { color: '#f2ecff', size: 12 },
};

/** How long a stain stays on the floor before fading, and how many at most. */
const STAIN_MS = 12_000;
const MAX_STAINS = 24;
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
  private anims: Phaser.GameObjects.Sprite[] = [];
  private stains: Phaser.GameObjects.Image[] = [];
  private critLabel: Phaser.GameObjects.Text | null = null;
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
        strokeThickness: 4,
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
      .setStroke(kind === 'taken' ? '#4a0000' : '#000000', 4)
      .setFontSize(style.size)
      .setPosition(x + Phaser.Math.Between(-6, 6), y - 14)
      .setAlpha(1)
      .setScale(kind === 'crit' ? 1.5 : 1);
    // Numbers pop and hold a moment before drifting up, so a big hit can be read.
    this.scene.tweens.chain({
      targets: t,
      tweens: [
        { scale: 1, duration: 120, ease: 'Back.easeOut' },
        {
          y: t.y - (kind === 'xp' ? 18 : 24),
          alpha: 0,
          duration: kind === 'xp' ? 1100 : 750,
          delay: kind === 'crit' || kind === 'xp' ? 250 : 120,
          ease: 'Cubic.easeIn',
        },
      ],
      onComplete: () => t.setActive(false).setVisible(false),
    });
  }

  /** A red "CRIT" stamped over a critical hit; one at a time, the newest wins. */
  critStamp(x: number, y: number, text: string) {
    if (!usePrefs.getState().gfx.numbers) return;
    this.critLabel ??= this.scene.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
        fontStyle: 'bold italic',
        fontSize: '16px',
        color: '#ff3b2f',
        stroke: '#2a0000',
        strokeThickness: 5,
        resolution: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(100_002);
    const label = this.critLabel;
    this.scene.tweens.killTweensOf(label);
    label
      .setText(text)
      .setActive(true)
      .setVisible(true)
      .setPosition(x, y - 30)
      .setAlpha(1)
      .setScale(2.2)
      .setAngle(-8);
    this.scene.tweens.chain({
      targets: label,
      tweens: [
        { scale: 1, angle: -4, duration: 140, ease: 'Back.easeOut' },
        { alpha: 0, y: label.y - 8, duration: 300, delay: 350 },
      ],
      onComplete: () => label.setActive(false).setVisible(false),
    });
  }

  /**
   * A stain left on the floor at (x, y) (a kill's blood, by colour), under the actors. It
   * fades after a while; the oldest goes first when there are too many.
   */
  stain(x: number, y: number, color: OtspSplashColor, shape?: OtspSplashName) {
    if (!usePrefs.getState().gfx.hitFx) return;
    const pick: OtspSplashName = shape ?? (Math.random() < 0.6 ? 'pool' : 'drops');
    let img = this.stains.find((s) => !s.active);
    if (!img && this.stains.length >= MAX_STAINS) {
      img = this.stains.reduce((a, b) => ((a.getData('at') as number) < b.getData('at') ? a : b));
    }
    if (!img) {
      img = this.scene.add.image(0, 0, 'otspfx', 0).setOrigin(0.75).setDepth(1);
      this.stains.push(img);
    }
    const stain = img;
    this.scene.tweens.killTweensOf(stain);
    stain
      .setFrame(otspSplashFrame(pick, color))
      .setActive(true)
      .setVisible(true)
      .setAlpha(0.9)
      .setFlipX(Math.random() < 0.5)
      .setPosition(x + Phaser.Math.Between(-4, 4), y + 6)
      .setData('at', this.scene.time.now);
    this.scene.tweens.add({
      targets: stain,
      alpha: 0,
      delay: STAIN_MS,
      duration: 1500,
      onComplete: () => stain.setActive(false).setVisible(false),
    });
  }

  /** Plays a pixel effect of hitfx.png once at (x, y), from a pool of sprites. */
  pixelFx(name: HitFxName, x: number, y: number, scale = 1, flipX = false) {
    this.playAnim(`hitfx:${name}`, 'hitfx', x, y, 0.5, scale, flipX);
  }

  /**
   * Plays a magic effect of otspfx.png once on the tile whose centre is (x, y), the way the
   * pack draws it (the 2×2 ones spill up and to the left). `tint` multiplies its colours.
   */
  tibiaFx(name: OtspFxName, x: number, y: number, o: { scale?: number; tint?: number } = {}) {
    const s = this.playAnim(`otspfx:${name}`, 'otspfx', x, y, 0.75, o.scale ?? 1);
    if (o.tint !== undefined) s.setTint(o.tint);
  }

  private playAnim(
    key: string,
    texture: string,
    x: number,
    y: number,
    origin: number,
    scale: number,
    flipX = false,
  ): Phaser.GameObjects.Sprite {
    const free = this.anims.find((a) => !a.active);
    const sprite = free ?? this.scene.add.sprite(0, 0, texture, 0);
    if (!free) {
      this.anims.push(sprite);
      sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
        sprite.setActive(false).setVisible(false),
      );
    }
    return sprite
      .setActive(true)
      .setVisible(true)
      .setTexture(texture)
      .clearTint()
      .setOrigin(origin)
      .setPosition(x, y)
      .setScale(scale)
      .setFlipX(flipX)
      .setDepth(100_001)
      .play(key);
  }

  /**
   * An effect on every tile of a square of `radius` tiles around (x, y), all at once, as area
   * spells look in the pack's games. `skipCentre` leaves the caster's own tile out.
   */
  private area(name: OtspFxName, x: number, y: number, radius: number, skipCentre = false) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (skipCentre && dx === 0 && dy === 0) continue;
        // Corners left out from radius 2, so the area reads round.
        if (radius > 1 && Math.abs(dx) === radius && Math.abs(dy) === radius) continue;
        this.tibiaFx(name, x + dx * TILE, y + dy * TILE);
      }
    }
  }

  /** Stars turning over a stunned head. */
  private stunned(x: number, y: number) {
    for (let k = 0; k < 2; k++) {
      this.scene.time.delayedCall(k * 180, () => this.tibiaFx('block', x, y - 22));
    }
  }

  /** A blow landing on a creature, by element (hero and monsters alike). */
  hit(element: Element, x: number, y: number) {
    if (!usePrefs.getState().gfx.hitFx) return;
    switch (element) {
      case 'physical':
        this.tibiaFx('blood', x, y);
        break;
      case 'fire':
        this.tibiaFx('fire', x, y);
        break;
      case 'ice':
        this.pixelFx('shards', x, y - 4);
        break;
      case 'poison':
        this.tibiaFx('poison', x, y);
        break;
      case 'arcane':
        this.tibiaFx('sparkle', x, y);
        break;
      case 'dark':
        this.tibiaFx('sparkle', x, y, { tint: 0xe070c8 });
        break;
    }
  }

  /** A spell or hit effect at (x, y); `to` is the target of effects that travel (charge). */
  spell(kind: SpellFx, x: number, y: number, to?: { x: number; y: number }) {
    // Level up keeps its effect: it is news, not noise.
    if (!usePrefs.getState().gfx.hitFx && kind !== 'levelup' && kind !== 'teleport') return;
    switch (kind) {
      case 'crit':
        this.pixelFx('blast', x, y - 6);
        break;
      case 'heavy':
        this.tibiaFx('explosion', x, y);
        break;
      case 'whirl':
        this.area('blood', x, y, 1, true);
        break;
      case 'warcry':
        this.tibiaFx('redRing', x, y, { scale: 2 });
        this.area('redRing', x, y, 1, true);
        break;
      case 'charge': {
        if (!to) break;
        // Dust along the path and a rock bursting under the target, who is stunned.
        const steps = Math.max(1, Math.round(Math.hypot(to.x - x, to.y - y) / TILE));
        for (let k = 0; k < steps; k++) {
          const f = k / steps;
          this.tibiaFx('dust', x + (to.x - x) * f, y + (to.y - y) * f);
        }
        this.tibiaFx('rock', to.x, to.y);
        this.stunned(to.x, to.y);
        break;
      }
      case 'death':
        this.pixelFx('splash', x, y - 4);
        break;
      case 'potion':
        this.tibiaFx('sparkle', x, y, { tint: 0x9dffb0 });
        break;
      case 'teleport':
        this.tibiaFx('sparkle', x, y, { scale: 1.5 });
        break;
      case 'aimed':
        this.tibiaFx('block', x, y);
        this.pixelFx('blast', x, y - 6);
        break;
      case 'arrowRain':
        this.arrowRain(x, y);
        break;
      case 'pin':
        this.tibiaFx('dust', x, y);
        this.stunned(x, y);
        break;
      case 'focus':
        this.tibiaFx('glitter', x, y, { scale: 1.5 });
        break;
      case 'arcane':
        this.tibiaFx('sparkle', x, y, { tint: 0xd8b0ff });
        break;
      case 'empower':
        this.tibiaFx('sparkle', x, y, { tint: 0xd8b0ff, scale: 1.5 });
        this.area('glitter', x, y, 1, true);
        break;
      case 'fireball':
        this.area('fire', x, y, 1);
        this.tibiaFx('explosion', x, y);
        break;
      case 'frost':
        this.area('bubbles', x, y, 1, true);
        this.tibiaFx('ice', x, y);
        break;
      case 'levelup':
        this.tibiaFx('sparkle', x, y, { scale: 1.5 });
        this.area('glitter', x, y, 2);
        break;
    }
  }

  /** Arrows falling on random tiles around (x, y), each landing with yellow sparks. */
  private arrowRain(x: number, y: number) {
    const tiles = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ dx, dy })));
    Phaser.Utils.Array.Shuffle(tiles);
    tiles.slice(0, 6).forEach(({ dx, dy }, k) => {
      const tx = x + dx * TILE;
      const ty = y + dy * TILE;
      this.scene.time.delayedCall(k * 60, () =>
        this.missile('arrow', { x: tx, y: ty - 4 * TILE }, { x: tx, y: ty }, 1, 200, () =>
          this.tibiaFx('block', tx, ty),
        ),
      );
    });
  }

  /** A monster's blow landing on the hero, by element. Bosses add a red ring. */
  monsterHit(element: Element, x: number, y: number, boss: boolean) {
    if (!usePrefs.getState().gfx.hitFx) return;
    if (element === 'physical') this.pixelFx('claw', x, y - 4, 1, Math.random() < 0.5);
    else this.hit(element, x, y);
    if (boss) this.tibiaFx('redRing', x, y, { scale: 1.5 });
  }

  burst(x: number, y: number, color: number, count = 10) {
    if (this.reducedMotion) return;
    this.sparks.setParticleTint(color);
    this.sparks.explode(count, x, y);
  }

  /**
   * Flies a missile of otspfx.png from `from` to `to` (tile centres), facing the nearest of
   * its eight directions, and runs `onHit` on arrival.
   */
  private missile(
    name: OtspMissileName,
    from: { x: number; y: number },
    to: { x: number; y: number },
    scale: number,
    duration: number,
    onHit: () => void,
    tint?: number,
  ) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    // Column and row of the direction in the 3×3 block: west/north 0, centre 1, east/south 2.
    const len = Math.hypot(dx, dy) || 1;
    const col = Math.round(dx / len + 1);
    const row = Math.round(dy / len + 1);
    const cell = row * 3 + col === 4 ? 7 : row * 3 + col;
    const shot = this.scene.add
      .image(from.x, from.y, 'otspfx', otspMissileFirstFrame(name) + cell)
      .setOrigin(0.75)
      .setScale(scale)
      .setDepth(100_000);
    if (tint !== undefined) shot.setTint(tint);
    this.scene.tweens.add({
      targets: shot,
      x: to.x,
      y: to.y,
      duration,
      onComplete: () => {
        shot.destroy();
        onHit();
      },
    });
  }

  /**
   * An arrow or a magic missile (by element) flying from `from` to `to`; `onHit` runs on
   * arrival (the damage numbers and effects show then). `big` is for skills such as the
   * fireball.
   */
  projectile(
    from: { x: number; y: number },
    to: { x: number; y: number },
    kind: 'arrow' | 'bolt',
    onHit: () => void,
    o: { element?: Element; big?: boolean } = {},
  ) {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const duration = Math.max(80, Math.min(o.big ? 300 : 240, dist * (o.big ? 2.4 : 2)));
    const element = o.element ?? 'arcane';
    const name: OtspMissileName =
      kind === 'arrow'
        ? 'arrow'
        : element === 'arcane' || element === 'dark'
          ? 'orb'
          : BOLT[element];
    const tint = name === 'orb' ? (element === 'dark' ? 0xff80e0 : 0xd8b0ff) : undefined;
    this.missile(name, from, to, o.big ? 1.25 : 1, duration, onHit, tint);
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
