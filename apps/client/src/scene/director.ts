import {
  routeWaypoints,
  type ContentDb,
  type Monster,
  type SpriteManifest,
  type TiledMap,
  type TilePoint,
} from '@abismo/content';
import { TICK_MS, type GameEvent, type ItemInstance } from '@abismo/engine';
import type Phaser from 'phaser';
import type { GameSim, SimSignal } from '../game/sim.ts';
import { t } from '../i18n.ts';
import { useUi } from '../state/store.ts';
import { itemName } from '../ui/items.ts';
import { Actor, type Animations } from './actor.ts';
import type { Effects } from './effects.ts';
import type { Pathfinder } from './pathfinder.ts';
import { heroTextureKey, monsterTextureKey } from './textures.ts';

/** Hero states of the cavebot (section 4.2). */
type Mode = 'walk_route' | 'engage' | 'fight' | 'loot' | 'return_town' | 'in_town' | 'dead';

interface MonsterView {
  uid: number;
  def: Monster;
  actor: Actor;
  hp: number;
  maxHp: number;
  alive: boolean;
}

/** Sight range: a group closer than this pulls the hero off the route. */
const VISION_TILES = 5;
/** More than this many ticks behind the engine (10 s): skip straight to the current state. */
const SNAP_LAG_TICKS = 100;
/** Lag tolerated before the scene speeds up to catch up. */
const RELAXED_LAG_TICKS = 12;
const LOOT_PAUSE_MS = 500;
const UI_PUBLISH_MS = 100;

const NAME_COLOR = { normal: '#e6e3dc', elite: '#ffb347', boss: '#ff6b6b', hero: '#9fd3ff' };

const manhattan = (a: TilePoint, b: TilePoint) => Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);
const key = (p: TilePoint) => `${p.tx},${p.ty}`;

/**
 * Stages engine events on the map. The engine has already decided everything; the director
 * only moves actors so that what you see matches the event stream. It keeps its own
 * presentation tick, which waits at fight events until the hero has walked up to the
 * monsters, speeds up to catch up, and snaps to the current state beyond 10 s of lag.
 */
export class Director {
  private queue: GameEvent[] = [];
  private pTick: number;
  private mode: Mode = 'in_town';
  private hero: Actor;
  private monsters = new Map<number, MonsterView>();
  private group: number[] = [];
  private pool: Actor[] = [];
  private loop: TilePoint[] = [];
  private loopIndex = 0;
  private exit: TilePoint;
  private engageDest: TilePoint | null = null;
  private lootTimer = 0;
  private uiTimer = 0;
  private pendingSalvage: ItemInstance | null = null;
  private heroAnims: Animations;
  private content: ContentDb;
  timeScale = 1;

  constructor(
    private scene: Phaser.Scene,
    private sim: GameSim,
    map: TiledMap,
    private paths: Pathfinder,
    private manifest: SpriteManifest,
    private fx: Effects,
    private backpackTarget: () => { x: number; y: number },
  ) {
    this.content = sim.content;
    this.pTick = sim.state.tick;
    const wps = routeWaypoints(map, 'route');
    this.loop = [wps[0]!];
    for (let i = 0; i < wps.length; i++) {
      const seg = paths.find(wps[i]!, wps[(i + 1) % wps.length]!) ?? [];
      this.loop.push(...seg);
    }
    this.loop.pop(); // the last segment ends where the loop starts
    const exitObj = map.layers.find((l) => l.name === 'town_exit');
    const exit = exitObj?.type === 'objectgroup' ? exitObj.objects[0] : undefined;
    this.exit = exit ? { tx: Math.floor(exit.x / 32), ty: Math.floor(exit.y / 32) } : wps[0]!;

    this.heroAnims = manifest.atlases.hero?.sprites.warrior?.animations ?? {};
    this.hero = new Actor(scene, heroTextureKey, this.heroAnims, {
      name: sim.state.hero.name,
      color: NAME_COLOR.hero,
      bar: true,
    });
    this.hero.place(this.exit);
    this.hero.container.setVisible(false);
    scene.cameras.main.startFollow(this.hero.container, true, 0.12, 0.12);
    this.resync();
  }

  get heroContainer() {
    return this.hero.container;
  }

  onSignal = (signal: SimSignal) => {
    if (signal.kind === 'resync') this.resync();
    else this.queue.push(...signal.events);
  };

