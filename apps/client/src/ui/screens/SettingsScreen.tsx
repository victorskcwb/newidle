import { MAX_LEVEL, type PotionSettings } from '@abismo/engine';
import { useState } from 'react';
import { t } from '../../i18n.ts';
import { Reminders } from '../../game/notify.ts';
import { usePrefs } from '../../state/prefs.ts';
import { Sheet, tryIntent } from '../Sheet.tsx';
import { useSim } from '../useSim.ts';

/**
 * Settings: hunt automation (in the save: potion limits and returns) and device preferences
 * (not in the save: economy mode, reduced motion, larger text). Sounds arrive in milestone 2.
 */
export function SettingsScreen() {
  const sim = useSim();
  const prefs = usePrefs();
  const [error, setError] = useState<string | null>(null);
  const st = sim.state.settings;
  const current: PotionSettings = {
    potionThresholdPct: st.potionThresholdPct,
    manaPotionThresholdPct: st.manaPotionThresholdPct,
    potionTarget: st.potionTarget,
    returnWhenOutOfPotions: st.returnWhenOutOfPotions,
    autoReturnAfterDeath: st.autoReturnAfterDeath,
  };
  const update = (patch: Partial<PotionSettings>) =>
    setError(tryIntent(() => sim.setPotionSettings({ ...current, ...patch })));

  return (
    <Sheet title={t('screen.settings')} testId="settings">
      <h3 className="pixel">{t('settings.hunt')}</h3>
      <label className="field">
        <span>{t('settings.potionThreshold', { pct: st.potionThresholdPct })}</span>
        <input
          type="range"
          min={0}
          max={95}
          step={5}
          value={st.potionThresholdPct}
          onChange={(e) => update({ potionThresholdPct: Number(e.target.value) })}
          data-testid="potion-threshold"
        />
      </label>
      <label className="field">
        <span>{t('settings.manaThreshold', { pct: st.manaPotionThresholdPct })}</span>
        <input
          type="range"
          min={0}
          max={95}
          step={5}
          value={st.manaPotionThresholdPct}
          onChange={(e) => update({ manaPotionThresholdPct: Number(e.target.value) })}
        />
      </label>
      <label className="field">
        <span>{t('settings.potionTarget', { n: st.potionTarget })}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={st.potionTarget}
          onChange={(e) => update({ potionTarget: Number(e.target.value) })}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={st.returnWhenOutOfPotions}
          onChange={(e) => update({ returnWhenOutOfPotions: e.target.checked })}
        />
        {t('settings.returnNoPotions')}
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={st.autoReturnAfterDeath}
          onChange={(e) => update({ autoReturnAfterDeath: e.target.checked })}
        />
        {t('settings.autoReturn')}
      </label>
      {error && <p className="tone-bad">{error}</p>}

      <h3 className="pixel">{t('settings.device')}</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={prefs.eco}
          onChange={(e) => prefs.set({ eco: e.target.checked })}
        />
        {t('settings.eco')}
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={prefs.reducedMotion}
          onChange={(e) => prefs.set({ reducedMotion: e.target.checked })}
        />
        {t('settings.reducedMotion')}
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={prefs.largeText}
          onChange={(e) => prefs.set({ largeText: e.target.checked })}
        />
        {t('settings.largeText')}
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={prefs.sound}
          onChange={(e) => prefs.set({ sound: e.target.checked })}
        />
        {t('settings.sound')}
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={prefs.reminders}
          disabled={!Reminders.supported()}
          onChange={(e) => {
            const on = e.target.checked;
            if (!on) return prefs.set({ reminders: false });
            void Reminders.request().then((ok) => {
              prefs.set({ reminders: ok });
              setError(ok ? null : t('settings.remindersDenied'));
            });
          }}
        />
        {t('settings.reminders')}
      </label>
      <p className="muted small">{t('settings.remindersHint')}</p>
      <label className="field">
        <span>{t('settings.volume', { pct: Math.round(prefs.volume * 100) })}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(prefs.volume * 100)}
          disabled={!prefs.sound}
          onChange={(e) => prefs.set({ volume: Number(e.target.value) / 100 })}
        />
      </label>

      {import.meta.env.DEV && (
        <>
          <h3 className="pixel">{t('settings.debug')}</h3>
          <button
            type="button"
            className="btn"
            onClick={() => sim.debugLevel(MAX_LEVEL)}
            data-testid="debug-level"
          >
            {t('settings.debugLevel')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => sim.debugResources()}
            data-testid="debug-resources"
          >
            {t('settings.debugResources')}
          </button>
        </>
      )}
    </Sheet>
  );
}
