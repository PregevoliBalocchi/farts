// UI strings: one JSON table per language, English as the fallback.
// Keys are flat ("action.tax"); `{name}` placeholders are filled from `vars`.

import en from './en.json';
import it from './it.json';

/** Languages with a string table. */
export type Lang = 'en' | 'it';
export const LANGS: readonly Lang[] = ['en', 'it'];

const TABLES: Record<Lang, Record<string, string>> = { en, it };

/** A translator bound to one language. */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Returns the translator for `lang`; a missing key falls back to English, then to the key itself. */
export function translator(lang: Lang): Translate {
  const table = TABLES[lang];
  return (key, vars) => {
    const raw = table[key] ?? TABLES.en[key] ?? key;
    return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
  };
}

/** Picks a language: `?lang=` first, then the browser's, then English. */
export function pickLang(search: string, navLang: string | undefined): Lang {
  const q = new URLSearchParams(search).get('lang');
  if (q && (LANGS as readonly string[]).includes(q)) return q as Lang;
  const nav = (navLang ?? '').slice(0, 2);
  return (LANGS as readonly string[]).includes(nav) ? (nav as Lang) : 'en';
}
