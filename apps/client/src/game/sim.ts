import { loadContent, type ContentDb } from '@abismo/content';
import {
  TICK_MS,
  computeRates,
  createGame,
  equipItem,
  heroStats,
  resolveOffline,
  returnToTown,
  salvageItem,
  startHunt,
  step,
  stepQuiet,
  xpToNext,
  type Activity,
  type GameEvent,
  type GameState,
  type OfflineReport,
  type RateSheet,
} from '@abismo/engine';

/** What the HUD shows at one tick. Kept per tick so the HUD can follow the scene's lag. */
export interface Snapshot {
  tick: number;
  level: number;
  xp: number;
  xpToNext: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  gold: bigint;
  potions: number;
  activity: Activity['kind'];
}

export type SimSignal =
  | { kind: 'events'; events: GameEvent[] }
  /** The state jumped (background tab, offline): the scene must rebuild from the state. */
  | { kind: 'resync' };

/** Ticks behind beyond which the sim fast-forwards without events instead of replaying. */
const CATCH_UP_TICKS = 300;
/** Time away (background tab) beyond which the offline resolution is used. */
const OFFLINE_AFTER_TICKS = 5 * 60 * 10;
const SNAPSHOT_HISTORY = 3000;
const RATES_DEBOUNCE_MS = 400;

/**
 * Runs the engine in real time in the browser: one engine tick per 100 ms of wall clock.
 * The engine decides everything; this class only feeds it time and intents, and fans out
 * the events (to the scene) and snapshots/rates (to the UI).
 */
export class GameSim {
  readonly content: ContentDb = loadContent();
  state: GameState;
  rates: RateSheet | null = null;
  offlineReport: OfflineReport | null = null;
  /** Increments whenever inventory, equipment or settings change (UI re-renders). */
  version = 0;
  /** Autosave checks this; turned off while a save import replaces the stored save. */
  saveEnabled = true;

  private originMs = 0;
  private originTick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hiddenAtMs: number | null = null;
  private ratesTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshots = new Map<number, Snapshot>();
  private listeners = new Set<(s: SimSignal) => void>();
  private backlog: SimSignal[] = [];
  private changeListeners = new Set<() => void>();

  constructor(
    state: GameState,
    /** Debug only (dev builds): game speed multiplier. */
    readonly speed = 1,
  ) {
    this.state = state;
    this.snapshot();
  }

  /** A brand-new hero (level 1, starter sword) with a seed from the browser's crypto RNG. */
  static newHero(hero: { name: string; appearance: { hair: number; outfit: number } }, speed = 1) {
    const content = loadContent();
    const seed = crypto.getRandomValues(new Uint32Array(4));
    const state = createGame(content, {
      ...hero,
      seed: [seed[0]!, seed[1]!, seed[2]!, seed[3]!],
    });
    return new GameSim(state, speed);
  }

