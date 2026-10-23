import { t } from '../i18n.ts';

/** What the game keeps and why (LGPD), in a few lines; the full policy text is pending review. */
export function PrivacySummary() {
  return (
    <ul className="privacy small muted" data-testid="privacy">
      {(['what', 'why', 'where', 'rights', 'delete'] as const).map((k) => (
        <li key={k}>{t(`privacy.${k}`)}</li>
      ))}
    </ul>
  );
}
