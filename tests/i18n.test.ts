import { afterAll, describe, expect, it } from 'vitest';
import { applyMoves, solvedState } from '../src/core/cube';
import { validate } from '../src/core/validate';
import { LOCALES, matchLocale, setLocale, t } from '../src/i18n';
import { EN } from '../src/i18n/locales/en';
import { getMethod } from '../src/solve/methods';

const files = import.meta.glob<{ default: Record<string, string> }>('../src/i18n/locales/*.ts', { eager: true });
const base = (key: string) => key.replace(/_(=\d+|zero|one|two|few|many|other)$/, '');
const holes = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
/** Params the code passes that English happens not to use. */
const EXTRA: Record<string, string[]> = { 'val.count': ['name'], 'cfop.regripAt': ['n'] };
/** Placeholders any English form of a key uses. */
function enHoles(key: string): Set<string> {
  const out = new Set<string>(EXTRA[key] ?? []);
  for (const [k, v] of Object.entries(EN)) if (k === key || base(k) === key) for (const h of holes(v)) out.add(h);
  if (key !== base(key) || Object.keys(EN).some((k) => base(k) === key && k !== key)) out.add('count');
  return out;
}

describe('translations', () => {
  afterAll(() => setLocale('en'));

  it('every listed language has a file', () => {
    for (const l of LOCALES) expect(files[`../src/i18n/locales/${l.code}.ts`] ?? (l.code === 'en' ? 1 : undefined), l.code).toBeDefined();
  });

  for (const l of LOCALES.filter((l) => l.code !== 'en')) {
    it(`${l.code}: keys exist in English and placeholders match`, () => {
      const msgs = files[`../src/i18n/locales/${l.code}.ts`].default;
      for (const [k, v] of Object.entries(msgs)) {
        expect(base(k) in EN || k in EN || Object.keys(EN).some((e) => base(e) === base(k)), `${l.code} ${k}: unknown key`).toBe(true);
        const allowed = enHoles(base(k));
        for (const h of holes(v)) expect(allowed.has(h), `${l.code} ${k}: unknown placeholder {${h}}`).toBe(true);
      }
    });

    it(`${l.code}: solver steps and cube checks are fully filled in`, async () => {
      await setLocale(l.code);
      const st = applyMoves(solvedState(), "R U R' F2 D L' B U2 R2 F' D2 L U'");
      for (const [id, settings] of [
        ['cfop', { crossColors: ['W', 'Y'], cross: 'advanced', f2l: 'advanced', oll: '2look', pll: '2look' }],
        ['cfop', { crossColors: ['W'], cross: 'standard', f2l: 'standard', oll: 'full', pll: 'full' }],
        ['beginner', { crossColor: 'W' }],
      ] as const) {
        const plan = getMethod(id).solve(st, settings as never);
        for (const s of plan.steps) for (const text of [s.title, s.caseName, s.hint]) if (text) expect(text, text).not.toMatch(/\{\w+\}/);
        expect(plan.note).not.toMatch(/\{\w+\}/);
      }
      const bad = solvedState();
      bad.U[0] = 'R';
      for (const e of validate(bad).errors) expect(e).not.toMatch(/\{\w+\}/);
    });
  }

  it('plural forms and fallbacks', async () => {
    await setLocale('en');
    expect(t('cfop.regrips', { count: 0 })).toBe('no regrip');
    expect(t('cfop.regrips', { count: 1 })).toBe('1 regrip');
    expect(t('cfop.regrips', { count: 3 })).toBe('3 regrips');
    await setLocale('ru');
    expect(t('learn.moves', { count: 1 })).toBe('1 ход');
    expect(t('learn.moves', { count: 3 })).toBe('3 хода');
    expect(t('learn.moves', { count: 7 })).toBe('7 ходов');
    await setLocale('ja');
    expect(t('timer.ok')).toBe('OK'); // not translated: English
  });

  it('picks a language from browser preferences', () => {
    expect(matchLocale(['pt-BR', 'en'])).toBe('pt');
    expect(matchLocale(['zh-CN'])).toBe('zh');
    expect(matchLocale(['ko-KR', 'fr-CA'])).toBe('fr');
    expect(matchLocale(['ko-KR'])).toBe('en');
  });
});
