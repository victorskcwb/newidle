import { z } from 'zod';

/**
 * The subset of the Tiled JSON map format (.tmj) the game uses. Maps are authored in Tiled
 * with the layers of section 4.1; these helpers read routes, spawns and the collision grid.
 */
export const REQUIRED_LAYERS = [
  'ground',
  'decor',
  'collision',
  'route',
  'spawns',
  'town_exit',
] as const;

const tiledObject = z.object({
  id: z.number().int(),
  name: z.string(),
  type: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  point: z.boolean().optional(),
});
export type TiledObject = z.infer<typeof tiledObject>;

const tileLayer = z.object({
  type: z.literal('tilelayer'),
  name: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  data: z.array(z.number().int()),
  visible: z.boolean().optional(),
});

const objectLayer = z.object({
  type: z.literal('objectgroup'),
  name: z.string(),
  objects: z.array(tiledObject),
});

export const tiledMapSchema = z.object({
  width: z.number().int(),
  height: z.number().int(),
  tilewidth: z.literal(32),
  tileheight: z.literal(32),
  orientation: z.literal('orthogonal'),
  layers: z.array(z.discriminatedUnion('type', [tileLayer, objectLayer])),
  tilesets: z
    .array(
      z.object({
        firstgid: z.number().int(),
        name: z.string(),
        image: z.string().optional(),
        columns: z.number().int().optional(),
        tilecount: z.number().int().optional(),
        tiles: z
          .array(
            z.object({
              id: z.number().int(),
              animation: z
                .array(z.object({ tileid: z.number().int(), duration: z.number().int() }))
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .min(1),
});
export type TiledMap = z.infer<typeof tiledMapSchema>;

export interface TilePoint {
  tx: number;
  ty: number;
}

export function tileLayerOf(map: TiledMap, name: string) {
  const layer = map.layers.find((l) => l.name === name);
  return layer?.type === 'tilelayer' ? layer : undefined;
}

export function objectsOf(map: TiledMap, name: string): TiledObject[] {
  const layer = map.layers.find((l) => l.name === name);
  return layer?.type === 'objectgroup' ? layer.objects : [];
}

/** walkable[ty][tx] — true where the collision layer has no tile. */
export function walkableGrid(map: TiledMap): boolean[][] {
  const collision = tileLayerOf(map, 'collision');
  const grid: boolean[][] = [];
  for (let ty = 0; ty < map.height; ty++) {
    const row: boolean[] = [];
    for (let tx = 0; tx < map.width; tx++) {
      row.push(!collision || (collision.data[ty * map.width + tx] ?? 0) === 0);
    }
    grid.push(row);
  }
  return grid;
}

export function toTile(map: TiledMap, x: number, y: number): TilePoint {
  return { tx: Math.floor(x / map.tilewidth), ty: Math.floor(y / map.tileheight) };
}

/** Route waypoints `wp_1`, `wp_2`… in order, as tiles. */
export function routeWaypoints(map: TiledMap, layer = 'route'): TilePoint[] {
  return objectsOf(map, layer)
    .filter((o) => /^wp_\d+$/.test(o.name))
    .sort((a, b) => Number(a.name.slice(3)) - Number(b.name.slice(3)))
    .map((o) => toTile(map, o.x, o.y));
}

/** Tiles reachable from `start` moving in 4 directions over walkable tiles. */
export function reachableFrom(grid: boolean[][], start: TilePoint): Set<string> {
  const seen = new Set<string>();
  if (!grid[start.ty]?.[start.tx]) return seen;
  const queue: TilePoint[] = [start];
  seen.add(`${start.tx},${start.ty}`);
  while (queue.length > 0) {
    const { tx, ty } = queue.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = tx + dx;
      const ny = ty + dy;
      const key = `${nx},${ny}`;
      if (!seen.has(key) && grid[ny]?.[nx]) {
        seen.add(key);
        queue.push({ tx: nx, ty: ny });
      }
    }
  }
  return seen;
}

/**
 * Structural checks of a hunt map: required layers, numbered route, everything reachable.
 * Returns the problems found (empty when the map is valid).
 */
export function validateHuntMap(map: TiledMap, routeLayer: string): string[] {
  const problems: string[] = [];
  for (const name of REQUIRED_LAYERS) {
    const name2 = name === 'route' ? routeLayer : name;
    if (!map.layers.some((l) => l.name === name2)) problems.push(`missing layer "${name2}"`);
  }
  const route = objectsOf(map, routeLayer).filter((o) => /^wp_\d+$/.test(o.name));
  const numbers = route.map((o) => Number(o.name.slice(3))).sort((a, b) => a - b);
  if (numbers.length < 2) problems.push('route needs at least 2 waypoints');
  numbers.forEach((n, i) => {
    if (n !== i + 1)
      problems.push(`route waypoints must be wp_1..wp_${numbers.length} (found wp_${n})`);
  });
  const grid = walkableGrid(map);
  const wps = routeWaypoints(map, routeLayer);
  const first = wps[0];
  if (!first) return problems;
  const reach = reachableFrom(grid, first);
  wps.forEach((wp, i) => {
    if (!reach.has(`${wp.tx},${wp.ty}`)) problems.push(`wp_${i + 1} is not reachable from wp_1`);
  });
  const exits = objectsOf(map, 'town_exit');
  if (exits.length !== 1) problems.push('town_exit needs exactly one object');
  for (const e of exits) {
    const t = toTile(map, e.x, e.y);
    if (!reach.has(`${t.tx},${t.ty}`)) problems.push('town_exit is not reachable from the route');
  }
  const spawns = objectsOf(map, 'spawns');
  if (spawns.length === 0) problems.push('no spawn areas');
  for (const sp of spawns) {
    const a = toTile(map, sp.x, sp.y);
    const b = toTile(map, sp.x + (sp.width ?? 0) - 1, sp.y + (sp.height ?? 0) - 1);
    let ok = false;
    for (let ty = a.ty; ty <= b.ty && !ok; ty++) {
      for (let tx = a.tx; tx <= b.tx && !ok; tx++) ok = reach.has(`${tx},${ty}`);
    }
    if (!ok) problems.push(`spawn area "${sp.name}" has no reachable tile`);
  }
  return problems;
}
