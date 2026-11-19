/**
 * Learn view: how to solve the cube as a learning path, level by level (basics, the beginner
 * method, a faster beginner method, an introduction to CFOP, then CFOP's levels: cross, F2L and the last layer). Each step
 * has its text and a 3D viewer with example cases; viewers are made when their step first
 * scrolls near the screen, so the page opens fast.
 */
import 'cubing/twisty';
import { t } from '../src/i18n';
import {
  BEGINNER,
  FULL_MASK,
  HOLD,
  holdOf,
  type Lesson,
  type LessonCase,
  NOTATION_MOVES,
  SPEEDUPS,
  type SpeedGroup,
} from '../src/learn/beginner';
import { CFOP_INTRO } from '../src/learn/cfop';
import { CROSS_LESSONS } from '../src/learn/cfopCross';
import { F2L_LESSONS } from '../src/learn/f2l';
import { OLL2_LESSONS, OLL_LESSONS, PLL2_LESSONS, PLL_LESSONS } from '../src/learn/lastLayer';

/** What a case viewer needs: lessons and speed-up groups both have it. */
type Demo = Pick<Lesson, 'id' | 'hold' | 'mask' | 'cases'>;

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
const players: Player[] = [];

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
function loadCase(p: Player, lesson: Demo, c: LessonCase) {
  p.pause();
  p.experimentalSetupAnchor = 'end';
  p.experimentalSetupAlg = [holdOf(lesson), c.end ?? ''].join(' ').trim();
  p.alg = c.alg;
  p.experimentalStickeringMaskOrbits = c.mask ?? lesson.mask;
  p.timestamp = 'start';
}

