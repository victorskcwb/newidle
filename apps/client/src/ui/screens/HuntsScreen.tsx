import type { Hunt } from '@abismo/content';
import type { RateSheet } from '@abismo/engine';
import { useEffect, useState } from 'react';
import { formatNumber, t } from '../../i18n.ts';
import { useUi } from '../../state/store.ts';
import { Sheet } from '../Sheet.tsx';
import { WorldMap } from '../WorldMap.tsx';
import { useSim } from '../useSim.ts';

/**
 * Regions and hunts with recommended level, predicted rates for the current setup (from
 * the engine, computed in the worker) and a lock with its reason.
 */
export function HuntsScreen() {
  const sim = useSim();
  const openScreen = useUi((s) => s.openScreen);
  const [rates, setRates] = useState<Record<string, RateSheet>>({});
  const s = sim.state;
  const hunts = [...sim.content.hunts.values()];
  const regions = [...sim.content.regions.values()].sort((a, b) => a.order - b.order);
  const unlocked = (h: Hunt) => s.unlockedHunts.includes(h.id);

  useEffect(() => {
    let live = true;
    void (async () => {
      for (const h of hunts) {
        if (!s.unlockedHunts.includes(h.id)) continue;
        const r = await sim.ratesFor(h.id);
        if (!live) return;
        setRates((prev) => ({ ...prev, [h.id]: r }));
      }
    })();
    return () => {
      live = false;
    };
    // Recomputed when the screen opens (the setup does not change while it is open).
  }, [sim]);

  const lockReason = (h: Hunt) => {
    const before = hunts.find((x) => x.unlocks === h.id);
    const boss = before?.boss ? sim.content.monsters.get(before.boss.monsterId) : undefined;
    return boss ? t('hunts.lockedBy', { boss: t(boss.nameKey) }) : t('hunts.locked');
  };

  return (
    <Sheet title={t('screen.hunts')} testId="hunts">
      <WorldMap rates={rates} />
      <h3 className="pixel">{t('map.allHunts')}</h3>
      {regions.map((region) => (
        <section key={region.id}>
          <h4 className="pixel">
            {t(region.nameKey)}{' '}
            <span className="muted small">
              {t('hunts.levels', { from: region.levelRange[0], to: region.levelRange[1] })}
            </span>
          </h4>
          {hunts
            .filter((h) => h.regionId === region.id)
            .map((h) => {
              const open = unlocked(h);
              const current = s.hunt?.huntId === h.id;
              const r = rates[h.id];
              const boss = h.boss ? sim.content.monsters.get(h.boss.monsterId) : undefined;
              return (
                <div
                  key={h.id}
                  className={`hunt-row${open ? '' : ' locked'}`}
                  data-testid={`hunt-${h.id}`}
                >
                  <div>
                    <div className="pixel">
                      {open ? '' : '🔒 '}
                      {t(h.nameKey)}
                    </div>
                    <div className="muted small">
                      {t('hunts.levels', { from: h.levelRange[0], to: h.levelRange[1] })} ·{' '}
                      {t('hunts.recommended', { level: h.recommendedLevel })}
                      {boss && ` · ${t('hunts.boss', { boss: t(boss.nameKey) })}`}
                      {boss && s.defeatedBosses.includes(boss.id) && ' ✓'}
                    </div>
                    {open ? (
                      <div className="rates small">
                        {r
                          ? t('rates.summary', {
                              kills: formatNumber(r.killsPerHour),
                              xp: formatNumber(r.xpPerHour),
                              gold: formatNumber(r.goldPerHour),
                            }) +
                            (r.deathsPerHour > 0.5
                              ? ` · ${t('hunts.deaths', { n: r.deathsPerHour.toFixed(1) })}`
                              : '')
                          : t('rates.calculating')}
                      </div>
                    ) : (
                      <div className="tone-bad small">{lockReason(h)}</div>
                    )}
                  </div>
                  {open && (
                    <button
                      type="button"
                      className={`btn${current ? '' : ' btn-primary'}`}
                      disabled={current && s.activity.kind !== 'idle_town'}
                      onClick={() => {
                        sim.startHunt(h.id);
                        openScreen(null);
                      }}
                    >
                      {current && s.activity.kind !== 'idle_town'
                        ? t('hunts.here')
                        : t('action.hunt')}
                    </button>
                  )}
                </div>
              );
            })}
        </section>
      ))}
    </Sheet>
  );
}
