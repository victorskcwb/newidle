import type { Stat } from '@abismo/content';
import { pityThreshold, regionCards, regionComplete } from '@abismo/engine';
import { t } from '../../i18n.ts';
import { Sheet } from '../Sheet.tsx';
import { useSim } from '../useSim.ts';

/** Album (section 8.4): cards by region, copies, total bonus, region set bonus. */
export function CardsScreen() {
  const sim = useSim();
  const hero = sim.state.hero;
  const regions = [...sim.content.regions.values()].sort((a, b) => a.order - b.order);
  const statText = (stat: Stat, value: number) => t(`stat.${stat}`, { value });
  const owned = [...sim.content.cards.values()].filter((c) => (hero.cards[c.id] ?? 0) > 0).length;

  return (
    <Sheet title={t('screen.cards')} testId="cards">
      <p className="muted">{t('cards.intro', { owned, total: sim.content.cards.size })}</p>
      {regions.map((region) => {
        const cards = regionCards(sim.content, region);
        const have = cards.filter((c) => (hero.cards[c.id] ?? 0) > 0).length;
        const complete = regionComplete(hero, sim.content, region);
        return (
          <section key={region.id}>
            <h3 className="pixel">
              {t(region.nameKey)}{' '}
              <span className={complete ? 'tone-good small' : 'muted small'}>
                {have}/{cards.length}
              </span>
            </h3>
            {region.cardSetBonus && (
              <p className={complete ? 'tone-good small' : 'muted small'}>
                {t(complete ? 'cards.setActive' : 'cards.setBonus', {
                  bonus: statText(region.cardSetBonus.stat, region.cardSetBonus.value),
                })}
              </p>
            )}
            <div className="card-grid">
              {cards.map((card) => {
                const copies = hero.cards[card.id] ?? 0;
                const pity = (sim.state.cardPity[card.id] ?? 0) >= pityThreshold(card);
                return (
                  <div
                    key={card.id}
                    className={`card${copies > 0 ? ' owned' : ''}${copies >= card.maxCopies ? ' maxed' : ''}`}
                    data-testid={`card-${card.id}`}
                  >
                    <div className="pixel card-name">{copies > 0 ? t(card.nameKey) : '???'}</div>
                    <div
                      className="copies"
                      aria-label={t('cards.copies', { n: copies, max: card.maxCopies })}
                    >
                      {'●'.repeat(copies)}
                      {'○'.repeat(card.maxCopies - copies)}
                    </div>
                    <div className="small">
                      {statText(
                        card.bonusPerCopy.stat,
                        card.bonusPerCopy.value * Math.max(1, copies),
                      )}
                      {copies === 0 && ` ${t('cards.perCopy')}`}
                    </div>
                    {pity && copies < card.maxCopies && (
                      <div className="tone-info small">{t('cards.pity')}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </Sheet>
  );
}
