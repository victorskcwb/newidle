import type { ReactNode } from 'react';
import { t } from '../i18n.ts';
import { useUi } from '../state/store.ts';

/** A full-width panel over the game with a title, a back-to-menu and a close button. */
export function Sheet({
  title,
  testId,
  children,
  back = true,
}: {
  title: string;
  testId: string;
  children: ReactNode;
  back?: boolean;
}) {
  const openScreen = useUi((s) => s.openScreen);
  return (
    <div className="sheet-backdrop" onClick={() => openScreen(null)}>
      <section
        className="panel sheet"
        onClick={(e) => e.stopPropagation()}
        aria-label={title}
        data-testid={testId}
      >
        <header className="sheet-head">
          {back && (
            <button
              type="button"
              className="btn icon"
              aria-label={t('action.back')}
              onClick={() => openScreen('menu')}
            >
              ←
            </button>
          )}
          <h2 className="pixel sheet-title">{title}</h2>
          <button
            type="button"
            className="btn icon"
            aria-label={t('action.close')}
            onClick={() => openScreen(null)}
          >
            ✕
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

/** Runs a sim intent and returns an error text for the UI instead of throwing. */
export function tryIntent(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    const code = (e as { code?: string }).code;
    return code ? t(`error.${code}`) : String(e);
  }
}
