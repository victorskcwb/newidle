import { TICK_MS, actionRates, ticksToNextLevel, ticksUntilActivityEnds } from '@valdren/engine';
import { useEffect, useRef } from 'react';
import { formatDuration, formatXp, t } from '../../i18n.ts';
import { RENDER_DELAY_MS } from '../../state/localSim.ts';
import { sim, useGame } from '../../state/store.ts';

/** Main slot: current action, live progress bar, XP/h, time to next level, stop button. */
export function SlotCard() {
  const slot = useGame((s) => s.slot);
  const activity = slot.activity;
  const action = activity ? sim.content.actions.get(activity.actionId) : undefined;
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activity) return;
    let frame = 0;
    const tick = () => {
      // Progress follows the scene clock (one tick behind the simulation).
      const start = sim.tickToMs(activity.startedTick);
      const k = (Date.now() - start) / (activity.durationTicks * TICK_MS);
      if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, k))})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activity]);

  if (!activity || !action) {
    return (
      <section className="card" aria-label={t('ui.mainSlot')}>
        <h2 className="card-title">{t('ui.mainSlot')}</h2>
        <p className="muted">{t('ui.idle')}</p>
      </section>
    );
  }

  const rates = actionRates(slot, action.id, sim.content);
  const toLevel = ticksToNextLevel(slot, sim.content);
  const toEnd = ticksUntilActivityEnds(slot, sim.content);
  return (
    <section className="card" aria-label={t('ui.mainSlot')}>
      <div className="card-head">
        <h2 className="card-title">{t(action.nameKey)}</h2>
        <button className="btn btn-danger" onClick={() => sim.stop()}>
          {t('ui.stop')}
        </button>
      </div>
      <div className="progress" aria-hidden>
        <div ref={barRef} className="progress-fill" />
      </div>
      <ul className="stats">
        {rates && <li>{t('ui.xpPerHour', { xp: formatXp(rates.xpTenthsPerHour) })}</li>}
        {toLevel !== null && (
          <li>
            {t('ui.nextLevelIn', { time: formatDuration(toLevel * TICK_MS + RENDER_DELAY_MS) })}
          </li>
        )}
        {toEnd !== null && <li>{t('ui.endsIn', { time: formatDuration(toEnd * TICK_MS) })}</li>}
      </ul>
    </section>
  );
}
