import { lang } from './i18n';
import 'cubing/twisty';
import { t } from '../src/i18n';
import { type CubeState, applyMoves, formatAlg, parseAlg, randomMoves, solvedState } from '../src/core/cube';
import { validate } from '../src/core/validate';
import { METHODS, getMethod } from '../src/solve/methods';
import type { SettingValues, SolvePlan, SolveStep } from '../src/solve/types';
import { createNet, decodeCube, encodeCube, renderNetView } from './net';
import { renderSettings, savedMethod, settingChips, valuesFor } from './settings';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') =>
  Object.assign(document.createElement(tag), { className, textContent: text });

/** The parts of cubing.js's TwistyPlayer used here. */
type Player = HTMLElement & {
  alg: string;
  experimentalSetupAlg: string;
  experimentalStickeringMaskOrbits: string;
  timestamp: number | 'start' | 'end';
  play(): void;
  pause(): void;
  experimentalModel: {
    currentMoveInfo: { addFreshListener(f: (info: { patternIndex: number; movesFinishing: unknown[] }) => void): void };
    coarseTimelineInfo: { addFreshListener(f: (info: { playing: boolean; atStart: boolean; atEnd: boolean }) => void): void };
    indexer: { get(): Promise<{ indexToMoveStartTimestamp(i: number): number; numAnimatedLeaves(): number }> };
  };
};
const player = $<Player>('player');
const status = $('status');
const summary = $('summary');
const note = $('note');
const stepsEl = $('steps');
const segsEl = $('segs');
const groupsEl = $('groups');
const toksEl = $('toks');
const btnCopy = $<HTMLButtonElement>('btn-copy');
const btnPlay = $<HTMLButtonElement>('btn-play');
const methodSel = $<HTMLSelectElement>('method');
const scrambleIn = $<HTMLInputElement>('scramble-in');

let method = getMethod(savedMethod() ?? 'cfop');
let settings: SettingValues = valuesFor(method);
let scramble: string | undefined; // set when the cube came from a typed scramble
let plan: SolvePlan | null = null;
let planScramble = '';
/** The step shown (index into plan.steps) and how many of its moves are done. */
let sel = 0;
let mv = 0;
let playing = false;
let loop = false;
let loadSeq = 0;
/** While a step loads, ignore viewer reports until it reaches this move (then null). */
let expect: number | null = null;
let ready = false;
let requestId = 0;

// ---------------------------------------------------------------- setup panel
const setupPanel = $('setup-panel');
const btnSetup = $<HTMLButtonElement>('btn-setup');
function setSetupOpen(open: boolean) {
  setupPanel.hidden = !open;
  btnSetup.setAttribute('aria-expanded', String(open));
  $('setup-label').textContent = t(open ? 'learn.closeSetup' : 'learn.editSetup');
}
btnSetup.onclick = () => setSetupOpen(setupPanel.hidden);

const net = createNet($('net'), $('palette'), () => {
  scramble = undefined;
  scrambleIn.value = '';
  onCubeChange();
});

// ---------------------------------------------------------------- method + settings
for (const m of METHODS) methodSel.add(new Option(t(`method.${m.id}.name`), m.id, false, m.id === method.id));
methodSel.add(new Option(t('learn.moreComing'), '', false, false));
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
    drawChips();
    solve();
  });
  drawChips();
}
function drawChips() {
  $('chips').replaceChildren(...[t(`method.${method.id}.name`), ...settingChips(method, settings)].map((c) => el('span', 'lp-chip', c)));
}
drawSettings();

// ---------------------------------------------------------------- cube input
function onCubeChange() {
  history.replaceState(null, '', scramble ? `#scramble=${encodeURIComponent(scramble)}` : `#cube=${encodeCube(net.get())}`);
  renderNetView($('mini-net'), net.get());
  solve();
}

function setScramble(text: string) {
  scramble = formatAlg(parseAlg(text));
  scrambleIn.value = scramble;
  net.set(applyMoves(solvedState(), scramble));
}

$('btn-solved').onclick = () => {
  scramble = undefined;
  scrambleIn.value = '';
  net.set(solvedState());
  onCubeChange();
};
$('btn-random').onclick = () => {
  setScramble(formatAlg(randomMoves(20)));
  onCubeChange();
};
$('scramble-form').onsubmit = (e) => {
  e.preventDefault();
  try {
    setScramble(scrambleIn.value.trim());
    onCubeChange();
  } catch (err) {
    setSetupOpen(true);
    status.className = 'status bad';
    status.textContent = (err as Error).message;
  }
};

