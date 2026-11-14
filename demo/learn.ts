import 'cubing/twisty';
import { type CubeState, applyMoves, formatAlg, parseAlg, randomMoves, solvedState } from '../src/core/cube';
import { validate } from '../src/core/validate';
import { METHODS, getMethod } from '../src/solve/methods';
import type { SettingValues, SolvePlan, SolveStep } from '../src/solve/types';
import { createNet, decodeCube, encodeCube } from './net';
import { renderSettings, savedMethod, valuesFor } from './settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
/** The parts of cubing.js's TwistyPlayer used here. */
type Player = HTMLElement & {
  alg: string;
  experimentalSetupAlg: string;
  experimentalStickeringMaskOrbits: string;
  timestamp: number | 'start' | 'end';
  experimentalModel: {
    currentMoveInfo: { addFreshListener(f: (info: { patternIndex: number; movesFinishing: unknown[] }) => void): void };
    indexer: { get(): Promise<{ indexToMoveStartTimestamp(i: number): number; numAnimatedLeaves(): number }> };
  };
};
const player = $('player') as Player;
const status = $('status');
const summary = $('summary');
const breakdown = $('breakdown');
const stepsEl = $('steps');
const btnCopy = $<HTMLButtonElement>('btn-copy');
const methodSel = $<HTMLSelectElement>('method');

let method = getMethod(savedMethod() ?? 'cfop');
let settings: SettingValues = valuesFor(method);
let scramble: string | undefined; // set when the cube came from a typed scramble
let plan: SolvePlan | null = null;
let planScramble = '';
/** What the viewer shows: the whole solve, or one step (index into plan.steps). */
let view: 'whole' | number = 'whole';
/** Position in the whole solve, in moves (rotations count, as in the viewer). */
let pos = 0;
let offsets: number[] = []; // where each step starts in the whole solve
let total = 0;
let loadSeq = 0;
/** While a view loads, ignore viewer reports until it reaches this move (then null). */
let expect: number | null = null;
let ready = false;
let requestId = 0;

const net = createNet($('net'), $('palette'), () => {
  scramble = undefined;
  onCubeChange();
});

// --- method + settings
for (const m of METHODS) methodSel.add(new Option(m.name, m.id, false, m.id === method.id));
methodSel.add(new Option('More coming…', '', false, false));
methodSel.options[methodSel.options.length - 1].disabled = true;
methodSel.onchange = () => {
  method = getMethod(methodSel.value);
  settings = valuesFor(method);
  drawSettings();
  solve();
};
function drawSettings() {
  renderSettings($('settings'), method, settings, (v) => {
    settings = v;
    solve();
  });
}
drawSettings();

// --- cube input
function onCubeChange() {
  history.replaceState(null, '', scramble ? `#scramble=${encodeURIComponent(scramble)}` : `#cube=${encodeCube(net.get())}`);
  solve();
}

$('btn-solved').onclick = () => {
  scramble = undefined;
  net.set(solvedState());
  onCubeChange();
};
$('btn-random').onclick = () => {
  scramble = formatAlg(randomMoves(20));
  ($('scramble-in') as HTMLInputElement).value = scramble;
  net.set(applyMoves(solvedState(), scramble));
  onCubeChange();
};
$('scramble-form').onsubmit = (e) => {
  e.preventDefault();
  const text = ($('scramble-in') as HTMLInputElement).value.trim();
  try {
    const moves = parseAlg(text);
    scramble = formatAlg(moves);
    net.set(applyMoves(solvedState(), moves));
    onCubeChange();
  } catch (err) {
    status.className = 'status bad';
    status.textContent = (err as Error).message;
  }
};

function checkCube(): boolean {
  const v = validate(net.get());
  status.innerHTML = '';
  if (v.ok) {
    status.className = 'status ok';
    status.textContent = 'Valid cube ✓';
    return true;
  }
  status.className = 'status bad';
  const ul = document.createElement('ul');
  for (const e of v.errors) ul.append(Object.assign(document.createElement('li'), { textContent: e }));
  status.append(ul);
  return false;
}

