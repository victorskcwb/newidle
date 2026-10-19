import { createTranslator, isLocale, type Locale } from '@abismo/i18n';

const LOCALE_KEY = 'abismo.locale';

/** The player's choice on this device, else the browser's language (Portuguese or English). */
function pickLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage blocked: fall back to the browser language.
  }
  const lang = typeof navigator === 'undefined' ? 'pt-BR' : navigator.language;
  return lang.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

export const locale: Locale = pickLocale();
/** BCP 47 tag for number and text formatting. */
export const localeTag = locale === 'en' ? 'en-US' : 'pt-BR';
if (typeof document !== 'undefined') document.documentElement.lang = localeTag;

export const t = createTranslator(locale);

/** Saves the language on this device and reloads, so every text is rebuilt in it. */
export function setLocale(next: Locale) {
  try {
    localStorage.setItem(LOCALE_KEY, next);
  } catch {
    // Without storage the choice cannot persist; reloading would undo it.
    return;
  }
  window.location.reload();
}

const integer = new Intl.NumberFormat(localeTag, { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(localeTag, { notation: 'compact', maximumFractionDigits: 1 });

/** Whole numbers with the locale's grouping; compact ("1.2M") from 100,000 up. */
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
