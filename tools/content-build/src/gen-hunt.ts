/**
 * Hunt maps with a biome (grounds, edges, trees or rocks, hazards, ground detail) and a
 * layout style, so no two hunts look alike:
 *   meadow  open fields, groves and ponds, a winding road
 *   forest  thick woods with clearings joined by trails
 *   caves   rock caverns grown by cellular automata, a stone floor
 *   marsh   islands of grass in water and mud, trails across
 *   ruins   broken stone houses in the grass, canals
 *   lava    rock fields cut by rivers of lava, fords between them
 * Whatever the shape, every open tile is reachable from the town exit; the route waypoints
 * (spread with farthest-point sampling) and the roads between them follow the terrain.
 */
import { MapGrid, Noise, Rng, makeObjects } from './map-kit.ts';
import { BORDERS, COLLISION, DECOR, GROUND, PROPS, type BorderSet } from './tileset.ts';

export type Theme =
  'cemetery' | 'woods' | 'crypt' | 'swamp' | 'village' | 'bog_heart' | 'ash' | 'molten' | 'throne';

type Style = 'meadow' | 'forest' | 'caves' | 'marsh' | 'ruins' | 'lava';

interface Litter {
  tiles: number[];
  chance: number;
}

interface Biome {
  style: Style;
  /** Upper ground (grass) and the lower one of roads and clearings. */
  field: number[];
  floor: number[];
  border: BorderSet | null;
  /** Ground under the solid mass (caves: the rock). */
  solidGround?: number[];
  hazard: 'water' | 'lava';
  /** 64 px props of the solid mass, and blocking 32 px objects. */
  props: number[];
  blocks: number[];
  /** Blocking objects scattered in the open (graves, boulders). */
  scatter: number[];
  scatterChance: number;
  detail: Litter[];
  meadow: Litter[];
  roadDetail: Litter[];
  litter: Litter[];
}