  update(dtMs: number) {
    const simTick = this.sim.state.tick;
    const lag = simTick - this.pTick;
    if (lag > SNAP_LAG_TICKS) {
      this.resync();
      return;
    }
    const scale = lag > RELAXED_LAG_TICKS ? Math.min(3, 1 + (lag - RELAXED_LAG_TICKS) / 25) : 1;
    this.setTimeScale(scale);
    let target = Math.min(simTick, this.pTick + (dtMs / TICK_MS) * scale);
    while (this.queue.length > 0) {
      const e = this.queue[0]!;
      if (e.tick > target) break;
      if (!this.ready(e)) {
        target = Math.min(target, e.tick);
        break;
      }
      this.queue.shift();
      this.present(e);
    }
    this.pTick = Math.max(this.pTick, target);
    this.cavebot(dtMs);

    this.uiTimer += dtMs;
    if (this.uiTimer >= UI_PUBLISH_MS) {
      this.uiTimer = 0;
      const snap = this.sim.snapshotAt(this.pTick);
      if (snap) {
        useUi.getState().setPresented(snap);
        this.hero.setHp(snap.hp / snap.maxHp);
      }
    }
  }

  private setTimeScale(scale: number) {
    if (scale === this.timeScale) return;
    this.timeScale = scale;
    this.scene.tweens.timeScale = scale;
    this.scene.time.timeScale = scale;
  }

  // --- Gating -------------------------------------------------------------------------------

  private currentTarget(): MonsterView | undefined {
    for (const uid of this.group) {
      const v = this.monsters.get(uid);
      if (v?.alive) return v;
    }
    return undefined;
  }

  /** Whether the scene is in position to show an event (otherwise time waits for it). */
  private ready(e: GameEvent): boolean {
    switch (e.type) {
      case 'GroupEngaged':
      case 'MonsterAttack':
        return this.mode === 'fight' || !this.currentTarget();
      case 'HeroAttack': {
        const target = this.monsters.get(e.hits[0]?.uid ?? -1);
        if (!target) return true;
        return this.mode === 'fight' && manhattan(this.hero.tile, target.actor.tile) <= 1;
      }
      case 'ArrivedInTown':
        return this.mode === 'in_town' || this.mode === 'dead';
      default:
        return true;
    }
  }

  // --- Events -------------------------------------------------------------------------------

  private log(
    text: string,
    extra: { rarity?: ItemInstance['rarity']; tone?: 'good' | 'bad' | 'info' } = {},
  ) {
    useUi.getState().pushLog({ text, ...extra });
  }

  private monsterName(def: Monster, elite: boolean) {
    const name = t(def.nameKey);
    return elite ? t('monster.elite', { name }) : name;
  }

