import type { ContentDb } from '@valdren/content';
import { TICK_MS, type GameEvent, type SlotState } from '@valdren/engine';
import { Application, Container, Graphics, TextureStyle, type Ticker } from 'pixi.js';
import type { GatherAnim } from './anims.ts';
import { Banner, FloatingTextPool, LootPool, ParticlePool } from './effects.ts';
import { Hero } from './hero.ts';
import {
  BACKDROPS,
  IconCache,
  PARTICLE_COLORS,
  drawProp,
  OUTLINE,
  type BackdropArt,
} from './placeholders.ts';

export const VIRTUAL_W = 480;
export const VIRTUAL_H = 270;
const GROUND_Y = 222;
const HERO_X = Math.round(VIRTUAL_W * 0.3);
const PROP_X = HERO_X + 30;
const BAG = { x: VIRTUAL_W - 16, y: 16 };
/** Events older than this when they come due are applied without animation (e.g. after a hidden tab). */
const STALE_EVENT_MS = 1500;
const DEPLETE_EVERY = 10;
const DEPLETE_MS = 1000;
/** Ideal length of one gather swing; the real one divides the action duration evenly. */
const SWING_MS = 750;
/** Below this fraction of the available space, integer scaling gives way to fit-to-space. */
const MIN_FILL = 0.8;
const RESYNC_FADE_MS = 200;

export interface SceneTexts {
  xpGain: (xpTenths: number) => string;
  levelUp: (skill: string, level: number) => string;
}

interface Scheduled {
  at: number;
  event: GameEvent;
}

interface ParallaxLayer {
  container: Container;
  factor: number;
}

/**
 * The scene only draws what the engine produced: every visual change below is triggered by
 * a GameEvent at the wall-clock time of its tick (one tick behind the simulation).
 */
export class GameScene {
  readonly app = new Application();
  private readonly root = new Container();
  private readonly sky = new Graphics();
  private readonly parallax: ParallaxLayer[] = [];
  private readonly ground = new Graphics();
  private readonly actors = new Container();
  private readonly effectsLayer = new Container();
  private readonly floatingLayer = new Container();
  private readonly uiLayer = new Container();
  private readonly clouds = new Graphics();
  private readonly bag = new Graphics();
  private hero!: Hero;
  private particles!: ParticlePool;
  private floating!: FloatingTextPool;
  private loot!: LootPool;
  private banner!: Banner;
  private icons!: IconCache;
  private prop: Container | null = null;
  private propKey = '';
  private particleKey = 'default';
  private backdropKey = '';
  private scroll = 0;
  private walkUntil = 0;
  private propHiddenUntil = 0;
  private bagBump = 0;
  private queue: Scheduled[] = [];
  private host: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private paused = false;
  private fadeStart = 0;

  constructor(
    private readonly content: ContentDb,
    private readonly tickToMs: (tick: number) => number,
    private readonly texts: SceneTexts,
  ) {}

  async mount(host: HTMLElement): Promise<void> {
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    await this.app.init({
      width: VIRTUAL_W,
      height: VIRTUAL_H,
      antialias: false,
      autoDensity: false,
      resolution: 1,
      backgroundAlpha: 0,
    });
    this.host = host;
    host.appendChild(this.app.canvas);
    this.icons = new IconCache(this.app.renderer);

    this.root.addChild(this.sky);
    for (const factor of [0.1, 0.3, 0.6]) {
      const container = new Container();
      this.parallax.push({ container, factor });
      this.root.addChild(container);
    }
    this.parallax[0]!.container.addChild(this.clouds);
    this.root.addChild(
      this.ground,
      this.actors,
      this.effectsLayer,
      this.floatingLayer,
      this.uiLayer,
    );
    this.app.stage.addChild(this.root);

    this.hero = new Hero({ skin: 0xe0b48a, hair: 0x4a2f22, outfit: 0x3f6db0 });
    this.hero.position.set(HERO_X, GROUND_Y);
    this.hero.onImpact = () => this.onSwingImpact();
    this.actors.addChild(this.hero);

    this.particles = new ParticlePool(this.effectsLayer);
    this.floating = new FloatingTextPool(this.floatingLayer);
    this.loot = new LootPool(this.effectsLayer, BAG);
    this.loot.onArrive = () => (this.bagBump = 1);
    this.banner = new Banner(VIRTUAL_W);
    this.drawBag();
    this.uiLayer.addChild(this.bag, this.banner);

    this.setBackdrop('bg/brumaporto');
    this.hero.idle(Date.now());

    this.app.ticker.add(this.update);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private destroyed = false;

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver?.disconnect();
    this.app.destroy(true, { children: true });
  }

  /**
   * Initial state (or a resync): put the hero where the state says without replaying events.
   * With `fade`, the scene fades in over 200 ms (section 7.4) so the jump is not jarring.
   */
  sync(state: SlotState, fade = false): void {
    this.queue = [];
    const now = Date.now();
    if (fade) this.fadeStart = now;
    const activity = state.activity;
    if (!activity) {
      this.clearActivity(now);
      return;
    }
    this.setActivity(
      activity.actionId,
      activity.startedTick + activity.durationTicks,
      activity.durationTicks,
      now,
      false,
    );
  }

