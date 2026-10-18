import { loginSlot } from '@abismo/engine';
import { useState } from 'react';
import { localDay } from '../game/sim.ts';
import { formatNumber, t } from '../i18n.ts';
import { PixelIcon } from './PixelIcon.tsx';
import { tryIntent } from './Sheet.tsx';
import { useSim } from './useSim.ts';

/** Icon name of a reward id (material or consumable). */
function rewardIcon(sim: ReturnType<typeof useSim>, id: string): string {
  return sim.content.consumables.has(id) ? `consumable.${id}` : `material.${id}`;
}

export function rewardText(sim: ReturnType<typeof useSim>, reward: Record<string, number>) {
  return Object.entries(reward)
    .map(([id, qty]) => {
      const name =
        sim.content.materials.get(id)?.nameKey ?? sim.content.consumables.get(id)?.nameKey;
      return `${formatNumber(qty)} ${name ? t(name) : id}`;
    })
    .join(', ');
}

/**
 * The 28-day login calendar (GDD 6.1). Days are counted, not streaked: the next square is
 * always the next one, whatever days were missed.
 */
export function LoginCalendar() {
  const sim = useSim();
  const [error, setError] = useState<string | null>(null);
  const days = sim.content.loginRewards;
  const slot = loginSlot(sim.state, sim.content);
  const due = sim.loginDue();
  return (
    <div className="login-cal" data-testid="login-calendar">
      <ol className="login-grid">
        {days.map((d, i) => {
          const claimed = i < slot;
          const today = i === slot && due;
          const [firstId] = Object.keys(d.reward);
          return (
            <li
              key={i}
              className={`login-day${d.big ? ' big' : ''}${claimed ? ' claimed' : ''}${today ? ' today' : ''}`}
              title={rewardText(sim, d.reward)}
            >
              <span className="login-n">{i + 1}</span>
              {firstId && <PixelIcon name={rewardIcon(sim, firstId)} size={d.big ? 28 : 22} />}
              {claimed && (
                <span className="login-check" aria-label={t('login.claimed')}>
                  ✓
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="muted small">
        {t('login.today', { reward: rewardText(sim, days[slot]?.reward ?? {}) })}
      </p>
      <button
        type="button"
        className="btn btn-primary wide"
        disabled={!due}
        data-testid="login-claim"
        onClick={() => setError(tryIntent(() => sim.claimLogin()))}
      >
        {due ? t('login.claim') : t('login.comeBack')}
      </button>
      {error && <p className="tone-bad">{error}</p>}
    </div>
  );
}

const LOGIN_MODAL_LEVEL = 5;

/** Shown once a day when the game opens (after the offline summary), until claimed or closed. */
export function LoginModal() {
  const sim = useSim();
  const [closedOn, setClosedOn] = useState<number | null>(null);
  const s = sim.state;
  // Not in the first minutes: the welcome tips come first (section 11.4).
  const settled = s.hero.level >= LOGIN_MODAL_LEVEL && s.flags.includes('tip_intro');
  if (!settled || sim.offlineReport || !sim.loginDue() || closedOn === localDay()) return null;
  return (
    <div className="sheet-backdrop center">
      <section className="panel sheet login-modal" data-testid="login-modal">
        <h2 className="pixel">{t('login.title')}</h2>
        <p className="muted small">{t('login.hint')}</p>
        <LoginCalendar />
        <button type="button" className="btn wide" onClick={() => setClosedOn(localDay())}>
          {t('login.later')}
        </button>
      </section>
    </div>
  );
}
