import { createTranslator } from '@abismo/i18n';

export const t = createTranslator('pt-BR');

const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/** Whole numbers with pt-BR grouping; compact ("1,2 mi") from 100,000 up. */
export function formatNumber(n: number | bigint): string {
  const v = typeof n === 'bigint' ? n : Math.round(n);
  if (typeof v === 'bigint' ? v >= 100_000n : v >= 100_000) return compact.format(v);
  return integer.format(v);
}

export function formatDuration(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? t('time.hoursMinutes', { h, m }) : t('time.minutes', { m });
}
