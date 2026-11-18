/**
 * Guided tour: a dimmed overlay with holes cut around the parts of the page it talks about, and
 * a card that walks through Cube → Learn → Timer. It opens from the "Tour" button in the header,
 * never by itself.
 */
import { t } from '../src/i18n';

type Route = 'cube' | 'learn' | 'timer';

interface Step {
  page: Route;
  /** Breadcrumb shown above the title (message keys joined with ›). */
  where: string[];
  /** Parts of the page to cut out of the overlay; the first visible one anchors the card. */
  targets: string[];
  /** Message key prefix: `<id>.title`, `<id>.body` and optionally `<id>.tip`. */
  id: string;
  /** UI names to put in bold into the text, as {placeholder}: message key. */
  names?: Record<string, string>;
  /** Runs when the step opens; may return a function to undo it when the step is left. */
  enter?: () => void | (() => void);
  /** Where to go when this step needs another page (default `#<page>`). */
  href?: () => string;
}

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const click = (sel: string) => $(sel)?.click();
const openTab = (name: string) => () => {
  if ($(`#tab-${name}`)?.getAttribute('aria-selected') !== 'true') click(`#tab-${name}`);
};

const STEPS: Step[] = [
  {
    page: 'cube',
    where: [],
    targets: ['nav.tabs'],
    id: 'tour.s1',
    names: { cube: 'nav.cube', learn: 'nav.learn', timer: 'nav.timer' },
  },
  {
    page: 'cube',
    where: ['nav.cube', 'cube.tabScan'],
    targets: ['#panel-scan .row.gap'],
    id: 'tour.s2',
    names: { start: 'scan.start', files: 'scan.files' },
    enter: openTab('scan'),
  },
  {
    page: 'cube',
    where: ['nav.cube', 'cube.tabEdit'],
    targets: ['#palette', '#net', '#status'],
    id: 'tour.s3',
    names: { edit: 'cube.tabEdit', valid: 'common.validCube', reset: 'edit.resetSolved' },
    enter: openTab('edit'),
  },
  {
    page: 'cube',
    where: ['nav.cube', 'cube.tabRandom'],
    targets: ['#btn-random'],
    id: 'tour.s4',
    names: { random: 'random.new', edit: 'cube.tabEdit' },
    enter: openTab('random'),
  },
  {
    page: 'cube',
    where: ['nav.cube', 'common.scramble'],
    targets: ['#scramble', '#btn-generate', '#btn-learn', '#btn-time'],
    id: 'tour.s5',
    names: { generate: 'cube.generate', howTo: 'cube.howTo', timeIt: 'cube.timeIt' },
  },
  {
    page: 'learn',
    where: ['nav.learn'],
    targets: ['#learn-scramble-form', '#learn-chips'],
    id: 'tour.s6',
    names: { howTo: 'cube.howTo', apply: 'learn.apply', random: 'learn.random', scan: 'learn.scan', editCube: 'learn.editCube' },
    // Coming from the Cube page with a scramble: take it along, as "How to solve it" would.
    href: () => {
      const a = $('#btn-learn') as HTMLAnchorElement | null;
      return a && !a.classList.contains('hidden') ? a.getAttribute('href')! : '#learn';
    },
  },
  {
    page: 'learn',
    where: ['nav.learn', 'learn.settings'],
    targets: ['#learn-btn-settings', '#learn-settings-panel'],
    id: 'tour.s7',
    names: { settings: 'learn.editSettings', cfop: 'method.cfop.name', beginner: 'method.beginner.name' },
    enter: () => {
      const btn = $('#learn-btn-settings');
      if (!btn || btn.getAttribute('aria-expanded') === 'true') return;
      btn.click();
      return () => {
        if (btn.getAttribute('aria-expanded') === 'true') btn.click();
      };
    },
  },
  {
    page: 'learn',
    where: ['nav.learn', 'learn.steps'],
    targets: ['#learn-segs', '#learn-btn-play', '#learn-btn-next-step'],
    id: 'tour.s8',
    names: {
      play: 'learn.play',
      nextStep: 'learn.nextStep',
      whole: 'learn.whole',
      oneStep: 'learn.oneStep',
      copy: 'learn.copySolution',
    },
  },
  {
    page: 'timer',
    where: ['nav.timer'],
    targets: ['#timer-pad'],
    id: 'tour.s9',
    names: { new: 'timer.new' },
  },
  {
    page: 'timer',
    where: ['nav.timer', 'timer.stats'],
    targets: ['#timer-last .row', '#timer-stats', '.table-wrap'],
    id: 'tour.s10',
    names: { ok: 'timer.ok', stats: 'timer.stats', history: 'timer.history', export: 'timer.export' },
  },
];

// ---------------------------------------------------------------- text

/** A button's label as it reads in the UI, without decoration like "→" or "✓". */
const uiName = (key: string) => t(key).replace(/[\s→✓…]+$/u, '').trim();

