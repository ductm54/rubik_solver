import { lang } from './i18n';
import { FACES, applyMoves, solvedState, type CubeState } from '../src/core/cube';
import { t } from '../src/i18n';
import { fromCsTimer, toCsTimer } from '../src/timer/cstimer';
import { TimerMachine, INSPECTION_MS, DNF_AFTER_MS } from '../src/timer/machine';
import { AVERAGES, type Penalty, type Solve, computeStats, formatSolve, formatTime, rollingAverage } from '../src/timer/stats';
import { type SolveStore, openStore } from '../src/timer/store';
import { renderChart } from './chart';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const pad = $('pad');
const clock = $('clock');
const hint = $('hint');
const scrambleEl = $('scramble');
const sourceEl = $('source');
const preview = $('preview');
const btnNew = $<HTMLButtonElement>('btn-new');
const lastEl = $('last');
const lastTime = $('last-time');
const lastNote = $<HTMLInputElement>('last-note');
const optInspection = $<HTMLInputElement>('opt-inspection');
const ioStatus = $('io-status');

// ------------------------------------------------------------------ state

let store: SolveStore;
let solves: Solve[] = [];
let scramble = '';
let source: Solve['source'] = 'random';
let showAll = false;
const machine = new TimerMachine({ inspection: loadPref('inspection', true) });
optInspection.checked = machine.opts.inspection;

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`timer.${key}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function savePref(key: string, v: unknown) {
  try {
    localStorage.setItem(`timer.${key}`, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

// ------------------------------------------------------------------ scrambles

const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
let reqId = 0;
let solverReady = false;
let nextScramble: string | null = null; // pre-generated so a new scramble is instant
worker.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'ready') {
    solverReady = true;
    btnNew.disabled = false;
    if (!scramble) requestRandom(true);
    else requestRandom(false);
    return;
  }
  if (d.type !== 'result') return;
  if (d.id === pendingShow) {
    setScramble(d.scramble, 'random');
    requestRandom(false);
  } else {
    nextScramble = d.scramble;
  }
};
let pendingShow = -1;
function requestRandom(show: boolean) {
  reqId++;
  if (show) pendingShow = reqId;
  worker.postMessage({ id: reqId, kind: 'random' });
}
function newScramble() {
  if (nextScramble) {
    setScramble(nextScramble, 'random');
    nextScramble = null;
    requestRandom(false);
  } else if (solverReady) {
    scrambleEl.textContent = t('timer.generating');
    requestRandom(true);
  }
}

function setScramble(s: string, src: Solve['source']) {
  scramble = s;
  source = src;
  scrambleEl.textContent = s || t('timer.solvedCube');
  ($('btn-learn') as HTMLAnchorElement).href = `./learn.html#scramble=${encodeURIComponent(s)}`;
  sourceEl.textContent = src === 'scan' ? t('timer.fromScan') : src === 'manual' ? t('timer.fromManual') : '';
  sourceEl.classList.toggle('hidden', src === 'random');
  renderPreview(applyMoves(solvedState(), s));
}

function renderPreview(st: CubeState) {
  // tiny net: same layout as the editor
  const pos: Record<string, [number, number]> = { U: [0, 3], L: [3, 0], F: [3, 3], R: [3, 6], B: [3, 9], D: [6, 3] };
  preview.replaceChildren();
  for (const f of FACES) {
    st[f].forEach((c, i) => {
      const s = document.createElement('span');
      s.dataset.color = c;
      s.style.gridRow = String(pos[f][0] + Math.floor(i / 3) + 1);
      s.style.gridColumn = String(pos[f][1] + (i % 3) + 1);
      preview.append(s);
    });
  }
}

// ------------------------------------------------------------------ timing

let raf = 0;
function frame() {
  raf = requestAnimationFrame(frame);
  const t = performance.now();
  machine.tick(t);
  renderClock(t);
}

function renderClock(now: number) {
  const st = machine.state;
  pad.dataset.state = st;
  document.body.classList.toggle('focus', st === 'running' || st === 'inspecting' || st === 'holding' || st === 'ready');
  if (st === 'inspecting' || ((st === 'holding' || st === 'ready') && machine.opts.inspection && inspectingHold)) {
    const used = machine.inspectionElapsed(now);
    const left = Math.ceil((INSPECTION_MS - used) / 1000);
    clock.textContent = used > DNF_AFTER_MS ? 'DNF' : used > INSPECTION_MS ? '+2' : String(left);
    pad.dataset.warn = used > 12000 ? 'yes' : 'no';
    hint.textContent = t(st === 'inspecting' ? 'timer.inspecting' : st === 'ready' ? 'timer.release' : 'timer.keepHolding');
    return;
  }
  pad.dataset.warn = 'no';
  if (st === 'running') {
    clock.textContent = formatTime(machine.elapsed(now)).replace(/\d$/, '');
    hint.textContent = t('timer.tapToStop');
  } else if (st === 'holding' || st === 'ready') {
    clock.textContent = '0.00';
    hint.textContent = t(st === 'ready' ? 'timer.release' : 'timer.keepHolding');
  } else {
    const r = machine.lastResult;
    clock.textContent = r ? formatSolve(r) : '0.00';
    hint.textContent = t(!scramble && source === 'random' ? 'timer.waiting' : machine.opts.inspection ? 'timer.hintInspect' : 'timer.hintStart');
  }
}
let inspectingHold = false;