  /** Engine events, in order. They are played when their tick comes due. */
  push(events: readonly GameEvent[]): void {
    for (const event of events) this.queue.push({ at: this.tickToMs(event.tick), event });
  }

  setAppearance(appearance: { skin: number; hair: number; outfit: number }): void {
    this.hero.setAppearance(appearance);
  }

  setEquippedWeapon(itemId: string | null): void {
    this.hero.setEquippedWeapon(itemId === 'dagger_bronze' ? 'dagger_bronze' : 'none');
  }

  private update = (ticker: Ticker) => {
    if (this.paused) return;
    const now = Date.now();
    const dt = Math.min(0.1, ticker.deltaMS / 1000);

    let handled = 0;
    while (handled < this.queue.length && this.queue[handled]!.at <= now) {
      const { at, event } = this.queue[handled]!;
      this.play(event, at, now - at > STALE_EVENT_MS);
      handled++;
    }
    if (handled > 0) this.queue.splice(0, handled);

    if (now < this.walkUntil) {
      this.scroll += 60 * dt;
    } else if (this.hero.state === 'walk') {
      this.hero.idle(now);
      this.resumeAfterWalk(now);
    }
    for (const layer of this.parallax) layer.container.x = -((this.scroll * layer.factor) % 480);
    this.clouds.x = -((now / 200) % 480);
    this.ground.x = -(this.scroll % 32);

    if (this.prop) {
      this.prop.visible = now >= this.propHiddenUntil;
      const fire = this.prop.getChildByLabel('fire');
      if (fire) fire.alpha = 0.75 + 0.25 * Math.sin(now / 90);
    }
    this.root.alpha = Math.min(1, (now - this.fadeStart) / RESYNC_FADE_MS);
    this.bagBump = Math.max(0, this.bagBump - dt * 4);
    this.bag.scale.set(1 + 0.25 * this.bagBump);

    this.hero.update(now);
    this.particles.update(dt);
    this.floating.update(dt);
    this.loot.update(dt);
    this.banner.update(dt);
  };

  private play(event: GameEvent, at: number, stale: boolean): void {
    const now = Date.now();
    switch (event.type) {
      case 'QueueAdvanced':
        this.setActivity(
          event.actionId,
          event.tick + event.durationTicks,
          event.durationTicks,
          now,
          !stale,
        );
        return;
      case 'SlotStopped':
        this.clearActivity(now);
        return;
      default:
        if (stale) return;
    }
    switch (event.type) {
      case 'ActionCompleted': {
        const colors = PARTICLE_COLORS[this.particleKey] ?? PARTICLE_COLORS.default!;
        this.particles.burst(PROP_X - 6, GROUND_Y - 12, 14, colors, 1.2);
        if (event.completed % DEPLETE_EVERY === 0 && this.propKey.startsWith('props/rock_')) {
          this.propHiddenUntil = at + DEPLETE_MS;
          this.particles.burst(PROP_X, GROUND_Y - 8, 24, colors, 1.6);
        }
        return;
      }
      case 'ItemsGained':
        event.items.forEach((item, i) => {
          const icon = this.content.items.get(item.itemId)?.icon ?? item.itemId;
          this.loot.launch(this.icons.get(icon), PROP_X - 4, GROUND_Y - 14, i * 0.12);
        });
        return;
      case 'XpGained':
        this.floating.show(HERO_X, GROUND_Y - 34, this.texts.xpGain(event.xpTenths), 0x9fe8ff);
        return;
      case 'LevelUp':
        this.hero.oneShot('celebrate', now);
        this.banner.show(this.texts.levelUp(event.skill, event.level));
        this.particles.burst(HERO_X, GROUND_Y - 20, 40, [0xffe28a, 0xffffff, 0x9fe8ff], 1.5);
        return;
      case 'InventoryDeposited':
        this.bagBump = 1;
        return;
      case 'ItemsConsumed':
        return;
    }
  }

  private setActivity(
    actionId: string,
    completeTick: number,
    durationTicks: number,
    now: number,
    animate: boolean,
  ): void {
    const action = this.content.actions.get(actionId);
    if (!action) return;
    const region = this.content.regions.get(action.regionId);
    const background = region?.background ?? 'bg/brumaporto';
    const changesPlace = background !== this.backdropKey || action.scene.prop !== this.propKey;
    this.particleKey = action.scene.particles;
    const durationMs = durationTicks * TICK_MS;
    const swings = Math.max(1, Math.round(durationMs / SWING_MS));
    this.pendingGather = {
      anim: action.scene.anim,
      anchor: this.tickToMs(completeTick),
      cycle: durationMs / swings,
    };
    if (changesPlace && animate) {
      // Walk to the new spot: the old prop scrolls away, the new one appears on arrival.
      this.walkUntil = now + 900;
      this.hero.walk(now);
      this.setProp(null);
      this.pendingProp = action.scene.prop;
      this.pendingBackdrop = background;
      return;
    }
    this.setBackdrop(background);
    this.setProp(action.scene.prop);
    this.startGather(now);
  }

