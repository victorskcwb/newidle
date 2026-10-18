import {
  objectsOf,
  spriteManifestSchema,
  tiledMapSchema,
  toTile,
  type TiledMap,
  type TilePoint,
} from '@abismo/content';
import Phaser from 'phaser';
import type { GameSim } from '../game/sim.ts';
import { t } from '../i18n.ts';
import { usePrefs } from '../state/prefs.ts';
import { useUi, type TownView } from '../state/store.ts';
import { Actor } from './actor.ts';
import { Effects } from './effects.ts';
import { REGION_TINT, addAtmosphere, renderMap } from './mapRender.ts';
import { Pathfinder } from './pathfinder.ts';
import { heroLook, npcLook } from './textures.ts';
import { ITEM_ICON_FRAMES } from '../ui/itemIcons.generated.ts';
import { claimableQuests } from '@abismo/engine';

/** The service each keeper offers, as the icon in its speech bubble. */
export const NPC_SERVICE_ICON: Record<string, string> = {
  elder: 'quest',
  smith: 'item.iron_blade',
  merchant: 'gold',
  banker: 'chest',
  priestess: 'book',
  guard: 'key',
};

/** NPC that greets the hero at each stop of a town visit. */
const STOP_NPC: Record<string, string> = {
  stash: 'banker',
  shop: 'merchant',
  smith: 'smith',
  shrine: 'priestess',
};

interface Npc {
  id: string;
  actor: Actor;
  home: TilePoint;
  wanders: boolean;
  nextMoveMs: number;
  bubble?: Phaser.GameObjects.Container;
  alert?: Phaser.GameObjects.Text;
}

/**
 * The region's town, drawn over the hunt while the hero is there (the hunt keeps running
 * underneath so the director goes on staging the engine's events). On a supply trip the
 * hero walks from the gate to the storehouse, the shop and the smithy on its own, each
 * keeper greeting it. Tapping the ground takes over: the hero walks there and stays in
 * town; tapping a keeper (with its service bubble) walks up and opens its dialog.
 */
