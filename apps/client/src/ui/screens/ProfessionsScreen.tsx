import type { Profession, Recipe } from '@abismo/content';
import {
  gatherTarget,
  gathering,
  hasInputs,
  perHour,
  PROFESSION_MAX_LEVEL,
  PROFESSION_XP_TO_NEXT,
  professionLevel,
  workTicks,
} from '@abismo/engine';
import { useState } from 'react';
import { formatNumber, t } from '../../i18n.ts';
import { rewardText } from '../LoginCalendar.tsx';
import { PixelIcon } from '../PixelIcon.tsx';
import { Sheet, tryIntent } from '../Sheet.tsx';
import { useSim } from '../useSim.ts';

function SkillBar({ profession }: { profession: Profession }) {
  const sim = useSim();
  const skill = sim.state.professions.skills[profession.id] ?? { level: 1, xp: 0 };
  const need = PROFESSION_XP_TO_NEXT[skill.level] ?? 0;
  return (
    <div className="prof-skill" data-testid={`prof-${profession.id}`}>
      <div className="prof-head">
        <span className="pixel">{t(profession.nameKey)}</span>
        <span className="pixel">{t('prof.level', { n: skill.level })}</span>
      </div>
      <div className="bar bar-xp quest-bar">
        <div
          className="bar-fill"
          style={{ width: need > 0 ? `${(skill.xp / need) * 100}%` : '100%' }}
        />
        <span className="bar-text">
          {skill.level >= PROFESSION_MAX_LEVEL
            ? t('hud.maxLevel')
            : `${formatNumber(skill.xp)} / ${formatNumber(need)}`}
        </span>
      </div>
    </div>
  );
}

function inputText(sim: ReturnType<typeof useSim>, inputs: Record<string, number>) {
  return Object.entries(inputs)
    .map(([id, qty]) => {
      const r = sim.content.resources.get(id);
      return `${qty} ${r ? t(r.nameKey) : id} (${formatNumber(sim.state.resources[id] ?? 0)})`;
    })
    .join(', ');
}

