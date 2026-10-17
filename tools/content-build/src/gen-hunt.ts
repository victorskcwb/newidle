/**
 * Hunt maps: the same 2-tile route loop and town exit for every hunt (so routes and spawns
 * are known to work), dressed by theme. Vegetation comes in groves and meadows driven by
 * smooth noise, the map edge is a forest (or rock wall) a few tiles deep, the road frays at
 * its edges, clearings of bare ground open in the grass, and tufts, flowers and gravel cover
 * the ground so no tile looks bare.
 */
import { MapGrid, Noise, Rng, makeObjects } from './map-kit.ts';
import { BORDERS, COLLISION, DECOR, GROUND, PROPS, type BorderSet } from './tileset.ts';

export type Theme = 'cemetery' | 'woods' | 'crypt' | 'swamp' | 'village' | 'ash' | 'molten';

interface Litter {
  tiles: number[];
  chance: number;
}

interface ThemeSpec {
  field: number[];
  /** Route ground; also the ground of clearings and the one grass edges lie on. */
  path: number[];
  border: BorderSet | null;
  hazard: 'water' | 'lava';
  pond: boolean;
  inner: 'graves' | 'trees' | 'rocks' | 'ruins' | 'hazard';
  edgeProps: number[];
  /** Props of the groves outside the loop, and how dense the groves are. */
  groveProps: number[];
  grove: number;
  /** Lone props anywhere outside the loop. */
  scatter: number;
  /** Blocking 32 px objects outside the loop. */
  blocks: number[];
  blockChance: number;
  outerHazard: number;
  /** Ground detail on the field, in meadows (flowers) and on the road. */
  detail: Litter[];
  meadow: Litter[];
  roadDetail: Litter[];
  /** Small objects off the road (decor layer, no collision). */
  litter: Litter[];
}

const swamp: ThemeSpec = {
  field: GROUND.dryGrass,
  path: GROUND.mud,
  border: BORDERS.dry,
  hazard: 'water',
  pond: true,
  inner: 'hazard',
  edgeProps: PROPS.swampTrees,
  groveProps: [...PROPS.swampTrees, ...PROPS.giantMushrooms],
  grove: 0.45,
  scatter: 0.03,
  blocks: DECOR.bushes,
  blockChance: 0.03,
  outerHazard: 0.05,
  detail: [
    { tiles: DECOR.tuftsDry, chance: 0.3 },
    { tiles: DECOR.moss, chance: 0.12 },
  ],
  meadow: [{ tiles: DECOR.violets, chance: 0.15 }],
  roadDetail: [{ tiles: DECOR.moss, chance: 0.08 }],
  litter: [
    { tiles: DECOR.toadstools, chance: 0.02 },
    { tiles: DECOR.mushrooms, chance: 0.02 },
    { tiles: DECOR.plants, chance: 0.05 },
    { tiles: DECOR.bones, chance: 0.01 },
  ],
};

const ash: ThemeSpec = {
  field: GROUND.darkEarth,
  path: GROUND.darkRock,
  border: null,
  hazard: 'lava',
  pond: true,
  inner: 'rocks',
  edgeProps: PROPS.rocks,
  groveProps: PROPS.rocks,
  grove: 0.35,
  scatter: 0.03,
  blocks: DECOR.boulders,
  blockChance: 0.07,
  outerHazard: 0.04,
  detail: [{ tiles: DECOR.gravel, chance: 0.14 }],
  meadow: [],
  roadDetail: [{ tiles: DECOR.gravel, chance: 0.08 }],
  litter: [
    { tiles: DECOR.bones, chance: 0.03 },
    { tiles: DECOR.pebbles, chance: 0.03 },
  ],
};

