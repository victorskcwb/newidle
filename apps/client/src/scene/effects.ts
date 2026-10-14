import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { OUTLINE } from './placeholders.ts';

/** Object pools for the hot path: nothing here allocates per frame once warmed up. */

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export class ParticlePool {
  private readonly items: Particle[] = [];
  private next = 0;

  constructor(
    private readonly layer: Container,
    size = 256,
  ) {
    for (let i = 0; i < size; i++) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.visible = false;
      sprite.anchor.set(0.5);
      layer.addChild(sprite);
      this.items.push({ sprite, vx: 0, vy: 0, life: 0, maxLife: 1 });
    }
  }

  /** Spawns `count` particles; reuses the oldest slots when the pool is exhausted. */
  burst(x: number, y: number, count: number, colors: readonly number[], power = 1): void {
    for (let i = 0; i < count; i++) {
      const p = this.items[this.next]!;
      this.next = (this.next + 1) % this.items.length;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const speed = (40 + Math.random() * 70) * power;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.maxLife = 0.35 + Math.random() * 0.35;
      p.life = p.maxLife;
      const s = p.sprite;
      s.position.set(x, y);
      s.tint = colors[i % colors.length] ?? 0xffffff;
      const size = Math.random() < 0.3 ? 2 : 1;
      s.width = size;
      s.height = size;
      s.alpha = 1;
      s.visible = true;
    }
  }

  update(dt: number): void {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.vy += 260 * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.alpha = Math.min(1, (p.life / p.maxLife) * 2);
    }
  }
}

interface Floating {
  text: Text;
  t: number;
  duration: number;
  startY: number;
}

export class FloatingTextPool {
  private readonly items: Floating[] = [];
  private next = 0;

  constructor(
    private readonly layer: Container,
    size = 32,
  ) {
    for (let i = 0; i < size; i++) {
      const text = new Text({
        text: '',
        style: {
          fontFamily: 'Silkscreen, monospace',
          fontSize: 8,
          fill: 0xffffff,
          stroke: { color: OUTLINE, width: 2 },
        },
      });
      text.anchor.set(0.5, 1);
      text.visible = false;
      layer.addChild(text);
      this.items.push({ text, t: 0, duration: 0, startY: 0 });
    }
  }

  show(x: number, y: number, value: string, color: number, scale = 1, duration = 1.1): void {
    const f = this.items[this.next]!;
    this.next = (this.next + 1) % this.items.length;
    f.text.text = value;
    f.text.style.fill = color;
    f.text.scale.set(scale);
    f.text.position.set(x, y);
    f.text.alpha = 1;
    f.text.visible = true;
    f.t = 0;
    f.duration = duration;
    f.startY = y;
  }

  update(dt: number): void {
    for (const f of this.items) {
      if (!f.text.visible) continue;
      f.t += dt;
      const k = f.t / f.duration;
      if (k >= 1) {
        f.text.visible = false;
        continue;
      }
      f.text.y = f.startY - 18 * (1 - (1 - k) * (1 - k));
      f.text.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }
  }
}

interface Loot {
  sprite: Sprite;
  t: number;
  fromX: number;
  fromY: number;
  peakX: number;
  peakY: number;
  delay: number;
}

const LOOT_HOP = 0.35;
const LOOT_FLY = 0.45;

/** Loot icons hop out of the source in an arc, then fly to the bag icon. */
export class LootPool {
  private readonly items: Loot[] = [];
  private next = 0;
  onArrive: (() => void) | null = null;

  constructor(
    private readonly layer: Container,
    private readonly target: { x: number; y: number },
    size = 24,
  ) {
    for (let i = 0; i < size; i++) {
      const sprite = new Sprite(Texture.EMPTY);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      layer.addChild(sprite);
      this.items.push({ sprite, t: 0, fromX: 0, fromY: 0, peakX: 0, peakY: 0, delay: 0 });
    }
  }

  launch(texture: Texture, x: number, y: number, delay = 0): void {
    const l = this.items[this.next]!;
    this.next = (this.next + 1) % this.items.length;
    l.sprite.texture = texture;
    l.sprite.width = 12;
    l.sprite.height = 12;
    l.sprite.position.set(x, y);
    l.sprite.visible = delay <= 0;
    l.t = -delay;
    l.delay = delay;
    l.fromX = x;
    l.fromY = y;
    l.peakX = x + 6 + Math.random() * 14;
    l.peakY = y - 18 - Math.random() * 8;
  }

  update(dt: number): void {
    for (const l of this.items) {
      if (!l.sprite.visible && l.t >= 0) continue;
      l.t += dt;
      if (l.t < 0) continue;
      l.sprite.visible = true;
      if (l.t < LOOT_HOP) {
        const k = l.t / LOOT_HOP;
        l.sprite.x = l.fromX + (l.peakX - l.fromX) * k;
        l.sprite.y = l.fromY + (l.peakY - l.fromY) * k - Math.sin(k * Math.PI) * 6;
      } else if (l.t < LOOT_HOP + LOOT_FLY) {
        const k = (l.t - LOOT_HOP) / LOOT_FLY;
        const e = k * k;
        l.sprite.x = l.peakX + (this.target.x - l.peakX) * e;
        l.sprite.y = l.peakY + (this.target.y - l.peakY) * e - Math.sin(k * Math.PI) * 20;
        l.sprite.scale.set((12 / l.sprite.texture.width) * (1 - 0.4 * k));
      } else {
        l.sprite.visible = false;
        l.t = 0;
        this.onArrive?.();
      }
    }
  }
}

/** Banner for level-ups ("Mineração nível 42!"). */
export class Banner extends Container {
  private readonly bg = new Graphics();
  private readonly caption: Text;
  private t = 0;
  private duration = 0;

  constructor(private readonly sceneWidth: number) {
    super();
    this.caption = new Text({
      text: '',
      style: {
        fontFamily: 'Silkscreen, monospace',
        fontSize: 10,
        fill: 0xffe28a,
        stroke: { color: OUTLINE, width: 3 },
      },
    });
    this.caption.anchor.set(0.5);
    this.addChild(this.bg, this.caption);
    this.visible = false;
  }

  show(text: string, duration = 2.2): void {
    this.caption.text = text;
    const w = Math.max(120, this.caption.width + 24);
    this.bg
      .clear()
      .rect(-w / 2, -10, w, 20)
      .fill({ color: 0x14121c, alpha: 0.85 })
      .stroke({ width: 1, color: 0xffe28a });
    this.position.set(this.sceneWidth / 2, 40);
    this.t = 0;
    this.duration = duration;
    this.visible = true;
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.t += dt;
    const k = this.t / this.duration;
    if (k >= 1) {
      this.visible = false;
      return;
    }
    this.alpha = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
    this.scale.set(k < 0.1 ? 0.8 + 2 * k : 1);
  }
}