async function onResult(time: number, penalty: Penalty) {
  const s: Solve = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time,
    penalty,
    scramble,
    date: Date.now(),
    source,
  };
  solves.push(s);
  await store.put(s);
  renderAll();
  newScramble();
}

function press(t: number) {
  // Every saved solve carries its scramble: don't start before there is one.
  if (machine.state === 'idle' && !scramble && source === 'random') return;
  inspectingHold = machine.state === 'inspecting';
  const r = machine.press(t);
  if (r) void onResult(r.time, r.penalty);
}
function release(t: number) {
  const before = machine.state;
  machine.release(t);
  // inspection DNF (held past 17 s) ends the attempt immediately
  if (before === 'ready' && machine.state === 'stopped' && machine.lastResult?.penalty === 'DNF') {
    void onResult(0, 'DNF');
    machine.release(t);
  }
}

// Keys go to the timer unless the user is typing in a text field (checkboxes and buttons don't count).
const typing = (e: Event) =>
  e.target instanceof HTMLTextAreaElement ||
  e.target instanceof HTMLSelectElement ||
  (e.target instanceof HTMLInputElement && !['checkbox', 'button', 'file'].includes(e.target.type));
window.addEventListener('keydown', (e) => {
  if (typing(e)) return;
  if (machine.state === 'running') {
    e.preventDefault();
    press(performance.now());
    return;
  }
  if (e.code === 'Escape') {
    machine.cancel();
    return;
  }
  if (e.code !== 'Space') return;
  e.preventDefault();
  if (e.repeat) return;
  press(performance.now());
});
window.addEventListener('keyup', (e) => {
  if (typing(e)) return;
  if (e.code === 'Space' || machine.state === 'stopped') {
    e.preventDefault();
    release(performance.now());
  }
});
pad.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pad.setPointerCapture(e.pointerId);
  press(performance.now());
});
pad.addEventListener('pointerup', (e) => {
  e.preventDefault();
  release(performance.now());
});
pad.addEventListener('pointercancel', () => machine.cancel());
// While running, a touch anywhere stops the clock.
window.addEventListener('pointerdown', (e) => {
  if (machine.state === 'running' && !pad.contains(e.target as Node)) {
    press(performance.now());
    machine.release(performance.now());
  }
});
pad.addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------------ rendering

function renderAll() {
  renderLast();
  renderStats();
  renderChart($('chart'), $('legend'), $('tooltip'), solves);
  renderTable();
}

function renderLast() {
  const s = solves[solves.length - 1];
  lastEl.classList.toggle('hidden', !s);
  if (!s) return;
  lastTime.textContent = t('timer.last', { time: formatSolve(s) });
  lastNote.value = s.note ?? '';
  for (const b of lastEl.querySelectorAll<HTMLButtonElement>('[data-pen]')) b.classList.toggle('active', b.dataset.pen === s.penalty);
}

function statTile(label: string, value: string, sub?: string) {
  const d = document.createElement('div');
  d.className = 'stat';
  const l = document.createElement('div');
  l.className = 'stat-label';
  l.textContent = label;
  const v = document.createElement('div');
  v.className = 'stat-value';
  v.textContent = value;
  d.append(l, v);
  if (sub) {
    const s = document.createElement('div');
    s.className = 'stat-sub';
    s.textContent = sub;
    d.append(s);
  }
  return d;
}

function renderStats() {
  const st = computeStats(solves);
  const f = (v: number | null) => (v === null ? '—' : formatTime(v));
  const tiles = [
    statTile(t('timer.best'), f(st.best)),
    statTile(t('timer.mean'), f(st.mean), t('timer.solvedOf', { done: st.completed, count: st.count })),
    ...AVERAGES.map((n) => statTile(`ao${n}`, f(st.current[n]), t('timer.bestOf', { time: f(st.bestAvg[n]) }))),
  ];
  $('stats').replaceChildren(...tiles);
}

