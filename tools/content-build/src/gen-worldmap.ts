/**
 * The world map (assets/sprites/worldmap.png, 16 px per tile, and worldmap.json with the
 * marker positions): the three regions side by side, Cinzarra's dry fields, the swamp of
 * Morvel and the burned Citadel, with the road from town to town through every hunt in
 * order. Drawn with the game's own tileset and props at half size.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { PNG } from 'pngjs';
import { PNG as Png } from 'pngjs';
import { MapGrid, Noise, Rng } from './map-kit.ts';
import { BORDERS, COLLISION, DECOR, GROUND, PROPS, PROPS_COLS, TILESET_COLS } from './tileset.ts';

const W = 60;
const H = 36;
const S = 16;

interface Node {
  kind: 'hunt' | 'town';
  id: string;
  regionId: string;
  tx: number;
  ty: number;
}

/** Path of the road, region by region: town first, then its hunts by level. */
const LAYOUT: Record<string, [number, number][]> = {
  cinzarra: [
    [4, 28],
    [9, 23],
    [12, 14],
    [17, 7],
  ],
  morvel_swamp: [
    [24, 9],
    [28, 18],
    [32, 27],
    [37, 16],
  ],
  burned_citadel: [
    [44, 9],
    [48, 19],
    [52, 28],
    [56, 15],
  ],
};

/** Copies a block at half size, averaging each 2×2 square (alpha-weighted). */
function blitHalf(
  src: PNG,
  sx: number,
  sy: number,
  size: number,
  dst: PNG,
  dx: number,
  dy: number,
) {
  const half = size / 2;
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < half; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 2; i++) {
          const si = ((sy + y * 2 + j) * src.width + sx + x * 2 + i) * 4;
          const al = src.data[si + 3]!;
          r += src.data[si]! * al;
          g += src.data[si + 1]! * al;
          b += src.data[si + 2]! * al;
          a += al;
        }
      }
      if (a === 0) continue;
      const px = dx + x;
      const py = dy + y;
      if (px < 0 || py < 0 || px >= dst.width || py >= dst.height) continue;
      const di = (py * dst.width + px) * 4;
      const alpha = a / 4 / 255;
      for (const [c, v] of [
        [0, r / a],
        [1, g / a],
        [2, b / a],
      ] as const) {
        dst.data[di + c] = Math.round(v * alpha + dst.data[di + c]! * (1 - alpha));
      }
      dst.data[di + 3] = Math.max(dst.data[di + 3]!, Math.round(a / 4));
    }
  }
}

