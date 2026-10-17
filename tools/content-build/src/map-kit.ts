/**
 * Shared pieces of the map generators: a seeded random source with smooth noise (for groves,
 * meadows and patches instead of salt-and-pepper scatter), a grid of layers, automatic grass
 * edges and the export to a Tiled map (.tmj).
 */
import {
  LAVA,
  LAVA_FRAME_MS,
  PROPS_COLS,
  PROPS_ROWS,
  TILESET_COLS,
  TILESET_ROWS,
  WATER,
  WATER_FRAME_MS,
  type BorderSet,
} from './tileset.ts';

export const T = 32;

export class Rng {
  constructor(private seed: number) {}
  next(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }
  chance(p: number) {
    return this.next() < p;
  }
  pick<V>(list: readonly V[]): V {
    return list[Math.floor(this.next() * list.length)]!;
  }
  int(min: number, max: number) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

/** Smooth value noise in [0, 1): random values on a grid of `cell` tiles, blended. */
export class Noise {
  private values = new Map<string, number>();
  constructor(
    private rng: Rng,
    private cell: number,
  ) {}
  private at(gx: number, gy: number) {
    const k = `${gx},${gy}`;
    let v = this.values.get(k);
    if (v === undefined) {
      v = this.rng.next();
      this.values.set(k, v);
    }
    return v;
  }
  get(x: number, y: number) {
    const fx = x / this.cell;
    const fy = y / this.cell;
    const gx = Math.floor(fx);
    const gy = Math.floor(fy);
    const sx = (fx - gx) ** 2 * (3 - 2 * (fx - gx));
    const sy = (fy - gy) ** 2 * (3 - 2 * (fy - gy));
    const top = this.at(gx, gy) * (1 - sx) + this.at(gx + 1, gy) * sx;
    const bottom = this.at(gx, gy + 1) * (1 - sx) + this.at(gx + 1, gy + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  }
}

export interface MapObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  point?: boolean;
  gid?: number;
  rotation: number;
  visible: boolean;
}

/** Layers of one map under construction; ids are tileset ids (gid = id + 1). */
export class MapGrid {
  readonly ground: number[];
  readonly detail: number[];
  readonly decor: number[];
  readonly collision: number[];
  readonly props: { prop: number; tx: number; ty: number }[] = [];
  /** Tiles of the "upper" ground (grass): the others get its edges. */
  readonly field = new Set<number>();
  /** Tiles kept clear of obstacles (roads, floors, spots where actors stand). */
  readonly reserved = new Set<number>();
  readonly hazard = new Set<number>();

  constructor(
    readonly W: number,
    readonly H: number,
    readonly collisionId: number,
  ) {
    this.ground = new Array<number>(W * H).fill(0);
    this.detail = new Array<number>(W * H).fill(0);
    this.decor = new Array<number>(W * H).fill(0);
    this.collision = new Array<number>(W * H).fill(0);
  }