/** The example viewer with a button per case. */
function caseDemo(lesson: Demo): HTMLElement {
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
    desc.textContent = t(`learn.${lesson.id}.${c.id}.desc`);
    code.textContent = c.show ?? c.alg;
    if (!player) return;
    loadCase(player, lesson, c);
    if (play) setTimeout(() => player?.play(), 150);
  };
  lesson.cases.forEach((c, i) => {
    const b = el('button', 'learn-case', t(`learn.${lesson.id}.${c.id}`));
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

function lesson(l: Lesson, n: number, tag = t('learn.stepN', { n })): HTMLElement {
  const sec = el('section', 'card learn-lesson');
  sec.id = `learn-step-${l.id}`;
  const textAlg = l.textAlg ?? Object.values(l.algs ?? {})[0] ?? '';

  const head = el('header', 'learn-head');
  head.append(el('span', `stage-tag stage-${l.stage}`, tag), el('h2', '', t(`learn.${l.id}.title`)));

  const text = el('div', 'learn-text');
  const goal = el('p', 'learn-goal');
  goal.append(el('strong', '', `${t('learn.goal')}: `), t(`learn.${l.id}.goal`));
  text.append(goal, el('h3', '', t('learn.how')));
  const how = el('ol', 'learn-how');
  for (let i = 1; i <= l.how; i++) {
    const li = el('li');
    li.append(rich(`learn.${l.id}.how${i}`, textAlg));
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
      row.append(el('dt', '', t(`learn.${l.id}.alg.${k}`)), dd);
      list.append(row);
    }
    text.append(list);
  }

  const tip = el('p', 'learn-tip');
  tip.append(el('strong', '', `${t('learn.tip')}: `), rich(`learn.${l.id}.tip`, textAlg));
  text.append(tip);
  if (l.ref) {
    const ref = el('p', 'learn-ref');
    const a = el('a', '', t(`learn.ref.${l.ref.set}${l.ref.twoLook ? '2' : ''}`));
    a.href = `#algs&set=${l.ref.set}${l.ref.twoLook ? '&twolook=1' : ''}`;
    ref.append(a);
    text.append(ref);
  }

  const body = el('div', l.cases.length || l.id === 'notation' ? 'learn-body' : 'learn-body learn-body-text');
  body.append(text);
  if (l.id === 'notation') body.append(notationDemo());
  else if (l.cases.length) body.append(caseDemo(l));
  sec.append(head, body);
  return sec;
}

/** A card of shortcuts for one step (or general habits), with demos when there are moves to show. */
function speedGroup(g: SpeedGroup): HTMLElement {
  const sec = el('section', 'card learn-lesson learn-fast');
  sec.id = `learn-${g.id.replace('.', '-')}`;
  const head = el('header', 'learn-head');
  head.append(el('span', `stage-tag stage-${g.stage}`, t('learn.fast.label')), el('h2', '', t(`learn.${g.id}.title`)));

  const text = el('div', 'learn-text');
  if (g.step) {
    const i = BEGINNER.findIndex((l) => l.id === g.step);
    const from = el('p', 'muted learn-fast-from');
    const link = el('a', '', `${t('learn.stepN', { n: i })} · ${t(`learn.${g.step}.title`)}`);
    link.href = `#learn&level=1`;
    link.onclick = (e) => {
      e.preventDefault();
      goTo(`learn-step-${g.step}`);
    };
    const [before, after = ''] = t('learn.fast.from', { step: '\u0001' }).split('\u0001');
    from.append(before, link, after);
    text.append(from);
  }
  for (const tip of g.tips) {
    text.append(el('h3', '', t(`learn.${g.id}.${tip.id}`)));
    const p = el('p', 'learn-fast-text');
    p.append(rich(`learn.${g.id}.${tip.id}.text`, tip.alg ?? ''));
    text.append(p);
  }

  const body = el('div', g.cases.length ? 'learn-body' : 'learn-body learn-body-text');
  body.append(text);
  if (g.cases.length) body.append(caseDemo(g));
  sec.append(head, body);
  return sec;
}

/** The levels after the introduction to CFOP: number, id, how many algorithms, and the lessons once written. */
const LATER: { n: number; id: string; algs: number; lessons?: Lesson[] }[] = [
  { n: 4, id: 'cross', algs: 0, lessons: CROSS_LESSONS },
  { n: 5, id: 'f2l', algs: 0, lessons: F2L_LESSONS },
  { n: 6, id: 'oll2', algs: 10, lessons: OLL2_LESSONS },
  { n: 7, id: 'pll2', algs: 6, lessons: PLL2_LESSONS },
  { n: 8, id: 'pll', algs: 21, lessons: PLL_LESSONS },
  { n: 9, id: 'oll', algs: 57, lessons: OLL_LESSONS },
];
const SOON = LATER.filter((l) => !l.lessons);

/** One panel per level (and one for the levels still to come): only the open one is shown. */
const panels = new Map<string, HTMLElement>();
const tocLevels = new Map<string, HTMLElement>();
let open = '';
const LEVEL_KEY = 'learn.level';

/** The level a `#learn&level=<n>` hash asks for, if any. */
const levelInHash = () => /[&?]level=([\w-]+)/.exec(location.hash)?.[1] ?? null;

/** Show level `key` (a level number, or `next`). Returns whether it changed. */
function openLevel(key: string): boolean {
  if (!panels.has(key)) key = '0';
  if (key === open) return false;
  open = key;
  for (const p of players) p.pause();
  for (const [k, panel] of panels) panel.hidden = k !== key;
  for (const [k, li] of tocLevels) {
    li.classList.toggle('active', k === key);
    li.querySelector('.learn-level-item')?.toggleAttribute('aria-current', k === key);
  }
  try {
    localStorage.setItem(LEVEL_KEY, key);
  } catch {
    // Remembering the level is only a convenience.
  }
  const hash = `#learn&level=${key}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  return true;
}

/** Open the level that holds element `id` and scroll to it. */
function goTo(id: string) {
  const target = document.getElementById(id);
  const panel = target?.closest<HTMLElement>('.learn-panel');
  if (!target || !panel) return;
  openLevel(panel.dataset.level!);
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function tocItem(mark: string, label: string, target: string, stage = ''): HTMLLIElement {
  const li = el('li');
  const b = el('button', `learn-toc-item ${stage ? `stage-${stage}` : ''}`.trim());
  b.type = 'button';
  b.append(el('span', 'learn-toc-n', mark), el('span', '', label));
  b.onclick = () => goTo(target);
  li.append(b);
  return li;
}

/** One level of the path in the contents: its number and name, with its steps under it (shown when open). */
function tocLevel(n: number, name: string, steps: HTMLLIElement[] = [], soon = false): HTMLLIElement {
  const key = soon ? 'next' : String(n);
  const li = el('li', soon ? 'learn-level learn-level-soon' : 'learn-level');
  const b = el('button', 'learn-level-item');
  b.type = 'button';
  b.append(el('span', 'learn-level-n', String(n)), el('span', '', name));
  if (soon) b.append(el('span', 'learn-soon', t('learn.soon')));
  b.onclick = () => goTo(`learn-panel-${key}`);
  li.append(b);
  if (steps.length) {
    const sub = el('ol', 'learn-toc-list');
    sub.append(...steps);
    li.append(sub);
  }
  if (!soon) tocLevels.set(key, li);
  return li;
}

/** A level's panel, holding its cards. */
function panel(key: string): HTMLElement {
  const p = el('div', 'learn-panel');
  p.id = `learn-panel-${key}`;
  p.dataset.level = key;
  p.hidden = true;
  panels.set(key, p);
  root.append(p);
  return p;
}

/** Links to the level before and after, at the foot of each panel. */
function levelNav(names: [key: string, label: string][]) {
  names.forEach(([key], i) => {
    const nav = el('nav', 'learn-level-nav');
    nav.setAttribute('aria-label', t('learn.path'));
    const link = (k: string, label: string, cls: string) => {
      const a = el('a', `learn-nav-link ${cls}`);
      a.href = `#learn&level=${k}`;
      a.append(el('span', 'muted', t(cls === 'prev' ? 'learn.prevLevel' : 'learn.nextLevel')), el('strong', '', label));
      a.onclick = (e) => {
        e.preventDefault();
        goTo(`learn-panel-${k}`);
      };
      return a;
    };
    if (i > 0) nav.append(link(names[i - 1][0], names[i - 1][1], 'prev'));
    if (i < names.length - 1) nav.append(link(names[i + 1][0], names[i + 1][1], 'next'));
    panels.get(key)!.append(nav);
  });
}

