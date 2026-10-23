import { useState } from 'react';
import { t } from '../../i18n.ts';
import { ApiError, api, setSessionToken } from '../../net/api.ts';
import { PrivacySummary } from '../PrivacySummary.tsx';

type Mode = 'start' | 'login' | 'register' | 'forgot';

/** A message for an API error code, with a generic fallback. */
export function apiErrorText(e: unknown): string {
  const code = e instanceof ApiError ? e.code : 'server';
  const key = `auth.error.${code}`;
  const text = t(key);
  return text === key ? t('auth.error.server') : text;
}

/**
 * First screen online without a session (decision 175): play at once as a guest, or sign in
 * with e-mail and password or Google. Calls `onSession` once a session token is stored.
 */
export function AuthScreen({
  onSession,
  notice,
}: {
  onSession: () => void;
  notice?: string | null;
}) {
  const [mode, setMode] = useState<Mode>('start');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice ?? null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const guest = () =>
    run(async () => {
      setSessionToken((await api.guest()).token);
      onSession();
    });
  const google = () =>
    run(async () => {
      location.href = (await api.googleStart()).url;
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      void run(async () => {
        setSessionToken((await api.login(email, password)).token);
        onSession();
      });
    } else if (mode === 'register') {
      void run(async () => {
        const r = await api.register(email, password);
        if (r.token) setSessionToken(r.token);
        onSession();
      });
    } else if (mode === 'forgot') {
      void run(async () => {
        await api.forgot(email);
        setInfo(t('auth.forgotSent'));
      });
    }
  };

  return (
    <main className="screen">
      <div className="panel screen-card" data-testid="auth">
        <h1 className="pixel">{t('auth.title')}</h1>
        {mode === 'start' ? (
          <>
            <p className="muted">{t('auth.intro')}</p>
            <button
              type="button"
              className="btn btn-primary wide"
              disabled={busy}
              onClick={() => void guest()}
              data-testid="auth-guest"
            >
              {t('auth.playNow')}
            </button>
            <button
              type="button"
              className="btn wide"
              onClick={() => setMode('login')}
              data-testid="auth-login"
            >
              {t('auth.login')}
            </button>
            <button
              type="button"
              className="btn wide"
              disabled={busy}
              onClick={() => void google()}
            >
              {t('auth.google')}
            </button>
          </>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label className="field">
              <span>{t('auth.email')}</span>
              <input
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="auth-email"
              />
            </label>
            {mode !== 'forgot' && (
              <label className="field">
                <span>{t('auth.password')}</span>
                <input
                  className="input"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="auth-password"
                />
                {mode === 'register' && <small className="muted">{t('auth.passwordRule')}</small>}
              </label>
            )}
            <button
              type="submit"
              className="btn btn-primary wide"
              disabled={busy}
              data-testid="auth-submit"
            >
              {t(`auth.submit.${mode}`)}
            </button>
            <div className="row auth-links">
              {mode === 'login' && (
                <>
                  <button type="button" className="link" onClick={() => setMode('forgot')}>
                    {t('auth.forgot')}
                  </button>
                  <button type="button" className="link" onClick={() => setMode('register')}>
                    {t('auth.createAccount')}
                  </button>
                </>
              )}
              <button type="button" className="link" onClick={() => setMode('start')}>
                {t('action.back')}
              </button>
            </div>
          </form>
        )}
        <details className="small">
          <summary>{t('privacy.title')}</summary>
          <PrivacySummary />
        </details>
        {info && <p className="tone-good small">{info}</p>}
        {error && (
          <p className="tone-bad small" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

/** The page a recovery e-mail opens: choose a new password. */
export function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="screen">
      <form
        className="panel screen-card"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          api
            .reset(token, password)
            .then(onDone)
            .catch((err: unknown) => setError(apiErrorText(err)))
            .finally(() => setBusy(false));
        }}
      >
        <h1 className="pixel">{t('auth.resetTitle')}</h1>
        <label className="field">
          <span>{t('auth.newPassword')}</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <small className="muted">{t('auth.passwordRule')}</small>
        </label>
        <button type="submit" className="btn btn-primary wide" disabled={busy}>
          {t('auth.resetSubmit')}
        </button>
        {error && <p className="tone-bad small">{error}</p>}
      </form>
    </main>
  );
}
