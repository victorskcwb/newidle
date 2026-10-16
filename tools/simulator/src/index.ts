/**
 * Balance simulator (first cut). Runs a fresh hero through the tick simulation for N hours
 * in the starting hunt, auto-equipping better drops, and writes a CSV of the progression.
 *
 *   pnpm sim [hours=8] [seed=1]
 *
 * The full synthetic-player model of section 12.2 (sessions per day, offline gaps, resets)
 * builds on this once those systems exist.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadContent } from '@abismo/content';
import {
  TICKS_PER_HOUR,
  computeRates,
  createGame,
  equipItem,
  heroStats,
  itemStats,
  startHunt,
  step,
  type GameState,
} from '@abismo/engine';

const hours = Number(process.argv[2] ?? 8);
const seed = Number(process.argv[3] ?? 1);
const content = loadContent();
const state = createGame(content, { name: 'Sim', seed: [seed, 2, 3, 4] });
const huntId = [...content.hunts.values()].find((h) => h.startUnlocked)!.id;

/** Crude gear score: equip anything in the stash whose damage/defense/life is higher. */
function score(s: GameState, uid: number): number {
  const item = [...s.stash, ...Object.values(s.hero.equipment)].find((i) => i?.uid === uid);
  if (!item) return 0;
  const st = itemStats(item, content);
  return (
    ((st.damageMin ?? 0) + (st.damageMax ?? 0)) * 3 +
    (st.defense ?? 0) * 2 +
    (st.mods.life ?? 0) +
    (st.mods.damagePct ?? 0) * 2 +
    (st.mods.damageFlat ?? 0) * 5
  );
}

function autoEquip(s: GameState) {
  for (const item of [...s.stash]) {
    const slot = content.itemBases.get(item.baseId)!.slot;
    const current = s.hero.equipment[slot];
    if (!current || score(s, item.uid) > score(s, current.uid)) {
      try {
        equipItem(s, content, item.uid);
      } catch {
        // requirement not met yet
      }
    }
  }
}

const t0 = performance.now();
const rates0 = computeRates(state, content, huntId);
const rateMs = performance.now() - t0;
console.log(`rate sheet in ${rateMs.toFixed(0)} ms:`, {
  killsPerHour: rates0.killsPerHour.toFixed(0),
  xpPerHour: rates0.xpPerHour.toFixed(0),
  goldPerHour: rates0.goldPerHour.toFixed(0),
  deathsPerHour: rates0.deathsPerHour.toFixed(2),
  potionsPerHour: rates0.potionsUsedPerHour,
  dropsPerHour: rates0.dropsPerHour,
});

startHunt(state, content, huntId);
const rows = ['minute,level,xp,gold,kills,deaths,stash,common,magic,rare,epic,legendary,dps_hint'];
const stepTicks = TICKS_PER_HOUR / 6;
const t1 = performance.now();
for (let i = 1; i <= hours * 6; i++) {
  const events = step(state, content, stepTicks);
  for (const e of events) {
    if (e.type === 'ArrivedInTown') autoEquip(state);
    if (e.type === 'HuntStopped') {
      console.log(`hunt stopped at minute ${i * 10}: ${e.reason}`);
      startHunt(state, content, huntId);
    }
  }
  const st = heroStats(state.hero, content);
  const l = state.lifetime;
  rows.push(
    [
      i * 10,
      state.hero.level,
      state.hero.xp,
      state.gold,
      l.kills,
      l.deaths,
      state.stash.length,
      l.itemsByRarity.common,
      l.itemsByRarity.magic,
      l.itemsByRarity.rare,
      l.itemsByRarity.epic,
      l.itemsByRarity.legendary,
      ((st.damageMin + st.damageMax) / 2 / (st.attackIntervalTicks / 10)).toFixed(1),
    ].join(','),
  );
}
const simMs = performance.now() - t1;
mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
const file = new URL('../out/progression.csv', import.meta.url);
writeFileSync(file, rows.join('\n') + '\n');
console.log(`${hours} h simulated in ${simMs.toFixed(0)} ms → ${file.pathname}`);
console.log(rows.slice(0, 7).join('\n'));
console.log('...');
console.log(rows.slice(-3).join('\n'));
