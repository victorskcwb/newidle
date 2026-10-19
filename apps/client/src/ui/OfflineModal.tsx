import { RARITIES } from '@abismo/content';
import { OFFLINE_CAP_TICKS, TICKS_PER_HOUR } from '@abismo/engine';
import { formatDuration, formatNumber, t } from '../i18n.ts';
import { itemName } from './items.ts';
import { rewardText } from './LoginCalendar.tsx';
import { RARITY_COLOR, RARITY_GLYPH } from './rarity.ts';
import { useSim } from './useSim.ts';

const BEST_ITEMS = 8;

/** "Enquanto você estava fora": the offline resolution of section 9.2, step 6. */
export function OfflineModal() {
  const sim = useSim();
  const r = sim.offlineReport;
  if (!r) return null;
  const hunted = r.huntId !== null && r.huntingTicks > 0;
  return (
    <div className="sheet-backdrop center">
      <section
        className="panel sheet offline"
        data-testid="offline-modal"
        aria-label={t('offline.title')}
      >
        <h2 className="pixel">{t('offline.title')}</h2>
        <div className="muted" data-testid="offline-time">
          {t('offline.time', { time: formatDuration(r.resolvedTicks / TICKS_PER_HOUR) })}
          {r.elapsedTicks > OFFLINE_CAP_TICKS &&
            ` ${t('offline.capped', { time: formatDuration(OFFLINE_CAP_TICKS / TICKS_PER_HOUR) })}`}
        </div>
        {!hunted ? (
          <p>{t('offline.nothing')}</p>
        ) : (
          <>
            {r.dungeon && (
              <p className="tone-info" data-testid="offline-dungeon">
                {t('offline.dungeon', { from: r.dungeon.from, to: r.dungeon.to })}
              </p>
            )}
            <ul className="offline-stats">
              {r.levelAfter > r.levelBefore && (
                <li className="tone-good pixel">
                  {t('offline.levels', { from: r.levelBefore, to: r.levelAfter })}
                </li>
              )}
              <li data-testid="offline-kills">
                {t('offline.kills', { n: formatNumber(r.kills) })}
              </li>
              <li>{t('offline.xp', { n: formatNumber(r.xp) })}</li>
              <li className="gold">{t('offline.gold', { n: formatNumber(r.gold) })}</li>
              {r.deaths > 0 && (
                <li className="tone-bad">
                  {t('offline.deaths', { n: r.deaths, xp: formatNumber(r.xpLost) })}
                </li>
              )}
            </ul>
            {r.stoppedBy && <p className="tone-bad">{t(`offline.stopped.${r.stoppedBy}`)}</p>}
            {Object.keys(r.materials).length > 0 && (
              <div className="materials">
                <span className="muted">{t('offline.materials')}:</span>
                {RARITIES.map((rar) => {
                  const m = sim.content.salvageMaterial[rar];
                  const qty = r.materials[m.id];
                  return qty ? (
                    <span key={m.id} style={{ color: RARITY_COLOR[rar] }}>
                      {t(m.nameKey)} +{formatNumber(qty)}
                    </span>
                  ) : null;
                })}
              </div>
            )}
            {(Object.keys(r.gathered).length > 0 || Object.keys(r.crafted).length > 0) && (
              <div className="offline-items" data-testid="offline-professions">
                <div className="muted">{t('offline.professions')}</div>
                {r.mealsEaten > 0 && <div>{t('offline.meals', { n: r.mealsEaten })}</div>}
                {Object.entries(r.professionLevels).map(([id, [from, to]]) => (
                  <div key={id} className="tone-good">
                    {t('offline.professionLevel', {
                      profession: t(sim.content.professions.get(id)!.nameKey),
                      from,
                      to,
                    })}
                  </div>
                ))}
                {Object.entries(r.gathered).map(([id, n]) => (
                  <div key={id}>
                    {t(sim.content.resources.get(id)!.nameKey)} +{formatNumber(n)}
                  </div>
                ))}
                {Object.entries(r.crafted).map(([id, n]) => (
                  <div key={id}>
                    {t('offline.crafted', {
                      n: formatNumber(n),
                      what: rewardText(sim, sim.content.recipes.get(id)!.outputs),
                    })}
                  </div>
                ))}
              </div>
            )}
            {Object.keys(r.cards).length > 0 && (
              <div className="offline-items">
                <div className="muted">{t('offline.cards')}</div>
                {Object.entries(r.cards).map(([id, n]) => (
                  <div key={id} className="tone-info">
                    {t(sim.content.cards.get(id)!.nameKey)} +{n}
                  </div>
                ))}
              </div>
            )}
            {r.items.length > 0 && (
              <div className="offline-items">
                <div className="muted">{t('offline.items')}</div>
                {r.items.slice(0, BEST_ITEMS).map((item) => (
                  <div key={item.uid} style={{ color: RARITY_COLOR[item.rarity] }}>
                    <span aria-hidden>{RARITY_GLYPH[item.rarity]} </span>
                    {itemName(sim.content, item)} ({t(`rarity.${item.rarity}`)})
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <button
          type="button"
          className="btn btn-primary wide"
          onClick={() => sim.dismissOffline()}
          data-testid="offline-continue"
        >
          {t('offline.continue')}
        </button>
      </section>
    </div>
  );
}
