import { loadContent, type ContentDb } from '@abismo/content';
import type { EquipmentSlot, Rarity } from '@abismo/content';
import {
  type CraftRarity,
  TICK_MS,
  allocateAttribute,
  buyConsumable,
  buyUpgrade,
  claimQuest,
  claimLogin,
  setGathering,
  setRecipe,
  setMeal,
  setActivePet,
  registerItem,
  enterDungeon,
  setAutomation,
  type AutomationId,
  checkAchievements,
  setTitle,
  loginDue,
  depositAll,
  computeRates,
  createGame,
  debugSetLevel,
  equipBest,
  equipItem,
  forgeItem,
  heroStats,
  learnSkill,
  performReset,
  refineItem,
  refreshQuests,
  reforgeItem,
  resolveOffline,
  respecSkills,
  returnToTown,
  salvageItem,
  salvageUpTo,
  sellItems,
  setActiveSkill,
  setHuntBehaviour,
  setAutoAllocate,
  setLootFilter,
  setPotionSettings,
  startHunt,
  step,
  stepQuiet,
  unequipItem,
  xpToNext,
  type Activity,
  type Attribute,
  type AutoAllocateProfile,
  type GameEvent,
  type GameState,
  type LootFilter,
  type OfflineReport,
  type PotionSettings,
  type RateSheet,
  type RefineResult,
  type RolledAffix,
} from '@abismo/engine';
import { RatesClient } from './ratesClient.ts';
import { recordHistory } from './history.ts';