// --- solving (in the worker: the scramble for the viewer needs the Kociemba tables)
const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
worker.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'ready') {
    ready = true;
    solve();
    return;
  }
  if (d.id !== requestId) return;
  if (d.type === 'error') {
    plan = null;
    summary.textContent = d.message;
    renderPlan();
    return;
  }
  if (d.type === 'plan') {
    plan = d.plan as SolvePlan;
    planScramble = d.scramble as string;
    renderPlan();
  }
};

function solve() {
  if (!checkCube()) {
    plan = null;
    summary.textContent = 'Fix the cube to see a solution.';
    renderPlan();
    return;
  }
  if (!ready) return;
  requestId++;
  summary.textContent = 'Solving…';
  worker.postMessage({ id: requestId, kind: 'learn', state: net.get() as CubeState, method: method.id, settings, scramble });
}

// --- output
const STAGE_LABEL: Record<string, string> = { cross: 'Cross', f2l: 'F2L', oll: 'OLL', pll: 'PLL' };

function renderPlan() {
  stepsEl.innerHTML = '';
  breakdown.innerHTML = '';
  btnCopy.disabled = !plan;
  offsets = [];
  total = 0;
  if (!plan) {
    void load('whole', 0);
    return;
  }
  for (const s of plan.steps) {
    offsets.push(total);
    total += tokens(s.alg).length;
  }
  summary.textContent = plan.moves ? `${plan.moves} moves. ${plan.note ?? ''}` : 'Already solved.';
  const byStage = new Map<string, number>();
  for (const s of plan.steps) byStage.set(s.stage, (byStage.get(s.stage) ?? 0) + s.moves);
  for (const [stage, n] of byStage) {
    const b = document.createElement('span');
    b.className = `stage-tag stage-${stage}`;
    b.textContent = `${STAGE_LABEL[stage] ?? stage} ${n}`;
    breakdown.append(b);
  }
  plan.steps.forEach((s, i) => stepsEl.append(stepItem(s, i)));
  void load('whole', 0);
}

function stepItem(s: SolveStep, i: number): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'step';
  li.dataset.stage = s.stage;
  const btn = document.createElement('button');
  btn.className = 'step-btn';
  // Keep the exact move if the whole solve is currently inside this step.
  btn.onclick = () => void load(i, stepAt(pos) === i ? pos : offsets[i]);
  const head = document.createElement('div');
  head.className = 'step-head';
  const tag = Object.assign(document.createElement('span'), { className: `stage-tag stage-${s.stage}`, textContent: STAGE_LABEL[s.stage] ?? s.stage });
  const title = Object.assign(document.createElement('span'), { className: 'step-title', textContent: s.title });
  const count = Object.assign(document.createElement('span'), { className: 'muted step-count', textContent: s.moves ? `${s.moves} moves` : 'skip' });
  head.append(tag, title, count);
  btn.append(head);
  if (s.caseName) btn.append(Object.assign(document.createElement('div'), { className: 'step-case', textContent: s.caseName }));
  if (s.alg) btn.append(Object.assign(document.createElement('code'), { className: 'step-alg', textContent: s.alg }));
  if (s.hint) btn.append(Object.assign(document.createElement('div'), { className: 'hint step-hint', textContent: s.hint }));
  li.append(btn);
  return li;
}

/** All pieces shown normally (a mask, once set, overrides the plain stickering setting). */
const FULL_MASK = 'EDGES:------------,CORNERS:--------,CENTERS:------';

// Step highlighting (grey out pieces the step doesn't work on), remembered per browser.
const HIGHLIGHT_KEY = 'learn.highlight';
let highlight = true;
try {
  highlight = localStorage.getItem(HIGHLIGHT_KEY) !== 'off';
} catch {
  /* storage unavailable: default on */
}
const optHighlight = $<HTMLInputElement>('opt-highlight');
optHighlight.checked = highlight;
optHighlight.onchange = () => {
  highlight = optHighlight.checked;
  try {
    localStorage.setItem(HIGHLIGHT_KEY, highlight ? 'on' : 'off');
  } catch {
    /* not remembered */
  }
  if (plan && view !== 'whole') {
    const mask = plan.steps[view].mask;
    player.experimentalStickeringMaskOrbits = highlight && mask ? mask : FULL_MASK;
  }
};