const BIOMES: Record<Theme, Biome> = {
  cemetery: {
    style: 'meadow',
    field: GROUND.dryGrass,
    floor: GROUND.dirt,
    border: BORDERS.dry,
    hazard: 'water',
    props: PROPS.deadTrees,
    blocks: [...DECOR.deadBushes, ...DECOR.graves],
    scatter: DECOR.graves,
    scatterChance: 0.07,
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
    ],
  },
  woods: {
    style: 'forest',
    field: GROUND.greenGrass,
    floor: GROUND.dirt,
    border: BORDERS.green,
    hazard: 'water',
    props: PROPS.greenTrees,
    blocks: DECOR.bushes,
    scatter: DECOR.bushes,
    scatterChance: 0.03,
    detail: [{ tiles: DECOR.tuftsGreen, chance: 0.4 }],
    meadow: [
      { tiles: DECOR.violets, chance: 0.18 },
      { tiles: DECOR.berries, chance: 0.1 },
      { tiles: DECOR.flowers, chance: 0.08 },
    ],
    roadDetail: [
      { tiles: DECOR.gravel, chance: 0.08 },
      { tiles: DECOR.leaves, chance: 0.06 },
    ],
    litter: [
      { tiles: DECOR.plants, chance: 0.05 },
      { tiles: DECOR.mushrooms, chance: 0.02 },
    ],
  },
  crypt: {
    style: 'caves',
    field: GROUND.hexStone,
    floor: GROUND.hexStone,
    border: null,
    solidGround: GROUND.abyss,
    hazard: 'water',
    props: PROPS.rocks,
    blocks: DECOR.boulders,
    scatter: [...DECOR.brazier, ...DECOR.graves, ...DECOR.boulders],
    scatterChance: 0.05,
    detail: [{ tiles: DECOR.gravel, chance: 0.18 }],
    meadow: [],
    roadDetail: [],
    litter: [
      { tiles: DECOR.bones, chance: 0.06 },
      { tiles: DECOR.pebbles, chance: 0.03 },
    ],
  },
  swamp: {
    style: 'marsh',
    field: GROUND.mossGrass,
    floor: GROUND.mud,
    border: BORDERS.moss,
    hazard: 'water',
    props: PROPS.swampTrees,
    blocks: DECOR.bushes,
    scatter: DECOR.bushes,
    scatterChance: 0.02,
    detail: [
      { tiles: DECOR.tuftsDry, chance: 0.25 },
      { tiles: DECOR.moss, chance: 0.12 },
    ],
    meadow: [{ tiles: DECOR.violets, chance: 0.15 }],
    roadDetail: [{ tiles: DECOR.moss, chance: 0.08 }],
    litter: [
      { tiles: DECOR.toadstools, chance: 0.03 },
      { tiles: DECOR.mushrooms, chance: 0.02 },
      { tiles: DECOR.plants, chance: 0.05 },
    ],
  },
  village: {
    style: 'ruins',
    field: GROUND.mossGrass,
    floor: GROUND.cobble,
    border: BORDERS.moss,
    hazard: 'water',
    props: PROPS.swampTrees,
    blocks: [...DECOR.boulders, ...DECOR.bushes],
    scatter: [...DECOR.crates, ...DECOR.barrels],
    scatterChance: 0.04,
    detail: [
      { tiles: DECOR.tuftsDry, chance: 0.3 },
      { tiles: DECOR.moss, chance: 0.1 },
    ],
    meadow: [{ tiles: DECOR.violets, chance: 0.1 }],
    roadDetail: [{ tiles: DECOR.moss, chance: 0.12 }],
    litter: [
      { tiles: DECOR.bones, chance: 0.02 },
      { tiles: DECOR.plants, chance: 0.04 },
    ],
  },
  bog_heart: {
    style: 'forest',
    field: GROUND.mossGrass,
    floor: GROUND.mud,
    border: BORDERS.moss,
    hazard: 'water',
    props: [...PROPS.swampTrees, ...PROPS.giantMushrooms],
    blocks: DECOR.bushes,
    scatter: DECOR.toadstools,
    scatterChance: 0,
    detail: [
      { tiles: DECOR.moss, chance: 0.2 },
      { tiles: DECOR.tuftsDry, chance: 0.2 },
    ],
    meadow: [{ tiles: DECOR.violets, chance: 0.12 }],
    roadDetail: [{ tiles: DECOR.moss, chance: 0.1 }],
    litter: [
      { tiles: DECOR.toadstools, chance: 0.05 },
      { tiles: DECOR.bones, chance: 0.02 },
    ],
  },
  ash: {
    style: 'lava',
    field: GROUND.darkEarth,
    floor: GROUND.darkRock,
    border: null,
    hazard: 'lava',
    props: PROPS.rocks,
    blocks: DECOR.boulders,
    scatter: DECOR.boulders,
    scatterChance: 0.04,
    detail: [{ tiles: DECOR.gravel, chance: 0.14 }],
    meadow: [],
    roadDetail: [{ tiles: DECOR.gravel, chance: 0.08 }],
    litter: [
      { tiles: DECOR.bones, chance: 0.03 },
      { tiles: DECOR.pebbles, chance: 0.03 },
    ],
  },
  molten: {
    style: 'caves',
    field: GROUND.darkRock,
    floor: GROUND.darkRock,
    border: null,
    solidGround: GROUND.darkEarth,
    hazard: 'lava',
    props: PROPS.rocks,
    blocks: DECOR.boulders,
    scatter: [...DECOR.brazier, ...DECOR.boulders],
    scatterChance: 0.03,
    detail: [{ tiles: DECOR.gravel, chance: 0.16 }],
    meadow: [],
    roadDetail: [],
    litter: [{ tiles: DECOR.bones, chance: 0.04 }],
  },
  throne: {
    style: 'ruins',
    field: GROUND.darkEarth,
    floor: GROUND.hexStone,
    border: null,
    hazard: 'lava',
    props: PROPS.rocks,
    blocks: DECOR.boulders,
    scatter: [...DECOR.brazier, ...DECOR.boulders, ...DECOR.graves],
    scatterChance: 0.04,
    detail: [{ tiles: DECOR.gravel, chance: 0.16 }],
    meadow: [],
    roadDetail: [{ tiles: DECOR.gravel, chance: 0.06 }],
    litter: [{ tiles: DECOR.bones, chance: 0.04 }],
  },
};

