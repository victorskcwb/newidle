import { loadContent } from '@abismo/content';
import { TICK_MS, encodeSave } from '@abismo/engine';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameSim } from './game/sim.ts';
import { OnlineLink } from './game/online.ts';
import {
  ApiError,
  api,
  sessionToken,
  setSessionToken,
  takeRedirect,
  type HeroSummary,
} from './net/api.ts';
import { ImportScreen } from './ui/screens/ImportScreen.tsx';
import { AuthScreen, ResetPasswordScreen } from './ui/screens/AuthScreen.tsx';
import { t } from './i18n.ts';
import { deleteSave, loadSave, startAutosave, writeSave, type LoadResult } from './save/storage.ts';
import { usePrefs } from './state/prefs.ts';
import { useUi } from './state/store.ts';
import { Reminders } from './game/notify.ts';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App.tsx';
import { bootDone, bootStep } from './boot.ts';
import { CreateHeroScreen, type NewHeroChoice } from './ui/screens/CreateHeroScreen.tsx';
import './ui/styles.css';

// Installable app: the service worker exists only in production builds.
if (import.meta.env.PROD) registerSW({ immediate: true });

// Debug only: `?speed=N` runs the game N× faster in development builds (e2e tests use it).
const params = new URLSearchParams(location.search);
const speed = import.meta.env.DEV ? Math.max(1, Number(params.get('speed') ?? 1)) : 1;
const content = loadContent();
const firstHunt = [...content.hunts.values()].find((h) => h.startUnlocked)!;
// Online mode (decision 173): builds with VITE_ONLINE=1, or `?online=1` in development.
const online = import.meta.env.VITE_ONLINE === '1' || (import.meta.env.DEV && params.has('online'));
const BUILD_ID: string = import.meta.env.VITE_BUILD_ID ?? 'dev';
/** Set once the player answered the offer to bring this device's hero into the account. */
const IMPORT_DISMISSED_KEY = 'abismo.importAnswered';

type Phase =
  | { kind: 'loading' }
  | { kind: 'create' }
  | { kind: 'broken'; result: Extract<LoadResult, { kind: 'broken' }> }
  | { kind: 'game'; sim: GameSim }
  /** Online, the account has no hero yet. */
  | { kind: 'create-online'; link: OnlineLink }
  /** Online without a session: play as a guest or sign in. */
  | { kind: 'auth'; notice: string | null }
  /** Online, opened from a password recovery e-mail. */
  | { kind: 'reset'; token: string }
  /** Online, on a device with a local hero the account may take in (decision 177). */
  | { kind: 'import'; local: HeroSummary; save: string; account: HeroSummary | null }
  | { kind: 'no-server' };

function run(sim: GameSim): GameSim {
  const reminders = new Reminders(sim);
  reminders.enabled = usePrefs.getState().reminders;
  usePrefs.subscribe((p) => (reminders.enabled = p.reminders));
  useUi.getState().setZoom(window.innerWidth < 700 ? 1 : 2);
  sim.start();
  startAutosave(
    () => sim.state,
    (cb) => sim.onChange(cb),
    () => sim.saveEnabled,
  );
  if (import.meta.env.DEV) {
    (window as unknown as { abismo: GameSim; abismoUi: typeof useUi }).abismo = sim;
    (window as unknown as { abismoUi: typeof useUi }).abismoUi = useUi;
  }
  return sim;
}

/** The local hero, if this device has one and the account may still import it. */
async function importOffer(): Promise<Phase | null> {
  try {
    if (localStorage.getItem(IMPORT_DISMISSED_KEY)) return null;
  } catch {
    return null;
  }
  const [me, local] = await Promise.all([api.me().catch(() => null), loadSave(content)]);
  if (!me?.canImport || local.kind !== 'ok') return null;
  const h = local.file.state.hero;
  return {
    kind: 'import',
    local: { name: h.name, level: h.level, resets: h.resets.count, classId: h.classId },
    save: encodeSave(local.file.state, local.file.savedAt),
    account: me.hero,
  };
}

/** Signed in: offers the local hero once, then connects. */
async function enterOnline(): Promise<Phase> {
  return (await importOffer()) ?? bootOnline(newLink());
}

