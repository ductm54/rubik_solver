import 'cubing/twisty';
import { type CubeState, applyMoves, formatAlg, parseAlg, randomMoves, solvedState } from '../src/core/cube';
import { validate } from '../src/core/validate';
import { METHODS, getMethod } from '../src/solve/methods';
import type { SettingValues, SolvePlan, SolveStep } from '../src/solve/types';
import { createNet, decodeCube, encodeCube } from './net';
import { renderSettings, savedMethod, valuesFor } from './settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
type Player = HTMLElement & {
  alg: string;
  experimentalSetupAlg: string;
  experimentalStickeringMaskOrbits: string;
  experimentalStickering: string;
  jumpToStart(): void;
  play(): void;
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
let current = -1; // -1 = whole solve
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
    current = -1;
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
  if (!plan) {
    showStep(-1);
    return;
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
  showStep(-1);
}

function stepItem(s: SolveStep, i: number): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'step';
  li.dataset.stage = s.stage;
  const btn = document.createElement('button');
  btn.className = 'step-btn';
  btn.onclick = () => showStep(i);
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

/** Show one step in the viewer (from the cube as it is just before it), or the whole solve. */
function showStep(i: number) {
  current = i;
  const steps = plan?.steps ?? [];
  [...stepsEl.children].forEach((el, k) => el.classList.toggle('active', k === i));
  $('step-pos').textContent = !plan ? '' : i < 0 ? 'Whole solve' : `Step ${i + 1} of ${steps.length}`;
  $<HTMLButtonElement>('btn-prev').disabled = !plan || i < 0;
  $<HTMLButtonElement>('btn-next').disabled = !plan || i >= steps.length - 1;
  if (!plan) {
    player.experimentalSetupAlg = '';
    player.alg = '';
    player.experimentalStickering = 'full';
    return;
  }
  if (i < 0) {
    player.experimentalSetupAlg = planScramble;
    player.alg = steps.map((s) => s.alg).filter(Boolean).join(' ');
    player.experimentalStickering = 'full';
    return;
  }
  player.experimentalSetupAlg = [planScramble, ...steps.slice(0, i).map((s) => s.alg)].filter(Boolean).join(' ');
  player.alg = steps[i].alg;
  if (steps[i].mask) player.experimentalStickeringMaskOrbits = steps[i].mask!;
  else player.experimentalStickering = 'full';
  stepsEl.children[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

$('btn-prev').onclick = () => showStep(current - 1);
$('btn-next').onclick = () => showStep(current + 1);

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
