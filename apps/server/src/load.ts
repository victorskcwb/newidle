import { loadContent } from '@abismo/content';
import {
  TICK_MS,
  cloneState,
  computeRates,
  createGame,
  encodeSave,
  startHunt,
  stepQuiet,
} from '@abismo/engine';
import { PROTOCOL_VERSION, brasiliaDay, encodeMessage } from '@abismo/protocol';
import { GameServer } from './game.ts';
import { MemoryStore } from './store.ts';

/**
 * Load test (docs/plan-fase-1.md, commit 12): N heroes hunting on one game server, each on a
 * connection that just drops what it receives. Measures how long each 100 ms server tick takes
 * (the budget is the tick itself) on a fake clock, so only the game's CPU is counted.
 *
 *   pnpm --filter @abismo/server load 500 600     # 500 heroes, 600 ticks (1 game minute)
 */
const heroes = Number(process.argv[2] ?? 200);
const ticks = Number(process.argv[3] ?? 600);
const content = loadContent();
let now = 1_700_000_000_000;
const store = new MemoryStore();
const server = new GameServer({
  content,
  store,
  authenticate: async (token) => ({ accountId: token, sessionId: token }),
  rates: async (state, huntId) => computeRates(state, content, huntId),
  now: () => now,
  dayOf: brasiliaDay,
  buildId: 'load',
});

// RICH=1: every hero is a copy of one played for 12 h (full backpack and stash, bigger state
// to hash and save); otherwise new heroes.
const rich = process.env.RICH === '1' ? played() : null;

function played() {
  const s = createGame(content, { name: 'Veterano', seed: [99, 7, 11, 13] });
  s.settings.automation = { equipBest: true, bestHunt: true, autoSkills: true, autoReset: true };
  startHunt(s, content, 'forgotten_cemetery');
  stepQuiet(s, content, 12 * 36_000);
  return s;
}

let bytes = 0;
for (let i = 0; i < heroes; i++) {
  const s = rich
    ? cloneState(rich)
    : createGame(content, { name: `Carga ${i}`, seed: [i + 1, 7, 11, 13] });
  if (rich) s.rng = [i + 1, 7, 11, 13];
  else startHunt(s, content, 'forgotten_cemetery');
  await server.createHero(`h${i}`, s);
  const link = server.connect({ send: (text) => (bytes += text.length), close: () => {} });
  link.receive(
    encodeMessage({ type: 'hello', protocol: PROTOCOL_VERSION, buildId: 'load', token: `h${i}` }),
  );
}
// Let every hello finish (they are async).
while (server.online < heroes) await new Promise((r) => setImmediate(r));
bytes = 0;

const times: number[] = [];
const heapBefore = process.memoryUsage().heapUsed;
for (let t = 0; t < ticks; t++) {
  now += TICK_MS;
  const t0 = performance.now();
  await server.tick();
  times.push(performance.now() - t0);
}
// Slow ticks in order (index, ms): a one-off at the start is not the same as a periodic spike.
const slow = times
  .map((ms, i) => [i, +ms.toFixed(0)] as const)
  .filter(([, ms]) => ms > 100)
  .slice(0, 10);
times.sort((a, b) => a - b);
const pct = (p: number) => times[Math.min(times.length - 1, Math.floor(times.length * p))]!;
const mean = times.reduce((a, b) => a + b, 0) / times.length;
console.log(
  JSON.stringify({
    heroes,
    ticks,
    rich: rich !== null,
    saveKb: +(
      encodeSave(rich ?? createGame(content, { name: 'x', seed: [1, 2, 3, 4] }), 0).length / 1024
    ).toFixed(0),
    msPerTick: {
      mean: +mean.toFixed(2),
      p50: +pct(0.5).toFixed(2),
      p99: +pct(0.99).toFixed(2),
      max: +times.at(-1)!.toFixed(2),
    },
    usPerHeroTick: +((mean * 1000) / heroes).toFixed(1),
    kbPerHeroMinute: +(bytes / heroes / (ticks / 600) / 1024).toFixed(1),
    slowTicks: slow,
    heapMb: +((process.memoryUsage().heapUsed - heapBefore) / 1e6).toFixed(0),
  }),
);
process.exit(0);
