/**
 * Animated hit and spell effects from the OpenTibia Sprite Pack's misc sheet (CC BY 4.0):
 * frame sequences copied into assets/sprites/hitfx.png (32 px cells, magenta made
 * transparent). The scene plays them by name (HIT_FX in @abismo/content).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { HIT_FX } from '@abismo/content';
import { PNG } from 'pngjs';

const T = 32;
const COLS = 16;

export function buildHitFx(assets: URL) {
  const src = PNG.sync.read(
    readFileSync(new URL('vendor/opentibia-sprite-pack/otsp_misc_01.png', assets)),
  );
  const cells = Object.values(HIT_FX).flatMap((a) => a.cells);
  const out = new PNG({ width: COLS * T, height: Math.ceil(cells.length / COLS) * T });
  cells.forEach((cell, i) => {
    const sx = (cell % 16) * T;
    const sy = Math.floor(cell / 16) * T;
    const dx = (i % COLS) * T;
    const dy = Math.floor(i / COLS) * T;
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const si = ((sy + y) * src.width + sx + x) * 4;
        const r = src.data[si]!;
        const g = src.data[si + 1]!;
        const b = src.data[si + 2]!;
        if (src.data[si + 3] === 0 || (r > 240 && g < 20 && b > 240)) continue;
        const di = ((dy + y) * out.width + dx + x) * 4;
        out.data[di] = r;
        out.data[di + 1] = g;
        out.data[di + 2] = b;
        out.data[di + 3] = 255;
      }
    }
  });
  writeFileSync(new URL('sprites/hitfx.png', assets), PNG.sync.write(out));
  return cells.length;
}
