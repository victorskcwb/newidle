import type { GameSim } from '../game/sim.ts';
import { t } from '../i18n.ts';
import { SceneView } from '../scene/SceneView.tsx';
import { useUi } from '../state/store.ts';
import { BackpackPanel } from './BackpackPanel.tsx';
import { EventLog } from './EventLog.tsx';
import { Hud } from './Hud.tsx';
import { SimContext, useSimBridge } from './useSim.ts';

function TownOverlay() {
  const town = useUi((s) => s.town);
  if (!town) return null;
  return (
    <div className="town-overlay" data-testid="town-overlay">
      <div className="pixel town-name">{t('town.cinzarra')}</div>
      <div className="muted">{t(town === 'depositing' ? 'town.depositing' : 'town.idle')}</div>
    </div>
  );
}

export function App({ sim, mapId }: { sim: GameSim; mapId: string }) {
  useSimBridge(sim);
  const backpackOpen = useUi((s) => s.backpackOpen);
  return (
    <SimContext.Provider value={sim}>
      <SceneView sim={sim} mapId={mapId} />
      <TownOverlay />
      <div className="hud">
        <Hud />
        <EventLog />
      </div>
      {backpackOpen && <BackpackPanel />}
    </SimContext.Provider>
  );
}
