import { loadContent, type ContentDb } from '@abismo/content';
import type { EquipmentSlot, Rarity } from '@abismo/content';
import {
  OFFLINE_AFTER_TICKS,
  TICK_MS,
  applyIntent,
  checkAchievements,
  createGame,
  debugSetLevel,
  heroStats,
  loginDue,
  advanceAway,
  step,
  stepQuiet,
  xpToNext,
  type Activity,
  type Attribute,
  type AutoAllocateProfile,
  type AutomationId,
  type CraftRarity,
  type GameEvent,
  type GameState,
  type HuntDifficulty,
  type Intent,
  type ItemInstance,
  type LootFilter,
  type OfflineReport,
  type PotionSettings,
  type RateSheet,
  type RefineResult,
  type RolledAffix,
  type SkillRule,
  type TargetPriority,
} from '@abismo/engine';
import type { salvageUpTo } from '@abismo/engine';
import { brasiliaDay } from '@abismo/protocol';
import { localNow, type LinkStatus, type OnlineLink } from './online.ts';
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
const SNAPSHOT_HISTORY = 3000;
const RATES_DEBOUNCE_MS = 400;

/** How an intent changes what the UI shows: `setup` also recomputes the rate sheet. */
interface ActOptions {
  setup?: boolean;
  /** The HUD must show the new values at once (see freshSnapshot). */
  fresh?: boolean;
}
const SETUP: ActOptions = { setup: true };
const FRESH: ActOptions = { fresh: true };
const SETUP_FRESH: ActOptions = { setup: true, fresh: true };

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
    /**
     * Online (decision 173): the state is the replica's, intents go through it to the server,
     * and time comes from the server's clock. Absent: the local single-player game.
     */
    readonly link: OnlineLink | null = null,
  ) {
    this.state = state;
    this.snapshot();
    if (link) {
      // The local save is the player's offline hero (to import later): never overwrite it.
      this.saveEnabled = false;
      this.offlineReport = link.replica?.offlineReport ?? null;
      link.onStateReplaced = () => {
        this.state = link.replica!.state;
        this.offlineReport = link.replica!.offlineReport ?? this.offlineReport;
        this.freshSnapshot();
        this.emit({ kind: 'resync' });
        this.changed(true);
      };
      link.onStatus = () => this.changed(false);
    }
  }

  /** Online: what the connection is doing (the UI shows reconnecting / taken over). */
  get connection(): LinkStatus | null {
    return this.link?.status ?? null;
  }

  /** The game day: Brasília's on the server's clock online, the device's local day offline. */
  private today(): number {
    const replica = this.link?.replica;
    return replica ? brasiliaDay(replica.serverNow(localNow())) : localDay();
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

  /** Without a difficulty: the one already chosen in that hunt, or normal elsewhere. */
  startHunt(huntId: string, difficulty?: HuntDifficulty) {
    this.act({ type: 'start_hunt', huntId, ...(difficulty ? { difficulty } : {}) }, SETUP);
  }

  enterDungeon() {
    this.act({ type: 'enter_dungeon' }, SETUP);
  }

  returnToTown() {
    this.act({ type: 'return_to_town' });
  }

  equip(uid: number) {
    this.act({ type: 'equip', uid }, SETUP_FRESH);
  }

  /** Equips the strongest items from the backpack and stash; returns how many changed. */
  equipBest() {
    return (this.act({ type: 'equip_best' }, SETUP_FRESH) as number[]).length;
  }

  /** Gives an item up to the collection. */
  register(uid: number) {
    this.act({ type: 'register', uid }, SETUP_FRESH);
  }

  salvage(uid: number) {
    this.act({ type: 'salvage', uid });
  }

  /** Action bar: target priority and auto-sell in town. */
  setHuntBehaviour(behaviour: { targetPriority: TargetPriority; autoSellUpTo: Rarity | null }) {
    this.act({ type: 'set_hunt_behaviour', ...behaviour }, SETUP);
  }

  /** Town: sells items to the merchant. */
  sell(uids: number[]) {
    return this.act({ type: 'sell', uids }, FRESH) as { count: number; gold: number };
  }

  /** Town: everything in the backpack goes to the stash. */
  depositAll() {
    return this.act({ type: 'deposit_all' }) as number;
  }

  /** Town: buys consumables from the merchant. */
  buy(consumableId: string, qty: number) {
    this.act({ type: 'buy', consumableId, qty }, FRESH);
  }

  /** Town: the smith forges a new item. */
  forge(slot: EquipmentSlot, rarity: CraftRarity) {
    return this.act({ type: 'forge', slot, rarity }, FRESH) as ItemInstance;
  }

  /** New daily/weekly goals when the local day changed (the engine has no clock). */
  refreshQuests() {
    const day = this.today();
    if (this.state.quests.day === day) return;
    this.act({ type: 'refresh_quests', day });
  }

  setGathering(professionId: string | null) {
    this.act({ type: 'set_gathering', professionId });
  }

  setAutomation(id: AutomationId, on: boolean) {
    this.act({ type: 'set_automation', id, on });
  }

  setActivePet(petId: string | null) {
    this.act({ type: 'set_active_pet', petId }, SETUP);
  }

  setMeal(mealId: string | null) {
    this.act({ type: 'set_meal', mealId }, SETUP);
  }

  setRecipe(recipeId: string | null) {
    this.act({ type: 'set_recipe', recipeId });
  }

  /** Today's login calendar reward is waiting. */
  loginDue(): boolean {
    return loginDue(this.state, this.today());
  }

  claimLogin() {
    this.act({ type: 'claim_login', day: this.today() });
  }

  /** Shows an unlocked achievement's title next to the hero's name (null hides it). */
  setTitle(achievementId: string | null) {
    this.act({ type: 'set_title', achievementId });
  }

  dismissAchievements() {
    this.newAchievements = [];
    this.changed(false);
  }

  claimQuest(which: number | 'weekly') {
    this.act({ type: 'claim_quest', which });
  }

  dismissOffline() {
    this.offlineReport = null;
    this.changed(false);
  }

  unequip(slot: EquipmentSlot) {
    this.act({ type: 'unequip', slot }, SETUP_FRESH);
  }

  allocate(attribute: Attribute, points: number) {
    this.act({ type: 'allocate', attribute, points }, SETUP_FRESH);
  }

  setAutoAllocate(profile: AutoAllocateProfile) {
    this.act({ type: 'set_auto_allocate', profile }, SETUP_FRESH);
  }

  learnSkill(skillId: string) {
    this.act({ type: 'learn_skill', skillId }, SETUP_FRESH);
  }

  setActiveSkill(slot: number, skillId: string | null) {
    this.act({ type: 'set_active_skill', slot, skillId }, SETUP);
  }

  /** When an active skill may be used (null clears the rule: used whenever ready). */
  setSkillRule(skillId: string, rule: SkillRule | null) {
    this.act({ type: 'set_skill_rule', skillId, rule }, SETUP);
  }

  respecSkills() {
    this.act({ type: 'respec_skills' }, SETUP_FRESH);
  }

  refine(uid: number, useProtection: boolean, useTempering = false): RefineResult {
    return this.act(
      { type: 'refine', uid, useProtection, useTempering },
      SETUP_FRESH,
    ) as RefineResult;
  }

  reforge(uid: number, index: number): RolledAffix {
    return this.act({ type: 'reforge', uid, index }, SETUP_FRESH) as RolledAffix;
  }

  salvageUpTo(rarity: Rarity) {
    return this.act({ type: 'salvage_up_to', rarity }) as ReturnType<typeof salvageUpTo>;
  }

  setLootFilter(filter: LootFilter) {
    this.act({ type: 'set_loot_filter', ...filter }, SETUP);
  }

  setPotionSettings(settings: PotionSettings) {
    this.act({ type: 'set_potion_settings', ...settings }, SETUP);
  }

  reset(nextClassId?: string) {
    const result = this.act(
      { type: 'reset', ...(nextClassId ? { nextClassId } : {}) },
      SETUP_FRESH,
    ) as { points: number };
    this.emit({ kind: 'resync' });
    return result;
  }

  buyUpgrade(upgradeId: string) {
    this.act({ type: 'buy_upgrade', upgradeId }, SETUP_FRESH);
  }

  /** Marks a one-time tip as seen. */
  setFlag(flag: string) {
    if (this.state.flags.includes(flag)) return;
    this.act({ type: 'set_flag', flag });
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
  ratesFor(huntId: string, difficulty?: HuntDifficulty): Promise<RateSheet> {
    this.ratesClient ??= new RatesClient();
    return this.ratesClient.compute(this.state, huntId, difficulty);
  }

  // --- Internals ----------------------------------------------------------------------------

  /**
   * Applies a player intent through the engine's single entry point (decision 173) and
   * notifies the scene and the UI. Throws IntentError like the rule it runs.
   */
  private act(intent: Intent, o: ActOptions = {}): unknown {
    const replica = this.link?.replica;
    const { events, result } = replica
      ? replica.act(intent)
      : applyIntent(this.state, this.content, intent);
    if (events.length > 0) this.emit({ kind: 'events', events });
    if (o.fresh) this.freshSnapshot();
    this.changed(!!o.setup);
    return result;
  }

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
    const replica = this.link?.replica;
    if (replica?.waitingForState) return;
    let due = replica ? replica.targetTick(localNow()) - this.state.tick : this.dueTicks();
    if (due <= 0) return;
    if (replica && due > OFFLINE_AFTER_TICKS) {
      // A long pause (background tab): the server has the hero's state; ask instead of replaying.
      replica.requestState();
      return;
    }
    if (due > CATCH_UP_TICKS) {
      if (replica) replica.stepUntil(this.state.tick + due);
      else stepQuiet(this.state, this.content, due);
      this.snapshot();
      this.emit({ kind: 'resync' });
      this.changed(true);
      return;
    }
    const events: GameEvent[] = [];
    let levelUp = false;
    let inventory = false;
    while (due-- > 0) {
      const tickEvents = replica
        ? replica.stepUntil(this.state.tick + 1)
        : step(this.state, this.content, 1);
      for (const e of tickEvents) {
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
    // Online, the server kept playing: the next pump catches up or asks for the state.
    if (!this.link) this.applyAway(away);
    this.resetClock();
    this.timer = setInterval(() => this.pump(), 50);
  };

  /** Time away: replays short gaps tick by tick, resolves long ones from the rate sheet. */
  applyAway(ticks: number) {
    if (ticks <= 0) return;
    const report = advanceAway(this.state, this.content, ticks, this.rates);
    if (report) this.offlineReport = report;
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
