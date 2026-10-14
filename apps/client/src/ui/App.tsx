import { useCallback, useEffect, useState } from 'react';
import { t } from '../i18n.ts';
import { api, ApiError } from '../net/api.ts';
import { LocalSim } from '../state/localSim.ts';
import { ServerSim } from '../state/serverSim.ts';
import { installSim, sim, useGame } from '../state/store.ts';
import { AuthScreen } from './screens/AuthScreen.tsx';
import { CreateHeroScreen } from './screens/CreateHeroScreen.tsx';
import { GameScreen } from './screens/GameScreen.tsx';

type Phase = 'loading' | 'auth' | 'create' | 'game' | 'error';

/** `?local` runs the engine-only test page (no server). */
const LOCAL_MODE = new URLSearchParams(location.search).has('local');

export function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('error.internal');

  const boot = useCallback(async () => {
    setPhase('loading');
    if (LOCAL_MODE) {
      const local = new LocalSim();
      installSim(local);
      local.start();
      setPhase('game');
      return;
    }
    try {
      const me = await api.me();
      if (!me.character) {
        setPhase('create');
        return;
      }
      const { sim: server, welcome } = await ServerSim.connect();
      installSim(server, welcome.offline);
      useGame.setState({ profile: me.character, status: server.status });
      server.onStatus((status) => {
        useGame.setState({ status });
        if (status === 'unauthorized') setPhase('auth');
      });
      server.subscribe({
        // The bank changed outside the slot (e.g. a sale): refresh coins.
        onReset: () => void api.me().then((m) => useGame.setState({ profile: m.character })),
      });
      server.start();
      setPhase('game');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setPhase('auth');
      else {
        setError(err instanceof ApiError ? err.messageKey : 'error.network');
        setPhase('error');
      }
    }
  }, []);

  useEffect(() => {
    void boot();
    return () => sim?.dispose();
  }, [boot]);

  const logout = async () => {
    sim?.dispose();
    await api.logout().catch(() => {});
    useGame.setState({ slot: null, profile: null, summary: null });
    setPhase('auth');
  };

  switch (phase) {
    case 'loading':
      return <p className="screen muted">{t('ui.loading')}</p>;
    case 'auth':
      return <AuthScreen onDone={() => void boot()} />;
    case 'create':
      return <CreateHeroScreen onDone={() => void boot()} />;
    case 'error':
      return (
        <main className="screen">
          <p className="blocked" role="alert">
            {t(error)}
          </p>
          <button className="btn" onClick={() => void boot()}>
            {t('ui.retry')}
          </button>
        </main>
      );
    case 'game':
      return <GameScreen onLogout={LOCAL_MODE ? undefined : () => void logout()} />;
  }
}