  private present(e: GameEvent) {
    switch (e.type) {
      case 'HuntStarted':
        this.log(t('log.huntStarted', { hunt: t(this.content.hunts.get(e.huntId)!.nameKey) }), {
          tone: 'info',
        });
        break;
      case 'ReturningToHunt':
        this.leaveTown();
        break;
      case 'GroupSpawned':
        this.spawnGroup(e);
        break;
      case 'GroupEngaged':
        break;
      case 'HeroAttack': {
        const first = this.monsters.get(e.hits[0]?.uid ?? -1);
        const anim = e.skillId ? 'cast' : 'attack';
        const at = first?.actor ?? this.hero;
        this.hero.attack(at.x, at.y, anim, () => {
          if (e.skillId) this.fx.ring(this.hero.x, this.hero.y, 0x9fd3ff);
          for (const hit of e.hits) {
            const v = this.monsters.get(hit.uid);
            if (!v) continue;
            if (hit.miss) {
              this.fx.number(v.actor.x, v.actor.y - 8, t('fx.miss'), 'miss');
              continue;
            }
            v.hp = Math.max(0, v.hp - hit.damage);
            if (v.def.boss) this.showBoss(v);
            v.actor.setHp(v.hp / v.maxHp);
            v.actor.hurt();
            this.fx.number(
              v.actor.x,
              v.actor.y - 8,
              hit.crit ? `${hit.damage}!` : `${hit.damage}`,
              hit.crit ? 'crit' : 'damage',
            );
          }
          if (e.leech > 0) this.fx.number(this.hero.x, this.hero.y - 8, `+${e.leech}`, 'heal');
        });
        break;
      }
      case 'MonsterAttack': {
        const v = this.monsters.get(e.uid);
        if (!v) break;
        v.actor.attack(this.hero.x, this.hero.y, 'attack', () => {
          if (e.miss) {
            this.fx.number(this.hero.x, this.hero.y - 8, t('fx.miss'), 'miss');
          } else {
            this.hero.hurt();
            this.fx.number(this.hero.x, this.hero.y - 8, `${e.damage}`, 'taken');
          }
        });
        break;
      }
      case 'PotionUsed':
        this.fx.number(this.hero.x, this.hero.y - 8, `+${e.amount}`, 'heal');
        break;
      case 'MonsterDied': {
        const v = this.monsters.get(e.uid);
        if (!v) break;
        v.alive = false;
        if (v.def.boss) this.showBoss(null);
        this.scene.time.delayedCall(180, () => v.actor.die(() => this.release(v)));
        this.log(
          t('log.killed', { monster: this.monsterName(v.def, false), xp: e.xp, gold: e.gold }),
        );
        if (!this.currentTarget()) {
          this.mode = 'loot';
          this.lootTimer = LOOT_PAUSE_MS;
        }
        break;
      }
      case 'ItemDropped': {
        const from = this.monsters.get(e.fromUid)?.actor ?? this.hero;
        const x = from.x;
        const y = from.y;
        this.scene.time.delayedCall(200, () =>
          this.fx.dropItem(x, y, e.item.rarity, e.kept, this.backpackTarget),
        );
        if (e.kept) {
          this.log(
            t('log.item', {
              item: itemName(this.content, e.item),
              rarity: t(`rarity.${e.item.rarity}`),
            }),
            {
              rarity: e.item.rarity,
            },
          );
        } else {
          this.pendingSalvage = e.item;
        }
        if (e.item.rarity === 'legendary') this.fx.burst(x, y, 0xff8c1a, 24);
        break;
      }
      case 'MaterialsGained': {
        const item = this.pendingSalvage;
        this.pendingSalvage = null;
        if (!item) break;
        this.log(
          t('log.itemSalvaged', {
            item: itemName(this.content, item),
            rarity: t(`rarity.${item.rarity}`),
            qty: e.qty,
            material: t(this.content.materials.get(e.materialId)!.nameKey),
          }),
          { rarity: item.rarity },
        );
        break;
      }
      case 'CardDropped': {
        const from = this.monsters.get(e.fromUid)?.actor ?? this.hero;
        const card = this.content.cards.get(e.cardId)!;
        this.fx.ring(from.x, from.y, 0x9fd3ff);
        this.fx.burst(from.x, from.y, 0x9fd3ff, 20);
        this.fx.number(from.x, from.y - 20, t('fx.card'), 'crit');
        this.log(
          t(e.copies === 1 ? 'log.cardNew' : 'log.cardCopy', {
            card: t(card.nameKey),
            n: e.copies,
            max: card.maxCopies,
          }),
          { tone: 'good' },
        );
        break;
      }
      case 'ConsumableDropped': {
        const from = this.monsters.get(e.fromUid)?.actor ?? this.hero;
        const x = from.x;
        const y = from.y;
        this.scene.time.delayedCall(250, () => this.fx.dropPotion(x, y, this.backpackTarget));
        this.log(
          t('log.consumable', {
            qty: e.qty,
            item: t(this.content.consumables.get(e.consumableId)!.nameKey),
          }),
          {
            tone: 'good',
          },
        );
        break;
      }
      case 'LevelUp':
        this.fx.ring(this.hero.x, this.hero.y, 0xffd84a);
        this.fx.burst(this.hero.x, this.hero.y, 0xffd84a, 16);
        this.fx.number(this.hero.x, this.hero.y - 20, t('log.levelUp', { level: e.level }), 'crit');
        this.log(t('log.levelUp', { level: e.level }), { tone: 'good' });
        break;
      case 'HeroDied':
        this.mode = 'dead';
        this.hero.path = [];
        this.hero.die();
        this.clearMonsters(true);
        this.log(t('log.died', { xp: e.xpLost }), { tone: 'bad' });
        this.scene.time.delayedCall(1000, () => {
          this.scene.cameras.main.fadeOut(300);
          this.scene.time.delayedCall(320, () => {
            this.hero.container.setVisible(false);
            this.scene.cameras.main.fadeIn(200);
            useUi.getState().setTown('depositing');
          });
        });
        break;
      case 'TownTripStarted':
        this.log(t(`log.townTrip.${e.reason}`), { tone: 'info' });
        if (this.mode === 'in_town' || this.mode === 'dead') break;
        this.clearMonsters(true);
        this.mode = 'return_town';
        this.hero.path = this.paths.find(this.hero.tile, this.exit) ?? [];
        break;
      case 'ArrivedInTown':
        this.enterTown(e.leaveTick === null ? 'idle' : 'depositing');
        this.log(t('log.arrived', { n: e.deposited, potions: e.potionsBought }), { tone: 'info' });
        break;
      case 'BossDefeated': {
        const def = this.content.monsters.get(e.monsterId)!;
        this.fx.ring(this.hero.x, this.hero.y, 0xff6b6b);
        this.fx.burst(this.hero.x, this.hero.y, 0xff6b6b, 30);
        this.log(t(e.firstTime ? 'log.bossFirst' : 'log.boss', { monster: t(def.nameKey) }), {
          tone: 'good',
        });
        break;
      }
      case 'HuntUnlocked':
        this.log(t('log.huntUnlocked', { hunt: t(this.content.hunts.get(e.huntId)!.nameKey) }), {
          tone: 'good',
        });
        break;
      case 'HuntStopped':
        this.log(t(`log.stopped.${e.reason}`), { tone: e.reason === 'manual' ? 'info' : 'bad' });
        this.enterTown('idle');
        break;
    }
  }

