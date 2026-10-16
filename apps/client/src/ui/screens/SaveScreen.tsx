import { SaveError, encodeSave } from '@abismo/engine';
import { useMemo, useState } from 'react';
import { t } from '../../i18n.ts';
import { importSave } from '../../save/storage.ts';
import { Sheet } from '../Sheet.tsx';
import { useSim } from '../useSim.ts';

/** Export and import the save as text (section 3: save with export/import). */
export function SaveScreen() {
  const sim = useSim();
  const exported = useMemo(() => encodeSave(sim.state, Date.now()), [sim]);
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title={t('screen.save')} testId="save">
      <h3 className="pixel">{t('menu.export')}</h3>
      <p className="muted">{t('menu.exportHint')}</p>
      <textarea
        className="input code"
        readOnly
        value={exported}
        rows={3}
        onFocus={(e) => e.currentTarget.select()}
        data-testid="export-text"
      />
      <button
        type="button"
        className="btn"
        onClick={() => {
          void navigator.clipboard?.writeText(exported).then(() => setCopied(true));
        }}
      >
        {copied ? t('menu.copied') : t('menu.copy')}
      </button>

      <h3 className="pixel">{t('menu.import')}</h3>
      <p className="muted">{t('menu.importHint')}</p>
      <textarea
        className="input code"
        value={text}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        data-testid="import-text"
      />
      {error && <p className="tone-bad">{error}</p>}
      <button
        type="button"
        className="btn btn-primary"
        disabled={text.trim().length === 0}
        onClick={() => {
          sim.stop();
          sim.saveEnabled = false;
          importSave(text, sim.content)
            .then(() => location.reload())
            .catch((e: unknown) => {
              sim.saveEnabled = true;
              sim.start();
              const reason = e instanceof SaveError ? t(`save.error.${e.code}`) : String(e);
              setError(t('menu.importError', { reason }));
            });
        }}
      >
        {t('menu.importButton')}
      </button>
    </Sheet>
  );
}