/** Days since 1970-01-01 in the player's local time zone (goals reset at local midnight). */
export function localDay(now = new Date()): number {
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
}

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
  /** Achievements unlocked since the player last saw the notice. */
  newAchievements: string[] = [];
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
  private ratesClient: RatesClient | null = null;
  private questTimer: ReturnType<typeof setInterval> | null = null;
  private ratesRequest = 0;

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
    this.refreshQuests();
    recordHistory(this.state);
    this.questTimer = setInterval(() => {
      this.refreshQuests();
      recordHistory(this.state);
    }, 60_000);
    this.timer = setInterval(() => this.pump(), 50);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop() {
    if (this.questTimer) clearInterval(this.questTimer);
    this.questTimer = null;
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

  enterDungeon() {
    this.emit({ kind: 'events', events: enterDungeon(this.state) });
    this.changed(true);
  }

  returnToTown() {
    this.emit({ kind: 'events', events: returnToTown(this.state, this.content) });
    this.changed(false);
  }

  equip(uid: number) {
    equipItem(this.state, this.content, uid);
    this.freshSnapshot();
    this.changed(true);
  }

  /** Equips the strongest items from the backpack and stash; returns how many changed. */
  equipBest() {
    const n = equipBest(this.state, this.content).length;
    this.freshSnapshot();
    this.changed(true);
    return n;
  }

  /** Gives an item up to the collection. */
  register(uid: number) {
    registerItem(this.state, uid);
    this.freshSnapshot();
    this.changed(true);
  }

  salvage(uid: number) {
    salvageItem(this.state, this.content, uid);
    this.changed(false);
  }

  /** Action bar: target priority and auto-sell in town. */
  setHuntBehaviour(behaviour: Parameters<typeof setHuntBehaviour>[1]) {
    setHuntBehaviour(this.state, behaviour);
    this.changed(true);
  }

  /** Town: sells items to the merchant. */
  sell(uids: number[]) {
    const r = sellItems(this.state, uids);
    this.freshSnapshot();
    this.changed(false);
    return r;
  }

  /** Town: everything in the backpack goes to the stash. */
  depositAll() {
    const n = depositAll(this.state);
    this.changed(false);
    return n;
  }

  /** Town: buys consumables from the merchant. */
  buy(consumableId: string, qty: number) {
    buyConsumable(this.state, this.content, consumableId, qty);
    this.freshSnapshot();
    this.changed(false);
  }

  /** Town: the smith forges a new item. */
  forge(slot: EquipmentSlot, rarity: CraftRarity) {
    const item = forgeItem(this.state, this.content, slot, rarity);
    this.freshSnapshot();
    this.changed(false);
    return item;
  }

  /** New daily/weekly goals when the local day changed (the engine has no clock). */
  refreshQuests() {
    const day = localDay();
    if (this.state.quests.day === day) return;
    refreshQuests(this.state, day);
    this.changed(false);
  }

  setGathering(professionId: string | null) {
    setGathering(this.state, this.content, professionId);
    this.changed(false);
  }

  setAutomation(id: AutomationId, on: boolean) {
    setAutomation(this.state, id, on);
    this.changed(false);
  }

  setActivePet(petId: string | null) {
    setActivePet(this.state, petId);
    this.changed(true);
  }

  setMeal(mealId: string | null) {
    setMeal(this.state, this.content, mealId);
    this.changed(true);
  }

  setRecipe(recipeId: string | null) {
    setRecipe(this.state, this.content, recipeId);
    this.changed(false);
  }

  /** Today's login calendar reward is waiting. */
  loginDue(): boolean {
    return loginDue(this.state, localDay());
  }

  claimLogin() {
    claimLogin(this.state, this.content, localDay());
    this.changed(false);
  }

  /** Shows an unlocked achievement's title next to the hero's name (null hides it). */
  setTitle(achievementId: string | null) {
    setTitle(this.state, this.content, achievementId);
    this.changed(false);
  }

  dismissAchievements() {
    this.newAchievements = [];
    this.changed(false);
  }

  claimQuest(which: number | 'weekly') {
    claimQuest(this.state, which);
    this.changed(false);
  }

  dismissOffline() {
    this.offlineReport = null;
    this.changed(false);
  }

  unequip(slot: EquipmentSlot) {
    unequipItem(this.state, this.content, slot);
    this.freshSnapshot();
    this.changed(true);
  }

  allocate(attribute: Attribute, points: number) {
    allocateAttribute(this.state, attribute, points);
    this.freshSnapshot();
    this.changed(true);
  }

  setAutoAllocate(profile: AutoAllocateProfile) {
    setAutoAllocate(this.state, this.content, profile);
    this.freshSnapshot();
    this.changed(true);
  }

  learnSkill(skillId: string) {
    learnSkill(this.state, this.content, skillId);
    this.freshSnapshot();
    this.changed(true);
  }

  setActiveSkill(slot: number, skillId: string | null) {
    setActiveSkill(this.state, this.content, slot, skillId);
    this.changed(true);
  }

  respecSkills() {
    respecSkills(this.state);
    this.freshSnapshot();
    this.changed(true);
  }

  refine(uid: number, useProtection: boolean, useTempering = false): RefineResult {
    const result = refineItem(this.state, this.content, uid, useProtection, useTempering);
    this.freshSnapshot();
    this.changed(true);
    return result;
  }

  reforge(uid: number, index: number): RolledAffix {
    const rolled = reforgeItem(this.state, this.content, uid, index);
    this.freshSnapshot();
    this.changed(true);
    return rolled;
  }

  salvageUpTo(rarity: Rarity) {
    const result = salvageUpTo(this.state, this.content, rarity);
    this.changed(false);
    return result;
  }

  setLootFilter(filter: LootFilter) {
    setLootFilter(this.state, this.content, filter);
    this.changed(true);
  }

  setPotionSettings(settings: PotionSettings) {
    setPotionSettings(this.state, settings);
    this.changed(true);
  }

  reset(nextClassId?: string) {
    const result = performReset(this.state, this.content, nextClassId);
    this.freshSnapshot();
    this.emit({ kind: 'resync' });
    this.changed(true);
    return result;
  }

  buyUpgrade(upgradeId: string) {
    buyUpgrade(this.state, this.content, upgradeId);
    this.freshSnapshot();
    this.changed(true);
  }

  /** Marks a one-time tip as seen. */
  setFlag(flag: string) {
    if (this.state.flags.includes(flag)) return;
    this.state.flags.push(flag);
    this.changed(false);
  }

  /** Debug only (dev builds). */
  debugLevel(level: number) {
    debugSetLevel(this.state, this.content, level);
    this.freshSnapshot();
    this.changed(true);
  }

  /** Debug only (dev builds): gold and refine materials for testing. */
  debugResources() {
    this.state.gold += 1_000_000n;
    for (const id of ['fragment', 'essence', 'crystal']) {
      this.state.materials[id] = (this.state.materials[id] ?? 0n) + 1_000n;
    }
    this.freshSnapshot();
    this.changed(false);
  }

  /** Rate sheet of the current setup in any hunt (computed off the main thread). */
  ratesFor(huntId: string): Promise<RateSheet> {
    this.ratesClient ??= new RatesClient();
    return this.ratesClient.compute(this.state, huntId);
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
        // A new level, or an automation that changed gear or hunt: new rates too.
        if (
          e.type === 'LevelUp' ||
          e.type === 'AutoEquipped' ||
          e.type === 'AutoReset' ||
          e.type === 'PetFound' ||
          e.type === 'HuntStarted' ||
          e.type === 'DungeonFloorCleared' ||
          e.type === 'DungeonEnded'
        ) {
          levelUp = true;
        }
        if (
          e.type === 'ItemDropped' ||
          e.type === 'ArrivedInTown' ||
          e.type === 'MaterialsGained' ||
          e.type === 'ConsumableDropped' ||
          e.type === 'HuntUnlocked' ||
          e.type === 'ProfessionLevelUp' ||
          e.type === 'ItemCrafted'
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

  /**
   * After a player intent the HUD must show the new values at once, not the older snapshot
   * of the tick the scene is presenting: drop the history so lookups fall back to now.
   */
  private freshSnapshot() {
    this.snapshots.clear();
    this.snapshot();
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
    const fresh = checkAchievements(this.state, this.content);
    if (fresh.length > 0) this.newAchievements = [...this.newAchievements, ...fresh];
    if (setupChanged) this.scheduleRates();
    for (const l of this.changeListeners) l();
  }

  private scheduleRates() {
    if (this.ratesTimer) clearTimeout(this.ratesTimer);
    this.ratesTimer = setTimeout(() => {
      const huntId = this.state.hunt?.huntId;
      const request = ++this.ratesRequest;
      if (!huntId) {
        this.rates = null;
        return;
      }
      void this.ratesFor(huntId).then((rates) => {
        // A newer request supersedes this one.
        if (request !== this.ratesRequest) return;
        this.rates = rates;
        this.version++;
        for (const l of this.changeListeners) l();
      });
    }, RATES_DEBOUNCE_MS);
  }
}