function RecipeRow({ recipe, onPick }: { recipe: Recipe; onPick: () => void }) {
  const sim = useSim();
  const s = sim.state;
  const level = professionLevel(s, recipe.professionId);
  const locked = level < recipe.level;
  const active = s.professions.recipe === recipe.id;
  const need = workTicks(recipe.seconds, recipe.level, level);
  return (
    <li className={`recipe${active ? ' active' : ''}${locked ? ' locked' : ''}`}>
      <div className="recipe-body">
        <div className="recipe-out">
          {Object.keys(recipe.outputs).map((id) => (
            <PixelIcon
              key={id}
              name={sim.content.consumables.has(id) ? `consumable.${id}` : `material.${id}`}
              size={22}
            />
          ))}
          <span>{rewardText(sim, recipe.outputs)}</span>
        </div>
        <div className="small muted">
          {t('prof.uses', { inputs: inputText(sim, recipe.inputs) })}
        </div>
        <div className="small muted">
          {locked
            ? t('prof.requires', { n: recipe.level })
            : t('prof.recipeRate', {
                seconds: Math.round(need / 10),
                xp: formatNumber(recipe.xp),
              })}
        </div>
        {active && (
          <div className="bar bar-xp quest-bar">
            <div
              className="bar-fill"
              style={{ width: `${(s.professions.craftTicks / need) * 100}%` }}
            />
            <span className="bar-text">
              {hasInputs(s, recipe) ? t('prof.crafting') : t('prof.waiting')}
            </span>
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn btn-small"
        disabled={locked}
        data-testid={`recipe-${recipe.id}`}
        onClick={onPick}
      >
        {active ? t('prof.stop') : t('prof.make')}
      </button>
    </li>
  );
}

/** The meal the hero eats while hunting, with the one under way. */
function MealPicker({ onError }: { onError: (e: string | null) => void }) {
  const sim = useSim();
  const s = sim.state;
  const meals = [...sim.content.consumables.values()].filter((c) => c.kind === 'meal');
  const current = s.hero.meal ? sim.content.consumables.get(s.hero.meal.mealId) : undefined;
  return (
    <>
      <h3 className="pixel">{t('meal.title')}</h3>
      <p className="muted small">{t('meal.hint')}</p>
      {current && s.hero.meal && (
        <p className="tone-good small" data-testid="meal-now">
          {t('meal.now', {
            meal: t(current.nameKey),
            minutes: Math.ceil(s.hero.meal.ticksLeft / 600),
          })}
        </p>
      )}
      <ul className="recipe-list">
        {meals.map((m) => {
          const chosen = s.settings.mealId === m.id;
          return (
            <li key={m.id} className={`recipe${chosen ? ' active' : ''}`}>
              <div className="recipe-body">
                <div className="recipe-out">
                  <PixelIcon name={`consumable.${m.id}`} size={22} />
                  <span>
                    {t(m.nameKey)} ({formatNumber(s.consumables[m.id] ?? 0)})
                  </span>
                </div>
                <div className="small muted">
                  {m.buff && t(`stat.${m.buff.stat}`, { value: m.buff.value })} ·{' '}
                  {t('meal.duration', { minutes: (m.durationSeconds ?? 0) / 60 })}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-small"
                data-testid={`meal-${m.id}`}
                onClick={() => onError(tryIntent(() => sim.setMeal(chosen ? null : m.id)))}
              >
                {chosen ? t('meal.stop') : t('meal.eat')}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Professions (GDD 3.2): gathering beside the hunt, production any time, levels 1–99. */
export function ProfessionsScreen() {
  const sim = useSim();
  const s = sim.state;
  const [error, setError] = useState<string | null>(null);
  const professions = [...sim.content.professions.values()];
  const gatherers = professions.filter((p) => p.kind === 'gathering');
  const producers = professions.filter((p) => p.kind === 'production');
  const target = gatherTarget(s, sim.content);
  const hunt = s.hunt ? sim.content.hunts.get(s.hunt.huntId) : undefined;
  const run = (f: () => void) => setError(tryIntent(f));

  return (
    <Sheet title={t('screen.professions')} testId="professions">
      <p className="muted small">{t('prof.intro')}</p>
      <div className="prof-skills">
        {professions.map((p) => (
          <SkillBar key={p.id} profession={p} />
        ))}
      </div>

      <h3 className="pixel">{t('prof.gathering')}</h3>
      <div className="seg" role="radiogroup" aria-label={t('prof.gathering')}>
        {[null, ...gatherers].map((p) => (
          <button
            key={p?.id ?? 'none'}
            type="button"
            role="radio"
            aria-checked={s.professions.gathering === (p?.id ?? null)}
            className={`btn btn-small${s.professions.gathering === (p?.id ?? null) ? ' btn-primary' : ''}`}
            data-testid={`gather-${p?.id ?? 'none'}`}
            onClick={() => run(() => sim.setGathering(p?.id ?? null))}
          >
            {p ? t(p.nameKey) : t('prof.none')}
          </button>
        ))}
      </div>
      {s.professions.gathering && (
        <div className="prof-now small" data-testid="gather-now">
          {!hunt ? (
            <span className="muted">{t('prof.noHunt')}</span>
          ) : target ? (
            <>
              <PixelIcon name={`resource.${target.id}`} size={22} />
              <span>
                {t('prof.gatheringNow', {
                  resource: t(target.nameKey),
                  hunt: t(hunt.nameKey),
                  n: Math.round(
                    perHour(target.seconds, target.level, professionLevel(s, target.professionId)),
                  ),
                })}
                {!gathering(s) && ` ${t('prof.pausedInTown')}`}
              </span>
            </>
          ) : (
            <span className="muted">{t('prof.nothingHere')}</span>
          )}
        </div>
      )}
      <p className="muted small">{t('prof.tiersHint')}</p>

      <h3 className="pixel">{t('prof.stock')}</h3>
      <div className="prof-stock">
        {[...sim.content.resources.values()].map((r) => (
          <span key={r.id} className="prof-res" title={t(r.nameKey)}>
            <PixelIcon name={`resource.${r.id}`} size={22} />
            <span className={(s.resources[r.id] ?? 0) > 0 ? '' : 'muted'}>
              {formatNumber(s.resources[r.id] ?? 0)}
            </span>
          </span>
        ))}
      </div>

      {producers.map((p) => (
        <section key={p.id}>
          <h3 className="pixel">{t(p.nameKey)}</h3>
          <ul className="recipe-list">
            {[...sim.content.recipes.values()]
              .filter((r) => r.professionId === p.id)
              .map((r) => (
                <RecipeRow
                  key={r.id}
                  recipe={r}
                  onPick={() =>
                    run(() => sim.setRecipe(s.professions.recipe === r.id ? null : r.id))
                  }
                />
              ))}
          </ul>
        </section>
      ))}
      <MealPicker onError={setError} />
      {error && <p className="tone-bad">{error}</p>}
    </Sheet>
  );
}
