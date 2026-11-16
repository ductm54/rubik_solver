import { lang } from './i18n';
import 'cubing/twisty';
import { t } from '../src/i18n';
import { type CubeState, applyMoves, formatAlg, parseAlg, randomMoves, solvedState } from '../src/core/cube';
import { validate } from '../src/core/validate';
import { METHODS, getMethod } from '../src/solve/methods';
import type { SettingValues, SolvePlan, SolveStep } from '../src/solve/types';
import { createNet, decodeCube, encodeCube, renderNetView } from './net';
import { renderSettings, savedMethod, settingChips, valuesFor } from './settings';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(`learn-${id}`) as T;
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
    playingInfo: { set(v: { playing: boolean; direction?: 1 | -1; untilBoundary?: string }): void };
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
/** Whole solve: the viewer holds every step in one go, and `sel` / `mv` follow it as it plays. */
let whole = true;
let offsets: number[] = []; // where each step starts in the whole solve, in moves
let playing = false;
let loop = false;
let loadSeq = 0;
/** While a step loads, ignore viewer reports until it reaches this move (then null). */
let expect: number | null = null;
let ready = false;
let requestId = 0;

// ---------------------------------------------------------------- setup panel
// Two panels, opened separately: the cube painter and the solver settings.
const cubePanel = $('cube-panel');
const settingsPanel = $('settings-panel');
function setPanel(panel: HTMLElement, btn: HTMLElement, open: boolean) {
  panel.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  $('setup-panel').hidden = cubePanel.hidden && settingsPanel.hidden;
}
const setCubeOpen = (open: boolean) => setPanel(cubePanel, $('btn-cube'), open);
$('btn-cube').onclick = () => setCubeOpen(cubePanel.hidden);
$('btn-settings').onclick = () => setPanel(settingsPanel, $('btn-settings'), settingsPanel.hidden);

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
/** Keep the cube in the URL, so a reload or a shared link shows the same one. */
const syncHash = () => history.replaceState(null, '', scramble ? `#learn&scramble=${encodeURIComponent(scramble)}` : `#learn&cube=${encodeCube(net.get())}`);

function onCubeChange() {
  syncHash();
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
    setCubeOpen(true);
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
    if (!scramble) scrambleIn.value = planScramble; // painted or scanned cube: show a scramble that makes it
    renderPlan();
  }
};

worker.onerror = () => {
  if (!ready) summary.textContent = t('common.solverFailed');
};

function solve() {
  if (!checkCube()) {
    plan = null;
    summary.textContent = t('learn.fixCube');
    setCubeOpen(true);
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
  offsets = [];
  let total = 0;
  for (const s of plan?.steps ?? []) {
    offsets.push(total);
    total += tokens(s.alg).length;
  }
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
  player.experimentalStickeringMaskOrbits = !whole && highlight && mask ? mask : FULL_MASK;
}

/** Step (one with moves) that whole-solve position `g` falls in: the last one once past the end. */
function stepAt(g: number): number {
  let last = -1;
  for (let i = 0; i < (plan?.steps.length ?? 0); i++) {
    if (!len(i)) continue;
    if (g < offsets[i] + len(i)) return i;
    last = i;
  }
  return last;
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
  } else if (whole) {
    player.experimentalSetupAlg = planScramble;
    player.alg = steps.map((s) => s.alg).filter(Boolean).join(' ');
  } else {
    player.experimentalSetupAlg = [planScramble, ...steps.slice(0, i).map((s) => s.alg)].filter(Boolean).join(' ');
    player.alg = steps[i].alg;
  }
  applyMask();
  render();
  const indexer = await player.experimentalModel.indexer.get();
  if (seq !== loadSeq) return;
  const n = indexer.numAnimatedLeaves();
  mv = Math.min(m, len(i));
  const at = whole && plan ? offsets[i] + mv : mv; // position in what the viewer holds
  const atEnd = at >= n;
  expect = atEnd ? n : at;
  setTimeout(() => seq === loadSeq && (expect = null), 1000);
  player.timestamp = atEnd ? 'end' : indexer.indexToMoveStartTimestamp(at);
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
  if (whole) {
    const i = stepAt(done);
    if (i < 0) return;
    sel = i;
    mv = Math.min(Math.max(done - offsets[i], 0), len(i));
  } else mv = Math.min(done, len(sel));
  render();
});

