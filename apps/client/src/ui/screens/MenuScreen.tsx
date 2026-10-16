import { MAX_LEVEL, shopUnlocked } from '@abismo/engine';
import { t } from '../../i18n.ts';
import { useUi, type Screen } from '../../state/store.ts';
import { Sheet } from '../Sheet.tsx';
import { useSim } from '../useSim.ts';

/** Every screen one tap from the menu, with a badge when something waits there. */
export function MenuScreen() {
  const sim = useSim();
  const openScreen = useUi((s) => s.openScreen);
  const hero = sim.state.hero;
  const items: { screen: Screen; badge?: string | number }[] = [
    { screen: 'character', badge: hero.unspentAttributePoints || undefined },
    { screen: 'skills', badge: hero.unspentSkillPoints || undefined },
    { screen: 'hunts' },
    { screen: 'smith' },
    {
      screen: 'altar',
      badge:
        hero.level >= MAX_LEVEL
          ? '!'
          : shopUnlocked(hero) && hero.resets.points > 0
            ? hero.resets.points
            : undefined,
    },
    { screen: 'filter' },
    { screen: 'settings' },
    { screen: 'save' },
  ];
  return (
    <Sheet title={t('menu.title')} testId="menu" back={false}>
      <nav className="menu-grid">
        {items.map(({ screen, badge }) => (
          <button
            key={screen}
            type="button"
            className="btn menu-item"
            onClick={() => openScreen(screen)}
            data-testid={`menu-${screen}`}
          >
            {t(`screen.${screen}`)}
            {badge !== undefined && <span className="badge">{badge}</span>}
          </button>
        ))}
      </nav>
    </Sheet>
  );
}
