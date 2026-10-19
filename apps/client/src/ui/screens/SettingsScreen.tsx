import { AUTOMATIONS, automationUnlocked, MAX_LEVEL, type PotionSettings } from '@abismo/engine';
import { useState } from 'react';
import { locale, setLocale, t } from '../../i18n.ts';
import { LOCALES, type Locale } from '@abismo/i18n';

/** Each language named in itself, so it is found whatever the current one. */
const LANGUAGE_NAMES: Record<Locale, string> = { 'pt-BR': 'Português (Brasil)', en: 'English' };
import { Reminders } from '../../game/notify.ts';
import { GFX_KEYS, usePrefs } from '../../state/prefs.ts';
import { useUi } from '../../state/store.ts';
import { PRESETS, presetLayout, useWindows } from '../../state/windows.ts';
import { Sheet, tryIntent } from '../Sheet.tsx';
import { useSim } from '../useSim.ts';
import { Icon } from '../Icon.tsx';

/**
 * Settings: hunt automation (in the save: potion limits and returns) and device preferences
 * (not in the save: economy mode, reduced motion, larger text). Sounds arrive in milestone 2.
 */
export function SettingsScreen() {
  const sim = useSim();
  const prefs = usePrefs();
  const openScreen = useUi((s) => s.openScreen);
  const windows = useWindows();
  const [layoutNote, setLayoutNote] = useState<string | null>(null);
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

      <h3 className="pixel">{t('settings.automation')}</h3>
      {AUTOMATIONS.map((id) => {
        const unlocked = automationUnlocked(sim.state, id);
        return (
          <label key={id} className="check" data-testid={`auto-${id}`}>
            <input
              type="checkbox"
              checked={unlocked && st.automation[id]}
              disabled={!unlocked}
              onChange={(e) => setError(tryIntent(() => sim.setAutomation(id, e.target.checked)))}
            />
            <span>
              {t(`automation.${id}`)}
              <span className="muted small">
                {' '}
                {unlocked ? t(`automation.${id}.hint`) : t(`automation.${id}.locked`)}
              </span>
            </span>
          </label>
        );
      })}

      <button
        type="button"
        className="btn wide save-link"
        onClick={() => openScreen('save')}
        data-testid="open-save"
      >
        <Icon name="save" size={18} />
        {t('screen.save')}
      </button>

      <h3 className="pixel">{t('settings.device')}</h3>
      <label className="field">
        <span>{t('settings.language')}</span>
        <select
          className="input"
          value={locale}
          data-testid="language"
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_NAMES[l]}
            </option>
          ))}
        </select>
      </label>
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

      <h3 className="pixel">{t('settings.windows')}</h3>
      <p className="muted small">{t('settings.windowsHint')}</p>
      <div className="choice-row" data-testid="layouts">
        {PRESETS.map((id) => (
          <button
            key={id}
            type="button"
            className="filter-chip"
            onClick={() => {
              windows.apply(presetLayout(id));
              setLayoutNote(t('settings.layoutApplied', { name: t(`settings.layout.${id}`) }));
            }}
            data-testid={`layout-${id}`}
          >
            {t(`settings.layout.${id}`)}
          </button>
        ))}
      </div>
      <div className="choice-row">
        <button
          type="button"
          className="filter-chip"
          onClick={() => {
            windows.saveMine();
            setLayoutNote(t('settings.layoutSaved'));
          }}
        >
          {t('settings.layout.saveMine')}
        </button>
        <button
          type="button"
          className="filter-chip"
          disabled={!windows.mine()}
          onClick={() => {
            const mine = windows.mine();
            if (mine) windows.apply(mine);
            setLayoutNote(t('settings.layoutApplied', { name: t('settings.layout.mine') }));
          }}
        >
          {t('settings.layout.mine')}
        </button>
      </div>
      {layoutNote && <p className="small tone-good">{layoutNote}</p>}

      <h3 className="pixel">{t('settings.graphics')}</h3>
      <p className="muted small">{t('settings.graphicsHint')}</p>
      <div className="gfx-list" data-testid="gfx">
        {GFX_KEYS.map((k) => (
          <label key={k} className="check gfx-row">
            <input
              type="checkbox"
              checked={prefs.gfx[k]}
              onChange={(e) => prefs.set({ gfx: { ...prefs.gfx, [k]: e.target.checked } })}
            />
            <span>
              {t(`settings.gfx.${k}`)}
              <br />
              <small className="muted">{t(`settings.gfx.${k}.hint`)}</small>
            </span>
          </label>
        ))}
      </div>

      <h3 className="pixel">{t('settings.credits')}</h3>
      <div className="credits small" data-testid="credits">
        <p>
          {t('settings.creditsOtsp')}{' '}
          <a href="vendor/opentibia-sprite-pack/AUTHORS.md" target="_blank" rel="noreferrer">
            {t('settings.creditsAuthors')}
          </a>
          {' · '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
            {t('settings.creditsLicense')}
          </a>
          {' · '}
          <a
            href="https://github.com/peonso/opentibia_sprite_pack"
            target="_blank"
            rel="noreferrer"
          >
            {t('settings.creditsSource')}
          </a>
        </p>
        <p>{t('settings.creditsKenney')}</p>
        <p>{t('settings.creditsKyrise')}</p>
        <p>
          {t('settings.creditsIcons')}{' '}
          <a href="vendor/game-icons/ICONS.md" target="_blank" rel="noreferrer">
            {t('settings.creditsIconList')}
          </a>
          {' · '}
          <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
            {t('settings.creditsIconLicense')}
          </a>
        </p>
        <p>{t('settings.creditsOwn')}</p>
        <p>{t('settings.creditsFont')}</p>
      </div>

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
