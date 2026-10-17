import { useEffect } from 'react';
import { t } from '../i18n.ts';
import { useUi } from '../state/store.ts';
import { Icon } from './Icon.tsx';

/** "Level up!" across the top of the screen for a moment (restarts on every new level). */
export function LevelUpBanner() {
  const levelUp = useUi((s) => s.levelUp);
  const hide = useUi((s) => s.hideLevelUp);
  useEffect(() => {
    if (!levelUp) return;
    const id = window.setTimeout(hide, 2600);
    return () => window.clearTimeout(id);
  }, [levelUp, hide]);
  if (!levelUp) return null;
  return (
    <div className="levelup" key={levelUp.id} role="status" data-testid="levelup">
      <span className="levelup-rays" aria-hidden />
      <Icon name="level" size={28} className="levelup-icon" />
      <div className="levelup-text">
        <div className="pixel levelup-title">{t('levelup.title')}</div>
        <div className="levelup-level pixel">{t('hud.level', { level: levelUp.level })}</div>
      </div>
    </div>
  );
}
