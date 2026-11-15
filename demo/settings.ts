/**
 * Solver settings view, built from a method's setting definitions so new methods get it for
 * free. Values are remembered per method in localStorage (when available).
 */
import { cap, hasKey, t } from '../src/i18n';
import type { MethodDef, SettingValues } from '../src/solve/types';

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

/** Render the settings of `m` into `el`; calls onChange with the new values on every change. */
export function renderSettings(el: HTMLElement, m: MethodDef, values: SettingValues, onChange: (v: SettingValues) => void) {
  el.innerHTML = '';
  for (const def of m.settings) {
    const field = document.createElement('fieldset');
    field.className = 'setting';
    const legend = document.createElement('legend');
    legend.textContent = tr(`set.${m.id}.${def.key}.label`, def.label);
    field.append(legend);
    const opts = document.createElement('div');
    opts.className = def.kind === 'multi' ? 'chips' : 'segmented';
    for (const o of def.options) {
      const label = document.createElement('label');
      label.className = def.kind === 'multi' ? 'chip' : 'seg';
      const input = document.createElement('input');
      input.type = def.kind === 'multi' ? 'checkbox' : 'radio';
      input.name = `${m.id}-${def.key}`;
      input.value = o.value;
      const cur = values[def.key];
      input.checked = Array.isArray(cur) ? cur.includes(o.value) : cur === o.value;
      input.onchange = () => {
        if (def.kind === 'multi') {
          const picked = [...opts.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value);
          if (!picked.length) {
            input.checked = true; // keep at least one
            return;
          }
          values = { ...values, [def.key]: picked };
        } else values = { ...values, [def.key]: o.value };
        storeValues(m, values);
        onChange(values);
      };
      label.append(input);
      if (def.key === 'crossColors' || def.key === 'crossColor') {
        const dot = document.createElement('span');
        dot.className = 'chip-dot';
        dot.dataset.color = o.value;
        label.append(dot);
      }
      const colorOpt = def.key === 'crossColors' || def.key === 'crossColor';
      label.append(document.createTextNode(colorOpt ? cap(t(`color.${o.value}`)) : tr(`set.${m.id}.${def.key}.${o.value}`, o.label)));
      opts.append(label);
    }
    field.append(opts);
    if (def.help) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = tr(`set.${m.id}.${def.key}.help`, def.help);
      field.append(p);
    }
    el.append(field);
  }
}