// When a step finishes while playing: repeat it, or carry on with the next step that has moves.
player.experimentalModel.coarseTimelineInfo.addFreshListener((info) => {
  if (!playing || info.playing || expect !== null) return;
  if (whole) {
    if (info.atEnd) setPlaying(false);
    return;
  }
  if (mv < len(sel)) return;
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
  if (whole) {
    if (mv >= len(sel) && nextWithMoves(sel) < 0) await load(0, 0); // at the end: start over
    if (playing) player.play();
    return;
  }
  if (mv >= len(sel)) {
    const next = loop && len(sel) ? sel : nextWithMoves(sel);
    if (next < 0) return setPlaying(false);
    await load(next, 0);
    if (!playing) return;
  }
  player.play();
};

/** Animate exactly one move forwards (+1) or backwards (-1) from the current position. */
async function animateMove(dir: 1 | -1) {
  if (!plan) return;
  stop();
  let target: [number, number]; // step, moves done afterwards
  let from: [number, number] | null = null; // set when the view has to be loaded at a different spot first
  if (dir === 1) {
    if (mv < len(sel)) target = [sel, mv + 1];
    else {
      const k = nextWithMoves(sel);
      if (k < 0) return;
      target = [k, 1];
      if (!whole) from = [k, 0];
    }
  } else if (mv > 0) target = [sel, mv - 1];
  else {
    let k = sel - 1;
    while (k >= 0 && !len(k)) k--;
    if (k < 0) return pick(Math.max(sel - 1, 0), 0);
    target = [k, len(k) - 1];
    if (!whole) from = [k, len(k)];
  }
  if (from) await load(from[0], from[1]);
  else ++loadSeq;
  const seq = loadSeq;
  const done = whole ? offsets[target[0]] + target[1] : target[1];
  expect = done; // ignore progress reports until the move has finished
  sel = target[0];
  mv = target[1];
  render();
  setTimeout(() => seq === loadSeq && expect === done && (expect = null), 2000);
  player.experimentalModel.playingInfo.set({ playing: true, direction: dir, untilBoundary: 'move' });
}

$('btn-next-move').onclick = () => void animateMove(1);
$('btn-prev-move').onclick = () => void animateMove(-1);
$('btn-next-step').onclick = () => {
  if (plan && sel + 1 < plan.steps.length) pick(sel + 1, 0);
};
$('btn-prev-step').onclick = () => {
  if (!plan) return;
  if (mv > 0) pick(sel, 0);
  else if (sel > 0) pick(sel - 1, 0);
};

// ---------------------------------------------------------------- step by step / whole solve
function setWhole(on: boolean) {
  if (whole === on) return;
  stop();
  whole = on;
  $('mode-step').setAttribute('aria-pressed', String(!on));
  $('mode-whole').setAttribute('aria-pressed', String(on));
  $('lp-switches').hidden = on; // repeat and highlight are per step
  void load(sel, mv);
}
$('mode-step').onclick = () => setWhole(false);
$('mode-whole').onclick = () => setWhole(true);

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
    btnPlay.disabled = !whole && !playing && mv >= n && !(loop && n) && nextWithMoves(sel) < 0;
    if (!plan.moves) btnPlay.disabled = true;
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
  $('now-pos').textContent = s ? (whole ? t('learn.wholePrefix') : '') + t('learn.stepPos', { step: sel + 1, steps: plan!.steps.length, move: mv, moves: n }) : '';
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
  try {
    await navigator.clipboard.writeText(`${t('common.scramble')}: ${planScramble}\n${text}`);
  } catch {
    return; // no clipboard access (insecure page, or permission denied)
  }
  $('copy-label').textContent = t('common.copied');
  setTimeout(() => ($('copy-label').textContent = t('learn.copySolution')), 1200);
};

// ---------------------------------------------------------------- start: cube from the URL
/**
 * Take the cube a link carries: #learn&cube=<54 letters> (scanner, cube tab) or
 * #learn&scramble=<moves> (cube tab, timer). False when it carries none, or the one already shown.
 */
function takeHash(): boolean {
  const cube = decodeCube(/cube=([A-Z]{54})/.exec(location.hash)?.[1] ?? '');
  const scr = /scramble=([^&]+)/.exec(location.hash)?.[1];
  if (cube) {
    if (!scramble && encodeCube(cube) === encodeCube(net.get())) return false;
    scramble = undefined;
    scrambleIn.value = '';
    net.set(cube);
    return true;
  }
  if (!scr) return false;
  try {
    const text = formatAlg(parseAlg(decodeURIComponent(scr)));
    if (text === scramble) return false;
    setScramble(text);
    return true;
  } catch {
    return false;
  }
}

if (!takeHash()) setScramble(formatAlg(randomMoves(20)));
renderNetView($('mini-net'), net.get());
if (!checkCube()) setCubeOpen(true);
render();

/** The Learn tab was opened again: load the cube the link carries, if it is a new one. */
export function show() {
  if (takeHash()) onCubeChange();
  else syncHash();
}

/** Another tab was opened: stop playback. */
export function hide() {
  stop();
}
