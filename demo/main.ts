import { lang } from './i18n';
import 'cubing/twisty';
import { t } from '../src/i18n';
import { type CubeState, applyMoves, randomMoves, solvedState } from '../src/core/cube';
import { validate } from '../src/core/validate';
import type { ReadCubeResult } from '../src/scan/readCube';
import { createNet, decodeCube, encodeCube, renderNetView } from './net';

let solverReady = false;
let requestId = 0;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status');
const btnGenerate = $<HTMLButtonElement>('btn-generate');
const btnCopy = $<HTMLButtonElement>('btn-copy');
const scrambleEl = $('scramble');
const meta = $('meta');
const player = $('player') as HTMLElement & { alg: string };

const net = createNet($('net'), $('palette'), () => {
  source = 'manual';
  onStateChange();
});
/** Where the cube on the net came from, passed on to the timer. */
let source: 'scan' | 'manual' = 'manual';
let state = (): CubeState => net.get();

function renderStatus() {
  const v = validate(state());
  if (v.ok) {
    status.className = 'status ok';
    status.textContent = t('common.validCube');
  } else {
    status.className = 'status bad';
    status.innerHTML = '';
    const ul = document.createElement('ul');
    for (const e of v.errors) {
      const li = document.createElement('li');
      li.textContent = e;
      ul.append(li);
    }
    status.append(ul);
  }
  btnGenerate.disabled = !solverReady || !v.ok;
  return v.ok;
}

function clearOutput() {
  scrambleEl.textContent = '—';
  meta.textContent = '';
  btnCopy.disabled = true;
  player.alg = '';
  $('btn-time').classList.add('hidden');
  $('btn-learn').classList.add('hidden');
}

function onStateChange() {
  renderStatus();
  clearOutput();
  history.replaceState(null, '', `#cube=${encodeCube(state())}`);
}

function setCube(s: CubeState, from: 'scan' | 'manual', generate = false) {
  net.set(s);
  source = from;
  if (from === 'manual') hideReview();
  onStateChange();
  if (generate && solverReady && renderStatus()) btnGenerate.click();
}

function newRandom() {
  setCube(applyMoves(solvedState(), randomMoves(30)), 'manual', true);
  renderNetView($('preview'), state());
}
$('btn-solved').onclick = () => setCube(solvedState(), 'manual');
$('btn-random').onclick = newRandom;

// --- tabs: Scan / Edit / Random. The scanner code (and its vision worker) loads on first use.
type Tab = 'scan' | 'edit' | 'random';
let tab: Tab | null = null;
let scanner: Promise<typeof import('./scan')> | null = null;

function showTab(t: Tab) {
  if (t === tab) return;
  if (tab === 'scan') void scanner?.then((m) => m.pauseScanner());
  tab = t;
  for (const name of ['scan', 'edit', 'random'] as Tab[]) {
    const on = name === t;
    const b = $(`tab-${name}`);
    b.setAttribute('aria-selected', String(on));
    $(b.dataset.panel!).classList.toggle('hidden', !on);
  }
  $('count').classList.toggle('hidden', t !== 'scan');
  status.classList.toggle('hidden', t === 'scan');
  if (t === 'scan')
    scanner ??= import('./scan').then((m) => {
      m.initScanner({ onCube: onScanned, onIncomplete: hideReview });
      return m;
    });
  // Random: a fresh cube each time the tab is opened.
  if (t === 'random') newRandom();
}
$('tab-scan').onclick = () => showTab('scan');
$('tab-edit').onclick = () => showTab('edit');
$('tab-random').onclick = () => showTab('random');

const reviewEl = $('review');
const reviewSummary = $('review-summary');
const btnAlt = $<HTMLButtonElement>('btn-alt');
let alternatives: CubeState[] = [];
let altIndex = 0;

function hideReview() {
  reviewEl.classList.add('hidden');
  alternatives = [];
}

