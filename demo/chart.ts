/**
 * Solve history chart (SVG): singles as a muted line with dots, ao5 and ao12 as coloured lines.
 * One y-axis (seconds), hairline grid, legend + end labels, crosshair tooltip on hover.
 */
import { t } from '../src/i18n';
import { type Solve, effective, formatTime, rollingAverage } from '../src/timer/stats';

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

export function renderChart(container: HTMLElement, legend: HTMLElement, tooltip: HTMLElement, solves: Solve[]) {
  const series = [
    { key: 'single', label: t('chart.single'), cls: 'mark-single' },
    { key: 'ao5', label: 'ao5', cls: 'mark-s1' },
    { key: 'ao12', label: 'ao12', cls: 'mark-s2' },
  ] as const;
  legend.replaceChildren(
    ...series.map((s) => {
      const item = document.createElement('span');
      item.className = 'legend-item';
      const key = document.createElement('span');
      key.className = `legend-key ${s.cls}`;
      item.append(key, s.label);
      return item;
    }),
  );

  container.replaceChildren();
  if (solves.length < 2) {
    const p = document.createElement('p');
    p.className = 'hint empty';
    p.textContent = t('chart.empty');
    container.append(p);
    return;
  }

  const W = Math.max(280, container.clientWidth);
  const H = 220;
  const m = { l: 40, r: 64, t: 12, b: 26 };
  const singles = solves.map(effective).map((t) => (Number.isFinite(t) ? t / 1000 : null));
  const raw5 = rollingAverage(solves, 5);
  const raw12 = rollingAverage(solves, 12);
  const ao5 = raw5.map((t) => (t !== null && Number.isFinite(t) ? t / 1000 : null));
  const ao12 = raw12.map((t) => (t !== null && Number.isFinite(t) ? t / 1000 : null));
  const vals = [...singles, ...ao5, ...ao12].filter((v): v is number => v !== null);
  if (!vals.length) return;
  let lo = vals.reduce((a, b) => Math.min(a, b), Infinity);
  let hi = vals.reduce((a, b) => Math.max(a, b), -Infinity);
  const pad = (hi - lo) * 0.08 || 1;
  lo = Math.max(0, lo - pad);
  hi += pad;
  const n = solves.length;
  const x = (i: number) => m.l + (n === 1 ? 0 : (i / (n - 1)) * (W - m.l - m.r));
  const y = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);

  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('chart.label') });
  // grid + y labels
  for (const v of niceTicks(lo, hi)) {
    svg.append(el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'grid' }));
    const t = el('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis-label' });
    t.textContent = v >= 60 ? formatTime(v * 1000).replace(/\.\d+$/, '') : `${+v.toFixed(2)}`;
    svg.append(t);
  }
  // x labels: first and last solve number
  for (const i of [0, n - 1]) {
    const t = el('text', { x: x(i), y: H - 8, 'text-anchor': i ? 'end' : 'start', class: 'axis-label' });
    t.textContent = `#${i + 1}`;
    svg.append(t);
  }

  const path = (arr: (number | null)[]) => {
    let d = '';
    let pen = false;
    arr.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  svg.append(el('path', { d: path(singles), class: 'line mark-single' }));
  if (n <= 60) {
    singles.forEach((v, i) => v !== null && svg.append(el('circle', { cx: x(i), cy: y(v), r: 3.5, class: 'dot mark-single' })));
  }
  svg.append(el('path', { d: path(ao5), class: 'line thick mark-s1' }));
  svg.append(el('path', { d: path(ao12), class: 'line thick mark-s2' }));

  // end labels for the averages (nudged apart if they collide)
  const ends: { label: string; v: number; cls: string }[] = [];
  const last = (arr: (number | null)[]) => [...arr].reverse().find((v) => v !== null) ?? null;
  const a5 = last(ao5);
  const a12 = last(ao12);
  if (a5 !== null) ends.push({ label: `ao5 ${a5.toFixed(2)}`, v: a5, cls: 'mark-s1' });
  if (a12 !== null) ends.push({ label: `ao12 ${a12.toFixed(2)}`, v: a12, cls: 'mark-s2' });
  ends.sort((a, b) => y(a.v) - y(b.v));
  let prevY = -Infinity;
  for (const e of ends) {
    const yy = Math.max(y(e.v) + 4, prevY + 13);
    prevY = yy;
    const t = el('text', { x: W - m.r + 6, y: yy, class: 'end-label' });
    t.textContent = e.label;
    svg.append(t);
  }

  // hover layer
  const cross = el('line', { y1: m.t, y2: H - m.b, class: 'crosshair', visibility: 'hidden' });
  const hl = series.map((s) => el('circle', { r: 5, class: `dot hl ${s.cls}`, visibility: 'hidden' }));
  svg.append(cross, ...hl);
  const hit = el('rect', { x: m.l - 8, y: 0, width: W - m.l - m.r + 16, height: H, fill: 'transparent' });
  svg.append(hit);
  const show = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const px = ev.clientX - r.left;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1))));
    cross.setAttribute('x1', String(x(i)));
    cross.setAttribute('x2', String(x(i)));
    cross.setAttribute('visibility', 'visible');
    [singles, ao5, ao12].forEach((arr, k) => {
      const v = arr[i];
      hl[k].setAttribute('visibility', v === null ? 'hidden' : 'visible');
      if (v !== null) {
        hl[k].setAttribute('cx', String(x(i)));
        hl[k].setAttribute('cy', String(y(v)));
      }
    });
    const fmt = (v: number | null, raw: number | null) => (v !== null ? formatTime(v * 1000) : raw === null ? '—' : 'DNF');
    const ro5 = raw5[i];
    const ro12 = raw12[i];
    tooltip.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'tt-title';
    title.textContent = t('chart.solve', { n: i + 1 });
    tooltip.append(title);
    for (const [k, s] of series.entries()) {
      const row = document.createElement('div');
      row.className = 'tt-row';
      const key = document.createElement('span');
      key.className = `legend-key ${s.cls}`;
      const val = document.createElement('span');
      val.className = 'tt-val';
      val.textContent = k === 0 ? fmt(singles[i], 0) : k === 1 ? fmt(ao5[i], ro5) : fmt(ao12[i], ro12);
      row.append(key, s.label, val);
      tooltip.append(row);
    }
    tooltip.classList.remove('hidden');
    const tw = tooltip.offsetWidth;
    const left = ev.clientX + 14 + tw > window.innerWidth ? ev.clientX - 14 - tw : ev.clientX + 14;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${ev.clientY + 12}px`;
  };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    hl.forEach((h) => h.setAttribute('visibility', 'hidden'));
    tooltip.classList.add('hidden');
  });
  container.append(svg);
}
