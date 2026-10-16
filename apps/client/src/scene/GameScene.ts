import { spriteManifestSchema, tiledMapSchema, type TiledMap } from '@abismo/content';
import Phaser from 'phaser';
import type { GameSim } from '../game/sim.ts';
import { useUi } from '../state/store.ts';
import { Director } from './director.ts';
import { Effects } from './effects.ts';
import { Pathfinder } from './pathfinder.ts';
import { makeTextures } from './textures.ts';

export const ZOOM_LEVELS = [1, 2, 3] as const;

/** The hunt map: Tiled layers, placeholder textures and the director that stages events. */
export class GameScene extends Phaser.Scene {
  private director!: Director;
  private unsubscribe: (() => void)[] = [];

  constructor(
    private sim: GameSim,
    private mapId: string,
    private options: { noParticles: boolean },
  ) {
    super('hunt');
  }

  preload() {
    this.load.tilemapTiledJSON('map', `${this.mapId}.tmj`);
    this.load.image('placeholder_tiles', 'sprites/placeholder_tiles.png');
    this.load.json('manifest', 'sprites/manifest.json');
  }

  create() {
    const raw = this.cache.tilemap.get('map').data as unknown;
    const mapData: TiledMap = tiledMapSchema.parse(raw);
    const manifest = spriteManifestSchema.parse(this.cache.json.get('manifest'));
    makeTextures(this, this.sim.content, this.sim.state.hero.appearance);

    const map = this.make.tilemap({ key: 'map' });
    const tiles = map.addTilesetImage('placeholder_tiles', 'placeholder_tiles')!;
    const ground = map.createLayer('ground', tiles)!;
    map.createLayer('decor', tiles);
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
    this.director = new Director(
      this,
      this.sim,
      mapData,
      new Pathfinder(mapData),
      manifest,
      effects,
      backpackTarget,
    );

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
