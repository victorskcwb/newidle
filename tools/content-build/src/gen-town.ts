/**
 * Town maps, one per region: a stone plaza with a well, four houses (blacksmith, shop,
 * storehouse and shrine) with stone walls and wooden floors, roads to the east gate and a
 * ring of trees. Object layers give the NPC posts and the spots the hero walks between.
 */
import { MapGrid, Noise, Rng, makeObjects, type MapObject } from './map-kit.ts';
import { BORDERS, COLLISION, DECOR, GROUND, PROPS, type BorderSet } from './tileset.ts';

interface TownTheme {
  field: number[];
  border: BorderSet | null;
  trees: number[];
  detail: number[];
}

const TOWN_THEMES: Record<string, TownTheme> = {
  cinzarra: {
    field: GROUND.dryGrass,
    border: BORDERS.dry,
    trees: [...PROPS.deadTrees, ...PROPS.greenTrees.slice(0, 4)],
    detail: DECOR.tuftsDry,
  },
  morvel_swamp: {
    field: GROUND.dryGrass,
    border: BORDERS.dry,
    trees: PROPS.swampTrees,
    detail: [...DECOR.tuftsDry, ...DECOR.moss],
  },
  burned_citadel: {
    field: GROUND.darkEarth,
    border: null,
    trees: PROPS.rocks,
    detail: DECOR.gravel,
  },
};

export const TOWN_REGIONS = Object.keys(TOWN_THEMES);

const W = 32;
const H = 24;

interface House {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Door tile in the top or bottom wall. */
  door: { x: number; y: number };
}