const tokens = (alg: string) => alg.split(/\s+/).filter(Boolean);
const len = (i: number) => tokens(plan!.steps[i].alg).length;

/** Step that a whole-solve position falls in (a step with moves), or -1. */
function stepAt(g: number): number {
  if (!plan) return -1;
  let last = -1;
  for (let i = 0; i < plan.steps.length; i++) {
    if (!len(i)) continue;
    if (g >= offsets[i] && g < offsets[i] + len(i)) return i;
    if (offsets[i] + len(i) <= g) last = i;
  }
  return last;
}

/**
 * Show the whole solve or one step, placed at whole-solve position `g` (in a step view the
 * position is clamped to that step).
 */
async function load(next: 'whole' | number, g: number) {
  view = next;
  pos = g;
  const seq = ++loadSeq;
  expect = -1; // ignore reports about the half-loaded view
  const steps = plan?.steps ?? [];
  if (!plan) {
    player.experimentalSetupAlg = '';
    player.alg = '';
    player.experimentalStickeringMaskOrbits = FULL_MASK;
  } else if (next === 'whole') {
    player.experimentalSetupAlg = planScramble;
    player.alg = steps.map((s) => s.alg).filter(Boolean).join(' ');
    player.experimentalStickeringMaskOrbits = FULL_MASK;
  } else {
    player.experimentalSetupAlg = [planScramble, ...steps.slice(0, next).map((s) => s.alg)].filter(Boolean).join(' ');
    player.alg = steps[next].alg;
    if (highlight && steps[next].mask) player.experimentalStickeringMaskOrbits = steps[next].mask!;
    else player.experimentalStickeringMaskOrbits = FULL_MASK;
  }
  renderNav();
  const local = next === 'whole' ? g : Math.min(Math.max(g - offsets[next], 0), len(next));
  const indexer = await player.experimentalModel.indexer.get();
  if (seq !== loadSeq) return;
  const atEnd = local >= indexer.numAnimatedLeaves();
  expect = atEnd ? indexer.numAnimatedLeaves() : local;
  setTimeout(() => seq === loadSeq && (expect = null), 1000);
  player.timestamp = atEnd ? 'end' : indexer.indexToMoveStartTimestamp(local);
  pos = next === 'whole' ? local : offsets[next] + local;
  renderNow();
}

// Follow the viewer as it plays or is scrubbed.
// Moves done = patternIndex, plus a move that has just finished exactly at this timestamp.
player.experimentalModel.currentMoveInfo.addFreshListener(({ patternIndex, movesFinishing }) => {
  if (!plan) return;
  const done = patternIndex + movesFinishing.length;
  if (expect !== null) {
    if (done !== expect) return;
    expect = null;
  }
  pos = view === 'whole' ? done : offsets[view] + Math.min(done, len(view));
  renderNow();
});

function renderNav() {
  const whole = view === 'whole';
  const btnWhole = $<HTMLButtonElement>('btn-whole');
  btnWhole.setAttribute('aria-pressed', String(whole));
  btnWhole.classList.toggle('on', whole);
  btnWhole.disabled = !plan;
  const cur = whole ? stepAt(pos) : view;
  $<HTMLButtonElement>('btn-prev').disabled = !plan || prevStep(cur as number) < 0 && !(whole && pos > 0);
  $<HTMLButtonElement>('btn-next').disabled = !plan || nextStep(cur as number) < 0;
  [...stepsEl.children].forEach((el, k) => el.classList.toggle('active', !whole && k === view));
}

const nextStep = (i: number) => {
  for (let k = i + 1; k < (plan?.steps.length ?? 0); k++) if (len(k)) return k;
  return -1;
};
const prevStep = (i: number) => {
  for (let k = i - 1; k >= 0; k--) if (len(k)) return k;
  return -1;
};

