import type { ContentDb } from '@abismo/content';
import { DIRECTIONS } from '@abismo/content';
import type Phaser from 'phaser';
import { HAIR_COLORS, OUTFIT_COLORS } from '../ui/appearance.ts';
import { RARITY_COLOR } from '../ui/rarity.ts';

/**
 * Placeholder art drawn by code: coloured shapes with an outline, one texture per facing.
 * Keys follow `${sprite}_${direction}` so a real atlas with the same frame names can replace
 * them without touching the scene.
 */
export type Direction = (typeof DIRECTIONS)[number];

const OUTLINE = 0x0b0a0f;

function eyes(
  g: Phaser.GameObjects.Graphics,
  dir: Direction,
  cx: number,
  cy: number,
  spread: number,
  color = 0x111111,
) {
  g.fillStyle(color, 1);
  if (dir === 'up') return;
  if (dir === 'down') {
    g.fillRect(cx - spread - 1, cy, 2, 2);
    g.fillRect(cx + spread - 1, cy, 2, 2);
  } else {
    const side = dir === 'left' ? -1 : 1;
    g.fillRect(cx + side * spread - 1, cy, 2, 2);
  }
}

export function heroTextureKey(dir: Direction) {
  return `hero_warrior_${dir}`;
}

export function monsterTextureKey(spriteKey: string, dir: Direction) {
  return `mon_${spriteKey}_${dir}`;
}

function drawHero(scene: Phaser.Scene, hair: number, outfit: number) {
  for (const dir of DIRECTIONS) {
    const g = scene.make.graphics({}, false);
    // Body
    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(7, 11, 18, 18, 4);
    g.fillStyle(outfit, 1);
    g.fillRoundedRect(8, 12, 16, 16, 3);
    // Head
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(16, 9, 7);
    g.fillStyle(0xe0b48a, 1);
    g.fillCircle(16, 9, 6);
    g.fillStyle(hair, 1);
    if (dir === 'up') g.fillCircle(16, 8, 6);
    else g.fillRect(10, 3, 12, 4);
    eyes(g, dir, 16, 9, 2);
    // Sword on the facing side
    g.fillStyle(0xb8bcc6, 1);
    if (dir === 'left') g.fillRect(3, 14, 3, 12);
    else if (dir === 'right') g.fillRect(26, 14, 3, 12);
    else g.fillRect(25, 14, 3, 12);
    g.generateTexture(heroTextureKey(dir), 32, 32);
    g.destroy();
  }
}

function drawMonster(scene: Phaser.Scene, key: string, tint: number, scale: number) {
  const size = Math.round(32 * scale);
  const c = size / 2;
  for (const dir of DIRECTIONS) {
    const g = scene.make.graphics({}, false);
    const r = size * 0.36;
    g.fillStyle(OUTLINE, 1);
    g.fillEllipse(c, c + 2, r * 2 + 3, r * 2 + 1);
    g.fillStyle(tint, 1);
    g.fillEllipse(c, c + 2, r * 2, r * 2 - 2);
    g.fillStyle(0xffffff, 0.18);
    g.fillEllipse(c - r * 0.3, c - r * 0.2, r * 0.8, r * 0.5);
    eyes(g, dir, c, c - 1, Math.max(2, Math.round(r * 0.35)), 0xb3261e);
    g.generateTexture(monsterTextureKey(key, dir), size, size);
    g.destroy();
  }
}

export function makeTextures(
  scene: Phaser.Scene,
  content: ContentDb,
  appearance: { hair: number; outfit: number },
) {
  drawHero(
    scene,
    HAIR_COLORS[appearance.hair % HAIR_COLORS.length]!,
    OUTFIT_COLORS[appearance.outfit % OUTFIT_COLORS.length]!,
  );
  for (const m of content.monsters.values()) {
    drawMonster(scene, m.sprite.key, parseInt(m.sprite.tint.slice(1), 16), m.sprite.scale ?? 1);
  }

  const g = scene.make.graphics({}, false);
  // Drop shadow
  g.fillStyle(0x000000, 0.35);
  g.fillEllipse(12, 4, 24, 8);
  g.generateTexture('shadow', 24, 8);
  g.clear();
  // Soft glow (tinted per rarity)
  for (let i = 8; i > 0; i--) {
    g.fillStyle(0xffffff, 0.06 * (9 - i));
    g.fillCircle(16, 16, i * 2);
  }
  g.generateTexture('glow', 32, 32);
  g.clear();
  // Legendary light beam
  for (let y = 0; y < 96; y++) {
    g.fillStyle(0xffffff, 0.55 * (y / 96));
    g.fillRect(2, y, 8, 1);
  }
  g.generateTexture('beam', 12, 96);
  g.clear();
  // Spark particle
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 3, 3);
  g.generateTexture('spark', 3, 3);
  g.clear();
  // Potion icon
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(1, 4, 10, 10, 3);
  g.fillStyle(0xd23b3b, 1);
  g.fillRoundedRect(2, 5, 8, 8, 2);
  g.fillStyle(0x9a7b5a, 1);
  g.fillRect(4, 1, 4, 4);
  g.generateTexture('potion', 12, 15);
  g.destroy();

  // One item gem per rarity
  for (const [rarity, color] of Object.entries(RARITY_COLOR)) {
    const gem = scene.make.graphics({}, false);
    const hex = parseInt(color.slice(1), 16);
    gem.fillStyle(OUTLINE, 1);
    gem.fillPoints(
      [
        { x: 7, y: 0 },
        { x: 14, y: 7 },
        { x: 7, y: 14 },
        { x: 0, y: 7 },
      ],
      true,
    );
    gem.fillStyle(hex, 1);
    gem.fillPoints(
      [
        { x: 7, y: 2 },
        { x: 12, y: 7 },
        { x: 7, y: 12 },
        { x: 2, y: 7 },
      ],
      true,
    );
    gem.generateTexture(`item_${rarity}`, 14, 14);
    gem.destroy();
  }
}