const THEMES: Record<Theme, ThemeSpec> = {
  cemetery: {
    field: GROUND.dryGrass,
    path: GROUND.dirt,
    border: BORDERS.dry,
    hazard: 'water',
    pond: true,
    inner: 'graves',
    edgeProps: PROPS.deadTrees,
    groveProps: PROPS.deadTrees,
    grove: 0.4,
    scatter: 0.03,
    blocks: [...DECOR.deadBushes, ...DECOR.graves],
    blockChance: 0.06,
    outerHazard: 0,
    detail: [
      { tiles: DECOR.tuftsDry, chance: 0.32 },
      { tiles: DECOR.leaves, chance: 0.06 },
      { tiles: DECOR.twigs, chance: 0.04 },
    ],
    meadow: [{ tiles: DECOR.berries, chance: 0.12 }],
    roadDetail: [
      { tiles: DECOR.gravel, chance: 0.1 },
      { tiles: DECOR.twigs, chance: 0.03 },
    ],
    litter: [
      { tiles: DECOR.bones, chance: 0.03 },
      { tiles: DECOR.mushrooms, chance: 0.015 },
      { tiles: DECOR.plants, chance: 0.02 },
    ],
  },
  woods: {
    field: GROUND.greenGrass,
    path: GROUND.dirt,
    border: BORDERS.green,
    hazard: 'water',
    pond: true,
    inner: 'trees',
    edgeProps: PROPS.greenTrees,
    groveProps: PROPS.greenTrees,
    grove: 0.6,
    scatter: 0.05,
    blocks: DECOR.bushes,
    blockChance: 0.05,
    outerHazard: 0,
    detail: [{ tiles: DECOR.tuftsGreen, chance: 0.4 }],
    meadow: [
      { tiles: DECOR.violets, chance: 0.18 },
      { tiles: DECOR.berries, chance: 0.1 },
      { tiles: DECOR.flowers, chance: 0.08 },
    ],
    roadDetail: [
      { tiles: DECOR.gravel, chance: 0.08 },
      { tiles: DECOR.leaves, chance: 0.05 },
    ],
    litter: [
      { tiles: DECOR.plants, chance: 0.05 },
      { tiles: DECOR.mushrooms, chance: 0.015 },
      { tiles: DECOR.bones, chance: 0.008 },
    ],
  },
  crypt: {
    field: GROUND.darkRock,
    path: GROUND.hexStone,
    border: null,
    hazard: 'water',
    pond: false,
    inner: 'ruins',
    edgeProps: PROPS.rocks,
    groveProps: PROPS.rocks,
    grove: 0.35,
    scatter: 0.03,
    blocks: [...DECOR.boulders, ...DECOR.graves],
    blockChance: 0.1,
    outerHazard: 0,
    detail: [{ tiles: DECOR.gravel, chance: 0.16 }],
    meadow: [],
    roadDetail: [{ tiles: DECOR.gravel, chance: 0.05 }],
    litter: [
      { tiles: DECOR.bones, chance: 0.05 },
      { tiles: DECOR.pebbles, chance: 0.03 },
    ],
  },
  swamp,
  village: {
    ...swamp,
    inner: 'ruins',
    grove: 0.35,
    blocks: [...DECOR.boulders, ...DECOR.bushes],
    blockChance: 0.05,
    outerHazard: 0.04,
  },
  ash,
  molten: { ...ash, inner: 'hazard', outerHazard: 0.08 },
};

const W = 40;
const H = 30;

