import 'cubing/twisty';
import { type CubeState, applyMoves, randomMoves, solvedState } from '../src/core/cube';
import { validate } from '../src/core/validate';
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

const net = createNet($('net'), $('palette'), () => onStateChange());
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

$('btn-solved').onclick = () => {
  net.set(solvedState());
  onStateChange();
};
$('btn-random').onclick = () => {
  net.set(applyMoves(solvedState(), randomMoves(30)));
  onStateChange();
};

// --- solver worker
const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
worker.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'ready') {
    solverReady = true;
    btnGenerate.textContent = 'Generate scramble';
    // A cube handed over from the scanner: generate straight away.
    if (renderStatus() && location.hash.includes('from=scan')) btnGenerate.click();
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
  btnTime.href = `./timer.html#${new URLSearchParams({ scramble: d.scramble, source: cameFromScan ? 'scan' : 'manual' })}`;
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

// Cube passed in the URL (from the scanner, or a shared link): #cube=<54 letters URFDLB>
const cameFromScan = location.hash.includes('from=scan');
const fromHash = decodeCube(/cube=([A-Z]{54})/.exec(location.hash)?.[1] ?? '');
if (fromHash) net.set(fromHash);
renderStatus();
clearOutput();
