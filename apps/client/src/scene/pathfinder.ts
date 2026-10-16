import { walkableGrid, type TiledMap, type TilePoint } from '@abismo/content';
import EasyStar from 'easystarjs';

/** A* on the map's collision grid (4 directions), synchronous. */
export class Pathfinder {
  readonly walkable: boolean[][];
  private star = new EasyStar.js();

  constructor(map: TiledMap) {
    this.walkable = walkableGrid(map);
    this.star.setGrid(this.walkable.map((row) => row.map((w) => (w ? 0 : 1))));
    this.star.setAcceptableTiles([0]);
    this.star.enableSync();
  }

  isWalkable(t: TilePoint): boolean {
    return this.walkable[t.ty]?.[t.tx] === true;
  }

  /** Tiles from `from` (exclusive) to `to` (inclusive), or null if unreachable. */
  find(from: TilePoint, to: TilePoint): TilePoint[] | null {
    if (from.tx === to.tx && from.ty === to.ty) return [];
    let result: TilePoint[] | null = null;
    this.star.findPath(from.tx, from.ty, to.tx, to.ty, (path) => {
      result = path ? path.slice(1).map((p) => ({ tx: p.x, ty: p.y })) : null;
    });
    this.star.calculate();
    return result;
  }

  /** Nearest walkable tile to `t` within `radius` (spiral search), preferring `t` itself. */
  nearestWalkable(t: TilePoint, radius = 4, avoid?: Set<string>): TilePoint | null {
    for (let r = 0; r <= radius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const p = { tx: t.tx + dx, ty: t.ty + dy };
          if (this.isWalkable(p) && !avoid?.has(`${p.tx},${p.ty}`)) return p;
        }
      }
    }
    return null;
  }
}