/** Translate `key`, with each {name} placeholder as a bold UI name. */
function rich(key: string, names: Record<string, string> = {}): DocumentFragment {
  const frag = document.createDocumentFragment();
  const params: Record<string, string> = {};
  for (const k of Object.keys(names)) params[k] = `\u0001${k}\u0002`;
  for (const part of t(key, params).split(/(\u0001\w+\u0002)/)) {
    const m = /^\u0001(\w+)\u0002$/.exec(part);
    if (m) {
      const b = document.createElement('b');
      b.textContent = uiName(names[m[1]]);
      frag.append(b);
    } else if (part) frag.append(part);
  }
  return frag;
}

const has = (key: string) => t(key) !== key;

// ---------------------------------------------------------------- DOM

const SVG = 'http://www.w3.org/2000/svg';
let root: HTMLElement | null = null;
let shade: SVGPathElement;
let rings: HTMLElement;
let card: HTMLElement;
let index = 0;
let undo: (() => void) | void;
let frame = 0;
let lastKey = '';
let scrolled = false;
let shownAt = 0;
let opener: HTMLElement | null = null;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function routeNow(): Route {
  const head = location.hash.slice(1).split(/[&=?]/)[0];
  return head === 'timer' || head === 'learn' ? head : 'cube';
}

function build() {
  root = document.createElement('div');
  root.className = 'tour';
  const svg = document.createElementNS(SVG, 'svg');
  svg.classList.add('tour-shade');
  svg.setAttribute('aria-hidden', 'true');
  shade = document.createElementNS(SVG, 'path');
  shade.setAttribute('fill-rule', 'evenodd');
  svg.append(shade);
  rings = document.createElement('div');
  rings.className = 'tour-rings';
  card = document.createElement('div');
  card.className = 'tour-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', t('tour.label'));
  card.tabIndex = -1;
  root.append(svg, rings, card);
  // Keys stay in the tour: the Timer page listens for Space on the window.
  for (const type of ['keydown', 'keyup'] as const) card.addEventListener(type, (e) => e.stopPropagation());
  card.addEventListener('keydown', onKey);
  // Clicks on the dimmed page do nothing (the tour never starts the camera or the timer).
  root.addEventListener('pointerdown', (e) => {
    if (!card.contains(e.target as Node)) e.preventDefault();
  });
  document.body.append(root);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    go(index + 1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    go(index - 1);
  } else if (e.key === 'Tab') {
    // Keep focus inside the card.
    const items = [...card.querySelectorAll<HTMLElement>('button')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

function button(label: string, cls: string, onClick: () => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function renderCard(step: Step) {
  card.replaceChildren();
  const head = document.createElement('div');
  head.className = 'tour-head';
  const where = document.createElement('span');
  where.className = 'tour-where';
  where.textContent = step.where.map(uiName).join(' › ');
  const count = document.createElement('span');
  count.className = 'tour-count';
  count.textContent = t('tour.progress', { n: index + 1, total: STEPS.length });
  head.append(where, count);

  const title = document.createElement('h2');
  title.className = 'tour-title';
  title.id = 'tour-title';
  title.textContent = t(`${step.id}.title`);
  card.setAttribute('aria-labelledby', title.id);

  const body = document.createElement('p');
  body.className = 'tour-body';
  body.append(rich(`${step.id}.body`, step.names));
  card.append(head, title, body);

  if (has(`${step.id}.tip`)) {
    const tip = document.createElement('p');
    tip.className = 'tour-tip';
    tip.append(rich(`${step.id}.tip`, step.names));
    card.append(tip);
  }

  const dots = document.createElement('div');
  dots.className = 'tour-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < STEPS.length; i++) {
    const d = document.createElement('span');
    if (i === index) d.className = 'on';
    dots.append(d);
  }

  const actions = document.createElement('div');
  actions.className = 'tour-actions';
  const lastStep = index === STEPS.length - 1;
  const skip = button(t('tour.skip'), 'tour-skip', close);
  const nav = document.createElement('div');
  nav.className = 'tour-nav';
  if (index > 0) nav.append(button(t('tour.back'), 'lp-btn', () => go(index - 1)));
  const next = button(t(lastStep ? 'tour.done' : 'tour.next'), 'lp-btn lp-btn-primary', () => (lastStep ? close() : go(index + 1)));
  nav.append(next);
  if (lastStep) actions.append(dots, nav);
  else actions.append(skip, dots, nav);
  card.append(actions);
  next.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- steps

async function go(i: number) {
  if (!root || i < 0 || i >= STEPS.length) return;
  undo?.();
  undo = undefined;
  index = i;
  const step = STEPS[i];
  if (routeNow() !== step.page) {
    location.hash = step.href?.() ?? `#${step.page}`;
    await waitFor(() => routeNow() === step.page && !document.getElementById(`page-${step.page}`)?.hidden, 1000);
  }
  if (!root || index !== i) return;
  await waitFor(() => visible(step).length > 0, 300); // the view's code loads the first time it opens
  if (!root || index !== i) return;
  undo = step.enter?.();
  renderCard(step);
  card.classList.remove('in');
  void card.offsetWidth;
  card.classList.add('in');
  lastKey = '';
  scrolled = false;
  shownAt = performance.now();
}

function waitFor(test: () => boolean, ms: number): Promise<void> {
  const end = performance.now() + ms;
  return new Promise((done) => {
    const tick = () => (test() || performance.now() > end ? done() : requestAnimationFrame(tick));
    tick();
  });
}

function visible(step: Step): DOMRect[] {
  const out: DOMRect[] = [];
  for (const sel of step.targets) {
    const el = $(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push(r);
  }
  return out;
}

const PAD = 6;
const MARGIN = 12;

function union(rects: DOMRect[]) {
  const l = Math.min(...rects.map((r) => r.left));
  const tp = Math.min(...rects.map((r) => r.top));
  const rt = Math.max(...rects.map((r) => r.right));
  const b = Math.max(...rects.map((r) => r.bottom));
  return { left: l, top: tp, right: rt, bottom: b, width: rt - l, height: b - tp };
}

const roundRect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
  `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;

/** Every frame: follow the targets as the page scrolls, loads or reflows. */
function layout() {
  frame = requestAnimationFrame(layout);
  if (!root) return;
  const step = STEPS[index];
  const rects = visible(step);
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const ch = card.offsetHeight;
  const cw = card.offsetWidth;
  const key = [vw, vh, ch, cw, ...rects.flatMap((r) => [r.left, r.top, r.width, r.height])].map(Math.round).join(',');
  const settle = !scrolled && performance.now() - shownAt > 150;
  if (key === lastKey && !settle) return;
  lastKey = key;

  let d = `M0 0H${vw}V${vh}H0Z`;
  rings.replaceChildren();
  for (const r of rects) {
    const x = r.left - PAD;
    const y = r.top - PAD;
    const w = r.width + PAD * 2;
    const h = r.height + PAD * 2;
    const rad = Math.min(12, w / 2, h / 2);
    d += roundRect(x, y, w, h, rad);
    const ring = document.createElement('div');
    ring.className = 'tour-ring';
    Object.assign(ring.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, borderRadius: `${rad}px` });
    rings.append(ring);
  }
  shade.setAttribute('d', d);

  if (!rects.length) {
    // Nothing to point at (yet): centre the card.
    Object.assign(card.style, { left: `${(vw - cw) / 2}px`, top: `${Math.max(MARGIN, (vh - ch) / 2)}px` });
    return;
  }

  // Bring the targets (and room for the card) into view once per step.
  const all = union(rects);
  // (After a short pause, so a view that is still filling in has its final layout.)
  if (settle) {
    scrolled = true;
    const need = all.height + PAD * 2 + MARGIN + ch;
    let dy: number;
    if (need + MARGIN * 2 <= vh) dy = all.top - PAD - (vh - need) / 2; // targets and card together
    else if (all.height + PAD * 2 + MARGIN * 2 <= vh) dy = all.top - PAD - MARGIN; // the targets
    else dy = rects[0].top - PAD - MARGIN; // the first target
    if (Math.abs(dy) > 4) window.scrollBy({ top: dy, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  // The card: below the targets, else above, else beside them, else wherever there is most room.
  // Targets too tall to share the screen with the card: place it by the first one alone.
  const fits = all.height + PAD * 2 + ch + MARGIN * 3 <= vh || all.width + PAD * 2 + cw + MARGIN * 3 <= vw;
  const box = fits ? all : union([rects[0]]);
  const below = vh - (box.bottom + PAD) - MARGIN;
  const above = box.top - PAD - MARGIN;
  const right = vw - (box.right + PAD) - MARGIN;
  const leftRoom = box.left - PAD - MARGIN;
  const anchor = rects[0];
  let top: number;
  let left = anchor.left + anchor.width / 2 - cw / 2;
  if (below >= ch + MARGIN) top = box.bottom + PAD + MARGIN;
  else if (above >= ch + MARGIN) top = box.top - PAD - MARGIN - ch;
  else if (Math.max(right, leftRoom) >= cw + MARGIN) {
    top = Math.max(box.top, MARGIN);
    left = right >= cw + MARGIN ? box.right + PAD + MARGIN : box.left - PAD - MARGIN - cw;
  } else top = below >= above ? vh - ch - MARGIN : MARGIN;
  top = Math.min(Math.max(MARGIN, top), Math.max(MARGIN, vh - ch - MARGIN));
  left = Math.min(Math.max(MARGIN, left), vw - cw - MARGIN);
  Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
}

// ---------------------------------------------------------------- open / close

export function startTour(at = 0) {
  if (root) return;
  opener = document.activeElement as HTMLElement | null;
  build();
  document.documentElement.classList.add('tour-open');
  frame = requestAnimationFrame(layout);
  void go(at);
}

function close() {
  if (!root) return;
  undo?.();
  undo = undefined;
  cancelAnimationFrame(frame);
  root.remove();
  root = null;
  document.documentElement.classList.remove('tour-open');
  opener?.focus?.({ preventScroll: true });
}

export function initTour() {
  const btn = document.getElementById('tour-btn');
  if (btn) btn.onclick = () => startTour();
}