function checkCube(): boolean {
  const v = validate(net.get());
  status.replaceChildren();
  if (v.ok) {
    status.className = 'status ok';
    status.textContent = t('common.validCube');
    return true;
  }
  status.className = 'status bad';
  const ul = document.createElement('ul');
  for (const e of v.errors) ul.append(el('li', '', e));
  status.append(ul);
  return false;
}

// ---------------------------------------------------------------- solving (worker: the viewer's scramble needs the Kociemba tables)
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
    summary.textContent = t('learn.fixCube');
    setSetupOpen(true);
    renderPlan();
    return;
  }
  if (!ready) return;
  requestId++;
  summary.textContent = t('common.solving');
  worker.postMessage({ id: requestId, kind: 'learn', state: net.get() as CubeState, method: method.id, settings, scramble, lang });
}

// ---------------------------------------------------------------- plan: overview bar and step list
const stageLabel = (stage: string) => t(`stage.${stage}`);
const tokens = (alg: string) => alg.split(/\s+/).filter(Boolean);
const len = (i: number) => (plan ? tokens(plan.steps[i].alg).length : 0);
const stageTag = (stage: string, extra = '') => el('span', `stage-tag stage-${stage}${extra}`, stageLabel(stage));
const countText = (s: SolveStep) => (s.moves ? t('learn.moves', { count: s.moves }) : t(s.stage === 'inspection' ? 'learn.inspection' : 'learn.skip'));

function renderPlan() {
  stop();
  stepsEl.replaceChildren();
  segsEl.replaceChildren();
  groupsEl.replaceChildren();
  btnCopy.disabled = !plan;
  note.textContent = '';
  $('step-count').textContent = '';
  if (!plan) {
    sel = 0;
    void load(0, 0);
    return;
  }
  if (plan.moves) {
    summary.textContent = t('learn.solveIn', { count: plan.moves });
    note.textContent = [plan.note, t('learn.pickHint')].filter(Boolean).join(' ');
  } else summary.textContent = t('learn.alreadySolved');
  $('step-count').textContent = t('learn.stepCount', { count: plan.steps.length });

  const groups: { stage: string; w: number; moves: number }[] = [];
  plan.steps.forEach((s, i) => {
    const w = Math.max(len(i), 1);
    const seg = el('button', `lp-seg stage-${s.stage}`);
    seg.type = 'button';
    seg.style.flexGrow = String(w);
    seg.setAttribute('aria-label', `${stageLabel(s.stage)}, ${s.title}`);
    seg.append(el('span', 'lp-seg-bar'));
    seg.onclick = () => pick(i, 0);
    segsEl.append(seg);
    const last = groups[groups.length - 1];
    if (last && last.stage === s.stage) {
      last.w += w;
      last.moves += s.moves;
    } else groups.push({ stage: s.stage, w, moves: s.moves });

    const li = document.createElement('li');
    const btn = el('button', 'lp-step');
    btn.type = 'button';
    btn.onclick = () => pick(i, 0);
    const head = el('span', 'lp-step-head');
    head.append(stageTag(s.stage), el('span', 'lp-step-title', s.title), el('span', 'muted lp-step-count', countText(s)));
    btn.append(head);
    if (s.alg) btn.append(el('code', 'lp-step-alg', s.alg));
    if (s.caseName) btn.append(el('span', 'muted lp-step-case', s.caseName));
    li.append(btn);
    stepsEl.append(li);
  });
  // Text labels for each run of same-stage steps, sized like the bar segments above them.
  for (const g of groups) {
    const lab = el('span', `lp-group stage-${g.stage}`, g.moves ? `${stageLabel(g.stage)} · ${g.moves}` : stageLabel(g.stage));
    lab.style.flexGrow = String(g.w);
    groupsEl.append(lab);
  }
  sel = 0;
  void load(0, 0);
}

// ---------------------------------------------------------------- viewer: one step at a time
/** All pieces shown normally (a mask, once set, overrides the plain stickering setting). */
const FULL_MASK = 'EDGES:------------,CORNERS:--------,CENTERS:------';

function applyMask() {
  const mask = plan?.steps[sel]?.mask;
  player.experimentalStickeringMaskOrbits = highlight && mask ? mask : FULL_MASK;
}