export function buildWorldMap(assets: URL, worldJson: URL, tiles: PNG, props: PNG) {
  const world = JSON.parse(readFileSync(worldJson, 'utf8')) as {
    regions: { id: string; order: number }[];
    hunts: { id: string; regionId: string; ilvl: number }[];
  };
  const rng = new Rng(0x51ed270b);
  const g = new MapGrid(W, H, COLLISION);
  const wobble = new Noise(rng, 6);
  const patches = new Noise(rng, 4);
  const groves = new Noise(rng, 5);
  const regionAt = (x: number, y: number) => {
    const w = (wobble.get(x, y) - 0.5) * 6;
    return x + w < 21 ? 'cinzarra' : x + w < 41 ? 'morvel_swamp' : 'burned_citadel';
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = regionAt(x, y);
      if (r === 'cinzarra') g.setGround(x, y, rng.pick(GROUND.dryGrass), true);
      else if (r === 'morvel_swamp') {
        if (patches.get(x, y) > 0.42) g.setGround(x, y, rng.pick(GROUND.dryGrass), true);
        else g.setGround(x, y, rng.pick(GROUND.mud), false);
      } else g.setGround(x, y, rng.pick(GROUND.darkEarth), false);
    }
  }

  // Nodes and the road between them, in region order.
  const nodes: Node[] = [];
  for (const region of [...world.regions].sort((a, b) => a.order - b.order)) {
    const spots = LAYOUT[region.id] ?? [];
    const hunts = world.hunts
      .filter((h) => h.regionId === region.id)
      .sort((a, b) => a.ilvl - b.ilvl);
    spots.forEach(([tx, ty], i) => {
      if (i === 0) nodes.push({ kind: 'town', id: region.id, regionId: region.id, tx, ty });
      else if (hunts[i - 1])
        nodes.push({ kind: 'hunt', id: hunts[i - 1]!.id, regionId: region.id, tx, ty });
    });
  }
  const roadAt = (x: number, y: number) => {
    const r = regionAt(x, y);
    g.setGround(x, y, rng.pick(r === 'burned_citadel' ? GROUND.darkRock : GROUND.dirt), false);
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) if (g.inside(x + i, y + j)) g.reserved.add(g.idx(x + i, y + j));
  };
  for (let k = 0; k + 1 < nodes.length; k++) {
    let { tx: x, ty: y } = nodes[k]!;
    const { tx: x1, ty: y1 } = nodes[k + 1]!;
    roadAt(x, y);
    // A meandering walk: step on the axis with more distance left, sometimes the other.
    while (x !== x1 || y !== y1) {
      const dx = Math.sign(x1 - x);
      const dy = Math.sign(y1 - y);
      const horizontal =
        dy === 0 ||
        (dx !== 0 && rng.next() < Math.abs(x1 - x) / (Math.abs(x1 - x) + Math.abs(y1 - y)));
      if (horizontal) x += dx;
      else y += dy;
      roadAt(x, y);
    }
  }
  for (const n of nodes) {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) roadAt(n.tx + i, n.ty + j);
  }

  // Water in the swamp, lava in the Citadel, trees and rocks in groves, a wooded edge.
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!g.free(x, y)) continue;
      const r = regionAt(x, y);
      const p = patches.get(x * 1.7, y * 1.7);
      if (r === 'morvel_swamp' && !g.field.has(g.idx(x, y)) && p < 0.3) g.hazardAt(x, y, 'water');
      else if (r === 'burned_citadel' && p > 0.72) g.hazardAt(x, y, 'lava');
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!g.free(x, y)) continue;
      const r = regionAt(x, y);
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y) === 0;
      const trees =
        r === 'cinzarra' ? PROPS.deadTrees : r === 'morvel_swamp' ? PROPS.swampTrees : PROPS.rocks;
      if (edge || (groves.get(x, y) > 0.6 && rng.chance(0.5)) || rng.chance(0.04)) {
        g.propAt(x, y, rng.pick(trees));
      } else {
        const roll = rng.next();
        if (r === 'cinzarra' && roll < 0.03) g.blockWith(x, y, rng.pick(DECOR.graves));
        if (r === 'burned_citadel' && roll < 0.04) g.blockWith(x, y, rng.pick(DECOR.boulders));
      }
    }
  }
  for (let i = 0; i < W * H; i++) {
    if (g.hazard.has(i) || g.detail[i]) continue;
    if (g.field.has(i) && rng.chance(0.35)) g.detail[i] = rng.pick(DECOR.tuftsDry) + 1;
    else if (!g.field.has(i) && rng.chance(0.12)) g.detail[i] = rng.pick(DECOR.gravel) + 1;
  }

  // Render: ground, grass edges, detail, objects, then props by depth.
  const out = new Png({ width: W * S, height: H * S });
  const drawTile = (gid: number, x: number, y: number) => {
    if (!gid) return;
    const id = gid - 1;
    blitHalf(
      tiles,
      (id % TILESET_COLS) * 32,
      Math.floor(id / TILESET_COLS) * 32,
      32,
      out,
      x * S,
      y * S,
    );
  };
  for (const layer of [g.ground, ...g.borderLayers(BORDERS.dry), g.detail, g.decor]) {
    layer.forEach((gid, i) => drawTile(gid, i % W, Math.floor(i / W)));
  }
  for (const p of [...g.props].sort((a, b) => a.ty - b.ty)) {
    blitHalf(
      props,
      (p.prop % PROPS_COLS) * 64,
      Math.floor(p.prop / PROPS_COLS) * 64,
      64,
      out,
      (p.tx - 1) * S,
      (p.ty - 1) * S,
    );
  }
  writeFileSync(new URL('sprites/worldmap.png', assets), Png.sync.write(out));
  writeFileSync(
    new URL('sprites/worldmap.json', assets),
    JSON.stringify(
      {
        width: W * S,
        height: H * S,
        nodes: nodes.map((n) => ({
          kind: n.kind,
          id: n.id,
          regionId: n.regionId,
          x: n.tx * S + S / 2,
          y: n.ty * S + S / 2,
        })),
      },
      null,
      2,
    ) + '\n',
  );
  return nodes.length;
}
