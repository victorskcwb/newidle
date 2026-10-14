import { useState, type FormEvent } from 'react';
import { t } from '../../i18n.ts';
import { api, ApiError } from '../../net/api.ts';

/** Sign in / create account. */
export function AuthScreen({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') await api.register(email, password);
      else await api.login(email, password);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.messageKey : 'error.internal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <form className="card form" onSubmit={submit} noValidate>
        <h1 className="brand brand-lg">{t('app.title')}</h1>
        <p className="muted">{t('auth.tagline')}</p>
        <h2 className="card-title">{t(mode === 'register' ? 'auth.register' : 'auth.login')}</h2>
        <label className="field">
          <span>{t('auth.email')}</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t('auth.password')}</span>
          <input
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'register' && <small className="muted">{t('auth.passwordHint')}</small>}
        </label>
        {error && (
          <p className="blocked" role="alert">
            {t(error)}
          </p>
        )}
        <button className="btn" type="submit" disabled={busy}>
          {t(mode === 'register' ? 'auth.register' : 'auth.login')}
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => {
            setMode(mode === 'register' ? 'login' : 'register');
            setError(null);
          }}
        >
          {t(mode === 'register' ? 'auth.haveAccount' : 'auth.noAccount')}
        </button>
      </form>
    </main>
  );
}