/** Connects to the game server and waits for the hero (or learns there is none yet). */
function bootOnline(link: OnlineLink): Promise<Phase> {
  bootStep(t('boot.server'), 40);
  return new Promise((resolve) => {
    link.onReplica = (replica) =>
      resolve({ kind: 'game', sim: run(new GameSim(replica.state, 1, link)) });
    link.onStatus = (status) => {
      if (status === 'no_hero') resolve({ kind: 'create-online', link });
      else if (status === 'auth') {
        // The session ended (expired, revoked, signed out elsewhere): sign in again.
        setSessionToken(null);
        resolve({ kind: 'auth', notice: t('auth.expired') });
      }
    };
    link.connect();
  });
}

function newLink(): OnlineLink {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return new OnlineLink(
    `${scheme}://${location.host}/ws`,
    () => sessionToken() ?? '',
    BUILD_ID,
    content,
  );
}

/** Loads the save, applies the time away (offline), or asks for a new hero. */
async function boot(): Promise<Phase> {
  if (online) {
    const { resetToken, authError } = takeRedirect();
    if (resetToken) return { kind: 'reset', token: resetToken };
    if (!sessionToken()) {
      return { kind: 'auth', notice: authError ? t('auth.error.google') : null };
    }
    return enterOnline();
  }
  bootStep(t('boot.save'), 40);
  const result = await loadSave(content);
  if (result.kind === 'empty') return { kind: 'create' };
  if (result.kind === 'broken') return { kind: 'broken', result };
  const sim = new GameSim(result.file.state, speed);
  // A clock that went backwards counts as no time away.
  const awayMs = Math.max(0, Date.now() - result.file.savedAt);
  bootStep(t('boot.away'), 65);
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

/** Creates the account's hero on the server, then connects to play it. */
async function createOnline(link: OnlineLink, hero: NewHeroChoice): Promise<Phase> {
  try {
    await api.createHero(hero);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 409)) return { kind: 'no-server' };
  }
  link.status = 'connecting';
  return bootOnline(link);
}

// Started once at module load (StrictMode runs effects twice; the sim must exist only once).
const booting = boot();

function Root() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    void booting.then((p) => {
      if (!live) return;
      setPhase(p);
      // The game screen hides the loading screen once its map is drawn; the others now.
      if (p.kind === 'game') bootStep(t('boot.map'), 85);
      else bootDone();
    });
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
    case 'no-server':
      return (
        <main className="screen">
          <div className="panel screen-card">
            <p className="tone-bad">{t('net.unavailable')}</p>
          </div>
        </main>
      );
    case 'auth':
      return (
        <AuthScreen
          notice={phase.notice}
          onSession={() => {
            void enterOnline().then((p) => {
              if (p.kind === 'game') bootStep(t('boot.map'), 85);
              setPhase(p);
            });
          }}
        />
      );
    case 'reset':
      return (
        <ResetPasswordScreen
          token={phase.token}
          onDone={() => setPhase({ kind: 'auth', notice: t('auth.resetDone') })}
        />
      );
    case 'import':
      return (
        <ImportScreen
          local={phase.local}
          save={phase.save}
          account={phase.account}
          onDone={() => {
            // Asked once per device: the local hero stays here either way.
            try {
              localStorage.setItem(IMPORT_DISMISSED_KEY, '1');
            } catch {
              // Without storage the offer comes back next time, which is harmless.
            }
            void bootOnline(newLink()).then((p) => {
              if (p.kind === 'game') bootStep(t('boot.map'), 85);
              setPhase(p);
            });
          }}
        />
      );
    case 'create-online': {
      const link = phase.link;
      return (
        <CreateHeroScreen
          onCreate={(hero: NewHeroChoice) => {
            void createOnline(link, hero).then((p) => {
              if (p.kind === 'game') bootStep(t('boot.map'), 85);
              setPhase(p);
            });
          }}
        />
      );
    }
    case 'create':
      return (
        <CreateHeroScreen
          onCreate={(hero: NewHeroChoice) => {
            const sim = GameSim.newHero(hero, speed);
            sim.startHunt(firstHunt.id);
            void writeSave(sim.state);
            bootStep(t('boot.map'), 85);
            setPhase({ kind: 'game', sim: run(sim) });
          }}
        />
      );
    case 'game':
      return <App sim={phase.sim} />;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
