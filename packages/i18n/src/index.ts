import en from './locales/en.json' with { type: 'json' };
import ptBR from './locales/pt-BR.json' with { type: 'json' };

export const locales = {
  'pt-BR': ptBR as Record<string, string>,
  en: en as Record<string, string>,
} as const;
export type Locale = keyof typeof locales;
export const defaultLocale: Locale = 'pt-BR';
export const LOCALES = Object.keys(locales) as Locale[];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in locales;
}

export type TranslateParams = Record<string, string | number>;
export type Translate = (key: string, params?: TranslateParams) => string;

/**
 * Returns a translator for a locale. A key missing in the locale falls back to pt-BR; missing
 * everywhere, it renders as the key itself so it is easy to spot.
 */
export function createTranslator(locale: Locale = defaultLocale): Translate {
  const table = locales[locale];
  const fallback = locales[defaultLocale];
  return (key, params) => {
    const template = table[key] ?? fallback[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}

export function hasKey(key: string, locale: Locale = defaultLocale): boolean {
  return key in locales[locale];
}
