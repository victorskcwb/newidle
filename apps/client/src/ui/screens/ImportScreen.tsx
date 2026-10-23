import { useState } from 'react';
import { t } from '../../i18n.ts';
import { ApiError, api, type HeroSummary } from '../../net/api.ts';
import { apiErrorText } from './AuthScreen.tsx';

function line(h: HeroSummary): string {
  return t('import.hero', {
    name: h.name,
    level: h.level,
    resets: h.resets,
    class: t(`class.${h.classId}`),
  });
}

/**
 * Online, on a device that has a local hero (decision 177): offers once to bring it into the
 * account. When the account already has a hero, the player chooses which one stays.
 */
export function ImportScreen({
  local,
  save,
  account,
  onDone,
}: {
  local: HeroSummary;
  /** The local save as text, sent as is: the server validates it. */
  save: string;
  account: HeroSummary | null;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const importIt = (replace: boolean) => {
    setBusy(true);
    setError(null);
    api
      .importHero(save, replace)
      .then(onDone)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.code === 'implausible') setError(t('import.implausible'));
        else setError(apiErrorText(e));
      })
      .finally(() => setBusy(false));
  };

  return (
    <main className="screen">
      <div className="panel screen-card" data-testid="import">
        <h1 className="pixel">{t('import.title')}</h1>
        <p>{t('import.local', { hero: line(local) })}</p>
        {account ? (
          <>
            <p>{t('import.account', { hero: line(account) })}</p>
            {confirming ? (
              <>
                <p className="tone-bad small">
                  {t('import.replaceWarning', { name: account.name })}
                </p>
                <button
                  type="button"
                  className="btn btn-primary wide"
                  disabled={busy}
                  onClick={() => importIt(true)}
                  data-testid="import-replace-confirm"
                >
                  {t('import.replaceConfirm', { name: local.name })}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn wide"
                disabled={busy}
                onClick={() => setConfirming(true)}
                data-testid="import-replace"
              >
                {t('import.replace', { name: local.name })}
              </button>
            )}
            <button
              type="button"
              className="btn wide"
              disabled={busy}
              onClick={onDone}
              data-testid="import-keep"
            >
              {t('import.keep', { name: account.name })}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary wide"
              disabled={busy}
              onClick={() => importIt(false)}
              data-testid="import-bring"
            >
              {t('import.bring', { name: local.name })}
            </button>
            <button type="button" className="btn wide" disabled={busy} onClick={onDone}>
              {t('import.skip')}
            </button>
          </>
        )}
        <p className="muted small">{t('import.once')}</p>
        {error && (
          <p className="tone-bad small" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
