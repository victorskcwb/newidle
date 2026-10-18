import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n.ts';
import { useUi, type LogLine } from '../state/store.ts';
import { FloatWindow } from './FloatWindow.tsx';
import { Icon } from './Icon.tsx';
import { RARITY_COLOR, RARITY_GLYPH } from './rarity.ts';

type Tab = 'all' | 'combat' | 'loot' | 'system';

/** Loot lines carry a rarity; system lines a tone; the rest is combat. */
function tabOf(line: LogLine): Exclude<Tab, 'all'> {
  if (line.rarity) return 'loot';
  if (line.tone === 'info' || line.tone === 'good') return 'system';
  return 'combat';
}

/** The event log as a small window with tabs, newest line at the bottom. */
export function EventLog() {
  const log = useUi((s) => s.log);
  const open = useUi((s) => s.logWindow);
  const toggle = useUi((s) => s.toggleLogWindow);
  const [tab, setTab] = useState<Tab>('all');
  const list = useRef<HTMLDivElement>(null);
  const lines = tab === 'all' ? log : log.filter((l) => tabOf(l) === tab);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [lines.length, tab]);
  if (!open) return null;
  const tabs: Tab[] = ['all', 'combat', 'loot', 'system'];
  return (
    <FloatWindow
      id="log"
      title={t('top.log')}
      icon={<Icon name="log" size={16} />}
      initial={{ x: 8, y: Math.max(64, window.innerHeight - 280) }}
      width={380}
      onClose={toggle}
    >
      <div className="log-tabs" role="tablist">
        {tabs.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`filter-chip${tab === k ? ' active' : ''}`}
            onClick={() => setTab(k)}
          >
            {t(`log.tab.${k}`)}
          </button>
        ))}
      </div>
      <div className="event-log" data-testid="event-log" role="log" aria-live="polite" ref={list}>
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
      </div>
    </FloatWindow>
  );
}
