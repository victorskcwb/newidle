import { loadContent } from '@abismo/content';
import { TICK_MS } from '@abismo/engine';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameSim } from './game/sim.ts';
import { t } from './i18n.ts';
import { deleteSave, loadSave, startAutosave, writeSave, type LoadResult } from './save/storage.ts';
import { useUi } from './state/store.ts';
import { App } from './ui/App.tsx';
import { CreateHeroScreen, type NewHeroChoice } from './ui/screens/CreateHeroScreen.tsx';
import './ui/styles.css';

// Debug only: `?speed=N` runs the game N× faster in development builds (e2e tests use it).
const params = new URLSearchParams(location.search);
const speed = import.meta.env.DEV ? Math.max(1, Number(params.get('speed') ?? 1)) : 1;
const content = loadContent();
const firstHunt = [...content.hunts.values()].find((h) => h.startUnlocked)!;

type Phase =
  | { kind: 'loading' }
  | { kind: 'create' }
  | { kind: 'broken'; result: Extract<LoadResult, { kind: 'broken' }> }
  | { kind: 'game'; sim: GameSim };

function run(sim: GameSim): GameSim {
  useUi.getState().setZoom(window.innerWidth < 700 ? 1 : 2);
  sim.start();
  startAutosave(
    () => sim.state,
    (cb) => sim.onChange(cb),
    () => sim.saveEnabled,
  );
  if (import.meta.env.DEV) (window as unknown as { abismo: GameSim }).abismo = sim;
  return sim;
}

/** Loads the save, applies the time away (offline), or asks for a new hero. */
async function boot(): Promise<Phase> {
  const result = await loadSave(content);
  if (result.kind === 'empty') return { kind: 'create' };
  if (result.kind === 'broken') return { kind: 'broken', result };
  const sim = new GameSim(result.file.state, speed);
  // A clock that went backwards counts as no time away.
  const awayMs = Math.max(0, Date.now() - result.file.savedAt);
  sim.applyAway(Math.floor((awayMs * speed) / TICK_MS));
  return { kind: 'game', sim: run(sim) };
}

function BrokenSave({
  result,
  onStartOver,
}: {
  result: Extract<LoadResult, { kind: 'broken' }>;
  onStartOver: () => void;
}) {
  return (
    <main className="screen">
      <div className="panel screen-card">
        <p className="tone-bad">
          {t('save.broken', { reason: t(`save.error.${result.error.code}`) })}
        </p>
        <p className="muted">{t('save.brokenHint')}</p>
        <textarea className="input code" readOnly rows={5} value={result.text} />
        <button type="button" className="btn btn-primary wide" onClick={onStartOver}>
          {t('save.startOver')}
        </button>
      </div>
    </main>
  );
}

// Started once at module load (StrictMode runs effects twice; the sim must exist only once).
const booting = boot();

function Root() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    void booting.then((p) => live && setPhase(p));
    return () => {
      live = false;
    };
  }, []);

  switch (phase.kind) {
    case 'loading':
      return <main className="screen muted">{t('app.loading')}</main>;
    case 'broken':
      return (
        <BrokenSave
          result={phase.result}
          onStartOver={() => void deleteSave().then(() => setPhase({ kind: 'create' }))}
        />
      );
    case 'create':
      return (
        <CreateHeroScreen
          onCreate={(hero: NewHeroChoice) => {
            const sim = GameSim.newHero(hero, speed);
            sim.startHunt(firstHunt.id);
            void writeSave(sim.state);
            setPhase({ kind: 'game', sim: run(sim) });
          }}
        />
      );
    case 'game': {
      const hunt = phase.sim.state.hunt
        ? content.hunts.get(phase.sim.state.hunt.huntId)
        : undefined;
      return <App sim={phase.sim} mapId={(hunt ?? firstHunt).mapId} />;
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
