import { TICK_MS } from '@valdren/engine';
import { formatDuration, formatNumber, formatXp, t } from '../../i18n.ts';
import { useGame } from '../../state/store.ts';
import { itemName } from './SkillsPanel.tsx';

/** "Enquanto você estava fora" panel. */
export function OfflineModal() {
  const summary = useGame((s) => s.summary);
  const close = useGame((s) => s.closeSummary);
  if (!summary) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="offline-title">
      <div className="modal card">
        <h2 id="offline-title" className="card-title">
          {t('ui.offlineTitle')}
        </h2>
        <p className="muted">
          {t('ui.offlineTime', { time: formatDuration(summary.ticks * TICK_MS) })}
        </p>
        {summary.xp.length > 0 && (
          <>
            <h3>{t('ui.offlineXp')}</h3>
            <ul className="summary-list">
              {summary.xp.map((x) => {
                const lv = summary.levels.find((l) => l.skill === x.skill);
                return (
                  <li key={x.skill}>
                    {t(`skill.${x.skill}`)}: +{formatXp(x.xpTenths)} XP
                    {lv && (
                      <strong className="highlight">
                        {' '}
                        · {t('ui.level', { level: `${lv.from} → ${lv.to}` })}
                      </strong>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {summary.gained.length > 0 && (
          <>
            <h3>{t('ui.offlineGained')}</h3>
            <ul className="summary-list">
              {summary.gained.map((g) => (
                <li key={g.itemId}>
                  +{formatNumber(g.qty)} {itemName(g.itemId)}
                </li>
              ))}
            </ul>
          </>
        )}
        {summary.consumed.length > 0 && (
          <>
            <h3>{t('ui.offlineSpent')}</h3>
            <ul className="summary-list">
              {summary.consumed.map((c) => (
                <li key={c.itemId}>
                  −{formatNumber(c.qty)} {itemName(c.itemId)}
                </li>
              ))}
            </ul>
          </>
        )}
        {summary.stopped && <p className="muted">{t(`stop.${summary.stopped}`)}</p>}
        <button className="btn" onClick={close} autoFocus>
          {t('ui.close')}
        </button>
      </div>
    </div>
  );
}
