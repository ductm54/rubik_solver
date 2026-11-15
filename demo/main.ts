import 'cubing/twisty';
import { type CubeState, applyMoves, randomMoves, solvedState } from '../src/core/cube';
import { validate } from '../src/core/validate';
import type { ReadCubeResult } from '../src/scan/readCube';
import { createNet, decodeCube, encodeCube } from './net';

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
    status.textContent = 'Valid cube ✓';
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

$('btn-solved').onclick = () => setCube(solvedState(), 'manual');
$('btn-random').onclick = () => setCube(applyMoves(solvedState(), randomMoves(30)), 'manual', true);

// --- scanning: the scanner code (and its vision worker) loads the first time the panel opens
const scanCard = $('scan-card');
const btnScan = $<HTMLButtonElement>('btn-scan');
let scanner: Promise<typeof import('./scan')> | null = null;

function openScan() {
  scanCard.classList.remove('hidden');
  btnScan.classList.add('hidden');
  scanner ??= import('./scan').then((m) => {
    m.initScanner({ onCube: onScanned, onIncomplete: hideReview });
    return m;
  });
  scanCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeScan() {
  scanCard.classList.add('hidden');
  btnScan.classList.remove('hidden');
  void scanner?.then((m) => m.pauseScanner());
}
btnScan.onclick = openScan;
$('btn-scan-close').onclick = closeScan;

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
  const how = r.usedStrips
    ? `Face rotations came from neighbour strips on ${r.usedStrips} of 6 faces${r.combinationsTried > 1 ? `, plus a search of ${r.combinationsTried} combinations` : ''}.`
    : `Each face's rotation was worked out by trying all ${r.combinationsTried.toLocaleString()} combinations.`;
  if (r.states.length === 1) reviewSummary.textContent = `Scanned a valid cube. ${how}`;
  else if (r.states.length > 1)
    reviewSummary.textContent = `${r.states.length} valid cubes match these faces. ${how} Check each one against your cube.`;
  else
    reviewSummary.textContent = `No valid cube matches the scan; a sticker was probably misread. Showing the closest guess: compare it with your cube and fix the wrong stickers.`;
  btnAlt.textContent = 'Next possibility';
  btnAlt.classList.toggle('hidden', r.states.length < 2);
  reviewEl.classList.remove('hidden');
  setCube(r.guess, 'scan', true);
  closeScan();
  $('net').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

btnAlt.onclick = () => {
  if (!alternatives.length) return;
  altIndex = (altIndex + 1) % alternatives.length;
  btnAlt.textContent = `Next possibility (${altIndex + 1}/${alternatives.length})`;
  setCube(alternatives[altIndex], 'scan', true);
};

// --- solver worker
const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
worker.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'ready') {
    solverReady = true;
    btnGenerate.textContent = 'Generate scramble';
    // A cube handed over in the URL: generate straight away.
    if (renderStatus() && fromHash) btnGenerate.click();
    return;
  }
  if (d.id !== requestId) return; // stale
  btnGenerate.textContent = 'Generate scramble';
  renderStatus();
  if (d.type === 'error') {
    scrambleEl.textContent = '—';
    meta.textContent = d.message;
    return;
  }
  scrambleEl.textContent = d.scramble || '(already solved)';
  meta.textContent = d.moveCount
    ? `${d.moveCount} moves · found in ${d.ms.toFixed(0)} ms · solution: ${d.solution}`
    : 'Nothing to do: the cube is solved.';
  btnCopy.disabled = !d.scramble;
  player.alg = d.scramble;
  const btnTime = $<HTMLAnchorElement>('btn-time');
  btnTime.href = `./timer.html#${new URLSearchParams({ scramble: d.scramble, source })}`;
  btnTime.classList.toggle('hidden', !d.scramble);
  const btnLearn = $<HTMLAnchorElement>('btn-learn');
  btnLearn.href = `./learn.html#cube=${encodeCube(state())}`;
  btnLearn.classList.toggle('hidden', !d.scramble);
};

btnGenerate.onclick = () => {
  if (!renderStatus()) return;
  requestId++;
  btnGenerate.disabled = true;
  btnGenerate.textContent = 'Solving…';
  worker.postMessage({ id: requestId, state: state() });
};

btnCopy.onclick = async () => {
  await navigator.clipboard.writeText(scrambleEl.textContent ?? '');
  btnCopy.textContent = 'Copied';
  setTimeout(() => (btnCopy.textContent = 'Copy'), 1200);
};

// Cube passed in the URL (a shared link): #cube=<54 letters URFDLB>. #scan opens the scanner.
const fromHash = decodeCube(/cube=([A-Z]{54})/.exec(location.hash)?.[1] ?? '');
if (fromHash) net.set(fromHash);
if (location.hash.includes('from=scan')) source = 'scan';
renderStatus();
clearOutput();
if (/(^#|&)scan\b/.test(location.hash)) openScan();
Object.assign(window, { cubePage: { getNet: () => encodeCube(net.get()) } });
