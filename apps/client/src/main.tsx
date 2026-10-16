import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameSim } from './game/sim.ts';
import { t } from './i18n.ts';
import { useUi } from './state/store.ts';
import { App } from './ui/App.tsx';
import './ui/styles.css';

// Debug only: `?speed=N` runs the game N× faster in development builds (e2e tests use it).
const params = new URLSearchParams(location.search);
const speed = import.meta.env.DEV ? Math.max(1, Number(params.get('speed') ?? 1)) : 1;

const sim = new GameSim(t('hero.defaultName'), speed);
const hunt = [...sim.content.hunts.values()].find((h) => h.startUnlocked)!;
useUi.getState().setZoom(window.innerWidth < 700 ? 1 : 2);
sim.start();
sim.startHunt(hunt.id);
if (import.meta.env.DEV) (window as unknown as { abismo: GameSim }).abismo = sim;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App sim={sim} mapId={hunt.mapId} />
  </StrictMode>,
);
