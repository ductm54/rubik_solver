/**
 * Translations for every user-facing string, shared by the pages and the solver worker.
 *
 * `t(key, params)` looks the key up in the current language, falling back to English. Templates
 * use `{name}` placeholders. With a numeric `count` param, plural forms are picked: first an
 * exact `key_=N` entry, then `key_<category>` (Intl.PluralRules: one, few, many, other...).
 * English is bundled; other languages load on demand with `setLocale`.
 */
import { EN, type Messages, type Translation } from './locales/en';

export interface LocaleInfo {
  code: string;
  /** The language's own name, for the picker. */
  name: string;
}

export const LOCALES: LocaleInfo[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh', name: '中文（简体）' },
  { code: 'ja', name: '日本語' },
  { code: 'vi', name: 'Tiếng Việt' },
];

export type Params = Record<string, string | number>;

const loaders = import.meta.glob<{ default: Translation }>(['./locales/*.ts', '!./locales/en.ts']);

let locale = 'en';
let messages: Translation = EN;
let plural = new Intl.PluralRules('en');

export const getLocale = () => locale;

/** Best supported language for a list of preferences such as navigator.languages. */
export function matchLocale(prefs: readonly string[]): string {
  for (const p of prefs) {
    const base = p.toLowerCase().split(/[-_]/)[0];
    if (LOCALES.some((l) => l.code === base)) return base;
  }
  return 'en';
}

/** Switch language (loads its messages first). Unknown codes fall back to English. */
export async function setLocale(code: string): Promise<void> {
  if (!LOCALES.some((l) => l.code === code)) code = 'en';
  if (code === locale) return;
  if (code === 'en') messages = EN;
  else {
    const load = loaders[`./locales/${code}.ts`];
    if (!load) return;
    messages = (await load()).default;
  }
  locale = code;
  plural = new Intl.PluralRules(code);
}

export type MessageKey = keyof Messages;

function lookup(key: string): string | undefined {
  return (messages as Record<string, string>)[key] ?? (EN as Record<string, string>)[key];
}

/** Has this exact key (in the current language or English)? */
export const hasKey = (key: string) => lookup(key) !== undefined;

export function t(key: MessageKey | (string & {}), params: Params = {}): string {
  let tpl: string | undefined;
  if (typeof params.count === 'number') {
    tpl = lookup(`${key}_=${params.count}`) ?? lookup(`${key}_${plural.select(params.count)}`) ?? lookup(`${key}_other`);
  }
  tpl ??= lookup(key) ?? key;
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** "a, b and c" in the current language. */
export const andList = (items: string[]) => new Intl.ListFormat(locale, { type: 'conjunction' }).format(items);

/** First letter upper-cased (no-op for scripts without case). */
export const cap = (s: string) => (s ? s[0].toLocaleUpperCase(locale) + s.slice(1) : s);
