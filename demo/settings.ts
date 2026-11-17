/**
 * Solver settings view, built from a method's setting definitions so new methods get it for
 * free. Values are remembered per method in localStorage (when available).
 */
import { cap, hasKey, t } from '../src/i18n';
import type { MethodDef, SettingDef, SettingValues } from '../src/solve/types';

const tr = (key: string, fallback: string) => (hasKey(key) ? t(key) : fallback);

const KEY = 'learn.settings.v1';

interface Saved {
  method?: string;
  values?: Record<string, SettingValues>;
}

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved;
  } catch {
    return {};
  }
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: settings just aren't remembered */
  }
}

export function savedMethod(): string | undefined {
  return load().method;
}

/** Current values for a method: saved ones merged over the method's defaults. */
export function valuesFor(m: MethodDef): SettingValues {
  const saved = load().values?.[m.id] ?? {};
  const out: SettingValues = { ...m.defaults };
  for (const def of m.settings) {
    const v = saved[def.key];
    const ok = (x: unknown) => def.options.some((o) => o.value === x);
    if (def.kind === 'multi' && Array.isArray(v) && v.length && v.every(ok)) out[def.key] = v;
    if (def.kind === 'choice' && typeof v === 'string' && ok(v)) out[def.key] = v;
  }
  return out;
}

export function storeValues(m: MethodDef, values: SettingValues) {
  const s = load();
  save({ ...s, method: m.id, values: { ...s.values, [m.id]: values } });
}

/** The option controls of one setting (radios or checkboxes); `set` gets the new values on every change. */
export function renderOptions(m: MethodDef, def: SettingDef, get: () => SettingValues, set: (v: SettingValues) => void, group = ''): HTMLElement {
  const opts = document.createElement('div');
  opts.className = def.kind === 'multi' ? 'chips' : 'segmented';
  const colorOpt = def.key === 'crossColors' || def.key === 'crossColor';
  for (const o of def.options) {
    const label = document.createElement('label');
    label.className = def.kind === 'multi' ? 'chip' : 'seg';
    const input = document.createElement('input');
    input.type = def.kind === 'multi' ? 'checkbox' : 'radio';
    input.name = `${group}${m.id}-${def.key}`;
    input.value = o.value;
    const cur = get()[def.key];
    input.checked = Array.isArray(cur) ? cur.includes(o.value) : cur === o.value;
    input.onchange = () => {
      let values = get();
      if (def.kind === 'multi') {
        const picked = [...opts.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value);
        if (!picked.length) {
          input.checked = true; // keep at least one
          return;
        }
        values = { ...values, [def.key]: picked };
      } else values = { ...values, [def.key]: o.value };
      storeValues(m, values);
      set(values);
    };
    label.append(input);
    if (colorOpt) {
      const dot = document.createElement('span');
      dot.className = 'chip-dot';
      dot.dataset.color = o.value;
      label.append(dot);
    }
    label.append(document.createTextNode(colorOpt ? cap(t(`color.${o.value}`)) : tr(`set.${m.id}.${def.key}.${o.value}`, o.label)));
    opts.append(label);
  }
  return opts;
}

/** Render the settings of `m` into `el`; calls onChange with the new values on every change. */
export function renderSettings(el: HTMLElement, m: MethodDef, values: SettingValues, onChange: (v: SettingValues) => void) {
  el.innerHTML = '';
  for (const def of m.settings) {
    const field = document.createElement('fieldset');
    field.className = 'setting';
    const legend = document.createElement('legend');
    legend.textContent = tr(`set.${m.id}.${def.key}.label`, def.label);
    field.append(legend);
    field.append(
      renderOptions(m, def, () => values, (v) => {
        values = v;
        onChange(v);
      }),
    );
    if (def.help) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = tr(`set.${m.id}.${def.key}.help`, def.help);
      field.append(p);
    }
    el.append(field);
  }
}

/** Short "Label: value" summaries of the current settings, for the chips above the solve. */
export function settingChips(m: MethodDef, values: SettingValues): string[] {
  return m.settings.map((def) => {
    const label = tr(`set.${m.id}.${def.key}.label`, def.label);
    const colorOpt = def.key === 'crossColors' || def.key === 'crossColor';
    const name = (v: string) => (colorOpt ? t(`color.${v}`) : tr(`set.${m.id}.${def.key}.${v}`, def.options.find((o) => o.value === v)?.label ?? v));
    const cur = values[def.key];
    return `${label}: ${(Array.isArray(cur) ? cur : [cur]).map(name).join(', ')}`;
  });
}