export function buildHuntMap(theme: Theme, seed: number) {
  const rng = new Rng(seed);
  const spec = THEMES[theme];
  const g = new MapGrid(W, H, COLLISION);
  const groves = new Noise(rng, 6);
  const meadows = new Noise(rng, 5);
  const clearings = new Noise(rng, 4);
  const edgeDepth = new Noise(rng, 5);
  const isPath = new Set<number>();

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) g.setGround(x, y, rng.pick(spec.field), true);
  const road = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        g.setGround(x, y, rng.pick(spec.path), false);
        isPath.add(g.idx(x, y));
        g.reserved.add(g.idx(x, y));
      }
    }
  };
  // Route loop (2 tiles wide) and the road out to the town on the left edge.
  road(6, 6, 33, 7);
  road(6, 22, 33, 23);
  road(6, 6, 7, 23);
  road(32, 6, 33, 23);
  road(0, 14, 7, 15);
  const inLoopInside = (x: number, y: number) => x >= 8 && x <= 31 && y >= 8 && y <= 21;
  const outsideLoop = (x: number, y: number) => x < 5 || x > 34 || y < 5 || y > 24;
  const nearExit = (x: number, y: number) => y >= 12 && y <= 17 && x <= 8;

  if (spec.border) {
    // The road frays: some tiles next to it are bare ground too.
    for (const i of [...isPath]) {
      const x = i % W;
      const y = Math.floor(i / W);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1 || isPath.has(g.idx(nx, ny))) continue;
        if (rng.chance(0.14)) g.setGround(nx, ny, rng.pick(spec.path), false);
      }
    }
    // Clearings of bare ground in the grass, away from the road.
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        if (isPath.has(g.idx(x, y)) || clearings.get(x, y) < 0.8) continue;
        g.setGround(x, y, rng.pick(spec.path), false);
      }
    }
  }

  // The map edge: a forest (or rock wall) one to three tiles deep, open where the road leaves.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      const depth = 1 + Math.floor(edgeDepth.get(x, y) * 3);
      if (d >= depth || d > 2) continue;
      if (isPath.has(g.idx(x, y))) {
        if (d === 0) g.block(x, y);
        continue;
      }
      if (nearExit(x, y) && d > 0) continue;
      if (d === 0) {
        if (!(rng.chance(0.8) && g.propAt(x, y, rng.pick(spec.edgeProps)))) {
          g.blockWith(x, y, rng.pick(spec.blocks));
        }
        g.block(x, y);
      } else if (rng.chance(0.55)) {
        g.propAt(x, y, rng.pick(spec.edgeProps));
      } else if (rng.chance(0.2)) {
        g.blockWith(x, y, rng.pick(spec.blocks));
      }
    }
  }
  if (spec.pond) g.poolAt(34, 25, spec.hazard, 4, 3);

  // Obstacles in the middle of the loop (the spawn strips next to the road stay clear).
  for (let y0 = 12; y0 <= 18; y0 += 3) {
    for (let x0 = 12; x0 <= 27; x0 += 3) {
      if (rng.chance(0.15)) continue;
      // A little disorder, without reaching the spawn strips.
      const x = x0 + rng.int(0, 1);
      const y = y0 + rng.int(-1, 1);
      switch (spec.inner) {
        case 'graves':
          g.blockWith(x, y, rng.pick(DECOR.graves));
          if (rng.chance(0.5)) g.blockWith(x + 1, y, rng.pick(DECOR.graves));
          break;
        case 'trees':
          g.propAt(x, y, rng.pick(PROPS.greenTrees));
          if (rng.chance(0.5)) g.propAt(x + 1, y, rng.pick(PROPS.greenTrees));
          if (rng.chance(0.4)) g.blockWith(x, y + 1, rng.pick(DECOR.bushes));
          break;
        case 'rocks':
          g.propAt(x, y, rng.pick(PROPS.rocks));
          if (rng.chance(0.5)) g.blockWith(x + 1, y, rng.pick(DECOR.boulders));
          break;
        case 'ruins':
          for (let k = 0; k < 2; k++) {
            g.blockWith(x + k, y, rng.pick(rng.chance(0.3) ? DECOR.graves : DECOR.boulders));
          }
          if (spec.pond && rng.chance(0.5)) g.poolAt(x, y + 1, spec.hazard);
          break;
        case 'hazard':
          g.poolAt(x, y, spec.hazard);
          break;
      }
    }
  }

  // Outside the loop: groves where the noise is high, lone props and hazards elsewhere.
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!g.free(x, y) || !outsideLoop(x, y) || nearExit(x, y)) continue;
      const grove = groves.get(x, y) > 0.6;
      if (grove && rng.chance(spec.grove)) g.propAt(x, y, rng.pick(spec.groveProps));
      else if (grove && rng.chance(0.25)) g.blockWith(x, y, rng.pick(spec.blocks));
      else if (rng.chance(spec.scatter)) g.propAt(x, y, rng.pick(spec.groveProps));
      else if (rng.chance(spec.blockChance)) g.blockWith(x, y, rng.pick(spec.blocks));
      else if (rng.chance(spec.outerHazard)) g.poolAt(x, y, spec.hazard);
    }
  }

  // Ground detail everywhere, flowers in meadows, small objects off the road.
  const roll = (list: Litter[]) => {
    for (const l of list) if (l.tiles.length > 0 && rng.chance(l.chance)) return rng.pick(l.tiles);
    return null;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = g.idx(x, y);
      if (g.hazard.has(i)) continue;
      const onField = g.field.has(i);
      const meadow = onField && meadows.get(x, y) > 0.66 && !g.collision[i];
      const d = onField
        ? ((meadow ? roll(spec.meadow) : null) ?? roll(spec.detail))
        : roll(spec.roadDetail);
      if (d !== null) g.detail[i] = d + 1;
      if (onField && g.free(x, y) && !inLoopInside(x, y)) {
        const l = roll(spec.litter);
        if (l !== null) g.decor[i] = l + 1;
      } else if (onField && g.free(x, y) && rng.chance(0.5)) {
        const l = roll(spec.litter);
        if (l !== null) g.decor[i] = l + 1;
      }
    }
  }

  const o = makeObjects();
  const route = [
    [7, 7],
    [20, 7],
    [32, 7],
    [32, 15],
    [32, 22],
    [20, 22],
    [7, 22],
    [7, 15],
  ].map(([tx, ty], i) => o.point(`wp_${i + 1}`, 'waypoint', tx!, ty!));
  const spawns = [
    o.area('north', 'spawn', 9, 8, 22, 2),
    o.area('east', 'spawn', 29, 10, 2, 11),
    o.area('south', 'spawn', 9, 20, 22, 2),
    o.area('west', 'spawn', 9, 10, 2, 11),
  ];
  const exit = o.point('town_exit', 'town_exit', 1, 14);
  return g.toTmj(
    spec.border,
    [
      ['route', route],
      ['spawns', spawns],
      ['town_exit', [exit]],
    ],
    o.next(),
  );
}
