import { RARITIES, type Rarity } from '@abismo/content';
import { upgradeTotal } from '@abismo/engine';
import { useState } from 'react';
import { t } from '../../i18n.ts';
import { RARITY_COLOR, RARITY_GLYPH } from '../rarity.ts';
import { Sheet, tryIntent } from '../Sheet.tsx';
import { useSim } from '../useSim.ts';

/**
 * Loot rules (section 7.4): keep from a rarity up, salvage the rest on the spot (it becomes
 * material and never takes a backpack slot); always keep items with chosen affixes.
 */
export function FilterScreen() {
  const sim = useSim();
  const filter = sim.state.settings.lootFilter;
  const automation = upgradeTotal(sim.state.hero, sim.content, 'automation') > 0;
  const [error, setError] = useState<string | null>(null);
  const update = (keepFromRarity: Rarity, alwaysKeepAffixes: string[]) =>
    setError(tryIntent(() => sim.setLootFilter({ keepFromRarity, alwaysKeepAffixes })));

  return (
    <Sheet title={t('screen.filter')} testId="filter">
      <h3 className="pixel">{t('filter.keepFrom')}</h3>
      <p className="muted small">{t('filter.keepHint')}</p>
      <div className="choice-row" role="radiogroup" aria-label={t('filter.keepFrom')}>
        {RARITIES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={filter.keepFromRarity === r}
            className={`btn choice${filter.keepFromRarity === r ? ' active' : ''}`}
            style={{ color: RARITY_COLOR[r] }}
            onClick={() => update(r, filter.alwaysKeepAffixes)}
            data-testid={`keep-${r}`}
          >
            <span aria-hidden>{RARITY_GLYPH[r]} </span>
            {t(`rarity.${r}`)}
          </button>
        ))}
      </div>

      <h3 className="pixel">{t('filter.alwaysKeep')}</h3>
      {!automation && <p className="tone-bad small">{t('filter.needsAutomation')}</p>}
      <div className="chips">
        {[...sim.content.affixes.values()].map((a) => {
          const on = filter.alwaysKeepAffixes.includes(a.id);
          return (
            <button
              key={a.id}
              type="button"
              className={`chip${on ? ' active' : ''}`}
              disabled={!automation}
              aria-pressed={on}
              onClick={() =>
                update(
                  filter.keepFromRarity,
                  on
                    ? filter.alwaysKeepAffixes.filter((x) => x !== a.id)
                    : [...filter.alwaysKeepAffixes, a.id],
                )
              }
            >
              {t(a.textKey, { value: 'X' })}
            </button>
          );
        })}
      </div>
      {error && <p className="tone-bad">{error}</p>}
    </Sheet>
  );
}
