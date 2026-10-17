import { useEffect } from 'react';
import type { GameSim } from '../game/sim.ts';
import { sfx } from '../audio/sfx.ts';
import { t } from '../i18n.ts';
import { SceneView } from '../scene/SceneView.tsx';
import { usePrefs } from '../state/prefs.ts';
import { useUi, type Screen } from '../state/store.ts';
import { BackpackPanel } from './BackpackPanel.tsx';
import { EventLog } from './EventLog.tsx';
import { Hud } from './Hud.tsx';
import { OfflineModal } from './OfflineModal.tsx';
import { AltarScreen } from './screens/AltarScreen.tsx';
import { CardsScreen } from './screens/CardsScreen.tsx';
import { CharacterScreen } from './screens/CharacterScreen.tsx';
import { FilterScreen } from './screens/FilterScreen.tsx';
import { HuntsScreen } from './screens/HuntsScreen.tsx';
import { QuestsScreen } from './screens/QuestsScreen.tsx';
import { SaveScreen } from './screens/SaveScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { SkillsScreen } from './screens/SkillsScreen.tsx';
import { SmithScreen } from './screens/SmithScreen.tsx';
import { Tips } from './Tips.tsx';
import { SimContext, useSim, useSimBridge } from './useSim.ts';

const SCREENS: Record<Screen, () => React.JSX.Element> = {
  character: CharacterScreen,
  skills: SkillsScreen,
  cards: CardsScreen,
  quests: QuestsScreen,
  hunts: HuntsScreen,
  smith: SmithScreen,
  altar: AltarScreen,
  filter: FilterScreen,
  settings: SettingsScreen,
  save: SaveScreen,
};

function TownOverlay() {
  const sim = useSim();
  const town = useUi((s) => s.town);
  if (!town) return null;
  const hunt = sim.state.hunt ? sim.content.hunts.get(sim.state.hunt.huntId) : undefined;
  return (
    <div className="town-overlay" data-testid="town-overlay">
      <div className="pixel town-name">{t(`town.${hunt?.regionId ?? 'cinzarra'}`)}</div>
      <div className="muted">{t(town === 'depositing' ? 'town.depositing' : 'town.idle')}</div>
    </div>
  );
}

/** The game: scene for the current hunt's map, HUD, panels and screens. */
function Game() {
  const sim = useSim();
  const backpackOpen = useUi((s) => s.backpackOpen);
  const screen = useUi((s) => s.screen);
  const eco = usePrefs((s) => s.eco);
  const reducedMotion = usePrefs((s) => s.reducedMotion);
  const hunt =
    (sim.state.hunt && sim.content.hunts.get(sim.state.hunt.huntId)) ??
    [...sim.content.hunts.values()].find((h) => h.startUnlocked)!;
  const Current = screen ? SCREENS[screen] : null;
  return (
    <>
      {/* A new map (another hunt) or new device prefs rebuild the scene from the state. */}
      <SceneView
        key={`${hunt.mapId}|${eco}|${reducedMotion}`}
        sim={sim}
        mapId={hunt.mapId}
        regionId={hunt.regionId}
        eco={eco}
        reducedMotion={reducedMotion}
      />
      <TownOverlay />
      <div className="hud">
        <Hud />
        <EventLog />
        <Tips />
      </div>
      {backpackOpen && <BackpackPanel />}
      {Current && <Current />}
      <OfflineModal />
    </>
  );
}

export function App({ sim }: { sim: GameSim }) {
  useSimBridge(sim);
  const largeText = usePrefs((s) => s.largeText);
  const sound = usePrefs((s) => s.sound);
  const volume = usePrefs((s) => s.volume);
  useEffect(() => sfx.setVolume(sound, volume), [sound, volume]);
  useEffect(() => {
    document.documentElement.classList.toggle('large-text', largeText);
  }, [largeText]);
  return (
    <SimContext.Provider value={sim}>
      <Game />
    </SimContext.Provider>
  );
}
