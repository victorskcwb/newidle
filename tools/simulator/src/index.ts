/**
 * Balance simulator (section 12.2). Synthetic players play sessions through the engine:
 * a few minutes of tick simulation, then the time away resolved offline (12 h cap), as the
 * real client does. In each session the player makes the obvious choices: best open hunt,
 * better gear, skill points, refining, salvage, reset at level 100, reset shop.
 *
 *   pnpm sim [profile=active|casual] [days=20] [seed=1]
 *   PROFESSIONS=alchemy|smithing also gathers and crafts; REFINE_MAX=15 refines past +9;
 *   SIM_TAG=x writes <profile>x.csv.
 *
 * Writes tools/simulator/out/<profile>.csv (one row per session) and prints a summary
 * against the targets of section 12.2.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadContent, type Hunt } from '@abismo/content';
import {
  TICKS_PER_HOUR,
  buyUpgrade,
  computeHeroStats,
  computeRates,
  createGame,
  equipItem,
  learnBlock,
  learnSkill,
  performReset,
  professionLevel,
  setGathering,
  setRecipe,
  refineBlock,
  refineItem,
  resetBlock,
  resolveOffline,
  salvageUpTo,
  shopUnlocked,
  startHunt,
  step,
  upgradeCost,
  type GameState,
  type ItemInstance,
} from '@abismo/engine';

const PROFILES = {
  /** 8 sessions a day, every 2 h while awake, 8 h of sleep. */
  active: { sessionsPerDay: 8, sessionMinutes: 6 },
  /** 4 sessions a day. */
  casual: { sessionsPerDay: 4, sessionMinutes: 4 },
} as const;
type Profile = keyof typeof PROFILES;

const profile = (process.argv[2] ?? 'active') as Profile;
const days = Number(process.argv[3] ?? 20);
const seed = Number(process.argv[4] ?? 1);
const { sessionsPerDay, sessionMinutes } = PROFILES[profile];
const content = loadContent();
const hunts = [...content.hunts.values()];

// --- The player's choices ------------------------------------------------------------------

/** How much a setup is worth: damage per second × a little for survivability. */
function power(s: GameState): number {
  const st = computeHeroStats(s.hero, content);
  const dps = ((st.damageMin + st.damageMax) / 2) * (10 / st.attackIntervalTicks);
  return dps * Math.sqrt(st.maxHp) * (1 + st.defense / 1000);
}

function autoEquip(s: GameState) {
  for (const item of [...s.backpack, ...s.stash]) {
    const base = content.itemBases.get(item.baseId)!;
    if (base.requires.level > s.hero.level) continue;
    const current = s.hero.equipment[base.slot];
    const before = power(s);
    const trial = structuredClone(s.hero);
    trial.equipment[base.slot] = item;
    const after = power({ ...s, hero: trial });
    if (!current || after > before * 1.001) {
      try {
        equipItem(s, content, item.uid);
      } catch {
        // attribute requirement
      }
    }
  }
}

/** Skill order: the main attack, then damage and survival passives, then the rest. */
const SKILL_PLAN = [
  'heavy_strike',
  'heavy_strike',
  'heavy_strike',
  'sword_mastery',
  'sword_mastery',
  'toughness',
  'toughness',
  'whirlwind',
  'war_cry',
  'war_cry',
  'war_cry',
  'charge',
  'precision',
  'precision',
  'precision',
  'iron_skin',
  'iron_skin',
  'iron_skin',
  'fury',
  'fury',
  'fury',
  'bloodthirst',
  'bloodthirst',
  'critical_eye',
  'undead_bane',
];
function spendSkills(s: GameState) {
  const order = [
    ...SKILL_PLAN,
    ...[...content.skills.keys()].flatMap((id) => Array(10).fill(id) as string[]),
  ];
  for (const id of order) {
    if (s.hero.unspentSkillPoints <= 0) return;
    const skill = content.skills.get(id)!;
    if ((s.hero.skillLevels[id] ?? 0) >= skill.maxLevel) continue;
    if (learnBlock(s.hero, skill) === null) learnSkill(s, content, id);
  }
}