function levelCard(n: number, id: string, name: string, intro: string): HTMLElement {
  const sec = el('section', 'card learn-lesson learn-intro-card learn-level-card');
  sec.id = id;
  const head = el('header', 'learn-head');
  head.append(el('span', 'learn-level-tag', t('learn.levelN', { n })), el('h2', '', name));
  sec.append(head, el('p', '', intro));
  return sec;
}

function render() {
  const [notation, ...steps] = BEGINNER;
  const level = (n: number, name: string) => `${t('learn.levelN', { n })} · ${name}`;
  const names: [string, string][] = [];

  // Contents: the learning path, level by level.
  const path = el('ol', 'learn-path');
  path.append(
    tocLevel(0, t('learn.basics'), [tocItem('0', t(`learn.${notation.id}.title`), `learn-step-${notation.id}`, notation.stage)]),
    tocLevel(
      1,
      t('learn.beginner'),
      steps.map((l, i) => tocItem(String(i + 1), t(`learn.${l.id}.title`), `learn-step-${l.id}`, l.stage)),
    ),
    tocLevel(
      2,
      t('learn.fast'),
      SPEEDUPS.map((g) => tocItem('»', t(`learn.${g.id}.title`), `learn-${g.id.replace('.', '-')}`, g.stage)),
    ),
    tocLevel(
      3,
      t('learn.cfopIntro'),
      CFOP_INTRO.map((l, i) => tocItem(String(i + 1), t(`learn.${l.id}.title`), `learn-step-${l.id}`, l.stage)),
    ),
  );
  for (const lv of LATER) {
    const items = lv.lessons?.map((l, i) => tocItem(String(i + 1), t(`learn.${l.id}.title`), `learn-step-${l.id}`, l.stage));
    path.append(tocLevel(lv.n, t(`learn.next.${lv.id}`), items, !lv.lessons));
  }
  toc.append(el('h2', '', t('learn.path')), path);

  // Level 0: basics.
  let p = panel('0');
  names.push(['0', level(0, t('learn.basics'))]);
  p.append(levelCard(0, 'learn-level-basics', t('learn.basics'), t('learn.basics.intro')), lesson(notation, 0));

  // Level 1: the beginner method.
  p = panel('1');
  names.push(['1', level(1, t('learn.beginner'))]);
  p.append(levelCard(1, 'learn-level-beginner', t('learn.beginner'), t('learn.beginner.intro')));
  steps.forEach((l, i) => p.append(lesson(l, i + 1)));
  const done = el('section', 'card learn-lesson learn-done');
  const cta = el('a', 'primary button-like', t('learn.done.cta'));
  cta.href = '#solve';
  done.append(el('h2', '', t('learn.done.title')), el('p', '', t('learn.done.body')), cta);
  p.append(done);

  // Level 2: faster beginner.
  p = panel('2');
  names.push(['2', level(2, t('learn.fast'))]);
  p.append(levelCard(2, 'learn-fast', t('learn.fast'), t('learn.fast.intro')));
  for (const g of SPEEDUPS) p.append(speedGroup(g));

  // Level 3: introduction to CFOP.
  p = panel('3');
  names.push(['3', level(3, t('learn.cfopIntro'))]);
  p.append(levelCard(3, 'learn-level-cfop', t('learn.cfopIntro'), t('learn.cfopIntro.intro')));
  for (const l of CFOP_INTRO) p.append(lesson(l, 0, t('learn.cfopIntro.tag')));
  const tryIt = el('section', 'card learn-lesson learn-done');
  const solve = el('a', 'primary button-like', t('learn.cfopIntro.cta'));
  solve.href = '#solve';
  tryIt.append(el('h2', '', t('learn.cfopIntro.done')), el('p', '', t('learn.cfopIntro.doneBody')), solve);
  p.append(tryIt);

  // Levels 4 and on: those written so far, then what comes next.
  for (const lv of LATER) {
    if (!lv.lessons) continue;
    const key = String(lv.n);
    p = panel(key);
    names.push([key, level(lv.n, t(`learn.next.${lv.id}`))]);
    p.append(levelCard(lv.n, `learn-level-${lv.id}`, t(`learn.next.${lv.id}`), t(`learn.level.${lv.id}.intro`)));
    lv.lessons.forEach((l, i) => p.append(lesson(l, i + 1)));
  }

  // Levels still to come, if any: listed on a page of their own.
  if (SOON.length) {
    p = panel('next');
    names.push(['next', t('learn.next.title')]);
    const next = el('section', 'card learn-lesson learn-intro-card learn-next');
    next.id = 'learn-next';
    const list = el('ol', 'learn-next-list');
    for (const { n, id, algs } of SOON) {
      const li = el('li');
      const head = el('div', 'learn-next-head');
      head.append(el('span', 'learn-level-n', String(n)), el('strong', '', t(`learn.next.${id}`)));
      if (algs) head.append(el('span', 'muted learn-next-algs', t('learn.next.algs', { n: algs })));
      li.append(head, el('p', 'muted', t(`learn.next.${id}.desc`)));
      list.append(li);
    }
    next.append(el('h2', '', t('learn.next.title')), el('p', '', t('learn.next.intro')), list);
    p.append(next);
  }

  levelNav(names);
}

/** The level to open: the one in the link, else the last one read, else the first. */
function startLevel(): string {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(LEVEL_KEY);
  } catch {
    // No storage: start at the first level.
  }
  return levelInHash() ?? saved ?? '0';
}

render();
openLevel(startLevel());

/** The Learn tab was opened again, or its link changed: open the level the link asks for. */
export function show() {
  const key = levelInHash();
  if (key && openLevel(key)) document.getElementById(`learn-panel-${open}`)?.scrollIntoView({ block: 'start' });
}

/** Another tab was opened: stop the viewers. */
export function hide() {
  for (const p of players) p.pause();
}
