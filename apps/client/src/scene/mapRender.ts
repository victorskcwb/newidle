import { objectsOf, type TiledMap } from '@abismo/content';
import Phaser from 'phaser';
import { Director } from './director.ts';

/** Map colour per region: dusk in Cinzarra, murky green in Morvel, embers in the Citadel. */
export const REGION_TINT: Record<string, number> = {
  cinzarra: 0xa8a4bc,
  morvel_swamp: 0x9cac94,
  burned_citadel: 0xd09a8a,
};

/**
 * Draws a generated map: the ground layer (animated water and lava), one texture with every
 * layer that never changes (grass edges, ground detail, small objects) and the 64 px props
 * as images sorted by their base, like the actors' feet. Props outside `active` (where no
 * actor ever stands) are drawn into the texture too; without `active`, all stay sorted.
 */
export function renderMap(
  scene: Phaser.Scene,
  key: string,
  mapData: TiledMap,
  tint: number,
  /** Props that actors can walk behind (sorted live); null keeps them all live. */
  active: ((tx: number, ty: number) => boolean) | null,
) {
  const map = scene.make.tilemap({ key });
  const tiles = map.addTilesetImage('tiles', 'tiles')!;
  const ground = map.createLayer('ground', tiles)!;
  ground.setTint(tint);
  const statics = mapData.layers
    .filter(
      (l) =>
        l.type === 'tilelayer' &&
        (l.name.startsWith('border') || l.name === 'detail' || l.name === 'decor'),
    )
    .map((l) => map.createLayer(l.name, tiles)!);
  const baked = scene.add
    .renderTexture(0, 0, map.widthInPixels, map.heightInPixels)
    .setOrigin(0, 0)
    .draw(statics)
    .setTint(tint);
  for (const layer of statics) layer.destroy();
  const propsSet = mapData.tilesets.find((t) => t.name === 'props');
  if (propsSet) {
    const props = objectsOf(mapData, 'props').toSorted((a, b) => a.y - b.y);
    for (const o of props) {
      if (o.gid === undefined) continue;
      const frame = o.gid - propsSet.firstgid;
      if (!active || active(Math.round(o.x / 32) + 1, Math.round(o.y / 32) - 1)) {
        scene.add.image(o.x, o.y, 'props', frame).setOrigin(0, 1).setDepth(o.y).setTint(tint);
      } else {
        baked.drawFrame('props', frame, o.x, o.y - 64);
      }
    }
  }
  Director.animateTiles(scene, ground, mapData);
  return map;
}

/**
 * A few drifting motes over the map for life: pale dust in Cinzarra, fireflies in Morvel,
 * rising embers in the Citadel. Off in economy mode and with reduced motion.
 */
export function addAtmosphere(
  scene: Phaser.Scene,
  regionId: string,
  width: number,
  height: number,
) {
  const look =
    regionId === 'burned_citadel'
      ? { tint: [0xff8a3a, 0xffc04a], speedY: { min: -30, max: -12 }, life: 3200 }
      : regionId === 'morvel_swamp'
        ? { tint: [0xc8ff6a, 0x8cff9a], speedY: { min: -8, max: 8 }, life: 4200 }
        : { tint: [0xe8e0ff, 0xbfb8d8], speedY: { min: -6, max: 6 }, life: 5000 };
  scene.add
    .particles(0, 0, 'spark', {
      x: { min: 0, max: width },
      y: { min: 0, max: height },
      speedX: { min: -8, max: 8 },
      speedY: look.speedY,
      lifespan: look.life,
      scale: { start: 0.5, end: 0.1 },
      alpha: { values: [0, 0.8, 0.8, 0] },
      tint: look.tint,
      frequency: 320,
      quantity: 1,
      maxAliveParticles: 14,
      blendMode: Phaser.BlendModes.ADD,
    })
    .setDepth(99_000);
}