export class TownScene extends Phaser.Scene {
  private hero!: Actor;
  private npcs: Npc[] = [];
  private paths!: Pathfinder;
  private stations = new Map<string, TilePoint>();
  private stroll: Phaser.Geom.Rectangle | null = null;
  private plan: string[] = [];
  private waitMs = 0;
  private fx!: Effects;
  private shown = false;
  /** Keeper whose dialog opens when the hero arrives next to it. */
  private talkTo: Npc | null = null;
  private alertTimer = 0;
  private keys: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key[]> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private sim: GameSim,
    private regionId: string,
    private options: { noParticles: boolean },
  ) {
    super('town');
  }

  preload() {
    this.load.tilemapTiledJSON('townmap', `maps/town_${this.regionId}.tmj`);
  }

  create() {
    const mapData: TiledMap = tiledMapSchema.parse(
      this.cache.tilemap.get('townmap').data as unknown,
    );
    const manifest = spriteManifestSchema.parse(this.cache.json.get('manifest'));
    const tint = REGION_TINT[this.regionId] ?? 0xffffff;
    const map = renderMap(this, 'townmap', mapData, tint, null);
    if (!this.options.noParticles && usePrefs.getState().gfx.atmosphere) {
      addAtmosphere(this, this.regionId, map.widthInPixels, map.heightInPixels);
    }
    this.paths = new Pathfinder(mapData);
    for (const s of objectsOf(mapData, 'stations')) {
      this.stations.set(s.name, toTile(mapData, s.x, s.y));
    }
    const area = objectsOf(mapData, 'stroll')[0];
    if (area) this.stroll = new Phaser.Geom.Rectangle(area.x, area.y, area.width, area.height);
    this.fx = new Effects(this);
    this.fx.reducedMotion = this.options.noParticles;

    for (const o of objectsOf(mapData, 'npcs')) {
      const look = npcLook(this, manifest, o.name);
      if (!look) continue;
      const actor = new Actor(
        this,
        look,
        {},
        {
          // Keepers have names over their heads; strolling villagers do not.
          name: o.name.startsWith('villager') ? '' : t(`npc.${o.name}`),
          color: '#ffe9a8',
          bar: false,
        },
      );
      actor.speed = 1.6;
      actor.setOverhead(usePrefs.getState().gfx.names);
      const home = toTile(mapData, o.x, o.y);
      actor.place(home);
      const npc: Npc = {
        id: o.name,
        actor,
        home,
        wanders: o.name.startsWith('villager'),
        nextMoveMs: 1500 + Math.random() * 3000,
      };
      const icon = NPC_SERVICE_ICON[o.name];
      if (icon) this.addBubble(npc, icon);
      this.npcs.push(npc);
    }
    this.hero = new Actor(
      this,
      heroLook(this, manifest, this.sim.state.hero.appearance.outfit),
      manifest.atlases.hero?.sprites.warrior?.animations ?? {},
      { name: this.sim.state.hero.name, color: '#9fd3ff', bar: false },
    );
    this.hero.speed = 3;

    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.setBackgroundColor('#0e0d12');
    cam.setRoundPixels(true);
    cam.startFollow(this.hero.container, true, 0.1, 0.1);
    cam.setZoom(useUi.getState().zoom);

    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: unknown[]) => {
      if (!this.shown || p.getDistance() > 12 || over.length > 0) return;
      this.onTap(p.worldX, p.worldY);
    });

    // Arrows and WASD walk tile by tile while held; E talks to a keeper next to the hero
    // (Enter and Space stay with the focused button). Keys are not captured, so typing in the interface still works.
    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      const key = (code: number) => kb.addKey(code, false);
      this.keys = {
        up: [key(K.UP), key(K.W)],
        down: [key(K.DOWN), key(K.S)],
        left: [key(K.LEFT), key(K.A)],
        right: [key(K.RIGHT), key(K.D)],
      };
      key(K.E).on('down', () => {
        if (this.shown && !this.uiBusy()) this.talkNearby();
      });
    }

    // Asleep (no update, no drawing) until the hero comes to town. Sleeping is queued by
    // Phaser, so a scene that starts in town must not be put to sleep at all.
    const apply = (view: TownView) => (view ? this.show(view) : this.hide());
    const first = useUi.getState().town;
    if (first) this.show(first);
    else {
      this.sys.setVisible(false);
      this.scene.sleep();
    }
    this.unsubscribe = useUi.subscribe((s, prev) => {
      if (s.town !== prev.town) apply(s.town);
      if (s.zoom !== prev.zoom) cam.setZoom(s.zoom);
    });
    const cleanup = () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  private show(view: 'depositing' | 'idle' | 'leaving') {
    const arriving = !this.shown;
    this.shown = true;
    if (this.scene.isSleeping()) this.scene.wake();
    this.sys.setVisible(true);
    this.scene.setVisible(false, 'hunt');
    if (arriving) {
      // Straight to the town square: no walk from the gate.
      this.cameras.main.fadeIn(250);
      this.plan = [];
      this.waitMs = 0;
      this.hero.place(this.stations.get('rest')!);
      this.hero.reset(false);
      this.cameras.main.centerOn(this.hero.x, this.hero.y);
    }
    if (view === 'leaving') {
      // Off to the hunt: walk out through the gate while the departure lasts.
      useUi.getState().openNpc(null);
      this.talkTo = null;
      this.waitMs = 0;
      this.plan = ['gate'];
    }
  }

  /** A white bubble with the keeper's service icon, bobbing over its head. */
  private addBubble(npc: Npc, icon: string) {
    const frame = ITEM_ICON_FRAMES[icon] ?? 0;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-11, -9, 22, 20, 7);
    g.fillStyle(0xfdf3dc, 1).fillRoundedRect(-12, -11, 24, 20, 7);
    g.fillTriangle(-4, 8, 4, 8, 0, 13);
    const img = this.add.image(0, -1, 'items', frame).setScale(1);
    const alert = this.add
      .text(10, -14, '!', {
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
        fontStyle: 'bold',
        fontSize: '11px',
        color: '#ffffff',
        backgroundColor: '#e0453a',
        padding: { x: 3, y: 0 },
        resolution: 4,
      })
      .setOrigin(0.5)
      .setVisible(false);
    const bubble = this.add
      .container(npc.actor.x, npc.actor.y - 62, [g, img, alert])
      .setDepth(100_005)
      .setSize(26, 24)
      .setInteractive({ useHandCursor: true });
    bubble.on('pointerup', () => this.goTalk(npc));
    this.tweens.add({
      targets: bubble,
      y: bubble.y - 4,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    npc.bubble = bubble;
    npc.alert = alert;
  }

  /** The player takes over: the automatic visit stops and the hero stays in town. */
  private takeControl() {
    this.plan = [];
    this.waitMs = 0;
    const a = this.sim.state.activity;
    if (a.kind === 'in_town' && a.then === 'hunt') this.sim.returnToTown();
  }

  /** A dialog, screen or text field has the keyboard. */
  private uiBusy() {
    const ui = useUi.getState();
    const el = document.activeElement;
    const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    return typing || ui.npc !== null || ui.screen !== null || ui.backpackOpen;
  }

  /** The direction held on the keyboard, if any. */
  private heldDirection(): TilePoint | null {
    if (!this.keys || this.uiBusy()) return null;
    const down = (list: Phaser.Input.Keyboard.Key[]) => list.some((k) => k.isDown);
    if (down(this.keys.up)) return { tx: 0, ty: -1 };
    if (down(this.keys.down)) return { tx: 0, ty: 1 };
    if (down(this.keys.left)) return { tx: -1, ty: 0 };
    if (down(this.keys.right)) return { tx: 1, ty: 0 };
    return null;
  }

  /** One step with the keyboard: the next tile if it is free, else just turn that way. */
  private stepWithKeys(dir: TilePoint) {
    this.takeControl();
    this.talkTo = null;
    const here = this.hero.tile;
    const next = { tx: here.tx + dir.tx, ty: here.ty + dir.ty };
    const blocked = this.npcs.some(
      (n) => n.actor.tile.tx === next.tx && n.actor.tile.ty === next.ty,
    );
    if (this.paths.isWalkable(next) && !blocked) this.hero.path = [next];
    else this.hero.face(this.hero.x + dir.tx * 32, this.hero.y + dir.ty * 32);
  }

  /** Talks to the closest keeper within one tile (diagonals count). */
  private talkNearby() {
    const here = this.hero.tile;
    const npc = this.npcs.find(
      (n) =>
        NPC_SERVICE_ICON[n.id] &&
        Math.abs(n.actor.tile.tx - here.tx) <= 1 &&
        Math.abs(n.actor.tile.ty - here.ty) <= 1,
    );
    if (!npc) return;
    this.takeControl();
    this.hero.path = [];
    this.talkTo = npc;
  }

  private onTap(x: number, y: number) {
    const npc = this.npcs.find(
      (n) => !n.wanders && Math.hypot(n.actor.x - x, n.actor.y - 8 - y) < 26,
    );
    if (npc) {
      this.goTalk(npc);
      return;
    }
    this.takeControl();
    this.talkTo = null;
    const spot = this.paths.nearestWalkable({ tx: Math.floor(x / 32), ty: Math.floor(y / 32) }, 2);
    if (spot) this.hero.path = this.paths.find(this.hero.tile, spot) ?? [];
  }

  /** Walk up to a keeper; its dialog opens on arrival. */
  private goTalk(npc: Npc) {
    if (!this.shown) return;
    this.takeControl();
    this.talkTo = npc;
    const occupied = new Set(this.npcs.map((n) => `${n.actor.tile.tx},${n.actor.tile.ty}`));
    const spot = this.paths.nearestWalkable(
      { tx: npc.actor.tile.tx, ty: npc.actor.tile.ty + 1 },
      2,
      occupied,
    );
    this.hero.path = spot ? (this.paths.find(this.hero.tile, spot) ?? []) : [];
  }

  private hide() {
    if (!this.shown) return;
    this.shown = false;
    this.talkTo = null;
    this.plan = [];
    this.hero.path = [];
    this.sys.setVisible(false);
    this.scene.sleep();
    this.scene.setVisible(true, 'hunt');
  }

  /** A speech bubble over an NPC for a moment. */
  private say(npc: Npc, text: string) {
    const bubble = this.add
      .text(npc.actor.x, npc.actor.y - 46, text, {
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
        fontStyle: 'bold',
        fontSize: '9px',
        color: '#1a1408',
        backgroundColor: '#f3e6c4',
        padding: { x: 4, y: 2 },
        resolution: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(100_010);
    this.tweens.add({
      targets: bubble,
      y: bubble.y - 6,
      alpha: { from: 1, to: 0 },
      delay: 1400,
      duration: 400,
      onComplete: () => bubble.destroy(),
    });
  }

  override update(_time: number, delta: number) {
    if (!this.shown) return;
    const dt = Math.min(delta, 250);
    let moving = this.hero.update(dt, 1);
    if (!moving) {
      const dir = this.heldDirection();
      if (dir) {
        this.stepWithKeys(dir);
        moving = this.hero.path.length > 0;
      }
    }
    // Keepers' bubbles follow them; the elder's shows "!" when goals wait to be claimed.
    this.alertTimer -= dt;
    if (this.alertTimer <= 0) {
      this.alertTimer = 500;
      const quests = claimableQuests(this.sim.state) > 0;
      for (const n of this.npcs) n.alert?.setVisible(n.id === 'elder' && quests);
    }
    if (!moving && this.talkTo) {
      const npc = this.talkTo;
      this.talkTo = null;
      this.hero.face(npc.actor.x, npc.actor.y);
      npc.actor.face(this.hero.x, this.hero.y);
      this.say(npc, t(`npc.say.${npc.id}`));
      useUi.getState().openNpc(npc.id);
    }
    if (!moving) {
      if (this.waitMs > 0) {
        this.waitMs -= dt;
      } else if (this.plan.length > 0) {
        const stop = this.plan[0]!;
        const to = this.stations.get(stop);
        const here = this.hero.tile;
        if (!to || (here.tx === to.tx && here.ty === to.ty)) {
          this.plan.shift();
          this.arrive(stop);
        } else {
          this.hero.path = this.paths.find(here, to) ?? [];
          if (this.hero.path.length === 0) this.hero.place(to);
        }
      }
    }
    for (const n of this.npcs) {
      const walking = n.actor.update(dt, 1);
      if (walking) continue;
      if (n.wanders && this.stroll) {
        n.nextMoveMs -= dt;
        if (n.nextMoveMs <= 0) {
          n.nextMoveMs = 2500 + Math.random() * 4000;
          const p = {
            tx: Math.floor((this.stroll.x + Math.random() * this.stroll.width) / 32),
            ty: Math.floor((this.stroll.y + Math.random() * this.stroll.height) / 32),
          };
          const spot = this.paths.nearestWalkable(p, 2);
          if (spot) n.actor.path = this.paths.find(n.actor.tile, spot) ?? [];
        }
      } else {
        // Keepers turn to the hero when it comes close.
        const d = Math.hypot(this.hero.x - n.actor.x, this.hero.y - n.actor.y);
        if (d < 96) n.actor.face(this.hero.x, n.actor.y);
      }
    }
  }

  private arrive(stop: string) {
    const npc = this.npcs.find((n) => n.id === STOP_NPC[stop]);
    if (npc) {
      this.hero.face(npc.actor.x, npc.actor.y);
      npc.actor.face(this.hero.x, this.hero.y);
      this.say(npc, t(`npc.say.${npc.id}`));
      this.fx.spell(stop === 'shop' ? 'potion' : 'crit', this.hero.x, this.hero.y);
      this.waitMs = 1100;
    } else if (stop === 'rest') {
      const elder = this.npcs.find((n) => n.id === 'elder');
      if (elder) this.say(elder, t('npc.say.elder'));
    }
  }
}