export function buildTownMap(region: string, seed: number) {
  const theme = TOWN_THEMES[region]!;
  const rng = new Rng(seed);
  const g = new MapGrid(W, H, COLLISION);
  const groves = new Noise(rng, 5);
  const flowers = new Noise(rng, 4);

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) g.setGround(x, y, rng.pick(theme.field), true);
  const pave = (x0: number, y0: number, x1: number, y1: number, tiles: number[]) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        g.setGround(x, y, rng.pick(tiles), false);
        g.reserved.add(g.idx(x, y));
      }
    }
  };

  // Plaza, the road to the east gate and the lanes to the four doors.
  pave(10, 8, 21, 15, GROUND.plaza);
  pave(22, 11, W - 1, 12, GROUND.cobble);
  pave(5, 8, 9, 9, GROUND.cobble);
  pave(22, 8, 26, 9, GROUND.cobble);
  pave(5, 14, 9, 15, GROUND.cobble);
  pave(22, 14, 26, 15, GROUND.cobble);

  const houses: Record<string, House> = {
    smithy: { x0: 2, y0: 2, x1: 8, y1: 7, door: { x: 5, y: 7 } },
    shop: { x0: 23, y0: 2, x1: 29, y1: 7, door: { x: 26, y: 7 } },
    storehouse: { x0: 2, y0: 16, x1: 8, y1: 21, door: { x: 5, y: 16 } },
    shrine: { x0: 23, y0: 16, x1: 29, y1: 21, door: { x: 26, y: 16 } },
  };
  for (const [name, h] of Object.entries(houses)) {
    // The floor stops under the right and bottom walls, which lean over the grass outside.
    pave(
      h.x0,
      h.y0,
      h.x1 - 1,
      h.y1 - 1,
      name === 'shrine' ? GROUND.darkWoodFloor : GROUND.woodFloor,
    );
    for (let x = h.x0; x <= h.x1; x++) g.reserved.add(g.idx(x, h.y1));
    for (let y = h.y0; y <= h.y1; y++) g.reserved.add(g.idx(h.x1, y));
    // Walls as in the pack: corner at the top left, verticals on the sides, horizontals on
    // the top and bottom, a pole at the bottom right. The door is a gap.
    for (let y = h.y0; y <= h.y1; y++) {
      for (let x = h.x0; x <= h.x1; x++) {
        const edge = x === h.x0 || x === h.x1 || y === h.y0 || y === h.y1;
        if (!edge || (x === h.door.x && y === h.door.y)) continue;
        const piece =
          x === h.x0 && y === h.y0
            ? PROPS.wallCorner
            : x === h.x1 && y === h.y1
              ? PROPS.wallPole
              : y === h.y0 && x < h.x1
                ? PROPS.wallHorizontal
                : y === h.y1
                  ? PROPS.wallHorizontal
                  : PROPS.wallVertical;
        g.propAt(x, y, piece, true);
      }
    }
  }
  // Furniture.
  const inside = (x: number, y: number, prop: number) => g.propAt(x, y, prop, true);
  inside(4, 4, PROPS.stove);
  inside(7, 4, PROPS.barrels);
  inside(7, 6, PROPS.crate);
  inside(3, 6, PROPS.bigTable);
  inside(25, 4, PROPS.displayCase);
  inside(28, 4, PROPS.cabinet);
  inside(28, 6, PROPS.table);
  inside(4, 19, PROPS.chestGold);
  inside(6, 19, PROPS.chestIron);
  inside(7, 20, PROPS.bigCrate);
  inside(3, 20, PROPS.darkCrate);
  inside(25, 19, PROPS.bookshelf);
  inside(28, 19, PROPS.bigTable);
  inside(24, 20, PROPS.bed);

  // The well in the middle of the plaza, benches and market goods around it.
  const place = (x: number, y: number, tiles: number[]) => {
    const i = g.idx(x, y);
    g.decor[i] = rng.pick(tiles) + 1;
    g.block(x, y);
  };
  place(15, 11, DECOR.well);
  place(11, 9, DECOR.benches);
  place(20, 9, DECOR.benches);
  place(11, 14, DECOR.benches);
  place(20, 14, DECOR.benches);
  place(9, 10, DECOR.barrels);
  place(9, 13, DECOR.crates);
  place(22, 10, DECOR.crates);
  place(22, 13, DECOR.barrels);
  place(27, 9, DECOR.pots);
  place(4, 9, DECOR.barrels);
  place(27, 14, DECOR.pots);
  place(4, 14, DECOR.crates);
  place(W - 2, 9, DECOR.sign);

  // NPC posts and the hero's stops stay clear.
  for (const [x, y] of [
    [6, 9],
    [25, 9],
    [6, 14],
    [25, 14],
    [14, 10],
    [W - 2, 10],
    [W - 2, 12],
    [7, 14],
    [24, 9],
    [7, 9],
    [24, 14],
    [17, 13],
  ] as const) {
    g.reserved.add(g.idx(x, y));
  }
  // Trees: a ring at the edge (open at the gate) and small groves in the grass.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = g.idx(x, y);
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (g.reserved.has(i)) {
        if (d === 0) g.block(x, y);
        continue;
      }
      if (d === 0) {
        if (!g.propAt(x, y, rng.pick(theme.trees))) g.block(x, y);
        g.block(x, y);
      } else if (d === 1 && rng.chance(0.35)) {
        g.propAt(x, y, rng.pick(theme.trees));
      } else if (groves.get(x, y) > 0.7 && rng.chance(0.35)) {
        g.propAt(x, y, rng.pick(theme.trees));
      }
    }
  }
  // Ground detail and flower beds.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = g.idx(x, y);
      if (!g.field.has(i)) continue;
      if (flowers.get(x, y) > 0.65 && rng.chance(0.3)) {
        g.detail[i] = rng.pick([...DECOR.violets, ...DECOR.berries]) + 1;
      } else if (rng.chance(0.35)) {
        g.detail[i] = rng.pick(theme.detail) + 1;
      }
    }
  }

  const o = makeObjects();
  const npc = (id: string, x: number, y: number): MapObject => o.point(id, 'npc', x, y);
  const npcs = [
    npc('smith', 6, 9),
    npc('merchant', 25, 9),
    npc('banker', 6, 14),
    npc('priestess', 25, 14),
    npc('elder', 14, 10),
    npc('guard', W - 2, 10),
    npc('villager_a', 12, 12),
    npc('villager_b', 19, 13),
  ];
  // Where the hero stands to talk to each of them, and where it enters and rests.
  const stations = [
    o.point('gate', 'station', W - 2, 12),
    o.point('stash', 'station', 7, 14),
    o.point('shop', 'station', 24, 9),
    o.point('smith', 'station', 7, 9),
    o.point('shrine', 'station', 24, 14),
    o.point('rest', 'station', 17, 13),
  ];
  // Villagers stroll inside this area.
  const stroll = [o.area('plaza', 'stroll', 10, 8, 12, 8)];
  return g.toTmj(
    theme.border,
    [
      ['npcs', npcs],
      ['stations', stations],
      ['stroll', stroll],
    ],
    o.next(),
  );
}
