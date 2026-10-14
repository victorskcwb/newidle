import { Container, Graphics, type Renderer, type Texture } from 'pixi.js';

/**
 * Programmatic placeholder art (section 6.7): simple coloured shapes with a 1 px outline.
 * Keys match the final atlas keys (items/…, props/…, bg/…), so final art replaces this file only.
 */

export const OUTLINE = 0x1a1420;

const ITEM_COLORS: Record<string, number> = {
  copper: 0xd9823b,
  tin: 0xb8c0c8,
  bronze: 0xb0763a,
  iron: 0x8a8f99,
  hammer: 0x9a7b55,
};

function colorFor(key: string): number {
  for (const [name, color] of Object.entries(ITEM_COLORS)) if (key.includes(name)) return color;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return 0x404040 | (h & 0xbfbfbf);
}

export const PARTICLE_COLORS: Record<string, number[]> = {
  chips_orange: [0xd9823b, 0xf0b070, 0x6b4a33],
  chips_grey: [0xb8c0c8, 0xe3e8ec, 0x5d6168],
  sparks: [0xfff2a8, 0xffc94a, 0xff8a2a],
  default: [0xffffff, 0xcccccc],
};

/** Draws an item icon (12×12, centred on 0,0). */
function drawIcon(g: Graphics, iconKey: string): void {
  const c = colorFor(iconKey);
  const name = iconKey.split('/')[1] ?? iconKey;
  if (name.startsWith('ore_')) {
    g.poly([-5, 2, -3, -4, 2, -5, 5, -1, 4, 4, -2, 5])
      .fill(0x6e6a72)
      .stroke({ width: 1, color: OUTLINE });
    g.rect(-2, -2, 2, 2).fill(c);
    g.rect(1, 0, 2, 2).fill(c);
    g.rect(-1, 2, 2, 1).fill(c);
  } else if (name.startsWith('bar_')) {
    g.poly([-6, 3, -4, -2, 4, -2, 6, 3]).fill(c).stroke({ width: 1, color: OUTLINE });
    g.rect(-3, -1, 6, 1).fill(0xffffff);
  } else if (name.startsWith('dagger_') || name.startsWith('sword_')) {
    g.poly([-1, 2, 4, -5, 5, -4, 0, 3]).fill(c).stroke({ width: 1, color: OUTLINE });
    g.rect(-3, 1, 4, 2).fill(0x5b3a24);
    g.rect(-5, 3, 2, 2).fill(0x5b3a24);
  } else if (name.startsWith('pickaxe_')) {
    g.rect(-1, -3, 2, 9).fill(0x7a5230);
    g.poly([-6, -2, 0, -5, 6, -2, 0, -3]).fill(c).stroke({ width: 1, color: OUTLINE });
  } else if (name === 'hammer') {
    g.rect(-1, -2, 2, 8).fill(0x7a5230);
    g.rect(-4, -5, 8, 4).fill(0x8a8f99).stroke({ width: 1, color: OUTLINE });
  } else {
    g.circle(0, 0, 4).fill(c).stroke({ width: 1, color: OUTLINE });
  }
}

export class IconCache {
  private readonly cache = new Map<string, Texture>();
  constructor(private readonly renderer: Renderer) {}

  get(iconKey: string): Texture {
    let tex = this.cache.get(iconKey);
    if (!tex) {
      const g = new Graphics();
      drawIcon(g, iconKey);
      tex = this.renderer.generateTexture({ target: g, resolution: 4 });
      g.destroy();
      this.cache.set(iconKey, tex);
    }
    return tex;
  }
}

/** Prop in front of the hero (rock, furnace, anvil…). Origin at the bottom centre. */
export function drawProp(propKey: string): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  const name = propKey.split('/')[1] ?? propKey;
  if (name.startsWith('rock_')) {
    const ore = colorFor(name.replace('rock_', ''));
    g.poly([-16, 0, -14, -12, -6, -20, 6, -19, 14, -10, 16, 0])
      .fill(0x75707c)
      .stroke({ width: 1, color: OUTLINE });
    g.poly([-6, -20, 6, -19, 2, -14, -8, -13]).fill(0x8f8a96);
    for (const [x, y] of [
      [-8, -10],
      [3, -13],
      [8, -6],
      [-2, -5],
      [-11, -4],
    ] as const) {
      g.rect(x, y, 3, 3).fill(ore);
    }
  } else if (name === 'furnace') {
    g.rect(-14, -30, 28, 30).fill(0x6b5a50).stroke({ width: 1, color: OUTLINE });
    g.rect(-10, -34, 8, 6).fill(0x4d403a).stroke({ width: 1, color: OUTLINE });
    g.rect(-7, -14, 14, 10).fill(0x2a1a14);
    const fire = new Graphics().rect(-6, -11, 12, 7).fill(0xff8a2a);
    fire.label = 'fire';
    c.addChild(fire);
  } else if (name === 'anvil') {
    g.rect(-4, -6, 8, 6).fill(0x3c3c44).stroke({ width: 1, color: OUTLINE });
    g.poly([-14, -12, 10, -12, 14, -9, 8, -6, -10, -6])
      .fill(0x55565f)
      .stroke({ width: 1, color: OUTLINE });
  } else {
    g.rect(-10, -16, 20, 16).fill(colorFor(name)).stroke({ width: 1, color: OUTLINE });
  }
  return c;
}

export interface BackdropArt {
  sky: number;
  far: (g: Graphics) => void;
  mid: (g: Graphics) => void;
  near: (g: Graphics) => void;
  ground: number;
  groundTop: number;
}

/** Repeating background layers, drawn 960 px wide so they can scroll. */
export const BACKDROPS: Record<string, BackdropArt> = {
  'bg/vale_verde': {
    sky: 0x79b4d9,
    far: (g) => {
      for (let x = -40; x < 1000; x += 160)
        g.poly([x, 200, x + 80, 120, x + 170, 200]).fill(0x8fb6c9);
    },
    mid: (g) => {
      for (let x = 0; x < 1000; x += 120) {
        g.poly([x, 210, x + 60, 150, x + 130, 210]).fill(0x5f9a5a);
        g.rect(x + 30, 170, 4, 30).fill(0x4a3424);
        g.circle(x + 32, 166, 12).fill(0x3f7d43);
      }
    },
    near: (g) => {
      for (let x = 0; x < 1000; x += 70) g.ellipse(x + 20, 222, 18, 8).fill(0x467f3e);
    },
    ground: 0x6b4f35,
    groundTop: 0x58a04a,
  },
  'bg/brumaporto': {
    sky: 0x5b7fa8,
    far: (g) => {
      g.rect(0, 175, 1000, 30).fill(0x3f6d8f);
      for (let x = 20; x < 1000; x += 240)
        g.poly([x, 175, x + 30, 150, x + 60, 175]).fill(0xe6e1d3);
    },
    mid: (g) => {
      for (let x = 0; x < 1000; x += 90) {
        g.rect(x + 5, 160, 50, 50)
          .fill(0x8a7a6a)
          .stroke({ width: 1, color: OUTLINE });
        g.poly([x, 162, x + 30, 140, x + 60, 162]).fill(0x8c3b32);
        g.rect(x + 22, 185, 10, 25).fill(0x4a3424);
      }
    },
    near: (g) => {
      for (let x = 10; x < 1000; x += 110)
        g.rect(x, 206, 14, 12).fill(0x7a5a3a).stroke({ width: 1, color: OUTLINE });
    },
    ground: 0x5d5a58,
    groundTop: 0x8a8682,
  },
};
