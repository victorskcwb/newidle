import {
  reachableFrom,
  routeWaypoints,
  type ContentDb,
  type Element,
  type Monster,
  type SpriteManifest,
  type TiledMap,
  type TilePoint,
} from '@abismo/content';
import { TICK_MS, huntOf, type GameEvent, type ItemInstance } from '@abismo/engine';
import type Phaser from 'phaser';
import type { GameSim, SimSignal } from '../game/sim.ts';
import { t } from '../i18n.ts';
import { sfx } from '../audio/sfx.ts';
import { usePrefs } from '../state/prefs.ts';
import { useUi } from '../state/store.ts';
import { itemName } from '../ui/items.ts';
import { Actor, type Animations } from './actor.ts';
import { SELF_FX, SKILL_FX, type Effects } from './effects.ts';
import type { Pathfinder } from './pathfinder.ts';
import { heroLook, monsterLook } from './textures.ts';

/**
 * Hero states. `roam`: no route; the hero wanders the map towards random spots and heads
 * straight for any monster group as soon as one appears, wherever it is.
 */
type Mode = 'roam' | 'engage' | 'fight' | 'loot' | 'return_town' | 'in_town' | 'dead';

interface MonsterView {
  uid: number;
  def: Monster;
  actor: Actor;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Noticed the hero and closing in. */
  chasing: boolean;
  /** Time left before the next path search (ms). */
  thinkMs: number;
}

/** A monster wandering the map between fights; the next group is drawn from them. */
interface Wanderer {
  def: Monster;
  actor: Actor;
  home: TilePoint;
  restMs: number;
}

/** Roaming spots are this far from the hero, in tiles (manhattan). */
const ROAM_MIN = 6;
const ROAM_MAX = 16;
/**
 * Monsters wandering the hunt map. Presentation only: the engine still sends one group at a
 * time, and the scene picks its monsters among the wanderers of the same kind when it can.
 */
const WANDERERS = 9;
/** A wanderer that joined a fight is replaced, somewhere else, after this long (ms). */
const WANDERER_RESPAWN_MS: [number, number] = [4000, 9000];
/** Wanderers stroll within this many tiles of where they appeared. */
const WANDER_RADIUS = 3;
const WANDER_SPEED = 1.2;
/** A group monster notices the hero this close (tiles) and runs at it. */
const AGGRO_RADIUS = 5;
const CHASE_SPEED = 2.2;
/** Archers and casters stop this far from the hero to shoot. */
const MONSTER_REACH = 3;
const THINK_MS = 300;
/** Longest wait for a monster to get in reach before it is moved there (ms). */
const POSITION_TIMEOUT_MS = 1500;
/** More than this many ticks behind the engine (10 s): skip straight to the current state. */
const SNAP_LAG_TICKS = 100;
/** Lag tolerated before the scene speeds up to catch up. */
const RELAXED_LAG_TICKS = 12;
const LOOT_PAUSE_MS = 500;
const UI_PUBLISH_MS = 100;

const NAME_COLOR = { normal: '#e6e3dc', elite: '#ffb347', boss: '#ff6b6b', hero: '#9fd3ff' };

const manhattan = (a: TilePoint, b: TilePoint) => Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);
/** Tiles apart counting diagonals as one step: next to = 1. */
const chebyshev = (a: TilePoint, b: TilePoint) =>
  Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty));
const between = ([min, max]: [number, number]) => min + Math.random() * (max - min);
const key = (p: TilePoint) => `${p.tx},${p.ty}`;

/**
 * Stages engine events on the map. The engine has already decided everything; the director
 * only moves actors so that what you see matches the event stream. It keeps its own
 * presentation tick, which waits at fight events until the hero has walked up to the
 * monsters, speeds up to catch up, and snaps to the current state beyond 10 s of lag.
 */
/** Tiles a ranged hero shoots from. */
const RANGED_REACH = 3;

