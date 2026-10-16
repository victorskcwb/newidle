import { spriteManifestSchema, tiledMapSchema, type TiledMap } from '@abismo/content';
import Phaser from 'phaser';
import type { GameSim } from '../game/sim.ts';
import { useUi } from '../state/store.ts';
import { Director } from './director.ts';
import { Effects } from './effects.ts';
import { Pathfinder } from './pathfinder.ts';
import { makeTextures, manifestSheets } from './textures.ts';

export const ZOOM_LEVELS = [1, 2, 3] as const;

/** Map colour per region: dusk in Cinzarra, murky green in Morvel, embers in the Citadel. */
const REGION_TINT: Record<string, number> = {
  cinzarra: 0x9c98b4,
  morvel_swamp: 0x8fa088,
  burned_citadel: 0xc89484,
};

/** The hunt map: Tiled layers, placeholder textures and the director that stages events. */
export class GameScene extends Phaser.Scene {
  private director!: Director;
  private unsubscribe: (() => void)[] = [];

  constructor(
    private sim: GameSim,
    private mapId: string,
    private regionId: string,
    private options: { noParticles: boolean },
  ) {
    super('hunt');
  }

  preload() {
    this.load.tilemapTiledJSON('map', `${this.mapId}.tmj`);
    this.load.image('tiles', 'sprites/tiles.png');
    this.load.json('manifest', 'sprites/manifest.json');
    // Sprite sheets named by the manifest are queued as soon as the manifest arrives.
    this.load.once('filecomplete-json-manifest', (_key: string, _type: string, data: unknown) => {
      for (const sheet of manifestSheets(spriteManifestSchema.parse(data))) {
        this.load.spritesheet(sheet.key, sheet.url, {
          frameWidth: sheet.size,
          frameHeight: sheet.size,
        });
      }
    });
  }

  create() {
    const raw = this.cache.tilemap.get('map').data as unknown;
    const mapData: TiledMap = tiledMapSchema.parse(raw);
    const manifest = spriteManifestSchema.parse(this.cache.json.get('manifest'));
    makeTextures(this, this.sim.content, this.sim.state.hero.appearance);

    const map = this.make.tilemap({ key: 'map' });
    const tiles = map.addTilesetImage('tiles', 'tiles')!;
    const ground = map.createLayer('ground', tiles)!;
    const decor = map.createLayer('decor', tiles)!;
    // Dark-fantasy mood per region over the bright CC0 tiles.
    const tint = REGION_TINT[this.regionId] ?? 0xffffff;
    ground.setTint(tint);
    decor.setTint(tint);
    Director.animateTiles(this, ground, mapData);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.setBackgroundColor('#0e0d12');
    cam.setRoundPixels(true);

    const effects = new Effects(this);
    effects.reducedMotion = this.options.noParticles;
    // Loot flies to the backpack button, which sits in the bottom-right corner of the screen.
    const backpackTarget = () => {
      const view = cam.worldView;
      return { x: view.right - 40 / cam.zoom, y: view.bottom - 40 / cam.zoom };
    };
    const director = new Director(
      this,
      this.sim,
      mapData,
      new Pathfinder(mapData),
      manifest,
      effects,
      backpackTarget,
    );
    director.calm = this.options.noParticles;
    this.director = director;

    const applyZoom = (zoom: number) => cam.setZoom(zoom);
    applyZoom(useUi.getState().zoom);
    this.unsubscribe.push(
      this.sim.on(this.director.onSignal),
      useUi.subscribe((s, prev) => {
        if (s.zoom !== prev.zoom) applyZoom(s.zoom);
      }),
    );
    const cleanup = () => {
      this.unsubscribe.forEach((u) => u());
      this.unsubscribe = [];
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  override update(_time: number, delta: number) {
    // Long frames (tab switch, debugger) are clamped; the director catches up on its own.
    this.director.update(Math.min(delta, 250));
  }
}
