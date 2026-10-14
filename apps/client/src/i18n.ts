import { createTranslator } from '@valdren/i18n';

export const t = createTranslator('pt-BR');

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

/** XP is stored in tenths. */
export function formatXp(xpTenths: number): string {
  return numberFormat.format(xpTenths / 10);
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return t('time.hm', { h, m });
  if (m > 0) return t('time.ms', { m, s });
  return t('time.s', { s });
}
