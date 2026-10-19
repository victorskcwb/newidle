import { useState } from 'react';
import { loadHistory, xpPerHour } from '../game/history.ts';
import { formatNumber, localeTag, t } from '../i18n.ts';
import { useSim } from './useSim.ts';

const W = 320;
const H = 120;
const PAD = { left: 8, right: 8, top: 10, bottom: 18 };

/**
 * XP per hour over the last 24 hours: one series, so no legend (the title names it), the
 * latest value as the headline, a crosshair with the value on hover.
 */
export function XpChart() {
  const sim = useSim();
  // Cheap to rebuild; the sim state is one mutable object, so a memo would go stale.
  const points = xpPerHour(loadHistory(sim.state));
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) {
    return <p className="muted small">{t('journal.chart.empty')}</p>;
  }
  const t0 = points[0]!.at;
  const t1 = points[points.length - 1]!.at;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (at: number) =>
    PAD.left + ((at - t0) / Math.max(1, t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
  const path = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join('');
  const last = points[points.length - 1]!;
  const shown = hover !== null ? points[hover]! : null;
  const time = (at: number) =>
    new Date(at).toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' });
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.at) - px) < Math.abs(x(points[best]!.at) - px)) best = i;
    });
    setHover(best);
  };
  return (
    <figure className="xp-chart" data-testid="xp-chart">
      <figcaption>
        <span className="muted small">{t('journal.chart.title')}</span>
        <span className="xp-chart-hero">{formatNumber(last.value)}</span>
        <span className="muted small">{t('journal.chart.now')}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t('journal.chart.title')}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <line className="xp-chart-base" x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} />
        <path className="xp-chart-line" d={path} />
        {shown && (
          <>
            <line
              className="xp-chart-cross"
              x1={x(shown.at)}
              x2={x(shown.at)}
              y1={PAD.top}
              y2={y(0)}
            />
            <circle className="xp-chart-dot" cx={x(shown.at)} cy={y(shown.value)} r={4} />
          </>
        )}
        <text className="xp-chart-axis" x={PAD.left} y={H - 4}>
          {time(t0)}
        </text>
        <text className="xp-chart-axis" x={W - PAD.right} y={H - 4} textAnchor="end">
          {time(t1)}
        </text>
      </svg>
      <div className="small xp-chart-tip" aria-live="polite">
        {shown
          ? t('journal.chart.point', { time: time(shown.at), n: formatNumber(shown.value) })
          : t('journal.chart.max', { n: formatNumber(max) })}
      </div>
    </figure>
  );
}