  idx(x: number, y: number) {
    return y * this.W + x;
  }
  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  }
  setGround(x: number, y: number, id: number, field: boolean) {
    const i = this.idx(x, y);
    this.ground[i] = id + 1;
    if (field) this.field.add(i);
    else this.field.delete(i);
  }
  block(x: number, y: number) {
    this.collision[this.idx(x, y)] = this.collisionId + 1;
  }
  /** Nothing stands here and nothing should. */
  free(x: number, y: number) {
    if (!this.inside(x, y)) return false;
    const i = this.idx(x, y);
    return !this.reserved.has(i) && !this.decor[i] && !this.collision[i];
  }
  /** A blocking 32 px object. */
  blockWith(x: number, y: number, id: number) {
    if (!this.free(x, y)) return false;
    this.decor[this.idx(x, y)] = id + 1;
    this.block(x, y);
    return true;
  }
  /** A 64 px prop standing on (x, y); its top-left part hangs over the tiles behind. */
  propAt(x: number, y: number, prop: number, force = false) {
    if (!force && !this.free(x, y)) return false;
    this.props.push({ prop, tx: x, ty: y });
    this.block(x, y);
    return true;
  }
  /** Water (or lava) on (x, y): animated ground, blocking. */
  hazardAt(x: number, y: number, kind: 'water' | 'lava') {
    if (!this.free(x, y)) return false;
    const id =
      kind === 'lava' ? LAVA[0]![(y % 2) * 2 + (x % 2)]! : WATER[0]![(y % 4) * 4 + (x % 4)]!;
    this.setGround(x, y, id, false);
    this.hazard.add(this.idx(x, y));
    this.block(x, y);
    return true;
  }
  /** Hazards come in 2×2 pools at least: grass edges would cover a lone tile. */
  poolAt(x: number, y: number, kind: 'water' | 'lava', w = 2, h = 2) {
    if (x < 1 || y < 1 || x + w >= this.W || y + h >= this.H) return false;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) if (!this.free(x + i, y + j)) return false;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.hazardAt(x + i, y + j, kind);
    return true;
  }

  /**
   * Grass edges: on every tile outside the field, the pieces for its field neighbours. Two
   * sides that meet take one large inner corner; a lone diagonal neighbour, a small corner.
   * On water only straight edges, so small pools stay visible.
   */
  borderLayers(b: BorderSet | null): number[][] {
    const layers: number[][] = [];
    if (!b) return layers;
    const f = (x: number, y: number) => this.inside(x, y) && this.field.has(this.idx(x, y));
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        if (f(x, y)) continue;
        const n = f(x, y - 1);
        const e = f(x + 1, y);
        const s = f(x, y + 1);
        const w = f(x - 1, y);
        const diag = !this.hazard.has(this.idx(x, y));
        const pieces: number[][] = [];
        if (diag && n && w) pieces.push(b.diagNW);
        if (diag && n && e) pieces.push(b.diagNE);
        if (diag && s && w) pieces.push(b.diagSW);
        if (diag && s && e) pieces.push(b.diagSE);
        if (n && (!diag || (!w && !e))) pieces.push(b.n);
        if (s && (!diag || (!w && !e))) pieces.push(b.s);
        if (w && (!diag || (!n && !s))) pieces.push(b.w);
        if (e && (!diag || (!n && !s))) pieces.push(b.e);
        if (!n && !w && f(x - 1, y - 1)) pieces.push(b.cornerNW);
        if (!n && !e && f(x + 1, y - 1)) pieces.push(b.cornerNE);
        if (!s && !w && f(x - 1, y + 1)) pieces.push(b.cornerSW);
        if (!s && !e && f(x + 1, y + 1)) pieces.push(b.cornerSE);
        // Variants by position (stable between runs, different from tile to tile).
        const v = (x * 7 + y * 13) >>> 0;
        pieces.forEach((variants, k) => {
          layers[k] ??= new Array<number>(this.W * this.H).fill(0);
          layers[k]![this.idx(x, y)] = variants[v % variants.length]! + 1;
        });
      }
    }
    return layers;
  }

  /** The Tiled map: tile layers, props as tile objects and the given object layers. */
  toTmj(border: BorderSet | null, objectLayers: [string, MapObject[]][], firstObjectId: number) {
    const { W, H } = this;
    let nextId = firstObjectId;
    const propsFirstGid = 1 + TILESET_COLS * TILESET_ROWS;
    // Tile objects are anchored at their bottom-left corner (Tiled's convention).
    const propObjects = this.props.map((p): MapObject => ({
      id: nextId++,
      name: '',
      type: 'prop',
      gid: propsFirstGid + p.prop,
      x: (p.tx - 1) * T,
      y: (p.ty + 1) * T,
      width: 2 * T,
      height: 2 * T,
      rotation: 0,
      visible: true,
    }));
    let layerId = 1;
    const tileLayer = (name: string, data: number[], visible = true) => ({
      id: layerId++,
      name,
      type: 'tilelayer',
      width: W,
      height: H,
      x: 0,
      y: 0,
      opacity: 1,
      visible,
      data,
    });
    const objectLayer = (name: string, objects: MapObject[]) => ({
      id: layerId++,
      name,
      type: 'objectgroup',
      draworder: 'index',
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      objects,
    });
    const layers = [
      tileLayer('ground', this.ground),
      ...this.borderLayers(border).map((data, k) => tileLayer(`border${k + 1}`, data)),
      tileLayer('detail', this.detail),
      tileLayer('decor', this.decor),
      tileLayer('collision', this.collision, false),
      objectLayer('props', propObjects),
      ...objectLayers.map(([name, objects]) => objectLayer(name, objects)),
    ];
    return {
      compressionlevel: -1,
      width: W,
      height: H,
      infinite: false,
      orientation: 'orthogonal',
      renderorder: 'right-down',
      tiledversion: '1.11.2',
      version: '1.10',
      type: 'map',
      tilewidth: T,
      tileheight: T,
      nextlayerid: layerId,
      nextobjectid: nextId,
      layers,
      tilesets: [
        {
          firstgid: 1,
          name: 'tiles',
          image: '../sprites/tiles.png',
          imagewidth: TILESET_COLS * T,
          imageheight: TILESET_ROWS * T,
          columns: TILESET_COLS,
          tilecount: TILESET_COLS * TILESET_ROWS,
          tilewidth: T,
          tileheight: T,
          margin: 0,
          spacing: 0,
          tiles: [
            ...WATER[0]!.map((id, c) => ({
              id,
              animation: WATER.map((frame) => ({ tileid: frame[c]!, duration: WATER_FRAME_MS })),
            })),
            ...LAVA[0]!.map((id, c) => ({
              id,
              animation: LAVA.map((frame) => ({ tileid: frame[c]!, duration: LAVA_FRAME_MS })),
            })),
          ],
        },
        {
          firstgid: propsFirstGid,
          name: 'props',
          image: '../sprites/props.png',
          imagewidth: PROPS_COLS * 2 * T,
          imageheight: PROPS_ROWS * 2 * T,
          columns: PROPS_COLS,
          tilecount: PROPS_COLS * PROPS_ROWS,
          tilewidth: 2 * T,
          tileheight: 2 * T,
          margin: 0,
          spacing: 0,
        },
      ],
    };
  }
}

/** Object helpers in map pixels. */
export function makeObjects() {
  let nextId = 1;
  return {
    point: (name: string, type: string, tx: number, ty: number): MapObject => ({
      id: nextId++,
      name,
      type,
      x: tx * T + T / 2,
      y: ty * T + T / 2,
      width: 0,
      height: 0,
      point: true,
      rotation: 0,
      visible: true,
    }),
    area: (
      name: string,
      type: string,
      tx: number,
      ty: number,
      tw: number,
      th: number,
    ): MapObject => ({
      id: nextId++,
      name,
      type,
      x: tx * T,
      y: ty * T,
      width: tw * T,
      height: th * T,
      rotation: 0,
      visible: true,
    }),
    next: () => nextId,
  };
}
