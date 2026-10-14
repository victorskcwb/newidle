/**
 * Balance check (early version of section 12.3): prints XP/h and items/h for every action
 * at its required level, next to the section 4.3 targets. Run: pnpm --filter @valdren/simulator start
 */
import { loadBundledContent } from '@valdren/content';
import {
  actionRates,
  deriveSeed,
  newCharacterSkills,
  newSlotState,
  xpForLevel,
} from '@valdren/engine';

const TARGETS: [maxLevel: number, xpPerHour: number][] = [
  [20, 3_000],
  [40, 9_000],
  [60, 25_000],
  [80, 60_000],
  [99, 120_000],
];

const content = loadBundledContent();
const tools = content.raw.items.filter((i) => i.tool).map((i) => ({ itemId: i.id, qty: 1 }));
const rows = ['action,skill,level,xp_per_hour,target_xp_per_hour,ratio,outputs_per_hour'];

for (const action of content.raw.actions) {
  const skills = newCharacterSkills().map((s) =>
    s.skill === action.skill ? { ...s, xpTenths: xpForLevel(action.level) } : s,
  );
  const state = newSlotState({
    slot: 'main',
    tick: 0,
    seed: deriveSeed('sim', 'main', 0),
    skills,
    bank: tools,
  });
  const rates = actionRates(state, action.id, content);
  if (!rates) continue;
  const xph = rates.xpTenthsPerHour / 10;
  const target = TARGETS.find(([max]) => action.level < max)?.[1] ?? 120_000;
  const outputs = rates.outputsPerHour.map((o) => `${o.itemId}:${o.qty.toFixed(1)}`).join(' ');
  rows.push(
    `${action.id},${action.skill},${action.level},${xph},${target},${(xph / target).toFixed(2)},${outputs}`,
  );
}

console.log(rows.join('\n'));