export class Director {
  private queue: GameEvent[] = [];
  private pTick: number;
  private mode: Mode = 'in_town';
  private hero: Actor;
  private monsters = new Map<number, MonsterView>();
  private group: number[] = [];
  private pool: Actor[] = [];
  /** Walkable tiles reachable from the town exit, away from the map edge. */
  private open: TilePoint[] = [];
  private exit: TilePoint;
  private engageDest: TilePoint | null = null;
  private lootTimer = 0;
  private uiTimer = 0;
  private pendingSalvage: ItemInstance | null = null;
  private heroAnims: Animations;
  /** Tiles from which the hero hits: 1 for melee, more for bows and staves. */
  private range: number;
  private projectile: 'arrow' | 'bolt';
  /** Element of the hero's basic attack. */
  private heroElement: Element;
  private wanderers: Wanderer[] = [];
  /** Time left (ms) before each missing wanderer comes back. */
  private respawns: number[] = [];
  /** How long the event at the head of the queue has waited for the scene (ms). */
  private blockedMs = 0;
  private blocked: GameEvent | null = null;
  /** The active pet, trailing the hero tile by tile. */
  private pet: { id: string; actor: Actor } | null = null;
  private trail: TilePoint | null = null;
  private content: ContentDb;
  timeScale = 1;
  /** Brief freeze after heavy blows (hit-stop), in ms. */
  private hitStop = 0;
  /** Flashes and hit-stop are off with reduced motion (the screen never shakes). */
  calm = false;

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
    const exitObj = map.layers.find((l) => l.name === 'town_exit');
    const exit = exitObj?.type === 'objectgroup' ? exitObj.objects[0] : undefined;
    this.exit = exit ? { tx: Math.floor(exit.x / 32), ty: Math.floor(exit.y / 32) } : wps[0]!;
    for (const k of reachableFrom(paths.walkable, this.exit)) {
      const [tx, ty] = k.split(',').map(Number) as [number, number];
      if (tx >= 2 && ty >= 2 && tx < map.width - 2 && ty < map.height - 2) {
        this.open.push({ tx, ty });
      }
    }