  start() {
    this.resetClock();
    this.timer = setInterval(() => this.pump(), 50);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  on(listener: (s: SimSignal) => void): () => void {
    this.listeners.add(listener);
    // Events from before the scene existed (e.g. the first startHunt) are delivered now.
    for (const signal of this.backlog.splice(0)) listener(signal);
    return () => this.listeners.delete(listener);
  }

  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** The latest snapshot at or before `tick`. */
  snapshotAt(tick: number): Snapshot | undefined {
    const t = Math.min(Math.floor(tick), this.state.tick);
    for (let k = t; k >= t - 50; k--) {
      const s = this.snapshots.get(k);
      if (s) return s;
    }
    return this.snapshots.get(this.state.tick);
  }

  // --- Intents ------------------------------------------------------------------------------

  startHunt(huntId: string) {
    this.emit({ kind: 'events', events: startHunt(this.state, this.content, huntId) });
    this.changed(true);
  }

  returnToTown() {
    this.emit({ kind: 'events', events: returnToTown(this.state, this.content) });
    this.changed(false);
  }

  equip(uid: number) {
    equipItem(this.state, this.content, uid);
    this.snapshot();
    this.changed(true);
  }

  salvage(uid: number) {
    salvageItem(this.state, this.content, uid);
    this.changed(false);
  }

  dismissOffline() {
    this.offlineReport = null;
    this.changed(false);
  }

  // --- Internals ----------------------------------------------------------------------------

  private resetClock() {
    this.originMs = performance.now();
    this.originTick = this.state.tick;
  }

  private dueTicks(): number {
    const target =
      this.originTick + Math.floor(((performance.now() - this.originMs) * this.speed) / TICK_MS);
    return target - this.state.tick;
  }

  private pump() {
    let due = this.dueTicks();
    if (due <= 0) return;
    if (due > CATCH_UP_TICKS) {
      stepQuiet(this.state, this.content, due);
      this.snapshot();
      this.emit({ kind: 'resync' });
      this.changed(true);
      return;
    }
    const events: GameEvent[] = [];
    let levelUp = false;
    let inventory = false;
    while (due-- > 0) {
      for (const e of step(this.state, this.content, 1)) {
        events.push(e);
        if (e.type === 'LevelUp') levelUp = true;
        if (
          e.type === 'ItemDropped' ||
          e.type === 'ArrivedInTown' ||
          e.type === 'MaterialsGained' ||
          e.type === 'ConsumableDropped' ||
          e.type === 'HuntUnlocked'
        ) {
          inventory = true;
        }
      }
      this.snapshot();
    }
    if (events.length > 0) this.emit({ kind: 'events', events });
    if (levelUp || inventory) this.changed(levelUp);
  }

  private onVisibility = () => {
    if (document.hidden) {
      this.hiddenAtMs = performance.now();
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    if (this.hiddenAtMs === null) return;
    const away = Math.floor(((performance.now() - this.hiddenAtMs) * this.speed) / TICK_MS);
    this.hiddenAtMs = null;
    this.applyAway(away);
    this.resetClock();
    this.timer = setInterval(() => this.pump(), 50);
  };

  /** Time away: replays short gaps tick by tick, resolves long ones from the rate sheet. */
  applyAway(ticks: number) {
    if (ticks <= 0) return;
    if (ticks < OFFLINE_AFTER_TICKS) {
      stepQuiet(this.state, this.content, ticks);
    } else {
      const huntId = this.state.hunt?.huntId;
      const rates = huntId ? (this.rates ?? computeRates(this.state, this.content, huntId)) : null;
      this.offlineReport = resolveOffline(this.state, this.content, rates, ticks);
    }
    this.snapshot();
    this.emit({ kind: 'resync' });
    this.changed(true);
  }

  private snapshot() {
    const s = this.state;
    const stats = heroStats(s.hero, this.content);
    this.snapshots.set(s.tick, {
      tick: s.tick,
      level: s.hero.level,
      xp: s.hero.xp,
      xpToNext: xpToNext(s.hero.level),
      hp: Math.max(0, s.hero.hp),
      maxHp: stats.maxHp,
      mana: s.hero.mana,
      maxMana: stats.maxMana,
      gold: s.gold,
      potions: s.consumables[s.settings.hpPotionId] ?? 0,
      activity: s.activity.kind,
    });
    this.snapshots.delete(s.tick - SNAPSHOT_HISTORY);
  }

  private emit(signal: SimSignal) {
    if (this.listeners.size === 0) {
      this.backlog.push(signal);
      return;
    }
    for (const l of this.listeners) l(signal);
  }

  /** Notifies the UI; `setupChanged` also schedules a new rate sheet. */
  private changed(setupChanged: boolean) {
    this.version++;
    if (setupChanged) this.scheduleRates();
    for (const l of this.changeListeners) l();
  }

  private scheduleRates() {
    if (this.ratesTimer) clearTimeout(this.ratesTimer);
    this.ratesTimer = setTimeout(() => {
      const huntId = this.state.hunt?.huntId;
      this.rates = huntId ? computeRates(this.state, this.content, huntId) : null;
      this.version++;
      for (const l of this.changeListeners) l();
    }, RATES_DEBOUNCE_MS);
  }
}
