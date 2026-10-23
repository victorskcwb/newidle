import { useEffect, useState } from 'react';
import { t } from '../i18n.ts';
import { api, setSessionToken, type Me, type SessionInfo } from '../net/api.ts';
import { PrivacySummary } from './PrivacySummary.tsx';
import { apiErrorText } from './screens/AuthScreen.tsx';

/** "Chrome · Android" from a user agent, or null when nothing is recognized. */
export function deviceName(ua: string): string | null {
  const browser = (
    [
      [/Edg\//, 'Edge'],
      [/OPR\/|Opera/, 'Opera'],
      [/Firefox\//, 'Firefox'],
      [/Chrome\//, 'Chrome'],
      [/Safari\//, 'Safari'],
    ] as const
  ).find(([re]) => re.test(ua))?.[1];
  const system = (
    [
      [/Android/, 'Android'],
      [/iPhone|iPad|iPod/, 'iOS'],
      [/Windows/, 'Windows'],
      [/Mac OS X|Macintosh/, 'macOS'],
      [/Linux/, 'Linux'],
    ] as const
  ).find(([re]) => re.test(ua))?.[1];
  const parts = [browser, system].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Online only, in Options: how the account signs in, linking a guest account to an e-mail or
 * Google (so the hero is not lost with the device), the open sessions and signing out.
 */
export function AccountSection() {
  const [me, setMe] = useState<Me | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const refresh = async () => {
    try {
      setMe(await api.me());
      setSessions((await api.sessions()).sessions);
    } catch (e) {
      setError(apiErrorText(e));
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!me) return error ? <p className="tone-bad small">{error}</p> : null;
  const hasPassword = me.identities.some((i) => i.provider === 'password');
  const hasGoogle = me.identities.some((i) => i.provider === 'google');
  const guestOnly = !hasPassword && !hasGoogle;

  return (
    <div className="account" data-testid="account">
      <p className={guestOnly ? 'tone-bad small' : 'muted small'}>
        {guestOnly
          ? t('account.guest')
          : t('account.signedIn', {
              how: me.identities
                .filter((i) => i.provider !== 'guest')
                .map((i) => (i.provider === 'google' ? `Google (${i.email ?? ''})` : i.email))
                .join(' · '),
            })}
      </p>

      {!hasPassword && (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.register(email, password);
              setPassword('');
            });
          }}
        >
          <label className="field">
            <span>{t('auth.email')}</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="link-email"
            />
          </label>
          <label className="field">
            <span>{t('auth.password')}</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              data-testid="link-password"
            />
            <small className="muted">{t('auth.passwordRule')}</small>
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy}
            data-testid="link-submit"
          >
            {t('account.linkEmail')}
          </button>
        </form>
      )}
      {!hasGoogle && (
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              location.href = (await api.googleStart()).url;
            })
          }
        >
          {t('account.linkGoogle')}
        </button>
      )}

      <h4 className="pixel">{t('account.sessions')}</h4>
      <ul className="session-list" data-testid="sessions">
        {sessions.map((s) => (
          <li key={s.id}>
            <span className="small">
              {deviceName(s.device) ?? t('account.unknownDevice')}
              {s.current && ` · ${t('account.thisDevice')}`}
              <br />
              <span className="muted">
                {t('account.lastSeen', { when: new Date(s.lastSeen).toLocaleString() })}
              </span>
            </span>
            {!s.current && (
              <button
                type="button"
                className="btn btn-small"
                disabled={busy}
                onClick={() => void run(() => api.revokeSession(s.id))}
              >
                {t('account.endSession')}
              </button>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            if (guestOnly && !confirm(t('account.logoutGuest'))) return;
            await api.logout();
            setSessionToken(null);
            location.reload();
          })
        }
        data-testid="logout"
      >
        {t('account.logout')}
      </button>
      <h4 className="pixel">{t('privacy.title')}</h4>
      <PrivacySummary />
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const data = await api.exportData();
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
            );
            const a = document.createElement('a');
            a.href = url;
            a.download = 'abismo-dados.json';
            a.click();
            URL.revokeObjectURL(url);
          })
        }
        data-testid="export-data"
      >
        {t('account.export')}
      </button>
      {deleting ? (
        <div className="account-delete">
          <p className="tone-bad small">{t('account.deleteWarning')}</p>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api.deleteAccount();
                setSessionToken(null);
                location.reload();
              })
            }
            data-testid="delete-confirm"
          >
            {t('account.deleteConfirm')}
          </button>
          <button type="button" className="btn" onClick={() => setDeleting(false)}>
            {t('action.back')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn"
          onClick={() => setDeleting(true)}
          data-testid="delete-account"
        >
          {t('account.delete')}
        </button>
      )}
      {error && <p className="tone-bad small">{error}</p>}
    </div>
  );
}
