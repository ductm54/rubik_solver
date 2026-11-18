/**
 * Learn view: how to solve the cube, course by course (the beginner method, then the same method
 * with fewer moves), picked with `#learn=<course>`. Each step has its text and a 3D viewer with
 * example cases; viewers are made when their step first scrolls near the screen, so the page
 * opens fast.
 */
import 'cubing/twisty';
import { t } from '../src/i18n';
import { type Course, FULL_MASK, HOLD, type Lesson, type LessonCase, NOTATION_MOVES } from '../src/learn/beginner';
import { COURSES, courseOf } from '../src/learn/courses';

/** The parts of cubing.js's TwistyPlayer used here. */
type Player = HTMLElement & {
  alg: string;
  experimentalSetupAlg: string;
  experimentalSetupAnchor: 'start' | 'end';
  experimentalStickeringMaskOrbits: string;
  timestamp: number | 'start' | 'end';
  play(): void;
  pause(): void;
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') =>
  Object.assign(document.createElement(tag), { className, textContent: text });

const root = document.getElementById('learn-lessons')!;
const toc = document.getElementById('learn-toc')!;
let players: Player[] = [];
/** The course on the page: its text keys are `<keys>.<lesson>…`. */
let course: Course = courseOf(location.hash);
const key = (lesson: Lesson, rest: string) => `${course.keys}.${lesson.id}.${rest}`;

/** Translate `key`, with `{alg}` shown as code. */
function rich(key: string, alg = ''): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const part of t(key, { alg: '\u0001' }).split(/(\u0001)/)) {
    if (part === '\u0001') frag.append(el('code', 'learn-inline', alg));
    else if (part) frag.append(part);
  }
  return frag;
}

function makePlayer(): Player {
  const p = document.createElement('twisty-player') as Player;
  p.setAttribute('puzzle', '3x3x3');
  p.setAttribute('background', 'none');
  p.setAttribute('control-panel', 'bottom-row');
  p.setAttribute('hint-facelets', 'floating');
  players.push(p);
  return p;
}

/** Show a case in a viewer, ready to play from its start. */
function loadCase(p: Player, lesson: Lesson, c: LessonCase) {
  p.pause();
  p.experimentalSetupAnchor = 'end';
  p.experimentalSetupAlg = [HOLD, c.end ?? ''].join(' ').trim();
  p.alg = c.alg;
  p.experimentalStickeringMaskOrbits = lesson.mask;
  p.timestamp = 'start';
}

/** The example viewer with a button per case. */
function caseDemo(lesson: Lesson): HTMLElement {
  const box = el('div', 'learn-demo');
  const picker = el('div', 'learn-cases');
  picker.setAttribute('role', 'group');
  picker.setAttribute('aria-label', t('learn.examples'));
  const viewer = el('div', 'learn-viewer');
  const desc = el('p', 'learn-case-desc');
  const moves = el('div', 'learn-moves');
  const label = el('span', 'lp-label', t('learn.moves'));
  const code = el('code', '');
  moves.append(label, code);
  const buttons: HTMLButtonElement[] = [];
  let player: Player | null = null;
  let current = 0;

  const pick = (i: number, play: boolean) => {
    current = i;
    const c = lesson.cases[i];
    buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    desc.textContent = t(key(lesson, `${c.id}.desc`));
    code.textContent = c.show ?? c.alg;
    if (!player) return;
    loadCase(player, lesson, c);
    if (play) setTimeout(() => player?.play(), 150);
  };
  lesson.cases.forEach((c, i) => {
    const b = el('button', 'learn-case', t(key(lesson, c.id)));
    b.type = 'button';
    b.onclick = () => pick(i, true);
    buttons.push(b);
    picker.append(b);
  });
  if (lesson.cases.length < 2) picker.hidden = true;

  box.append(picker, viewer, desc, moves);
  pick(0, false);
  lazily(viewer, () => {
    player = makePlayer();
    viewer.append(player);
    pick(current, false);
  });
  return box;
}

/** The notation step: a pad of moves to try on a cube. */
function notationDemo(): HTMLElement {
  const box = el('div', 'learn-demo');
  const viewer = el('div', 'learn-viewer');
  const pad = el('div', 'learn-pad');
  pad.setAttribute('role', 'group');
  pad.setAttribute('aria-label', t('learn.notation.pad'));
  const done = el('code', 'learn-history');
  const moves = el('div', 'learn-moves');
  moves.append(el('span', 'lp-label', t('learn.moves')), done);
  let history: string[] = [];
  let player: Player | null = null;

  const show = (move: string) => {
    done.textContent = history.join(' ') || '—';
    if (!player) return;
    player.pause();
    player.experimentalSetupAnchor = 'start';
    player.experimentalSetupAlg = [HOLD, ...history.slice(0, move ? -1 : undefined)].join(' ');
    player.alg = move;
    player.experimentalStickeringMaskOrbits = FULL_MASK;
    player.timestamp = 'start';
    if (move) setTimeout(() => player?.play(), 50);
  };
  for (const m of NOTATION_MOVES) {
    const b = el('button', 'learn-move', m);
    b.type = 'button';
    b.onclick = () => {
      history.push(m);
      show(m);
    };
    pad.append(b);
  }
  const reset = el('button', 'learn-move learn-reset', t('learn.notation.reset'));
  reset.type = 'button';
  reset.onclick = () => {
    history = [];
    show('');
  };
  pad.append(reset);

  box.append(el('span', 'lp-label', t('learn.notation.pad')), pad, viewer, moves);
  show('');
  lazily(viewer, () => {
    player = makePlayer();
    viewer.append(player);
    show('');
  });
  return box;
}

