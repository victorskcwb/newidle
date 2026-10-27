/**
 * Magic effects and missiles from the OpenTibia Sprite Pack's client files (otsp.dat/otsp.spr,
 * CC BY 4.0), the pixel effects the scene plays on hits and spells. Writes
 * assets/sprites/otspfx.png: 64 px cells, the effects of OTSP_FX frame by frame and then the
 * nine directions of each missile of OTSP_MISSILES, then the floor stains of OTSP_SPLASHES in
 * each colour of OTSP_SPLASH_COLORS (see @abismo/content).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { OTSP_FX, OTSP_MISSILES, OTSP_SPLASH_COLORS, OTSP_SPLASHES } from '@abismo/content';
import { PNG } from 'pngjs';
import { CELL, composeFrame, readOtspDat, type Rgba } from './otsp-actors.ts';

const COLS = 16;

export function buildOtspFx(assets: URL): number {
  const vendor = (f: string) => readFileSync(new URL(`vendor/opentibia-sprite-pack/${f}`, assets));
  const { items, effects, missiles } = readOtspDat(vendor('otsp.dat'));
  const spr = vendor('otsp.spr');
  const cells: Rgba[] = [];

  for (const [name, fx] of Object.entries(OTSP_FX)) {
    const t = effects.get(fx.effect);
    if (!t) throw new Error(`otsp.dat has no effect ${fx.effect} (${name})`);
    if (t.frames !== fx.frames) {
      throw new Error(`effect ${name}: otsp.dat has ${t.frames} frames, OTSP_FX says ${fx.frames}`);
    }
    for (let f = 0; f < t.frames; f++) cells.push(composeFrame(spr, t, f, 0, 0));
  }
  for (const [name, id] of Object.entries(OTSP_MISSILES)) {
    const t = missiles.get(id);
    if (!t || t.px !== 3 || t.py !== 3) throw new Error(`otsp.dat missile ${id} (${name})`);
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) cells.push(composeFrame(spr, t, 0, x, 0, y));
  }
  for (const [name, id] of Object.entries(OTSP_SPLASHES)) {
    const t = items.get(id);
    if (!t || t.px !== 4 || t.py !== 2) throw new Error(`otsp.dat splash ${id} (${name})`);
    for (const pattern of Object.values(OTSP_SPLASH_COLORS)) {
      cells.push(composeFrame(spr, t, 0, pattern % 4, 0, Math.floor(pattern / 4)));
    }
  }

  const png = new PNG({ width: COLS * CELL, height: Math.ceil(cells.length / COLS) * CELL });
  cells.forEach((img, i) => {
    const ox = (i % COLS) * CELL;
    const oy = Math.floor(i / COLS) * CELL;
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const si = (y * CELL + x) * 4;
        const di = ((oy + y) * png.width + ox + x) * 4;
        for (let c = 0; c < 4; c++) png.data[di + c] = img[si + c]!;
      }
    }
  });
  writeFileSync(new URL('sprites/otspfx.png', assets), PNG.sync.write(png));
  return cells.length;
}