function onScanned(r: ReadCubeResult) {
  alternatives = r.states;
  altIndex = 0;
  const count = r.combinationsTried.toLocaleString(lang);
  const how = r.usedStrips
    ? t(r.combinationsTried > 1 ? 'review.stripsSearch' : 'review.strips', { n: r.usedStrips, count })
    : t('review.search', { count });
  if (r.states.length === 1) reviewSummary.textContent = t('review.one', { how });
  else if (r.states.length > 1) reviewSummary.textContent = t('review.many', { n: r.states.length, how });
  else reviewSummary.textContent = t('review.none');
  btnAlt.textContent = t('edit.nextPossibility');
  btnAlt.classList.toggle('hidden', r.states.length < 2);
  reviewEl.classList.remove('hidden');
  setCube(r.guess, 'scan', true);
  showTab('edit');
}

btnAlt.onclick = () => {
  if (!alternatives.length) return;
  altIndex = (altIndex + 1) % alternatives.length;
  btnAlt.textContent = t('edit.nextPossibilityN', { i: altIndex + 1, n: alternatives.length });
  setCube(alternatives[altIndex], 'scan', true);
};

// --- solver worker
const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
worker.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'ready') {
    solverReady = true;
    btnGenerate.textContent = t('cube.generate');
    // A cube handed over in the URL: generate straight away.
    if (renderStatus() && (fromHash || tab === 'random')) btnGenerate.click();
    return;
  }
  if (d.id !== requestId) return; // stale
  btnGenerate.textContent = t('cube.generate');
  renderStatus();
  if (d.type === 'error') {
    scrambleEl.textContent = '—';
    meta.textContent = d.message;
    return;
  }
  scrambleEl.textContent = d.scramble || t('cube.alreadySolved');
  meta.textContent = d.moveCount
    ? t('cube.meta', { moves: d.moveCount, ms: d.ms.toFixed(0), solution: d.solution })
    : t('common.cubeSolved');
  btnCopy.disabled = !d.scramble;
  player.alg = d.scramble;
  const btnTime = $<HTMLAnchorElement>('btn-time');
  btnTime.href = `#timer&${new URLSearchParams({ scramble: d.scramble, source })}`;
  btnTime.classList.toggle('hidden', !d.scramble);
  const btnLearn = $<HTMLAnchorElement>('btn-learn');
  btnLearn.href = `#learn&scramble=${encodeURIComponent(d.scramble)}`;
  btnLearn.classList.toggle('hidden', !d.scramble);
};

worker.onerror = () => {
  if (solverReady) return;
  btnGenerate.textContent = t('cube.generate');
  meta.textContent = t('common.solverFailed');
};

btnGenerate.onclick = () => {
  if (!renderStatus()) return;
  requestId++;
  btnGenerate.disabled = true;
  btnGenerate.textContent = t('common.solving');
  worker.postMessage({ id: requestId, state: state(), lang });
};

btnCopy.onclick = async () => {
  try {
    await navigator.clipboard.writeText(scrambleEl.textContent ?? '');
  } catch {
    return; // no clipboard access (insecure page, or permission denied)
  }
  btnCopy.textContent = t('common.copied');
  setTimeout(() => (btnCopy.textContent = t('common.copy')), 1200);
};

// Cube passed in the URL (a shared link): #cube=<54 letters URFDLB>. #scan opens the scanner.
const cubeInHash = () => decodeCube(/cube=([A-Z]{54})/.exec(location.hash)?.[1] ?? '');
const scanInHash = () => /(^#|&)scan\b/.test(location.hash);
const fromHash = cubeInHash();
if (fromHash) net.set(fromHash);
if (location.hash.includes('from=scan')) source = 'scan';
renderStatus();
clearOutput();
showTab(scanInHash() ? 'scan' : 'edit');

/** The Cube tab was opened again (the page stays loaded): follow what the link asked for. */
export function show() {
  const cube = cubeInHash();
  if (scanInHash()) showTab('scan');
  else if (cube && encodeCube(cube) !== encodeCube(state())) setCube(cube, 'manual', true);
  history.replaceState(null, '', `#cube=${encodeCube(state())}`);
}

/** Another tab was opened: the camera must not keep running behind it. */
export function hide() {
  void scanner?.then((m) => m.pauseScanner());
}
Object.assign(window, { cubePage: { getNet: () => encodeCube(net.get()) } });