const W = 40;
const H = 30;
const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const idx = (x: number, y: number) => y * W + x;
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

/** Solid mass and hazards by layout style (true = blocked). */
function shapeTerrain(style: Style, rng: Rng) {
  const solid = new Array<boolean>(W * H).fill(false);
  const hazard = new Array<boolean>(W * H).fill(false);
  const n1 = new Noise(rng, 6);
  const n2 = new Noise(rng, 4);
  const n3 = new Noise(rng, 9);
  /** Cave-like blobs: random fill smoothed by the 5-of-9 rule. */
  const automaton = (fill: number, steps: number) => {
    let cells = solid.map(() => rng.chance(fill));
    for (let k = 0; k < steps; k++) {
      cells = cells.map((_, i) => {
        const x = i % W;
        const y = Math.floor(i / W);
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!inside(x + dx, y + dy) || cells[idx(x + dx, y + dy)]) n++;
          }
        }
        return n >= 5;
      });
    }
    return cells;
  };
  const each = (fn: (x: number, y: number, i: number) => void) => {
    for (let i = 0; i < W * H; i++) fn(i % W, Math.floor(i / W), i);
  };
  switch (style) {
    case 'meadow':
      each((x, y, i) => {
        solid[i] = n1.get(x, y) > 0.66;
        hazard[i] = !solid[i] && n2.get(x + 50, y) > 0.8;
      });
      break;
    case 'forest': {
      const cells = automaton(0.5, 4);
      each((x, y, i) => {
        solid[i] = cells[i]!;
        hazard[i] = !solid[i] && n2.get(x, y + 40) > 0.83;
      });
      break;
    }
    case 'caves': {
      const cells = automaton(0.47, 5);
      each((x, y, i) => {
        solid[i] = cells[i]!;
        hazard[i] = !solid[i] && n2.get(x, y) > 0.8;
      });
      break;
    }
    case 'marsh':
      each((x, y, i) => {
        hazard[i] = n1.get(x, y) < 0.42;
        solid[i] = !hazard[i] && n2.get(x, y) > 0.74;
      });
      break;
    case 'lava':
      each((x, y, i) => {
        // Ridged noise: thin winding rivers where the noise crosses the middle.
        hazard[i] = Math.abs(n3.get(x, y) - 0.5) < 0.045 || n2.get(x, y) > 0.84;
        solid[i] = !hazard[i] && n1.get(x + 30, y) > 0.7;
      });
      break;
    case 'ruins':
      each((x, y, i) => {
        solid[i] = n1.get(x, y) > 0.74;
        hazard[i] = !solid[i] && n2.get(x, y) > 0.82;
      });
      break;
  }
  return { solid, hazard };
}

/** Cheapest path (4 directions) from any `from` tile to any tile `goal` accepts. */
function cheapest(
  from: Iterable<number>,
  goal: (i: number) => boolean,
  cost: (i: number) => number | null,
): number[] {
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const frontier: [number, number][] = [];
  for (const i of from) {
    dist.set(i, 0);
    frontier.push([0, i]);
  }
  while (frontier.length > 0) {
    frontier.sort((a, b) => a[0] - b[0]);
    const [d, i] = frontier.shift()!;
    if (d > (dist.get(i) ?? Infinity)) continue;
    if (goal(i)) {
      const path = [i];
      for (let k = i; prev.has(k); k = prev.get(k)!) path.push(prev.get(k)!);
      return path;
    }
    const x = i % W;
    const y = Math.floor(i / W);
    for (const [dx, dy] of N4) {
      if (!inside(x + dx, y + dy)) continue;
      const j = idx(x + dx, y + dy);
      const step = cost(j);
      if (step === null) continue;
      if (d + step < (dist.get(j) ?? Infinity)) {
        dist.set(j, d + step);
        prev.set(j, i);
        frontier.push([d + step, j]);
      }
    }
  }
  return [];
}

