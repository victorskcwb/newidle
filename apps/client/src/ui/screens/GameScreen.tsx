import { totalLevel } from '@valdren/engine';
import { formatNumber, t } from '../../i18n.ts';
import { SceneView } from '../../scene/SceneView.tsx';
import { LocalSim } from '../../state/localSim.ts';
import { sim, useGame, useSlot } from '../../state/store.ts';
import { BankPanel } from '../components/BankPanel.tsx';
import { OfflineModal } from '../components/OfflineModal.tsx';
import { SkillsPanel } from '../components/SkillsPanel.tsx';
import { SlotCard } from '../components/SlotCard.tsx';

const TWO_HOURS_TICKS = 12_000;

export function GameScreen({ onLogout }: { onLogout?: () => void }) {
  const slot = useSlot();
  const profile = useGame((s) => s.profile);
  const status = useGame((s) => s.status);
  const local = sim instanceof LocalSim ? sim : null;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">{t('app.title')}</span>
        <span className="topbar-stats">
          {profile && (
            <span className="topbar-stat">
              {t('ui.coins')} <strong>{formatNumber(profile.coins)}</strong>
            </span>
          )}
          <span className="topbar-stat">
            {t('ui.totalLevel')} <strong>{totalLevel(slot.skills)}</strong>
          </span>
        </span>
      </header>
      <SceneView />
      <main className="panel">
        {status !== 'online' && (
          <p className="net-banner" role="status">
            {t(`net.${status}`)}
          </p>
        )}
        {local && <p className="dev-banner">{t('ui.devBanner')}</p>}
        <SlotCard />
        <SkillsPanel />
        <BankPanel />
        <div className="dev-tools">
          {local && (
            <>
              <button className="btn" onClick={() => local.simulateAway(TWO_HOURS_TICKS)}>
                {t('ui.offlineTest')}
              </button>
              <button className="btn btn-ghost" onClick={() => local.reset()}>
                {t('ui.reset')}
              </button>
            </>
          )}
          {onLogout && (
            <button className="btn btn-ghost" onClick={onLogout}>
              {t('ui.logout')}
            </button>
          )}
        </div>
      </main>
      <OfflineModal />
    </div>
  );
}