const pending = new Map<Element, () => void>();
const io =
  'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            io?.unobserve(e.target);
            pending.get(e.target)?.();
            pending.delete(e.target);
          }
        },
        { rootMargin: '400px 0px' },
      )
    : null;

/** Run `make` when `target` first comes near the screen. */
function lazily(target: Element, make: () => void) {
  if (!io) return make();
  pending.set(target, make);
  io.observe(target);
}

function lesson(l: Lesson, n: number): HTMLElement {
  const sec = el('section', 'card learn-lesson');
  sec.id = `learn-step-${course.id}-${l.id}`;
  const textAlg = l.textAlg ?? Object.values(l.algs ?? {})[0] ?? '';

  const head = el('header', 'learn-head');
  head.append(el('span', `stage-tag stage-${l.stage}`, t('learn.stepN', { n })), el('h2', '', t(key(l, 'title'))));

  const text = el('div', 'learn-text');
  const goal = el('p', 'learn-goal');
  goal.append(el('strong', '', `${t('learn.goal')}: `), t(key(l, 'goal')));
  text.append(goal, el('h3', '', t('learn.how')));
  const how = el('ol', 'learn-how');
  for (let i = 1; i <= l.how; i++) {
    const li = el('li');
    li.append(rich(key(l, `how${i}`), textAlg));
    how.append(li);
  }
  text.append(how);

  if (l.algs) {
    text.append(el('h3', '', t('learn.learnAlgs')));
    const list = el('dl', 'learn-algs');
    for (const [k, alg] of Object.entries(l.algs)) {
      const row = el('div', 'learn-alg');
      const dd = el('dd');
      dd.append(el('code', '', alg));
      row.append(el('dt', '', t(key(l, `alg.${k}`))), dd);
      list.append(row);
    }
    text.append(list);
  }

  const tip = el('p', 'learn-tip');
  tip.append(el('strong', '', `${t('learn.tip')}: `), rich(key(l, 'tip'), textAlg));
  text.append(tip);

  const body = el('div', 'learn-body');
  body.append(text);
  if (l.id === 'notation') body.append(notationDemo());
  else if (l.cases.length) body.append(caseDemo(l));
  else body.classList.add('learn-body-text');
  sec.append(head, body);
  return sec;
}

function render() {
  root.replaceChildren();
  toc.replaceChildren();
  for (const p of players) p.pause();
  players = [];
  for (const target of pending.keys()) io?.unobserve(target);
  pending.clear();

  const methods = el('div', 'learn-methods');
  methods.setAttribute('role', 'group');
  methods.append(el('span', 'lp-label', t('learn.methods')));
  for (const c of COURSES) {
    const chip = el('a', 'learn-method', t(`learn.${c.id}`));
    chip.href = c === COURSES[0] ? '#learn' : `#learn=${c.id}`;
    if (c === course) chip.setAttribute('aria-current', 'true');
    methods.append(chip);
  }
  methods.append(el('span', 'muted learn-more', t('solve.moreComing')));

  const list = el('ol', 'learn-toc-list');
  course.lessons.forEach((l, i) => {
    const li = el('li');
    const b = el('button', `learn-toc-item stage-${l.stage}`);
    b.type = 'button';
    b.append(el('span', 'learn-toc-n', String(i)), el('span', '', t(key(l, 'title'))));
    b.onclick = () => document.getElementById(`learn-step-${course.id}-${l.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    li.append(b);
    list.append(li);
  });
  toc.append(methods, el('h2', '', t('learn.contents')), list);

  const intro = el('section', 'card learn-lesson learn-intro-card');
  intro.append(el('h2', '', t(`learn.${course.id}`)), el('p', '', t(`learn.${course.id}.intro`)));
  root.append(intro);
  course.lessons.forEach((l, i) => root.append(lesson(l, i)));

  const done = el('section', 'card learn-lesson learn-done');
  const cta = el('a', 'primary button-like', t(`${course.keys}.done.cta`));
  cta.href = '#solve';
  done.append(el('h2', '', t(`${course.keys}.done.title`)), el('p', '', t(`${course.keys}.done.body`)), cta);
  root.append(done);
}

render();

/** The tab was opened again, or its hash changed: show the course it asks for. */
export function show() {
  const next = courseOf(location.hash);
  if (next === course) return;
  course = next;
  render();
  window.scrollTo(0, 0);
}

/** Another tab was opened: stop the viewers. */
export function hide() {
  for (const p of players) p.pause();
}
