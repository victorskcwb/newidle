import { useEffect } from 'react';
import { t } from '../i18n.ts';
import { useUi } from '../state/store.ts';
import { Icon } from './Icon.tsx';
import { useSim } from './useSim.ts';

const TOAST_MS = 3_200;

/** "Achievement unlocked" for a moment; several at once (an old save) show as one with a count. */
export function AchievementToast() {
  const sim = useSim();
  const openScreen = useUi((s) => s.openScreen);
  const fresh = sim.newAchievements;
  const first = fresh[0];
  useEffect(() => {
    if (!first) return;
    useUi.getState().pushLog({
      text: t('log.achievement', { name: t(sim.content.achievements.get(first)!.nameKey) }),
      tone: 'good',
    });
    const id = window.setTimeout(() => sim.dismissAchievements(), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [first, sim]);
  if (!first) return null;
  const a = sim.content.achievements.get(first)!;
  return (
    <button
      type="button"
      className="ach-toast"
      role="status"
      data-testid="achievement-toast"
      onClick={() => {
        sim.dismissAchievements();
        openScreen('journal');
      }}
    >
      <Icon name="achievement" size={26} className="tone-xp" />
      <span>
        <span className="pixel ach-toast-title">{t('achievement.unlocked')}</span>
        <span className="ach-toast-name">
          {t(a.nameKey)}
          {fresh.length > 1 && ` ${t('achievement.more', { n: fresh.length - 1 })}`}
        </span>
      </span>
    </button>
  );
}