/** Highest refine the player goes for (REFINE_MAX, default +9: no risk of losing a level). */
const REFINE_MAX = Number(process.env.REFINE_MAX ?? 9);

/**
 * Refines the main gear while affordable. Above +9 a failure costs a level, so a protection
 * charm is used when there is one; tempering alloys are used on attempts from +7.
 */
function refineGear(s: GameState) {
  for (const slot of ['weapon', 'chest', 'helm', 'offhand'] as const) {
    const item = s.hero.equipment[slot];
    for (let tries = 0; item && item.refine < REFINE_MAX && tries < 200; tries++) {
      const protect = item.refine + 1 >= 10 && (s.consumables.refine_charm ?? 0) > 0;
      const temper = item.refine + 1 >= 7 && (s.consumables.tempering_stone ?? 0) > 0;
      if (refineBlock(s, item, protect, 'refine_charm', temper, 'tempering_stone') !== null) break;
      refineItem(s, content, item.uid, protect, temper);
    }
  }
}

function bestHunt(s: GameState): Hunt {
  const open = hunts.filter(
    (h) => s.unlockedHunts.includes(h.id) && h.levelRange[0] <= s.hero.level + 2,
  );
  return open[open.length - 1] ?? hunts[0]!;
}

function shop(s: GameState) {
  if (!shopUnlocked(s.hero)) return;
  // Speed first (XP), then the rest in order, each as far as the points go.
  const wishes = ['wisdom', 'ancestral_power', 'fortune', 'master', 'deep_pack', 'patience'];
  for (const id of wishes) {
    for (;;) {
      const cost = upgradeCost(content, s.hero, id);
      if (cost === null || cost > s.hero.resets.points) break;
      buyUpgrade(s, content, id);
    }
  }
}

/**
 * PROFESSIONS=1 (or alchemy): gathers herbs and crafts the best alchemy recipe the hunt can
 * feed. PROFESSIONS=smithing: mines and smiths instead.
 */
const PROFESSIONS = process.env.PROFESSIONS;
function professions(s: GameState) {
  if (!PROFESSIONS) return;
  const [gather, craft] =
    PROFESSIONS === 'smithing' ? ['mining', 'smithing'] : ['herbalism', 'alchemy'];
  if (s.professions.gathering !== gather) setGathering(s, content, gather);
  const huntTier = s.hunt ? (content.hunts.get(s.hunt.huntId)?.gatherTier ?? 1) : 1;
  const level = professionLevel(s, craft);
  const recipes = [...content.recipes.values()].filter(
    (r) =>
      r.professionId === craft &&
      r.level <= level &&
      Object.keys(r.inputs).every((id) => (content.resources.get(id)?.tier ?? 9) <= huntTier),
  );
  const best = recipes[recipes.length - 1];
  if (best && s.professions.recipe !== best.id) setRecipe(s, content, best.id);
}

function session(s: GameState) {
  professions(s);
  autoEquip(s);
  // Keep the best items; salvage the rest for refine materials.
  if (s.stash.length > 60) salvageUpTo(s, content, 'rare');
  spendSkills(s);
  refineGear(s);
  if (resetBlock(s) === null) {
    performReset(s, content);
    spendSkills(s);
  }
  shop(s);
  const hunt = bestHunt(s);
  if (s.hunt?.huntId !== hunt.id || s.activity.kind === 'idle_town') startHunt(s, content, hunt.id);
}

// --- Run --------------------------------------------------------------------------------------

const s = createGame(content, { name: 'Sim', seed: [seed, 0x9e3779b9, 7, 11] });
startHunt(s, content, hunts[0]!.id);
const rows = [
  'day,hour,level,resets,hunt,gold,kills,common,magic,rare,epic,legendary,refine,power',
];
const awakeHours = 16;
const gapHours = awakeHours / sessionsPerDay;
let hour = 8;
let firstLegendaryDay: number | null = null;
const cycleDone: number[] = [];
const t0 = performance.now();
let lastResets = 0;
/** First cycle only: XP and hours spent in each hunt, to compare XP/h between hunts. */
const perHunt = new Map<string, { xp: bigint; hours: number; levels: number[] }>();