function renderTable() {
  const tbody = $('solves');
  const ao5 = rollingAverage(solves, 5);
  const ao12 = rollingAverage(solves, 12);
  const rows: HTMLTableRowElement[] = [];
  const limit = showAll ? solves.length : Math.min(solves.length, 50);
  for (let k = 0; k < limit; k++) {
    const i = solves.length - 1 - k;
    const s = solves[i];
    const tr = document.createElement('tr');
    const td = (text: string, cls = '') => {
      const c = document.createElement('td');
      c.textContent = text;
      if (cls) c.className = cls;
      tr.append(c);
      return c;
    };
    td(String(i + 1), 'muted');
    td(formatSolve(s), 'num strong');
    td(ao5[i] === null ? '—' : formatTime(ao5[i]!), 'num');
    td(ao12[i] === null ? '—' : formatTime(ao12[i]!), 'num');
    const sc = td(s.scramble, 'hide-sm scr');
    sc.title = s.scramble + (s.note ? `\n${t('timer.noteLine', { note: s.note })}` : '');
    td(new Date(s.date).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' }), 'hide-sm muted');
    const act = document.createElement('td');
    act.className = 'actions';
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', t('timer.penaltyFor', { i: i + 1 }));
    for (const p of ['none', '+2', 'DNF'] as Penalty[]) {
      const o = document.createElement('option');
      o.value = p;
      o.textContent = p === 'none' ? t('timer.ok') : p;
      o.selected = s.penalty === p;
      sel.append(o);
    }
    sel.onchange = () => void updateSolve(s, { penalty: sel.value as Penalty });
    const del = document.createElement('button');
    del.className = 'ghost small danger';
    del.textContent = '✕';
    del.setAttribute('aria-label', t('timer.deleteSolve', { i: i + 1 }));
    del.onclick = () => void deleteSolve(s);
    act.append(sel, del);
    tr.append(act);
    rows.push(tr);
  }
  tbody.replaceChildren(...rows);
  $('count').textContent = solves.length ? `(${solves.length})` : '';
  $('btn-more').classList.toggle('hidden', showAll || solves.length <= 50);
}

async function updateSolve(s: Solve, patch: Partial<Solve>) {
  Object.assign(s, patch);
  await store.put(s);
  renderAll();
}
async function deleteSolve(s: Solve) {
  solves = solves.filter((x) => x !== s);
  await store.remove(s.id);
  if (!solves.length) machine.lastResult = null;
  renderAll();
}

// ------------------------------------------------------------------ controls

for (const b of lastEl.querySelectorAll<HTMLButtonElement>('[data-pen]')) {
  b.onclick = () => {
    const s = solves[solves.length - 1];
    if (s) void updateSolve(s, { penalty: b.dataset.pen as Penalty });
  };
}
lastNote.onchange = () => {
  const s = solves[solves.length - 1];
  if (s) void updateSolve(s, { note: lastNote.value.trim() || undefined });
};
$('btn-delete-last').onclick = () => {
  const s = solves[solves.length - 1];
  if (s) void deleteSolve(s);
};
btnNew.onclick = () => newScramble();
$('btn-copy-scramble').onclick = () => void navigator.clipboard?.writeText(scramble);
$('btn-more').onclick = () => {
  showAll = true;
  renderTable();
};
optInspection.onchange = () => {
  machine.opts.inspection = optInspection.checked;
  savePref('inspection', optInspection.checked);
  renderClock(performance.now());
};
$('btn-export').onclick = () => {
  const blob = new Blob([toCsTimer(solves)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cstimer-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  ioStatus.textContent = t('timer.exported', { count: solves.length });
};
$<HTMLInputElement>('file-import').onchange = async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const imported = fromCsTimer(await file.text());
    const have = new Set(solves.map((s) => `${s.date}|${s.time}`));
    const fresh = imported.filter((s) => !have.has(`${s.date}|${s.time}`));
    await store.putMany(fresh);
    solves = (await store.list()).slice();
    renderAll();
    const dup = imported.length - fresh.length;
    ioStatus.textContent = t(dup ? 'timer.importedDup' : 'timer.imported', { count: fresh.length, dup });
  } catch (err) {
    ioStatus.textContent = (err as Error).message;
  }
};
$('btn-clear-all').onclick = async () => {
  if (!solves.length || !confirm(t('timer.confirmClear', { count: solves.length }))) return;
  await store.clear();
  solves = [];
  machine.lastResult = null;
  renderAll();
};
new ResizeObserver(() => renderChart($('chart'), $('legend'), $('tooltip'), solves)).observe($('chart'));

// ------------------------------------------------------------------ start

(async () => {
  store = await openStore();
  solves = await store.list();
  $('storage-note').textContent = store.persistent
    ? t('timer.storageOk')
    : t('timer.storageNo');
  // A scramble handed over from the scramble page: #scramble=<alg>&source=scan|manual
  const params = new URLSearchParams(location.hash.slice(1));
  const handed = params.get('scramble');
  if (handed !== null) setScramble(handed, params.get('source') === 'scan' ? 'scan' : 'manual');
  renderAll();
  cancelAnimationFrame(raf);
  frame();
})();

Object.assign(window, { timer: { machine, get solves() { return solves; } } });
