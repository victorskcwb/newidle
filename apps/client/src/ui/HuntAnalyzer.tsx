import { RARITY_ORDER, reportRates } from '@abismo/engine';
import { formatDuration, formatNumber, t } from '../i18n.ts';
import { useReport } from '../state/report.ts';
import { useUi } from '../state/store.ts';
import { FloatWindow } from './FloatWindow.tsx';
import { Icon } from './Icon.tsx';
import { RARITY_COLOR, RARITY_GLYPH } from './rarity.ts';
import { useSim } from './useSim.ts';

/** "+1.2K/h", or nothing in the first minute (too little to say). */
function perHour(v: number | null) {
  return v === null ? '' : t('analyzer.perHour', { n: formatNumber(v) });
}

/**
 * The hunt analyzer (Fase 4, item 5): what the current session yielded and its pace per hour,
 * gold against supplies, and the loot by rarity. It opens on its own when a session ends.
 */
export function HuntAnalyzer() {
  const sim = useSim();
  const open = useUi((s) => s.analyzerWindow);
  const setOpen = useUi((s) => s.setAnalyzerWindow);
  const report = useReport((s) => s.report);
  const restart = useReport((s) => s.restart);
  if (!open) return null;
  const hunt = report?.huntId ? sim.content.hunts.get(report.huntId) : undefined;
  const rates = report ? reportRates(report) : null;
  const rows: { icon: string; label: string; value: number; rate: number | null; tone?: string }[] =
    report && rates
      ? [
          {
            icon: 'xp',
            label: t('analyzer.xp'),
            value: report.xp - report.xpLost,
            rate: rates.xpPerHour,
          },
          { icon: 'gold', label: t('analyzer.gold'), value: report.gold, rate: rates.goldPerHour },
          {
            icon: 'potion',
            label: t('analyzer.supplies'),
            value: report.supplies,
            rate: rates.suppliesPerHour,
          },
          {
            icon: 'gold',
            label: t('analyzer.profit'),
            value: rates.profit,
            rate: rates.profitPerHour,
            tone: rates.profit >= 0 ? 'tone-good' : 'tone-bad',
          },
          {
            icon: 'hunt',
            label: t('analyzer.kills'),
            value: report.kills,
            rate: rates.killsPerHour,
          },
        ]
      : [];
  return (
    <FloatWindow
      id="analyzer"
      title={t('analyzer.title')}
      icon={<Icon name="xp" size={16} />}
      initial={{ x: Math.max(8, window.innerWidth - 308), y: 64 }}
      width={300}
      onClose={() => setOpen(false)}
      actions={
        report && (
          <button
            type="button"
            className="float-btn"
            title={t('analyzer.restart')}
            aria-label={t('analyzer.restart')}
            onClick={() => restart(sim.state.hunt?.huntId ?? null, sim.state.tick)}
          >
            ↺
          </button>
        )
      }
      testId="hunt-analyzer"
    >
      {!report || !rates ? (
        <p className="muted small">{t('analyzer.empty')}</p>
      ) : (
        <div className="analyzer">
          <div className="analyzer-head">
            <span>{hunt ? t(hunt.nameKey) : t('analyzer.abyss')}</span>
            <span className="muted">
              {formatDuration(rates.ms / 3_600_000)}
              {report.stoppedTick !== null && ` · ${t('analyzer.ended')}`}
            </span>
          </div>
          {rows.map((r) => (
            <div key={r.label} className="analyzer-row">
              <Icon name={r.icon} size={14} />
              <span className="analyzer-label">{r.label}</span>
              <span className={`analyzer-value ${r.tone ?? ''}`} data-testid={`analyzer-${r.icon}`}>
                {formatNumber(r.value)}
              </span>
              <span className="analyzer-rate muted">{perHour(r.rate)}</span>
            </div>
          ))}
          {report.deaths > 0 && (
            <div className="analyzer-row tone-bad">
              <Icon name="hp" size={14} />
              <span className="analyzer-label">{t('analyzer.deaths')}</span>
              <span className="analyzer-value">{report.deaths}</span>
              <span />
            </div>
          )}
          <div className="analyzer-loot">
            {RARITY_ORDER.filter((r) => report.drops[r] > 0).map((r) => (
              <span key={r} style={{ color: RARITY_COLOR[r] }} title={t(`rarity.${r}`)}>
                {RARITY_GLYPH[r]} {report.drops[r]}
              </span>
            ))}
            {report.cards > 0 && <span>{t('analyzer.cards', { n: report.cards })}</span>}
            {RARITY_ORDER.every((r) => report.drops[r] === 0) && report.cards === 0 && (
              <span className="muted">{t('analyzer.noLoot')}</span>
            )}
          </div>
        </div>
      )}
    </FloatWindow>
  );
}
