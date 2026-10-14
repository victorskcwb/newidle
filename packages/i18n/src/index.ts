import ptBR from './locales/pt-BR.json' with { type: 'json' };

export const locales = { 'pt-BR': ptBR as Record<string, string> } as const;
export type Locale = keyof typeof locales;
export const defaultLocale: Locale = 'pt-BR';

export type TranslateParams = Record<string, string | number>;
export type Translate = (key: string, params?: TranslateParams) => string;

/** Returns a translator for a locale. Missing keys render as the key itself so they are easy to spot. */
export function createTranslator(locale: Locale = defaultLocale): Translate {
  const table = locales[locale];
  return (key, params) => {
    const template = table[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}

export function hasKey(key: string, locale: Locale = defaultLocale): boolean {
  return key in locales[locale];
}