/** Show step `i` with `m` of its moves done. */
async function load(i: number, m: number) {
  sel = i;
  mv = m;
  const seq = ++loadSeq;
  expect = -1; // ignore reports about the half-loaded view
  const steps = plan?.steps ?? [];
  if (!plan) {
    player.experimentalSetupAlg = '';
    player.alg = '';
  } else {
    player.experimentalSetupAlg = [planScramble, ...steps.slice(0, i).map((s) => s.alg)].filter(Boolean).join(' ');
    player.alg = steps[i].alg;
  }
  applyMask();
  render();
  const indexer = await player.experimentalModel.indexer.get();
  if (seq !== loadSeq) return;
  const n = indexer.numAnimatedLeaves();
  const atEnd = m >= n;
  expect = atEnd ? n : m;
  setTimeout(() => seq === loadSeq && (expect = null), 1000);
  player.timestamp = atEnd ? 'end' : indexer.indexToMoveStartTimestamp(m);
  mv = Math.min(m, n);
  render();
}

/** Jump to a step / move picked by the user (stops playback). */
function pick(i: number, m: number) {
  stop();
  void load(i, m);
}

// Follow the viewer as it plays. Moves done = patternIndex, plus a move that has just finished.
player.experimentalModel.currentMoveInfo.addFreshListener(({ patternIndex, movesFinishing }) => {
  if (!plan) return;
  const done = patternIndex + movesFinishing.length;
  if (expect !== null) {
    if (done !== expect) return;
    expect = null;
  }
  mv = Math.min(done, len(sel));
  render();
});

// When a step finishes while playing: repeat it, or carry on with the next step that has moves.
player.experimentalModel.coarseTimelineInfo.addFreshListener((info) => {
  if (!playing || info.playing || expect !== null || mv < len(sel)) return;
  const seq = loadSeq;
  setTimeout(() => {
    if (!playing || seq !== loadSeq) return;
    const next = loop ? sel : nextWithMoves(sel);
    if (next < 0) stop();
    else void load(next, 0).then(() => playing && player.play());
  }, 450);
});

const nextWithMoves = (i: number) => {
  for (let k = i + 1; k < (plan?.steps.length ?? 0); k++) if (len(k)) return k;
  return -1;
};

function setPlaying(on: boolean) {
  playing = on;
  btnPlay.classList.toggle('playing', on);
  $('play-label').textContent = t(on ? 'learn.pause' : 'learn.play');
}

function stop() {
  if (playing) player.pause();
  setPlaying(false);
}

btnPlay.onclick = async () => {
  if (!plan) return;
  if (playing) return stop();
  setPlaying(true);
  if (mv >= len(sel)) {
    const next = loop && len(sel) ? sel : nextWithMoves(sel);
    if (next < 0) return setPlaying(false);
    await load(next, 0);
    if (!playing) return;
  }
  player.play();
};

$('btn-next-move').onclick = () => {
  if (!plan) return;
  if (mv < len(sel)) pick(sel, mv + 1);
  else if (sel + 1 < plan.steps.length) pick(sel + 1, len(sel + 1) ? 1 : 0);
};
$('btn-prev-move').onclick = () => {
  if (!plan) return;
  if (mv > 0) pick(sel, mv - 1);
  else if (sel > 0) pick(sel - 1, Math.max(len(sel - 1) - 1, 0));
};
$('btn-next-step').onclick = () => {
  if (plan && sel + 1 < plan.steps.length) pick(sel + 1, 0);
};
$('btn-prev-step').onclick = () => {
  if (!plan) return;
  if (mv > 0) pick(sel, 0);
  else if (sel > 0) pick(sel - 1, 0);
};

// ---------------------------------------------------------------- toggles
const HIGHLIGHT_KEY = 'learn.highlight';
let highlight = true;
try {
  highlight = localStorage.getItem(HIGHLIGHT_KEY) !== 'off';
} catch {
  /* storage unavailable: default on */
}
const optHighlight = $<HTMLButtonElement>('opt-highlight');
const optLoop = $<HTMLButtonElement>('opt-loop');
optHighlight.setAttribute('aria-pressed', String(highlight));
optHighlight.onclick = () => {
  highlight = !highlight;
  optHighlight.setAttribute('aria-pressed', String(highlight));
  try {
    localStorage.setItem(HIGHLIGHT_KEY, highlight ? 'on' : 'off');
  } catch {
    /* not remembered */
  }
  applyMask();
};
optLoop.onclick = () => {
  loop = !loop;
  optLoop.setAttribute('aria-pressed', String(loop));
};

