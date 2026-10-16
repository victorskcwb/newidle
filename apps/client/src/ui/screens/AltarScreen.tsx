import {
  MAX_LEVEL,
  RESET_MILESTONES,
  resetBlock,
  resetCost,
  resetPointsEarned,
  shopUnlocked,
  upgradeCost,
} from '@abismo/engine';
import { useState } from 'react';
import { formatNumber, t } from '../../i18n.ts';
import { Sheet, tryIntent } from '../Sheet.tsx';
import { useSim } from '../useSim.ts';

/** Reset altar (section 8): what is lost, what stays, points earned, the reset shop. */
export function AltarScreen() {
  const sim = useSim();
  const hero = sim.state.hero;
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const block = resetBlock(sim.state);
  const points = resetPointsEarned(hero);

  return (
    <Sheet title={t('screen.altar')} testId="altar">
      <p className="muted">{t('altar.intro')}</p>
      <div className="two-cols">
        <div>
          <h3 className="pixel tone-bad">{t('altar.loses')}</h3>
          <ul className="item-lines">
            <li>{t('altar.lose.level')}</li>
            <li>{t('altar.lose.attributes')}</li>
            <li>{t('altar.lose.skills')}</li>
          </ul>
        </div>
        <div>
          <h3 className="pixel tone-good">{t('altar.keeps')}</h3>
          <ul className="item-lines">
            <li>{t('altar.keep.items')}</li>
            <li>{t('altar.keep.materials')}</li>
            <li>{t('altar.keep.hunts')}</li>
            <li>{t('altar.keep.stats')}</li>
          </ul>
        </div>
      </div>
      <ul className="item-lines">
        <li className={hero.level >= MAX_LEVEL ? 'tone-good' : 'tone-bad'}>
          {t('altar.needLevel', { level: hero.level })}
        </li>
        <li className={sim.state.gold >= resetCost(hero) ? 'tone-good' : 'tone-bad'}>
          {t('altar.cost', { gold: formatNumber(resetCost(hero)) })}
        </li>
        <li className="pixel" data-testid="reset-points">
          {t('altar.earns', { n: points, bosses: hero.resets.newBossesThisCycle })}
        </li>
      </ul>
      {confirm ? (
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setConfirm(false);
              setMessage(tryIntent(() => sim.reset()) ?? t('altar.done', { n: points }));
            }}
            data-testid="reset-confirm"
          >
            {t('altar.confirm')}
          </button>
          <button type="button" className="btn" onClick={() => setConfirm(false)}>
            {t('action.cancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary wide"
          disabled={block !== null}
          onClick={() => setConfirm(true)}
          data-testid="reset-button"
        >
          {t('altar.reset', { n: hero.resets.count + 1 })}
        </button>
      )}
      {message && <p className="tone-good">{message}</p>}

      <h3 className="pixel">
        {t('altar.shop')}{' '}
        <span className="muted">{t('altar.points', { n: hero.resets.points })}</span>
      </h3>
      {!shopUnlocked(hero) ? (
        <p className="muted">{t('altar.shopLocked')}</p>
      ) : (
        <div className="shop">
          {[...sim.content.resetUpgrades.values()].map((up) => {
            const level = hero.resets.upgrades[up.id] ?? 0;
            const cost = upgradeCost(sim.content, hero, up.id);
            return (
              <div key={up.id} className="shop-row" data-testid={`upgrade-${up.id}`}>
                <div>
                  <div className="pixel">
                    {t(up.nameKey)}{' '}
                    <span className="muted small">
                      {level}/{up.maxLevel}
                    </span>
                  </div>
                  <div className="muted small">{t(up.descKey)}</div>
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={cost === null || cost > hero.resets.points}
                  onClick={() => setMessage(tryIntent(() => sim.buyUpgrade(up.id)))}
                >
                  {cost === null ? t('altar.maxed') : t('altar.buy', { n: cost })}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <h3 className="pixel">{t('altar.milestones')}</h3>
      <ul className="item-lines">
        {RESET_MILESTONES.map((m) => (
          <li key={m.unlock} className={hero.resets.count >= m.resets ? 'tone-good' : 'muted'}>
            {t('altar.milestone', { n: m.resets, what: t(`milestone.${m.unlock}`) })}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
