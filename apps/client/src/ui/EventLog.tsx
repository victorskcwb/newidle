import { t } from '../i18n.ts';
import { useUi } from '../state/store.ts';
import { RARITY_COLOR, RARITY_GLYPH } from './rarity.ts';

const VISIBLE = 5;

/** Last events in the bottom-left corner; tapping expands the history. */
export function EventLog() {
  const log = useUi((s) => s.log);
  const expanded = useUi((s) => s.logExpanded);
  const toggle = useUi((s) => s.toggleLog);
  const lines = expanded ? log : log.slice(-VISIBLE);
  return (
    <section
      className={`panel event-log${expanded ? ' expanded' : ''}`}
      data-testid="event-log"
      onClick={toggle}
      role="log"
      aria-live="polite"
    >
      {lines.length === 0 && <div className="muted">{t('log.empty')}</div>}
      {lines.map((line) => (
        <div
          key={line.id}
          className={`log-line${line.tone ? ` tone-${line.tone}` : ''}`}
          style={line.rarity ? { color: RARITY_COLOR[line.rarity] } : undefined}
        >
          {line.rarity && <span aria-hidden>{RARITY_GLYPH[line.rarity]} </span>}
          {line.text}
        </div>
      ))}
    </section>
  );
}