  private pendingGather: { anim: GatherAnim; anchor: number; cycle: number } | null = null;
  private pendingProp: string | null = null;
  private pendingBackdrop: string | null = null;

  private resumeAfterWalk(now: number): void {
    if (this.pendingBackdrop) this.setBackdrop(this.pendingBackdrop);
    if (this.pendingProp) this.setProp(this.pendingProp);
    this.pendingBackdrop = null;
    this.pendingProp = null;
    this.startGather(now);
  }

  private startGather(now: number): void {
    const g = this.pendingGather;
    if (!g || now < this.walkUntil) return;
    this.hero.gather(g.anim, g.anchor, g.cycle, now);
  }

  private clearActivity(now: number): void {
    this.pendingGather = null;
    this.pendingProp = null;
    this.walkUntil = 0;
    this.setProp(null);
    this.hero.idle(now);
  }

  private onSwingImpact(): void {
    const colors = PARTICLE_COLORS[this.particleKey] ?? PARTICLE_COLORS.default!;
    this.particles.burst(PROP_X - 8, GROUND_Y - 12, 4, colors, 0.7);
  }

  private setProp(key: string | null): void {
    if (key === this.propKey && this.prop) return;
    this.prop?.destroy({ children: true });
    this.prop = null;
    this.propKey = key ?? '';
    if (!key) return;
    this.prop = drawProp(key);
    this.prop.position.set(PROP_X, GROUND_Y);
    this.actors.addChildAt(this.prop, 0);
  }

  private setBackdrop(key: string): void {
    if (key === this.backdropKey) return;
    const art: BackdropArt = BACKDROPS[key] ?? BACKDROPS['bg/vale_verde']!;
    this.backdropKey = key;
    this.sky.clear().rect(0, 0, VIRTUAL_W, VIRTUAL_H).fill(art.sky);
    const draws = [art.far, art.mid, art.near];
    this.parallax.forEach((layer, i) => {
      for (const child of [...layer.container.children]) if (child !== this.clouds) child.destroy();
      const g = new Graphics();
      draws[i]!(g);
      layer.container.addChild(g);
    });
    this.clouds.clear();
    for (let x = 30; x < 960; x += 150) {
      this.clouds.ellipse(x, 40 + ((x * 7) % 30), 22, 7).fill({ color: 0xffffff, alpha: 0.8 });
      this.clouds.ellipse(x + 14, 36 + ((x * 7) % 30), 14, 6).fill({ color: 0xffffff, alpha: 0.8 });
    }
    this.parallax[0]!.container.addChild(this.clouds);
    this.ground
      .clear()
      .rect(0, GROUND_Y, VIRTUAL_W + 64, VIRTUAL_H - GROUND_Y)
      .fill(art.ground);
    this.ground.rect(0, GROUND_Y, VIRTUAL_W + 64, 3).fill(art.groundTop);
    for (let x = 0; x < VIRTUAL_W + 64; x += 32)
      this.ground.rect(x + 8, GROUND_Y + 12, 6, 2).fill(OUTLINE);
    if (this.host) this.host.style.backgroundColor = `#${art.sky.toString(16).padStart(6, '0')}`;
  }

  private drawBag(): void {
    this.bag.clear();
    this.bag
      .poly([-7, -2, -5, -7, 5, -7, 7, -2, 7, 7, -7, 7])
      .fill(0x8a5a32)
      .stroke({ width: 1, color: OUTLINE });
    this.bag.rect(-3, -9, 6, 3).fill(0x6b4426).stroke({ width: 1, color: OUTLINE });
    this.bag.position.set(BAG.x, BAG.y);
  }

  /**
   * Integer scaling with nearest filtering; leftover space shows the region's sky colour.
   * On narrow phones the integer fit can waste most of the space (e.g. 720 device px wide → 1×),
   * so then we render at the next integer scale and let CSS shrink it to fit.
   */
  private resize(): void {
    if (!this.host) return;
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = this.host;
    const fit = Math.min((w * dpr) / VIRTUAL_W, (h * dpr) / VIRTUAL_H);
    const floor = Math.max(1, Math.floor(fit));
    const scale = floor / fit < MIN_FILL ? Math.ceil(fit) : floor;
    const shown = Math.min(scale, fit);
    this.app.renderer.resize(VIRTUAL_W, VIRTUAL_H, scale);
    const canvas = this.app.canvas;
    canvas.style.width = `${(VIRTUAL_W * shown) / dpr}px`;
    canvas.style.height = `${(VIRTUAL_H * shown) / dpr}px`;
  }

  /** Background tab: stop rendering; the simulation catches up on return. */
  private onVisibility = () => {
    this.paused = document.visibilityState === 'hidden';
    if (this.paused) this.app.ticker.stop();
    else this.app.ticker.start();
  };
}