  // --- Group placement ----------------------------------------------------------------------

  private nearestLoopIndex(p: TilePoint): number {
    let best = 0;
    let bestD = Infinity;
    this.loop.forEach((l, i) => {
      const d = manhattan(l, p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  private spawnGroup(e: Extract<GameEvent, { type: 'GroupSpawned' }>) {
    for (const uid of this.group) {
      const v = this.monsters.get(uid);
      if (v && v.alive) this.release(v);
    }
    const walkSeconds = (e.engageTick - e.tick) * (TICK_MS / 1000);
    const ahead = Math.max(3, Math.round(this.hero.speed * walkSeconds) - 1);
    const from =
      this.mode === 'walk_route' ? this.loopIndex : this.nearestLoopIndex(this.hero.tile);
    const center = this.loop[(from + ahead) % this.loop.length]!;
    this.placeGroup(e.monsters, center, true);
    const bossView = this.group.map((uid) => this.monsters.get(uid)).find((v) => v?.def.boss);
    this.showBoss(bossView ?? null);
    const boss = e.monsters.find((m) => m.boss);
    if (boss) {
      this.log(
        t('log.bossAppears', { monster: t(this.content.monsters.get(boss.monsterId)!.nameKey) }),
        {
          tone: 'bad',
        },
      );
    } else if (e.monsters.some((m) => m.elite)) {
      this.log(t('log.elite'), { tone: 'bad' });
    }
  }

  private placeGroup(
    monsters: {
      uid: number;
      monsterId: string;
      elite: boolean;
      boss: boolean;
      maxHp: number;
      hp?: number;
    }[],
    center: TilePoint,
    animate: boolean,
  ) {
    const taken = new Set<string>([key(this.hero.tile)]);
    // Two tiles apart so the name labels above each monster stay readable.
    const offsets = [
      [0, 0],
      [2, 0],
      [0, 2],
      [2, 2],
    ] as const;
    this.group = [];
    monsters.forEach((m, i) => {
      const [dx, dy] = offsets[i % offsets.length]!;
      const spot =
        this.paths.nearestWalkable({ tx: center.tx + dx, ty: center.ty + dy }, 3, taken) ?? center;
      taken.add(key(spot));
      const def = this.content.monsters.get(m.monsterId)!;
      const anims =
        this.manifest.atlases[def.sprite.atlas]?.sprites[def.sprite.key]?.animations ?? {};
      const actor = this.takeActor();
      actor.setTexture((dir) => monsterTextureKey(def.sprite.key, dir), anims);
      actor.reset(true);
      const color = m.boss ? NAME_COLOR.boss : m.elite ? NAME_COLOR.elite : NAME_COLOR.normal;
      actor.setName(
        `${this.monsterName(def, m.elite)} ${t('hud.level', { level: def.level })}`,
        color,
      );
      actor.place(spot);
      actor.face(this.hero.x, this.hero.y);
      const hp = m.hp ?? m.maxHp;
      actor.setHp(hp / m.maxHp);
      if (animate) actor.spawn();
      this.monsters.set(m.uid, { uid: m.uid, def, actor, hp, maxHp: m.maxHp, alive: true });
      this.group.push(m.uid);
    });
  }

  private takeActor(): Actor {
    const free = this.pool.pop();
    if (free) return free;
    return new Actor(
      this.scene,
      () => '__MISSING',
      {},
      { name: '', color: NAME_COLOR.normal, bar: true },
    );
  }

  private showBoss(v: MonsterView | null) {
    useUi
      .getState()
      .setBoss(v && v.alive ? { name: t(v.def.nameKey), hp: v.hp, maxHp: v.maxHp } : null);
  }

  private release(v: MonsterView) {
    if (this.monsters.get(v.uid) !== v) return;
    this.monsters.delete(v.uid);
    v.actor.container.setVisible(false);
    this.pool.push(v.actor);
  }

  private clearMonsters(fade: boolean) {
    this.showBoss(null);
    for (const v of [...this.monsters.values()]) {
      v.alive = false;
      if (fade) {
        this.scene.tweens.add({
          targets: v.actor.container,
          alpha: 0,
          duration: 300,
          onComplete: () => this.release(v),
        });
      } else {
        this.release(v);
      }
    }
    this.group = [];
  }

  // --- Town ---------------------------------------------------------------------------------

  private enterTown(view: 'idle' | 'depositing') {
    this.mode = 'in_town';
    this.hero.path = [];
    this.hero.container.setVisible(false);
    this.hero.place(this.exit);
    this.clearMonsters(false);
    useUi.getState().setTown(view);
  }

  private leaveTown() {
    const wasHidden = !this.hero.container.visible;
    useUi.getState().setTown(null);
    if (wasHidden) {
      this.hero.reset(true);
      this.hero.place(this.exit);
      this.scene.cameras.main.fadeIn(300);
    }
    this.rejoinRoute();
  }

  private rejoinRoute() {
    this.mode = 'walk_route';
    this.engageDest = null;
    this.loopIndex = (this.nearestLoopIndex(this.hero.tile) + 1) % this.loop.length;
    this.hero.path = this.paths.find(this.hero.tile, this.loop[this.loopIndex]!) ?? [];
  }

  // --- Cavebot ------------------------------------------------------------------------------

  private cavebot(dtMs: number) {
    const hero = this.hero;
    const moving = hero.update(dtMs, this.timeScale);
    switch (this.mode) {
      case 'walk_route': {
        const target = this.currentTarget();
        if (target && manhattan(hero.tile, target.actor.tile) <= VISION_TILES) {
          this.mode = 'engage';
          this.engageDest = null;
          break;
        }
        if (!moving) {
          if (key(hero.tile) === key(this.loop[this.loopIndex]!)) {
            this.loopIndex = (this.loopIndex + 1) % this.loop.length;
          }
          hero.path = this.paths.find(hero.tile, this.loop[this.loopIndex]!) ?? [];
        }
        break;
      }
      case 'engage': {
        const target = this.currentTarget();
        if (!target) {
          if (!moving) this.rejoinRoute();
          break;
        }
        if (manhattan(hero.tile, target.actor.tile) <= 1 && !moving) {
          this.mode = 'fight';
          hero.face(target.actor.x, target.actor.y);
          break;
        }
        if (!moving || !this.engageDest) {
          this.engageDest = this.attackSpot(target.actor.tile);
          hero.path = this.paths.find(hero.tile, this.engageDest) ?? [];
          if (hero.path.length === 0 && key(hero.tile) !== key(this.engageDest)) {
            hero.place(this.engageDest);
          }
        }
        break;
      }
      case 'fight': {
        const target = this.currentTarget();
        if (target && manhattan(hero.tile, target.actor.tile) > 1) {
          this.mode = 'engage';
          this.engageDest = null;
        } else if (target) {
          hero.face(target.actor.x, target.actor.y);
          for (const uid of this.group) {
            const v = this.monsters.get(uid);
            if (v?.alive) v.actor.face(hero.x, hero.y);
          }
        }
        break;
      }
      case 'loot':
        this.lootTimer -= dtMs * this.timeScale;
        if (this.lootTimer <= 0) {
          if (this.currentTarget()) this.mode = 'engage';
          else this.rejoinRoute();
        }
        break;
      case 'return_town':
        if (!moving) {
          if (key(hero.tile) === key(this.exit)) {
            // At the exit: fade to town. ArrivedInTown (gated on this mode) follows.
            this.mode = 'in_town';
            this.scene.cameras.main.fadeOut(250);
            this.scene.time.delayedCall(260, () => {
              this.scene.cameras.main.fadeIn(200);
              if (this.mode !== 'in_town') return;
              hero.container.setVisible(false);
              useUi.getState().setTown('depositing');
            });
          } else {
            hero.path = this.paths.find(hero.tile, this.exit) ?? [];
            if (hero.path.length === 0) hero.place(this.exit);
          }
        }
        break;
      case 'in_town':
      case 'dead':
        break;
    }
  }

  /** A free walkable tile next to `target`, closest to the hero. */
  private attackSpot(target: TilePoint): TilePoint {
    const occupied = new Set<string>();
    for (const v of this.monsters.values()) if (v.alive) occupied.add(key(v.actor.tile));
    let best: TilePoint | null = null;
    let bestD = Infinity;
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ] as const) {
      const p = { tx: target.tx + dx, ty: target.ty + dy };
      if (!this.paths.isWalkable(p) || occupied.has(key(p))) continue;
      const d = manhattan(p, this.hero.tile);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best ?? this.paths.nearestWalkable(target, 2, occupied) ?? target;
  }

  // --- Resync -------------------------------------------------------------------------------

  /** Rebuilds the scene from the engine state (start, background tab, offline, big lag). */
  resync() {
    this.queue = [];
    this.pTick = this.sim.state.tick;
    this.setTimeScale(1);
    this.clearMonsters(false);
    const s = this.sim.state;
    const a = s.activity;
    const ui = useUi.getState();
    switch (a.kind) {
      case 'walking':
      case 'fighting': {
        ui.setTown(null);
        if (!this.hero.container.visible) {
          this.hero.reset(true);
          this.hero.place(this.loop[0]!);
        }
        const near = this.nearestLoopIndex(this.hero.tile);
        this.hero.place(this.loop[near]!);
        const alive = a.group.filter((m) => m.hp > 0);
        const center = this.loop[(near + (a.kind === 'fighting' ? 1 : 4)) % this.loop.length]!;
        this.placeGroup(alive, center, false);
        if (a.kind === 'fighting') {
          this.mode = 'engage';
          this.engageDest = null;
        } else {
          this.rejoinRoute();
        }
        break;
      }
      case 'to_hunt':
        ui.setTown(null);
        this.hero.reset(true);
        this.hero.place(this.exit);
        this.rejoinRoute();
        break;
      default:
        this.enterTown(a.kind === 'idle_town' ? 'idle' : 'depositing');
    }
    const snap = this.sim.snapshotAt(this.pTick);
    if (snap) ui.setPresented(snap);
  }

  /** Tile animations from the Tiled tileset (water), advanced by the scene clock. */
  static animateTiles(scene: Phaser.Scene, layer: Phaser.Tilemaps.TilemapLayer, map: TiledMap) {
    const ts = map.tilesets[0];
    const animated = ts?.tiles?.filter((tile) => tile.animation && tile.animation.length > 1) ?? [];
    for (const tile of animated) {
      const frames = tile.animation!.map((f) => ({ gid: f.tileid + ts!.firstgid, ms: f.duration }));
      const cells: Phaser.Tilemaps.Tile[] = [];
      layer.forEachTile((cell) => {
        if (cell.index === frames[0]!.gid) cells.push(cell);
      });
      if (cells.length === 0) continue;
      let i = 0;
      const next = () => {
        i = (i + 1) % frames.length;
        for (const c of cells) c.index = frames[i]!.gid;
        scene.time.delayedCall(frames[i]!.ms, next);
      };
      scene.time.delayedCall(frames[0]!.ms, next);
    }
  }
}
