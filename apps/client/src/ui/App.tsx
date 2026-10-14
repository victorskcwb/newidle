import { totalLevel } from '@valdren/engine';
import { useEffect } from 'react';
import { t } from '../i18n.ts';
import { SceneView } from '../scene/SceneView.tsx';
import { sim, useGame } from '../state/store.ts';
import { BankPanel } from './components/BankPanel.tsx';
import { OfflineModal } from './components/OfflineModal.tsx';
import { SkillsPanel } from './components/SkillsPanel.tsx';
import { SlotCard } from './components/SlotCard.tsx';

const TWO_HOURS_TICKS = 12_000;

export function App() {
  const slot = useGame((s) => s.slot);

  useEffect(() => {
    sim.start();
    return () => sim.dispose();
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">{t('app.title')}</span>
        <span className="topbar-stat">
          {t('ui.totalLevel')} <strong>{totalLevel(slot.skills)}</strong>
        </span>
      </header>
      <SceneView />
      <main className="panel">
        <p className="dev-banner">{t('ui.devBanner')}</p>
        <SlotCard />
        <SkillsPanel />
        <BankPanel />
        <div className="dev-tools">
          <button className="btn" onClick={() => sim.simulateAway(TWO_HOURS_TICKS)}>
            {t('ui.offlineTest')}
          </button>
          <button className="btn btn-ghost" onClick={() => sim.reset()}>
            {t('ui.reset')}
          </button>
        </div>
      </main>
      <OfflineModal />
    </div>
  );
}