for (let d = 0; d < days; d++) {
  for (let k = 0; k < sessionsPerDay; k++) {
    session(s);
    const huntId = s.hunt?.huntId ?? '-';
    const xpBefore = s.lifetime.xpEarned;
    const levelBefore = s.hero.level;
    step(s, content, sessionMinutes * 60 * 10);
    session(s);
    // Time away until the next session (overnight after the last one).
    const away = k === sessionsPerDay - 1 ? 24 - awakeHours + gapHours : gapHours;
    const rates = s.hunt ? computeRates(s, content, s.hunt.huntId, 2 * TICKS_PER_HOUR) : null;
    resolveOffline(s, content, rates, Math.round(away * TICKS_PER_HOUR));
    hour += sessionMinutes / 60 + away;
    if (s.hero.resets.count === 0 && s.hunt?.huntId === huntId) {
      const h = perHunt.get(huntId) ?? { xp: 0n, hours: 0, levels: [] };
      h.xp += s.lifetime.xpEarned - xpBefore;
      h.hours += sessionMinutes / 60 + away;
      h.levels.push(levelBefore);
      perHunt.set(huntId, h);
    }
    const day = hour / 24;
    if (firstLegendaryDay === null && s.lifetime.itemsByRarity.legendary > 0)
      firstLegendaryDay = day;
    if (s.hero.resets.count > lastResets) {
      cycleDone.push(day);
      lastResets = s.hero.resets.count;
    }
    const l = s.lifetime.itemsByRarity;
    const weapon = s.hero.equipment.weapon as ItemInstance | undefined;
    rows.push(
      [
        day.toFixed(2),
        hour.toFixed(1),
        s.hero.level,
        s.hero.resets.count,
        s.hunt?.huntId ?? '-',
        s.gold,
        s.lifetime.kills,
        l.common,
        l.magic,
        l.rare,
        l.epic,
        l.legendary,
        weapon?.refine ?? 0,
        power(s).toFixed(0),
      ].join(','),
    );
  }
}

mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
const file = new URL(`../out/${profile}${process.env.SIM_TAG ?? ''}.csv`, import.meta.url);
writeFileSync(file, rows.join('\n') + '\n');

// --- Summary against section 12.2 -----------------------------------------------------------
const reached100 = cycleDone[0] ?? null;
const cycles = cycleDone.map((day, i) => day - (i === 0 ? 0 : cycleDone[i - 1]!));
console.log(
  `profile ${profile}, ${days} days, seed ${seed} (${((performance.now() - t0) / 1000).toFixed(0)} s)`,
);
console.log(`final: level ${s.hero.level}, resets ${s.hero.resets.count}, hunt ${s.hunt?.huntId}`);
console.log(
  `first level 100 (first reset): ${reached100 === null ? 'not reached' : `day ${reached100.toFixed(1)}`}  [target 3–5 for active]`,
);
console.log(
  `first legendary: ${firstLegendaryDay === null ? 'none' : `day ${firstLegendaryDay.toFixed(1)}`}  [target 1–3]`,
);
console.log(
  `cycle lengths (days): ${cycles.map((c) => c.toFixed(1)).join(', ') || '-'}  [each ≥10% faster]`,
);
const levels = rows.slice(1).filter((_, i) => i % sessionsPerDay === sessionsPerDay - 1);
console.log('end of each day: level/resets/hunt');
console.log(
  levels
    .map((r) => r.split(','))
    .map((c) => `  day ${Math.round(Number(c[0]))}: L${c[2]} R${c[3]} ${c[4]}`)
    .join('\n'),
);
console.log('first cycle, XP/h by hunt (hero levels while there):');
for (const [id, h] of perHunt) {
  const lv = `${Math.min(...h.levels)}–${Math.max(...h.levels)}`;
  console.log(
    `  ${id.padEnd(20)} ${(Number(h.xp) / h.hours).toFixed(0).padStart(8)} XP/h  levels ${lv}`,
  );
}
console.log(`csv: ${file.pathname}`);