// ---------------------------------------------------------------- current step card
function render() {
  const s = plan?.steps[sel];
  const n = len(sel);
  for (const id of ['btn-prev-step', 'btn-prev-move', 'btn-next-move', 'btn-next-step', 'btn-play']) $<HTMLButtonElement>(id).disabled = !plan;
  if (plan) {
    const last = plan.steps.length - 1;
    $<HTMLButtonElement>('btn-prev-step').disabled = sel === 0 && mv === 0;
    $<HTMLButtonElement>('btn-prev-move').disabled = sel === 0 && mv === 0;
    $<HTMLButtonElement>('btn-next-step').disabled = sel >= last;
    $<HTMLButtonElement>('btn-next-move').disabled = sel >= last && mv >= n;
    btnPlay.disabled = !playing && mv >= n && !(loop && n) && nextWithMoves(sel) < 0;
  }

  [...segsEl.children].forEach((c, k) => {
    c.classList.toggle('done', k <= sel);
    if (k === sel) c.setAttribute('aria-current', 'step');
    else c.removeAttribute('aria-current');
  });
  [...stepsEl.children].forEach((li, k) => {
    const b = li.firstElementChild!;
    b.classList.toggle('active', k === sel);
    if (k === sel) b.setAttribute('aria-current', 'step');
    else b.removeAttribute('aria-current');
  });
  keepVisible(sel);

  const tag = $('now-tag');
  tag.className = s ? `stage-tag stage-${s.stage}` : 'stage-tag hidden';
  tag.textContent = s ? stageLabel(s.stage) : '';
  $('now-title').textContent = s ? s.title : plan ? t('common.cubeSolved') : '';
  $('now-pos').textContent = s ? t('learn.stepPos', { step: sel + 1, steps: plan!.steps.length, move: mv, moves: n }) : '';
  $('now-case-box').hidden = !s?.caseName;
  $('now-case').textContent = s?.caseName ?? '';
  $('now-hint-box').hidden = !s?.hint;
  $('now-hint').textContent = s?.hint ?? '';
  $('no-toks').hidden = !s || n > 0;
  toksEl.replaceChildren(
    ...tokens(s?.alg ?? '').map((tok, k) => {
      const b = el('button', k < mv ? 'lp-tok done' : k === mv ? 'lp-tok current' : 'lp-tok', tok);
      b.type = 'button';
      if (k === mv) b.setAttribute('aria-current', 'true');
      b.onclick = () => pick(sel, k);
      return b;
    }),
  );
}

/** Keep the current step in view inside the (scrollable) step list, without moving the page. */
function keepVisible(i: number) {
  const item = stepsEl.children[i] as HTMLElement | undefined;
  if (!item || stepsEl.scrollHeight <= stepsEl.clientHeight) return;
  const top = item.offsetTop - stepsEl.offsetTop;
  if (top < stepsEl.scrollTop || top + item.offsetHeight > stepsEl.scrollTop + stepsEl.clientHeight) {
    stepsEl.scrollTo({ top: top - 8, behavior: 'smooth' });
  }
}

btnCopy.onclick = async () => {
  if (!plan) return;
  const text = plan.steps.filter((s) => s.alg).map((s) => `${s.alg} // ${s.title}${s.caseName ? ` (${s.caseName})` : ''}`).join('\n');
  await navigator.clipboard.writeText(`${t('common.scramble')}: ${planScramble}\n${text}`);
  $('copy-label').textContent = t('common.copied');
  setTimeout(() => ($('copy-label').textContent = t('learn.copySolution')), 1200);
};

// ---------------------------------------------------------------- start: cube from the URL
// #cube=<54 letters> (scanner, scramble page) or #scramble=<moves> (timer).
const hash = location.hash;
const cubeFromHash = decodeCube(/cube=([A-Z]{54})/.exec(hash)?.[1] ?? '');
const scrFromHash = /scramble=([^&]+)/.exec(hash)?.[1];
if (cubeFromHash) net.set(cubeFromHash);
else if (scrFromHash) {
  try {
    setScramble(decodeURIComponent(scrFromHash));
  } catch {
    scramble = undefined;
  }
} else setScramble(formatAlg(randomMoves(20)));
renderNetView($('mini-net'), net.get());
if (!checkCube()) setSetupOpen(true);
render();
