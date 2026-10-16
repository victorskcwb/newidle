/**
 * Placeholder app icons for the installable PWA (192, 512 and a maskable 512), drawn with
 * the same code-made style as the rest of the provisional art: an abyss and a sword.
 *
 *   pnpm --filter @abismo/content-build run icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Image } from './png.ts';

type Rgba = readonly [number, number, number, number];

function icon(size: number, padding: number): Image {
  const img = new Image(size, size);
  const bg: Rgba = [14, 13, 18, 255];
  img.rect(0, 0, size, size, bg);
  const c = size / 2;
  const r = (size / 2) * (1 - padding);
  // Abyss: concentric rings from orange to black.
  const rings: Rgba[] = [
    [217, 164, 65, 255],
    [140, 70, 30, 255],
    [70, 30, 20, 255],
    [30, 14, 14, 255],
    [8, 6, 10, 255],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / r;
      if (d > 1) continue;
      const ring = rings[Math.min(rings.length - 1, Math.floor((1 - d) * rings.length))]!;
      img.set(x, y, ring);
    }
  }
  // Sword, pointing down into the abyss.
  const u = size / 32;
  const blade: Rgba = [214, 218, 228, 255];
  const edge: Rgba = [120, 124, 138, 255];
  const hilt: Rgba = [255, 236, 170, 255];
  img.rect(Math.round(c - u), Math.round(c - 11 * u), Math.round(2 * u), Math.round(18 * u), blade);
  img.rect(Math.round(c), Math.round(c - 11 * u), Math.round(u), Math.round(18 * u), edge);
  img.rect(
    Math.round(c - 5 * u),
    Math.round(c - 12 * u),
    Math.round(10 * u),
    Math.round(2 * u),
    hilt,
  );
  img.rect(Math.round(c - u), Math.round(c - 15 * u), Math.round(2 * u), Math.round(3 * u), hilt);
  return img;
}

const dir = new URL('../../../assets/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('icon-192.png', dir), icon(192, 0.08).toPng());
writeFileSync(new URL('icon-512.png', dir), icon(512, 0.08).toPng());
// Maskable icons keep the art inside the central safe zone (80%).
writeFileSync(new URL('icon-maskable-512.png', dir), icon(512, 0.3).toPng());
console.log('wrote assets/icons/icon-192.png, icon-512.png and icon-maskable-512.png');