/** The bar above the viewer: which step is playing and which move. */
function renderNow() {
  const now = $('now');
  now.innerHTML = '';
  const cur = view === 'whole' ? stepAt(pos) : view;
  [...stepsEl.children].forEach((el, k) => el.classList.toggle('playing', view === 'whole' && k === cur));
  if (view === 'whole') keepVisible(cur);
  renderNav();
  if (!plan || cur < 0) {
    now.textContent = plan ? 'Nothing to do: the cube is solved.' : '';
    return;
  }
  const s = plan.steps[cur];
  const head = document.createElement('div');
  head.className = 'now-head';
  head.append(
    Object.assign(document.createElement('span'), { className: `stage-tag stage-${s.stage}`, textContent: STAGE_LABEL[s.stage] ?? s.stage }),
    Object.assign(document.createElement('span'), { className: 'now-title', textContent: s.title }),
  );
  const done = Math.min(Math.max(pos - offsets[cur], 0), len(cur));
  head.append(
    Object.assign(document.createElement('span'), {
      className: 'muted now-count',
      textContent: `${view === 'whole' ? 'Whole solve · ' : ''}step ${cur + 1}/${plan.steps.length} · move ${done}/${len(cur)}`,
    }),
  );
  now.append(head);
  if (s.caseName) now.append(Object.assign(document.createElement('div'), { className: 'now-case', textContent: s.caseName }));
  const alg = document.createElement('div');
  alg.className = 'now-alg';
  tokens(s.alg).forEach((t, k) => {
    alg.append(Object.assign(document.createElement('span'), { className: k < done ? 'done' : k === done ? 'current' : '', textContent: t }), ' ');
  });
  now.append(alg);
}

/** Keep the playing step in view inside the (scrollable) step list, without moving the page. */
function keepVisible(i: number) {
  const el = stepsEl.children[i] as HTMLElement | undefined;
  if (!el || stepsEl.scrollHeight <= stepsEl.clientHeight) return;
  const top = el.offsetTop - stepsEl.offsetTop;
  if (top < stepsEl.scrollTop || top + el.offsetHeight > stepsEl.scrollTop + stepsEl.clientHeight) {
    stepsEl.scrollTo({ top: top - 8, behavior: 'smooth' });
  }
}

$('btn-whole').onclick = () => void load('whole', pos);
$('btn-prev').onclick = () => {
  if (view === 'whole') {
    const cur = stepAt(pos);
    // Back to the start of this step, or to the previous step if already there.
    const target = cur >= 0 && pos > offsets[cur] && pos < offsets[cur] + len(cur) ? cur : prevStep(cur);
    void load('whole', target >= 0 ? offsets[target] : 0);
  } else {
    const p = prevStep(view);
    if (p >= 0) void load(p, offsets[p]);
  }
};
$('btn-next').onclick = () => {
  const cur = view === 'whole' ? stepAt(pos) : view;
  const n = nextStep(cur);
  if (n >= 0) void load(view === 'whole' ? 'whole' : n, offsets[n]);
};

btnCopy.onclick = async () => {
  if (!plan) return;
  const text = plan.steps.filter((s) => s.alg).map((s) => `${s.alg} // ${s.title}${s.caseName ? ` (${s.caseName})` : ''}`).join('\n');
  await navigator.clipboard.writeText(`Scramble: ${planScramble}\n${text}`);
  btnCopy.textContent = 'Copied';
  setTimeout(() => (btnCopy.textContent = 'Copy'), 1200);
};

// Cube from the URL: #cube=<54 letters> (scanner, scramble page) or #scramble=<moves> (timer).
const hash = location.hash;
const cubeFromHash = decodeCube(/cube=([A-Z]{54})/.exec(hash)?.[1] ?? '');
const scrFromHash = /scramble=([^&]+)/.exec(hash)?.[1];
if (cubeFromHash) net.set(cubeFromHash);
else if (scrFromHash) {
  try {
    scramble = formatAlg(parseAlg(decodeURIComponent(scrFromHash)));
    ($('scramble-in') as HTMLInputElement).value = scramble;
    net.set(applyMoves(solvedState(), scramble));
  } catch {
    scramble = undefined;
  }
} else {
  scramble = formatAlg(randomMoves(20));
  ($('scramble-in') as HTMLInputElement).value = scramble;
  net.set(applyMoves(solvedState(), scramble));
}
checkCube();
