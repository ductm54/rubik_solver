/**
 * Page language: picked from ?lang=, then the saved choice, then the browser's languages. Loads
 * the messages before the page script runs (top-level await), translates the static HTML
 * (data-i18n attributes) and adds the language picker to the nav.
 *
 *   data-i18n="key"             text content
 *   data-i18n-title="key"       title attribute (also: -placeholder, -aria-label)
 */
import { LOCALES, getLocale, matchLocale, setLocale, t } from '../src/i18n';

const KEY = 'lang';

function saved(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const fromUrl = new URLSearchParams(location.search).get('lang');
if (fromUrl) {
  try {
    localStorage.setItem(KEY, fromUrl);
  } catch {
    /* storage unavailable */
  }
}
await setLocale(matchLocale([fromUrl ?? '', saved() ?? '', ...(navigator.languages ?? [navigator.language])].filter(Boolean)));

export const lang = getLocale();
document.documentElement.lang = lang;

/** Translate the data-i18n attributes under `root`. */
export function translateDom(root: ParentNode = document) {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n!);
  for (const attr of ['title', 'placeholder', 'aria-label']) {
    const data = `data-i18n-${attr}`;
    for (const el of root.querySelectorAll<HTMLElement>(`[${data}]`)) el.setAttribute(attr, t(el.getAttribute(data)!));
  }
}

function addPicker() {
  const nav = document.querySelector('nav.tabs');
  if (!nav) return;
  const sel = document.createElement('select');
  sel.className = 'lang-picker';
  sel.setAttribute('aria-label', t('lang.label'));
  sel.title = t('lang.label');
  for (const l of LOCALES) sel.add(new Option(l.name, l.code, false, l.code === lang));
  sel.onchange = () => {
    try {
      localStorage.setItem(KEY, sel.value);
    } catch {
      /* not remembered: the URL carries it */
    }
    const url = new URL(location.href);
    url.searchParams.set('lang', sel.value);
    location.replace(url);
  };
  nav.append(sel);
}

translateDom();
addPicker();