    const classId = sim.state.hero.classId;
    const heroSprites = manifest.atlases.hero?.sprites;
    this.heroAnims = (heroSprites?.[classId] ?? heroSprites?.warrior)?.animations ?? {};
    const heroClass = sim.content.classes.get(classId);
    this.range = heroClass?.ranged ? RANGED_REACH : 1;
    this.projectile = classId === 'sorcerer' ? 'bolt' : 'arrow';
    this.heroElement = heroClass?.element ?? 'physical';
    this.hero = new Actor(
      scene,
      heroLook(scene, manifest, sim.state.hero.appearance.outfit, classId),
      this.heroAnims,
      {
        // The hero's name is on the panel; over the head it only covered the monsters'.
        name: '',
        color: NAME_COLOR.hero,
        bar: true,
      },
    );
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
    // Leaving town: show the hunt map as soon as the engine has the hero there, without
    // waiting for the first group's event to come up in the queue.
    const k = this.sim.state.activity.kind;
    if (this.mode === 'in_town' && (k === 'walking' || k === 'fighting')) {
      if (useUi.getState().town !== null) this.leaveTown();
    }
    if (this.hitStop > 0) {
      this.hitStop -= dtMs;
      return;
    }
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
        if (this.blocked !== e) {
          this.blocked = e;
          this.blockedMs = 0;
        }
        this.blockedMs += dtMs;
        if (this.blockedMs < POSITION_TIMEOUT_MS || !this.unblock(e)) {
          target = Math.min(target, e.tick);
          break;
        }
      }
      this.blocked = null;
      this.queue.shift();
      this.present(e);
    }
    this.pTick = Math.max(this.pTick, target);
    this.cavebot(dtMs);
    this.moveGroup(dtMs);
    this.wander(dtMs);
    this.followPet(dtMs);

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

  /**
   * The active pet walks the hero's trail: each tile the hero leaves is the pet's next step,
   * so it never cuts through walls. It hides with the hero and jumps back when left behind.
   */
  private followPet(dtMs: number) {
    const id = this.sim.state.hero.activePet;
    if (this.pet?.id !== id) {
      this.pet?.actor.container.destroy();
      this.pet = null;
      const def = id ? this.content.pets.get(id) : undefined;
      if (def) {
        const look = monsterLook(this.scene, this.manifest, { sprite: def.sprite } as Monster);
        const anims =
          this.manifest.atlases[def.sprite.atlas]?.sprites[def.sprite.key]?.animations ?? {};
        const actor = new Actor(this.scene, look, anims, {
          name: '',
          color: NAME_COLOR.normal,
          bar: false,
        });
        actor.speed = this.hero.speed;
        actor.place(this.hero.tile);
        this.pet = { id: def.id, actor };
        this.trail = this.hero.tile;
      }
    }
    if (!this.pet) return;
    const pet = this.pet.actor;
    pet.container.setVisible(this.hero.container.visible);
    const here = this.hero.tile;
    if (this.trail && key(here) !== key(this.trail)) {
      pet.path.push(this.trail);
      this.trail = here;
    }
    // Too far behind (a teleport, a new map): back at the hero's side.
    if (pet.path.length > 4 || manhattan(pet.tile, here) > 6) {
      pet.path = [];
      pet.place(here);
      this.trail = here;
    }
    if (!pet.update(dtMs, this.timeScale)) pet.face(this.hero.x, this.hero.y);
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
        return this.mode === 'fight' || !this.currentTarget();
      case 'MonsterAttack': {
        if (this.mode !== 'fight' && this.currentTarget()) return false;
        // Each monster strikes from where it stands: next to the hero, or in bow range.
        const v = this.monsters.get(e.uid);
        return !v?.alive || chebyshev(v.actor.tile, this.hero.tile) <= this.reachOf(v.def);
      }
      case 'HeroAttack': {
        const target = this.monsters.get(e.hits[0]?.uid ?? -1);
        if (!target) return true;
        return this.mode === 'fight' && chebyshev(this.hero.tile, target.actor.tile) <= this.range;
      }
      case 'ArrivedInTown':
        return this.mode === 'in_town' || this.mode === 'dead';
      default:
        return true;
    }
  }

  /**
   * Gets a stuck fight going: a monster that could not reach the hero in time (or that the
   * hero could not reach) is moved next to it. Returns false when there is nothing to do but
   * wait (the hero still walking, in town).
   */
  private unblock(e: GameEvent): boolean {
    if (this.mode === 'in_town' || this.mode === 'dead' || this.mode === 'return_town') {
      return false;
    }
    const uid =
      e.type === 'MonsterAttack' ? e.uid : e.type === 'HeroAttack' ? e.hits[0]?.uid : undefined;
    const v = uid === undefined ? undefined : this.monsters.get(uid);
    if (!v?.alive) return false;
    v.chasing = true;
    v.actor.path = [];
    v.actor.place(this.postFor(v, e.type === 'HeroAttack' ? 1 : this.reachOf(v.def)));
    v.actor.face(this.hero.x, this.hero.y);
    this.hero.path = [];
    this.mode = 'fight';
    return true;
  }

  private reachOf(def: Monster): number {
    return (def.attack?.style ?? 'melee') === 'melee' ? 1 : MONSTER_REACH;
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
        if (this.mode !== 'in_town' && this.mode !== 'dead') this.fillWanderers();
        break;
      case 'ReturningToHunt':
        // The trip is shown in town (the hero walks out of the gate); the hunt map appears
        // on arrival, with the first group already there.
        if (this.mode === 'in_town') useUi.getState().setTown('leaving');
        else this.leaveTown();
        break;
      case 'GroupSpawned':
        if (useUi.getState().town !== null) this.leaveTown();
        this.spawnGroup(e);
        break;
      case 'GroupEngaged':
        break;
      case 'HeroAttack': {
        const first = this.monsters.get(e.hits[0]?.uid ?? -1);
        const anim = e.skillId ? 'cast' : 'attack';
        const at = first?.actor ?? this.hero;
        const skill = e.skillId ? this.content.skills.get(e.skillId) : undefined;
        const skillFx = e.skillId
          ? ((skill?.kind === 'active' ? SKILL_FX[skill.effect] : undefined) ?? 'heavy')
          : null;
        const element = (skill?.kind === 'active' ? skill.element : undefined) ?? this.heroElement;
        const ranged = this.range > 1;
        const land = () => {
          if (skillFx) {
            const onHero = SELF_FX.has(skillFx);
            this.fx.spell(
              skillFx,
              onHero ? this.hero.x : at.x,
              onHero ? this.hero.y : at.y,
              this.hero,
            );
            if (skillFx === 'charge') this.fx.spell('charge', this.hero.x, this.hero.y, at);
            if (e.hits.some((h) => !h.miss) && !this.calm) this.hitStop = 60;
          }
          for (const hit of e.hits) {
            const v = this.monsters.get(hit.uid);
            if (!v) continue;
            if (hit.miss) {
              sfx.play('miss');
              this.fx.number(v.actor.x, v.actor.y - 8, t('fx.miss'), 'miss');
              continue;
            }
            v.hp = Math.max(0, v.hp - hit.damage);
            sfx.play(hit.crit ? 'crit' : 'hit');
            if (v.def.boss) this.showBoss(v);
            v.actor.setHp(v.hp / v.maxHp);
            v.actor.hurt();
            if (!skillFx && !ranged) this.fx.spell('slash', v.actor.x, v.actor.y, this.hero);
            if (hit.crit) this.fx.spell('crit', v.actor.x, v.actor.y);
            this.fx.number(
              v.actor.x,
              v.actor.y - 8,
              hit.crit ? `${hit.damage}!` : `${hit.damage}`,
              hit.crit ? 'crit' : 'damage',
              element,
            );
          }
          if (e.leech > 0) this.fx.number(this.hero.x, this.hero.y - 8, `+${e.leech}`, 'heal');
        };
        this.hero.attack(at.x, at.y, anim, () => {
          // Bows and staves: the blow lands when the arrow or bolt arrives. Arrow rain
          // falls from the sky instead.
          if (ranged && first && skillFx !== 'arrowRain') {
            this.fx.projectile(this.hero, at, this.projectile, land, {
              element,
              big: skillFx !== null && !SELF_FX.has(skillFx),
            });
          } else {
            land();
          }
        });
        break;
      }
      case 'MonsterAttack': {
        const v = this.monsters.get(e.uid);
        if (!v) break;
        const style = v.def.attack?.style ?? 'melee';
        const element = v.def.attack?.element ?? 'physical';
        const land = () => {
          if (e.miss) {
            this.fx.number(this.hero.x, this.hero.y - 8, t('fx.miss'), 'miss');
          } else {
            this.hero.hurt();
            this.fx.monsterHit(element, this.hero.x, this.hero.y, v.def.boss === true);
            sfx.play('hurt');
            this.fx.number(this.hero.x, this.hero.y - 8, `-${e.damage}`, 'taken', element);
          }
        };
        v.actor.attack(this.hero.x, this.hero.y, style === 'magic' ? 'cast' : 'attack', () => {
          if (style === 'melee') land();
          else
            this.fx.projectile(v.actor, this.hero, style === 'ranged' ? 'arrow' : 'bolt', land, {
              element,
            });
        });
        break;
      }
      case 'PotionUsed':
        sfx.play('potion');
        this.fx.spell('potion', this.hero.x, this.hero.y);
        this.fx.number(
          this.hero.x,
          this.hero.y - 8,
          `+${e.amount}`,
          e.kind === 'mana' ? 'mana' : 'heal',
        );
        break;
      case 'MonsterDied': {
        const v = this.monsters.get(e.uid);
        if (!v) break;
        v.alive = false;
        sfx.play('kill');
        if (v.def.boss) this.showBoss(null);
        this.scene.time.delayedCall(180, () => {
          this.fx.spell('death', v.actor.x, v.actor.y);
          v.actor.die(() => this.release(v));
        });
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
        if (e.pity) {
          this.log(t('log.pity', { rarity: t(`rarity.${e.item.rarity}`) }), {
            rarity: e.item.rarity,
          });
        }
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
        this.scene.time.delayedCall(220, () => sfx.play(`drop_${e.item.rarity}`));
        if (e.item.rarity === 'legendary') {
          this.fx.burst(x, y, 0xff8c1a, 24);
          this.flash(255, 140, 26);
        }
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
        sfx.play('card');
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
        sfx.play('levelUp');
        this.fx.spell('levelup', this.hero.x, this.hero.y);
        this.fx.burst(this.hero.x, this.hero.y, 0xffd84a, 16);
        this.hero.celebrate();
        if (!this.calm && usePrefs.getState().gfx.flashes) {
          this.scene.cameras.main.flash(250, 255, 220, 140);
        }
        useUi.getState().showLevelUp(e.level);
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
        if (e.reason === 'manual') {
          // The player's order is a teleport: a flash where the hero stood, then the town.
          this.fx.spell('teleport', this.hero.x, this.hero.y);
          sfx.play('potion');
          this.enterTown('idle');
          break;
        }
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
        sfx.play('bossDefeat');
        this.flash(255, 107, 107);
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
      case 'DungeonEntered':
        this.log(t('log.dungeonEntered', { floor: e.floor }), { tone: 'info' });
        if (this.mode !== 'in_town' && this.mode !== 'dead') this.fillWanderers();
        break;
      case 'DungeonFloorCleared':
        this.log(t('log.dungeonFloor', { floor: e.floor }), { tone: 'good' });
        // A new block of ten floors brings another hunt's monsters.
        if (e.floor % 10 === 0 && this.mode !== 'in_town' && this.mode !== 'dead') {
          this.fillWanderers();
        }
        if (e.item) {
          this.log(
            t('log.dungeonItem', {
              item: itemName(this.content, e.item),
              rarity: t(`rarity.${e.item.rarity}`),
            }),
            { rarity: e.item.rarity },
          );
        }
        break;
      case 'DungeonEnded':
        this.log(
          t(e.reason === 'time' ? 'log.dungeonTimedOut' : 'log.dungeonEnded', {
            floor: e.floor,
            best: e.best,
          }),
          { tone: 'bad' },
        );
        break;
      case 'AutoReset':
        this.log(t('log.autoReset', { n: e.resets, points: e.points }), { tone: 'good' });
        break;
      case 'PetFound': {
        const pet = this.content.pets.get(e.petId)!;
        const max = pet.maxStars;
        this.log(
          e.stars === 1
            ? t('log.petNew', { pet: t(pet.nameKey) })
            : t('log.petStar', { pet: t(pet.nameKey), n: e.stars, max }),
          { tone: 'good' },
        );
        this.fx.spell('levelup', this.hero.x, this.hero.y);
        break;
      }
      case 'AutoEquipped':
        this.log(t('log.autoEquipped', { n: e.uids.length }), { tone: 'info' });
        break;
      case 'ProfessionLevelUp':
        this.log(
          t('log.professionLevel', {
            profession: t(this.content.professions.get(e.professionId)!.nameKey),
            level: e.level,
          }),
          { tone: 'good' },
        );
        break;
      case 'HuntStopped':
        this.log(t(`log.stopped.${e.reason}`), { tone: e.reason === 'manual' ? 'info' : 'bad' });
        this.enterTown('idle');
        break;
    }
  }

  // --- Group placement ----------------------------------------------------------------------

  /** A random open tile at a manhattan distance in [min, max] from `from`. */
  private openSpot(from: TilePoint, min: number, max: number): TilePoint {
    const ring = this.open.filter((p) => {
      const d = manhattan(p, from);
      return d >= min && d <= max;
    });
    const list = ring.length > 0 ? ring : this.open;
    return list[Math.floor(Math.random() * list.length)] ?? from;
  }

  private spawnGroup(e: Extract<GameEvent, { type: 'GroupSpawned' }>) {
    for (const uid of this.group) {
      const v = this.monsters.get(uid);
      if (v && v.alive) this.release(v);
    }
    // The group shows up in any direction, about as far as the hero walks before the fight.
    const walkSeconds = (e.engageTick - e.tick) * (TICK_MS / 1000);
    const ahead = Math.min(14, Math.max(3, Math.round(this.hero.speed * walkSeconds) - 1));
    // Monsters already wandering at about that distance answer the call; the others appear.
    const recruits = new Map<number, Actor>();
    for (const m of e.monsters) {
      if (m.elite || m.boss) continue;
      let best: Wanderer | null = null;
      let bestD = Infinity;
      for (const w of this.wanderers) {
        if (w.def.id !== m.monsterId) continue;
        const d = Math.abs(manhattan(w.actor.tile, this.hero.tile) - ahead);
        if (d <= 4 && d < bestD) {
          best = w;
          bestD = d;
        }
      }
      if (!best) continue;
      this.wanderers.splice(this.wanderers.indexOf(best), 1);
      this.respawns.push(between(WANDERER_RESPAWN_MS));
      recruits.set(m.uid, best.actor);
    }
    const first = recruits.values().next().value;
    const center = first?.tile ?? this.openSpot(this.hero.tile, Math.max(2, ahead - 2), ahead + 2);
    this.placeGroup(e.monsters, center, true, recruits);
    if (this.mode === 'roam') {
      this.mode = 'engage';
      this.engageDest = null;
    }
    const bossView = this.group.map((uid) => this.monsters.get(uid)).find((v) => v?.def.boss);
    this.showBoss(bossView ?? null);
    const boss = e.monsters.find((m) => m.boss);
    if (boss) {
      sfx.play('bossAppear');
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
      affixes: string[];
    }[],
    center: TilePoint,
    animate: boolean,
    /** Wanderers taking part, by monster uid: they stay where they are and notice the hero. */
    recruits = new Map<number, Actor>(),
  ) {
    const taken = new Set<string>([key(this.hero.tile)]);
    for (const a of recruits.values()) taken.add(key(a.tile));
    // Two tiles apart so the name labels above each monster stay readable.
    const offsets = [
      [0, 0],
      [2, 0],
      [0, 2],
      [2, 2],
    ] as const;
    this.group = [];
    monsters.forEach((m, i) => {
      const def = this.content.monsters.get(m.monsterId)!;
      const recruit = recruits.get(m.uid);
      let spot: TilePoint;
      let actor: Actor;
      if (recruit) {
        actor = recruit;
        spot = recruit.tile;
        actor.reset(true);
      } else {
        const [dx, dy] = offsets[i % offsets.length]!;
        spot =
          this.paths.nearestWalkable({ tx: center.tx + dx, ty: center.ty + dy }, 3, taken) ??
          center;
        taken.add(key(spot));
        const anims =
          this.manifest.atlases[def.sprite.atlas]?.sprites[def.sprite.key]?.animations ?? {};
        actor = this.takeActor();
        actor.setLook(monsterLook(this.scene, this.manifest, def), anims);
        actor.reset(true);
      }
      actor.speed = CHASE_SPEED;
      const affixes = m.affixes
        .map((id) => this.content.monsterAffixes.get(id))
        .filter((a) => a !== undefined);
      const color = m.boss
        ? NAME_COLOR.boss
        : (affixes[0]?.color ?? (m.elite ? NAME_COLOR.elite : NAME_COLOR.normal));
      const base = `${this.monsterName(def, m.elite)} ${t('hud.level', { level: def.level })}`;
      actor.setName(
        affixes.length > 0
          ? t('monster.eliteAffixes', {
              name: base,
              affixes: affixes.map((a) => t(a.nameKey)).join(', '),
            })
          : base,
        color,
      );
      actor.setOverhead(usePrefs.getState().gfx.names);
      actor.place(spot);
      actor.face(this.hero.x, this.hero.y);
      const hp = m.hp ?? m.maxHp;
      actor.setHp(hp / m.maxHp);
      if (animate && !recruit) actor.spawn();
      this.monsters.set(m.uid, {
        uid: m.uid,
        def,
        actor,
        hp,
        maxHp: m.maxHp,
        alive: true,
        chasing: false,
        thinkMs: 0,
      });
      this.group.push(m.uid);
    });
  }

  // --- Monster behaviour --------------------------------------------------------------------

  /**
   * The fight's monsters notice the hero within AGGRO_RADIUS (an "!" over the head) and run
   * at it: fighters take a free tile around the hero, archers and casters stop in range.
   */
  private moveGroup(dtMs: number) {
    if (this.mode === 'in_town' || this.mode === 'dead' || this.mode === 'return_town') return;
    const heroTile = this.hero.tile;
    for (const uid of this.group) {
      const v = this.monsters.get(uid);
      if (!v?.alive) continue;
      const moving = v.actor.update(dtMs, this.timeScale);
      const d = chebyshev(v.actor.tile, heroTile);
      if (!v.chasing && (d <= AGGRO_RADIUS || this.mode === 'fight')) {
        v.chasing = true;
        v.thinkMs = 0;
        this.fx.number(v.actor.x, v.actor.y - 22, '!', 'crit');
      }
      if (!v.chasing || moving) continue;
      if (d <= this.reachOf(v.def)) {
        v.actor.face(this.hero.x, this.hero.y);
        continue;
      }
      v.thinkMs -= dtMs;
      if (v.thinkMs > 0) continue;
      v.thinkMs = THINK_MS;
      v.actor.path = this.paths.find(v.actor.tile, this.postFor(v)) ?? [];
    }
  }

  /**
   * Where a monster fights from: a free tile next to the hero (diagonals count), or one at
   * bow range, the closest to where the monster stands.
   */
  private postFor(v: MonsterView, reach = this.reachOf(v.def)): TilePoint {
    const hero = this.hero.tile;
    const taken = new Set<string>([key(hero)]);
    for (const uid of this.group) {
      const o = this.monsters.get(uid);
      if (!o?.alive || o === v) continue;
      taken.add(key(o.actor.tile));
      const last = o.actor.path[o.actor.path.length - 1];
      if (last) taken.add(key(last));
    }
    let best: TilePoint | null = null;
    let bestD = Infinity;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== reach) continue;
        const p = { tx: hero.tx + dx, ty: hero.ty + dy };
        if (!this.paths.isWalkable(p) || taken.has(key(p))) continue;
        const d = manhattan(p, v.actor.tile);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    return best ?? this.paths.nearestWalkable(hero, reach + 1, taken) ?? hero;
  }

  /** Fills the map with wanderers of the current hunt (start, new hunt, resync). */
  private fillWanderers() {
    this.clearWanderers();
    for (let i = 0; i < WANDERERS; i++) this.spawnWanderer(false);
  }

  private clearWanderers() {
    for (const w of this.wanderers) {
      w.actor.container.setVisible(false);
      this.pool.push(w.actor);
    }
    this.wanderers = [];
    this.respawns = [];
  }

  /** A monster of the hunt appears on an open tile away from the hero and the others. */
  private spawnWanderer(animate: boolean) {
    const hunt = huntOf(this.sim.state, this.content);
    const spawns = hunt?.spawns.filter((s) => !this.content.monsters.get(s.monsterId)?.boss);
    if (!spawns?.length) return;
    let pick = Math.random() * spawns.reduce((n, s) => n + s.weight, 0);
    const spawn = spawns.find((s) => (pick -= s.weight) < 0) ?? spawns[0]!;
    const def = this.content.monsters.get(spawn.monsterId)!;
    let spot = this.openSpot(this.hero.tile, 6, 60);
    for (let tries = 0; tries < 8; tries++) {
      if (this.wanderers.every((w) => manhattan(w.home, spot) >= 4)) break;
      spot = this.openSpot(this.hero.tile, 6, 60);
    }
    const anims =
      this.manifest.atlases[def.sprite.atlas]?.sprites[def.sprite.key]?.animations ?? {};
    const actor = this.takeActor();
    actor.setLook(monsterLook(this.scene, this.manifest, def), anims);
    actor.reset(false);
    actor.speed = WANDER_SPEED;
    actor.setName(
      `${this.monsterName(def, false)} ${t('hud.level', { level: def.level })}`,
      NAME_COLOR.normal,
    );
    actor.setOverhead(usePrefs.getState().gfx.names);
    actor.place(spot);
    if (animate) actor.spawn();
    this.wanderers.push({ def, actor, home: spot, restMs: between([500, 4000]) });
  }

  /** Wanderers stroll around their spot, pausing now and then, and watch the hero pass. */
  private wander(dtMs: number) {
    if (this.mode === 'in_town' || this.mode === 'dead') return;
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      this.respawns[i]! -= dtMs * this.timeScale;
      if (this.respawns[i]! <= 0) {
        this.respawns.splice(i, 1);
        this.spawnWanderer(true);
      }
    }
    const heroTile = this.hero.tile;
    for (const w of this.wanderers) {
      if (w.actor.update(dtMs, this.timeScale)) continue;
      if (chebyshev(w.actor.tile, heroTile) <= 2) {
        w.actor.face(this.hero.x, this.hero.y);
        continue;
      }
      w.restMs -= dtMs * this.timeScale;
      if (w.restMs > 0) continue;
      w.restMs = between([1500, 5000]);
      const near = this.open.filter((p) => chebyshev(p, w.home) <= WANDER_RADIUS);
      const to = near[Math.floor(Math.random() * near.length)];
      if (to) w.actor.path = this.paths.find(w.actor.tile, to) ?? [];
    }
  }

  private takeActor(): Actor {
    const free = this.pool.pop();
    if (free) return free;
    return new Actor(
      this.scene,
      () => ({ texture: '__MISSING', flipX: false, scale: 1 }),
      {},
      { name: '', color: NAME_COLOR.normal, bar: true },
    );
  }

  private flash(r: number, g: number, b: number) {
    if (!this.calm && usePrefs.getState().gfx.flashes) this.scene.cameras.main.flash(220, r, g, b);
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

  private enterTown(view: 'idle' | 'depositing' | 'leaving') {
    this.mode = 'in_town';
    this.hero.path = [];
    this.hero.container.setVisible(false);
    this.hero.place(this.exit);
    this.clearMonsters(false);
    this.clearWanderers();
    useUi.getState().setTown(view);
  }

  private leaveTown() {
    const wasHidden = !this.hero.container.visible;
    useUi.getState().setTown(null);
    if (wasHidden) {
      this.hero.reset(true);
      this.hero.place(this.exit);
      this.scene.cameras.main.fadeIn(300);
      this.fx.spell('teleport', this.hero.x, this.hero.y);
    }
    if (this.wanderers.length === 0 && this.respawns.length === 0) this.fillWanderers();
    this.roam();
  }

  /** Off to a random spot of the map; any monster group pulls the hero away at once. */
  private roam() {
    this.mode = 'roam';
    this.engageDest = null;
    const spot = this.openSpot(this.hero.tile, ROAM_MIN, ROAM_MAX);
    this.hero.path = this.paths.find(this.hero.tile, spot) ?? [];
  }

  // --- Cavebot ------------------------------------------------------------------------------

  private cavebot(dtMs: number) {
    const hero = this.hero;
    const moving = hero.update(dtMs, this.timeScale);
    switch (this.mode) {
      case 'roam': {
        if (this.currentTarget()) {
          this.mode = 'engage';
          this.engageDest = null;
          break;
        }
        if (!moving) this.roam();
        break;
      }
      case 'engage': {
        const target = this.currentTarget();
        if (!target) {
          if (!moving) this.roam();
          break;
        }
        const d = chebyshev(hero.tile, target.actor.tile);
        // Ranged classes stop as soon as the target is within reach.
        if (this.range > 1 && d <= this.range) hero.path = [];
        if (d <= this.range && !moving) {
          this.mode = 'fight';
          hero.face(target.actor.x, target.actor.y);
          break;
        }
        // A fighter running at the hero: stand and wait for it rather than walk into it.
        if (target.chasing && this.reachOf(target.def) === 1 && d <= AGGRO_RADIUS) {
          hero.path = [];
          hero.face(target.actor.x, target.actor.y);
          this.engageDest = null;
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
        if (target && chebyshev(hero.tile, target.actor.tile) > this.range) {
          this.mode = 'engage';
          this.engageDest = null;
        } else if (target) {
          hero.face(target.actor.x, target.actor.y);
        }
        break;
      }
      case 'loot':
        this.lootTimer -= dtMs * this.timeScale;
        if (this.lootTimer <= 0) {
          if (this.currentTarget()) this.mode = 'engage';
          else this.roam();
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
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
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
          this.hero.place(this.openSpot(this.exit, 4, 10));
        }
        if (!this.paths.isWalkable(this.hero.tile))
          this.hero.place(this.openSpot(this.exit, 4, 10));
        const alive = a.group.filter((m) => m.hp > 0);
        const center =
          a.kind === 'fighting'
            ? this.openSpot(this.hero.tile, 1, 2)
            : this.openSpot(this.hero.tile, 4, 7);
        this.placeGroup(alive, center, false);
        this.fillWanderers();
        if (a.kind === 'fighting') {
          this.mode = 'engage';
          this.engageDest = null;
        } else {
          this.roam();
        }
        break;
      }
      case 'to_hunt':
        this.enterTown('idle');
        ui.setTown('leaving');
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