export function buildHuntMap(theme: Theme, seed: number) {
  const rng = new Rng(seed);
  const biome = BIOMES[theme];
  const g = new MapGrid(W, H, COLLISION);
  const { solid, hazard } = shapeTerrain(biome.style, rng);
  // Water needs room for its sandy shore: keep it only where it fills a 3×3 block.
  const pruneWater = () => {
    if (biome.hazard !== 'water') return;
    const keep = new Array<boolean>(W * H).fill(false);
    for (let y = 0; y + 2 < H; y++) {
      for (let x = 0; x + 2 < W; x++) {
        let full = true;
        for (let j = 0; j < 3 && full; j++) {
          for (let i = 0; i < 3 && full; i++) full = hazard[idx(x + i, y + j)]!;
        }
        if (full) {
          for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) keep[idx(x + i, y + j)] = true;
        }
      }
    }
    for (let i = 0; i < W * H; i++) hazard[i] = hazard[i]! && keep[i]!;
  };
  pruneWater();
  const walls: { x: number; y: number }[] = [];

  // The map edge is closed, a little deeper here and there.
  const edge = new Noise(rng, 5);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (d === 0 || (d === 1 && edge.get(x, y) > 0.5) || (d === 2 && edge.get(x, y) > 0.8)) {
        solid[idx(x, y)] = true;
        hazard[idx(x, y)] = false;
      }
    }
  }
  // Ruins: broken stone houses.
  if (biome.style === 'ruins') {
    const placed: [number, number, number, number][] = [];
    for (let tries = 0; tries < 60 && placed.length < 6; tries++) {
      const w = rng.int(4, 7);
      const h = rng.int(4, 6);
      const x0 = rng.int(5, W - w - 4);
      const y0 = rng.int(3, H - h - 3);
      // Houses keep two tiles apart, so walls never tangle.
      if (
        placed.some(
          ([a, b, c, d]) => x0 <= c + 2 && x0 + w >= a - 2 && y0 <= d + 2 && y0 + h >= b - 2,
        )
      ) {
        continue;
      }
      placed.push([x0, y0, x0 + w, y0 + h]);
      const door = rng.int(x0 + 1, x0 + w - 1);
      for (let y = y0; y <= y0 + h; y++) {
        for (let x = x0; x <= x0 + w; x++) {
          const onWall = x === x0 || x === x0 + w || y === y0 || y === y0 + h;
          solid[idx(x, y)] = false;
          hazard[idx(x, y)] = false;
          if (onWall && !(y === y0 + h && x === door) && rng.chance(0.85)) {
            solid[idx(x, y)] = true;
            walls.push({ x, y });
          }
        }
      }
    }
  }

  // Town exit on the left edge, with an opening into the map.
  const ey = rng.int(8, H - 9);
  const exit = { x: 1, y: ey };
  for (let y = ey - 1; y <= ey + 1; y++) {
    for (let x = 0; x <= 4; x++) {
      solid[idx(x, y)] = x === 0;
      hazard[idx(x, y)] = false;
    }
  }

  // Every open pocket joins the main area: carve the cheapest way (rock costs more than
  // water, which becomes a ford).
  const open = (i: number) => !solid[i] && !hazard[i];
  const flood = (start: number) => {
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const i = queue.pop()!;
      const x = i % W;
      const y = Math.floor(i / W);
      for (const [dx, dy] of N4) {
        if (!inside(x + dx, y + dy)) continue;
        const j = idx(x + dx, y + dy);
        if (!seen.has(j) && open(j)) {
          seen.add(j);
          queue.push(j);
        }
      }
    }
    return seen;
  };
  let main = flood(idx(exit.x, exit.y));
  for (let guard = 0; guard < 60; guard++) {
    let pocket = -1;
    for (let i = 0; i < W * H && pocket < 0; i++) if (open(i) && !main.has(i)) pocket = i;
    if (pocket < 0) break;
    const comp = flood(pocket);
    if (comp.size < 5) {
      for (const i of comp) solid[i] = true;
      continue;
    }
    const path = cheapest(
      comp,
      (i) => main.has(i),
      (j) => {
        const x = j % W;
        const y = Math.floor(j / W);
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return null;
        return open(j) ? 1 : hazard[j] ? 3 : 4;
      },
    );
    for (const i of path) {
      solid[i] = false;
      hazard[i] = false;
    }
    main = flood(idx(exit.x, exit.y));
  }

  // Fords may have left thin strips of water: prune again (this only opens ground).
  pruneWater();
  main = flood(idx(exit.x, exit.y));

  // Waypoints: spread over the open area, then ordered around its centre into a loop.
  const roomy = [...main].filter((i) => {
    const x = i % W;
    const y = Math.floor(i / W);
    return (
      x > 2 &&
      y > 2 &&
      x < W - 3 &&
      y < H - 3 &&
      N4.every(([dx, dy]) => main.has(idx(x + dx, y + dy)))
    );
  });
  const dist = (a: number, b: number) =>
    Math.abs((a % W) - (b % W)) + Math.abs(Math.floor(a / W) - Math.floor(b / W));
  const middle = idx(W / 2, H / 2);
  const pts = [roomy.reduce((a, b) => (dist(a, middle) <= dist(b, middle) ? a : b))];
  while (pts.length < 7) {
    let best = -1;
    let bestD = -1;
    for (const i of roomy) {
      const d = Math.min(...pts.map((p) => dist(p, i)));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    pts.push(best);
  }
  const cx = pts.reduce((n, p) => n + (p % W), 0) / pts.length;
  const cy = pts.reduce((n, p) => n + Math.floor(p / W), 0) / pts.length;
  const angle = (p: number) => Math.atan2(Math.floor(p / W) - cy, (p % W) - cx);
  pts.sort((a, b) => angle(a) - angle(b));

  // Roads between waypoints and from the exit: cheapest paths over the open area with a
  // noisy cost so they wind, then frayed by a tile here and there.
  const roads = new Set<number>();
  if (biome.style !== 'caves') {
    const wind = new Noise(rng, 3);
    const road = (from: number, to: number) => {
      const path = cheapest(
        [from],
        (i) => i === to,
        (j) =>
          main.has(j)
            ? 1 + wind.get(j % W, Math.floor(j / W)) * 3 - (roads.has(j) ? 0.6 : 0)
            : null,
      );
      for (const i of path) roads.add(i);
    };
    const start = idx(exit.x + 1, exit.y);
    road(
      start,
      pts.reduce((a, b) => (dist(a, start) <= dist(b, start) ? a : b)),
    );
    pts.forEach((p, k) => road(p, pts[(k + 1) % pts.length]!));
    for (const i of [...roads]) {
      for (const [dx, dy] of N4) {
        const j = i + dx + dy * W;
        if (main.has(j) && rng.chance(0.3)) roads.add(j);
      }
    }
  }

  // Ground.
  const clear = new Noise(rng, 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (biome.style === 'caves') {
        g.setGround(
          x,
          y,
          rng.pick(solid[i] ? (biome.solidGround ?? biome.field) : biome.floor),
          false,
        );
      } else if (roads.has(i) || (main.has(i) && clear.get(x, y) > 0.82)) {
        g.setGround(x, y, rng.pick(biome.floor), false);
      } else {
        g.setGround(x, y, rng.pick(biome.field), true);
      }
      if (roads.has(i)) g.reserved.add(i);
    }
  }
  for (let i = 0; i < W * H; i++) {
    if (hazard[i]) g.hazardAt(i % W, Math.floor(i / W), biome.hazard);
  }

  // Walls of the ruins, as in the town: corner, verticals, horizontals, poles.
  const wallSet = new Set(walls.map((w) => idx(w.x, w.y)));
  for (const w of walls) {
    const across = wallSet.has(idx(w.x - 1, w.y)) || wallSet.has(idx(w.x + 1, w.y));
    const down = wallSet.has(idx(w.x, w.y - 1)) || wallSet.has(idx(w.x, w.y + 1));
    const piece =
      across && down
        ? PROPS.wallCorner
        : across
          ? PROPS.wallHorizontal
          : down
            ? PROPS.wallVertical
            : PROPS.wallPole;
    g.propAt(w.x, w.y, piece, true);
  }

  // The solid mass: 64 px props anchored so they cover it, 32 px blockers where no prop
  // reaches, and collision everywhere.
  const covered = new Set<number>(wallSet);
  for (let y = 1; y < H; y++) {
    for (let x = 1; x < W; x++) {
      const i = idx(x, y);
      if (!solid[i] || covered.has(i)) continue;
      const block = [i, idx(x - 1, y), idx(x, y - 1), idx(x - 1, y - 1)];
      if (block.filter((j) => solid[j]).length >= 3 && rng.chance(0.85)) {
        g.propAt(x, y, rng.pick(biome.props), true);
        for (const j of block) covered.add(j);
      }
    }
  }
  for (let i = 0; i < W * H; i++) {
    if (!solid[i]) continue;
    const x = i % W;
    const y = Math.floor(i / W);
    if (!covered.has(i) && (biome.style !== 'caves' || rng.chance(0.3))) {
      g.blockWith(x, y, rng.pick(biome.blocks));
    }
    g.block(x, y);
  }

  // Lone blockers in the open (graves, crates): only where all 8 neighbours are open, so
  // they never cut a passage.
  const taken = new Set<number>();
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = idx(x, y);
      if (!main.has(i) || roads.has(i) || !rng.chance(biome.scatterChance)) continue;
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) {
        for (let dx = -1; dx <= 1 && ok; dx++) {
          const j = idx(x + dx, y + dy);
          ok = main.has(j) && !taken.has(j) && !roads.has(j) && !pts.includes(j);
        }
      }
      if (ok && g.blockWith(x, y, rng.pick(biome.scatter))) {
        taken.add(i);
        main.delete(i);
      }
    }
  }

  // Ground detail, flowers in meadows, small objects off the roads.
  const meadows = new Noise(rng, 5);
  const roll = (list: Litter[]) => {
    for (const l of list) if (l.tiles.length > 0 && rng.chance(l.chance)) return rng.pick(l.tiles);
    return null;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (g.hazard.has(i)) continue;
      const onField = g.field.has(i) || (biome.style === 'caves' && !solid[i]);
      const d = onField
        ? ((meadows.get(x, y) > 0.66 ? roll(biome.meadow) : null) ?? roll(biome.detail))
        : roll(biome.roadDetail);
      if (d !== null) g.detail[i] = d + 1;
      if (main.has(i) && !roads.has(i) && g.free(x, y)) {
        const l = roll(biome.litter);
        if (l !== null) g.decor[i] = l + 1;
      }
    }
  }

  const o = makeObjects();
  const route = pts.map((p, k) => o.point(`wp_${k + 1}`, 'waypoint', p % W, Math.floor(p / W)));
  const spawns = pts.map((p, k) =>
    o.area(`area_${k + 1}`, 'spawn', (p % W) - 2, Math.floor(p / W) - 2, 5, 5),
  );
  const exitObj = o.point('town_exit', 'town_exit', exit.x, exit.y);
  return g.toTmj(
    biome.border,
    [
      ['route', route],
      ['spawns', spawns],
      ['town_exit', [exitObj]],
    ],
    o.next(),
  );
}
