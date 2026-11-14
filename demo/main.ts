import 'cubing/twisty';
import {
  COLORS,
  type Color,
  type CubeState,
  FACES,
  type FaceName,
  applyMoves,
  cloneState,
  randomMoves,
  solvedState,
  toColorArray,
} from '../src/core/cube';
import { validate } from '../src/core/validate';

const COLOR_NAMES: Record<Color, string> = { W: 'White', Y: 'Yellow', G: 'Green', B: 'Blue', R: 'Red', O: 'Orange' };

// Net layout in a 12 × 9 grid: [row, col] of each face's top-left sticker.
const NET_POS: Record<FaceName, [number, number]> = {
  U: [0, 3],
  L: [3, 0],
  F: [3, 3],
  R: [3, 6],
  B: [3, 9],
  D: [6, 3],
};

let state: CubeState = solvedState();
let paint: Color = 'W';
let solverReady = false;
let requestId = 0;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const net = $('net');
const palette = $('palette');
const status = $('status');
const btnGenerate = $<HTMLButtonElement>('btn-generate');
const btnCopy = $<HTMLButtonElement>('btn-copy');
const scrambleEl = $('scramble');
const meta = $('meta');
const player = $('player') as HTMLElement & { alg: string };

// --- palette
for (const c of COLORS) {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.dataset.color = c;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-label', COLOR_NAMES[c]);
  b.title = COLOR_NAMES[c];
  b.onclick = () => {
    paint = c;
    renderPalette();
  };
  palette.append(b);
}
function renderPalette() {
  for (const b of palette.querySelectorAll<HTMLButtonElement>('.swatch')) {
    const on = b.dataset.color === paint;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-checked', String(on));
  }
}

// --- net
const cells: Record<FaceName, HTMLButtonElement[]> = { U: [], R: [], F: [], D: [], L: [], B: [] };
for (const f of FACES) {
  const [r0, c0] = NET_POS[f];
  for (let i = 0; i < 9; i++) {
    const b = document.createElement('button');
    b.className = 'sticker';
    b.style.gridRow = String(r0 + Math.floor(i / 3) + 1);
    b.style.gridColumn = String(c0 + (i % 3) + 1);
    if (i === 4) {
      b.classList.add('center');
      b.textContent = f;
      b.disabled = true;
    } else {
      b.onclick = () => {
        state = cloneState(state);
        state[f][i] = paint;
        onStateChange();
      };
    }
    cells[f].push(b);
    net.append(b);
  }
}

function renderNet() {
  for (const f of FACES) cells[f].forEach((b, i) => (b.dataset.color = state[f][i]));
}

function renderStatus() {
  const v = validate(state);
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
}

function onStateChange() {
  renderNet();
  renderStatus();
  clearOutput();
}

$('btn-solved').onclick = () => {
  state = solvedState();
  onStateChange();
};
$('btn-random').onclick = () => {
  state = applyMoves(solvedState(), randomMoves(30));
  onStateChange();
};

// --- solver worker
const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
worker.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'ready') {
    solverReady = true;
    btnGenerate.textContent = 'Generate scramble';
    renderStatus();
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
};

btnGenerate.onclick = () => {
  if (!renderStatus()) return;
  requestId++;
  btnGenerate.disabled = true;
  btnGenerate.textContent = 'Solving…';
  worker.postMessage({ id: requestId, state });
};

btnCopy.onclick = async () => {
  await navigator.clipboard.writeText(scrambleEl.textContent ?? '');
  btnCopy.textContent = 'Copied';
  setTimeout(() => (btnCopy.textContent = 'Copy'), 1200);
};

renderPalette();
onStateChange();
// Expose for debugging in the console.
Object.assign(window, { getState: () => toColorArray(state).join('') });
