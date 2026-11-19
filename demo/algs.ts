/**
 * Algorithms view: a reference sheet of every CFOP case (F2L, OLL, PLL), one card per case with a
 * diagram and its algorithm. A card opens a dialog with the case on a 3D cube and every
 * algorithm listed for it. Diagrams are small SVGs drawn from the case's stickers, so the
 * 119 cards cost nothing to show; there is only one 3D viewer, made the first time it is opened.
 */
import 'cubing/twisty';
import { FACES, FACE_FRAMES, STICKERS, countMoves, parseAlg } from '../src/core/cube';
import { t } from '../src/i18n';
import { ALG_SETS, type AlgSet, EO_CASES, GROUPS, REFERENCE, type RefCase } from '../src/learn/algs';
import { HOLD } from '../src/learn/beginner';

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
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

const sets = document.getElementById('algs-sets')!;
const search = document.getElementById('algs-search') as HTMLInputElement;
const twoLook = document.getElementById('algs-twolook') as HTMLInputElement;
const twoLookLabel = twoLook.closest('label')!;
const about = document.getElementById('algs-about')!;
const list = document.getElementById('algs-list')!;
const dialog = document.getElementById('algs-dialog') as HTMLDialogElement;

const SET_KEY = 'algs.set';
let set: AlgSet = 'oll';

const fill = (c: string | null) => (c ? `var(--${c})` : 'var(--ll-grey)');
const moves = (alg: string) => countMoves(parseAlg(alg).filter((m) => !'xyz'.includes(m.base)));

/** Top view: the U face with the top row of each side around it, as OLL and PLL sheets draw it. */
function topView(c: RefCase): SVGSVGElement {
  const s = 22; // sticker
  const g = 3; // gap to the side strips
  const w = 7; // side strip depth
  const o = w + g + 2; // U face origin
  const size = o * 2 + s * 3;
  const root = svg('svg', { viewBox: `0 0 ${size} ${size}`, class: 'algs-diagram', 'aria-hidden': 'true' }) as SVGSVGElement;
  const rect = (x: number, y: number, rw: number, rh: number, i: number) =>
    root.append(svg('rect', { x, y, width: rw, height: rh, rx: 2.5, fill: fill(c.stickers[i]), class: 'algs-st' }));
  for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) rect(o + col * s + 1, o + r * s + 1, s - 2, s - 2, r * 3 + col);
  for (let k = 0; k < 3; k++) {
    rect(o + k * s + 1, o - g - w, s - 2, w, 45 + (2 - k)); // B, seen from above
    rect(o + k * s + 1, o + 3 * s + g, s - 2, w, 18 + k); // F
    rect(o - g - w, o + k * s + 1, w, s - 2, 36 + k); // L
    rect(o + 3 * s + g, o + k * s + 1, w, s - 2, 9 + (2 - k)); // R
  }
  if (c.arrows?.length) {
    const centre = (i: number) => [o + (i % 3) * s + s / 2, o + Math.floor(i / 3) * s + s / 2];
    const id = `ah-${c.set}-${c.id}`;
    const defs = svg('defs', {});
    const marker = svg('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse' });
    marker.append(svg('path', { d: 'M0 0L10 5L0 10z', class: 'algs-arrowhead' }));
    defs.append(marker);
    root.append(defs);
    const done = new Set<string>();
    for (const [from, to] of c.arrows) {
      if (done.has(`${from}-${to}`)) continue;
      const swap = c.arrows.some(([a, b]) => a === to && b === from);
      done.add(`${to}-${from}`);
      const [x1, y1] = centre(from);
      const [x2, y2] = centre(to);
      // Shorten both ends so the heads stay inside the stickers.
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      const cut = 5;
      const line = svg('line', {
        x1: x1 + ux * cut,
        y1: y1 + uy * cut,
        x2: x2 - ux * cut,
        y2: y2 - uy * cut,
        class: 'algs-arrow',
        'marker-end': `url(#${id})`,
      });
      if (swap) line.setAttribute('marker-start', `url(#${id})`);
      root.append(line);
    }
  }
  return root;
}

/** Corner view of the top, front and right faces, as F2L sheets draw it. */
function isoView(c: RefCase): SVGSVGElement {
  const root = svg('svg', { viewBox: '-3.1 -3.2 6.2 6.4', class: 'algs-diagram', 'aria-hidden': 'true' }) as SVGSVGElement;
  const cos = Math.cos(Math.PI / 6);
  const project = ([x, y, z]: number[]) => [(x - z) * cos, (x + z) * 0.5 - y];
  STICKERS.forEach((st, i) => {
    const face = FACES[Math.floor(i / 9)];
    if (face !== 'U' && face !== 'F' && face !== 'R') return;
    const { n, a, b } = FACE_FRAMES[face];
    const mid = st.pos.map((v, k) => v + n[k] * 0.5);
    const d = 0.44;
    const pts = [
      [-d, -d],
      [d, -d],
      [d, d],
      [-d, d],
    ].map(([p, q]) => project(mid.map((v, k) => v + a[k] * p + b[k] * q)));
    root.append(svg('polygon', { points: pts.map((p) => p.map((v) => v.toFixed(3)).join(',')).join(' '), fill: fill(c.stickers[i]), class: 'algs-st' }));
  });
  return root;
}

const diagram = (c: RefCase) => (c.set === 'f2l' ? isoView(c) : topView(c));

function title(c: RefCase): string {
  if (c.group === 'eo') return c.id;
  if (c.set === 'f2l') return t('algs.caseN', { n: c.id });
  if (c.set === 'oll') return t('algs.ollN', { n: c.id });
  return t('algs.perm', { n: c.id });
}

const hintText = (c: RefCase) => c.hint?.replaceAll('{top}', t('color.Y'));

function card(c: RefCase): HTMLElement {
  const b = el('button', 'algs-card');
  b.type = 'button';
  const head = el('div', 'algs-card-head');
  head.append(el('strong', '', title(c)));
  if (c.twoLook && c.group !== 'eo') head.append(el('span', 'tag', t('algs.inTwoLook')));
  if (c.shape) b.append(head, el('span', 'muted algs-shape', c.shape));
  else b.append(head);
  b.prepend(diagram(c));
  b.append(el('code', 'algs-alg', c.algs[0]));
  b.onclick = () => openCase(c);
  return b;
}

/** Lowercased text a search is matched against. */
function haystack(c: RefCase): string {
  return [c.id, title(c), c.shape ?? '', t(`algs.group.${c.group}`), ...c.algs, ...(c.left ?? [])]
    .join(' ')
    .toLowerCase()
    .replace(/[()]/g, '');
}

function render() {
  const q = search.value.trim().toLowerCase().replace(/[()]/g, '');
  const only2 = set !== 'f2l' && twoLook.checked;
  twoLookLabel.hidden = set === 'f2l';
  about.textContent = t(`algs.about.${set}`);
  for (const r of sets.querySelectorAll<HTMLInputElement>('input')) r.checked = r.value === set;

  let cases = REFERENCE[set];
  if (set === 'oll' && only2) cases = [...EO_CASES, ...cases];
  cases = cases.filter((c) => (!only2 || c.twoLook) && (!q || haystack(c).includes(q)));

  list.replaceChildren();
  if (!cases.length) list.append(el('p', 'card muted', t('algs.none')));
  for (const g of ['eo', ...GROUPS[set]]) {
    const inGroup = cases.filter((c) => c.group === g);
    if (!inGroup.length) continue;
    const sec = el('section', 'algs-group');
    const head = el('header', 'algs-group-head');
    head.append(el('h2', '', t(`algs.group.${g}`)), el('span', 'muted', t('algs.count', { n: inGroup.length })));
    const grid = el('div', 'algs-grid');
    grid.append(...inGroup.map(card));
    sec.append(head, grid);
    list.append(sec);
  }
}

function pickSet(s: AlgSet) {
  set = s;
  try {
    localStorage.setItem(SET_KEY, s);
  } catch {
    // Remembering the set is only a convenience.
  }
  const hash = `#algs&set=${s}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  render();
}

// ---------------------------------------------------------------- the case dialog

let player: Player | null = null;

function load(c: RefCase, alg: string, play: boolean) {
  if (!player) return;
  player.pause();
  player.experimentalSetupAnchor = 'start';
  player.experimentalSetupAlg = `${HOLD} ${c.setup}`;
  player.alg = alg;
  player.experimentalStickeringMaskOrbits = c.mask;
  player.timestamp = 'start';
  if (play) setTimeout(() => player?.play(), 150);
}

/** The dialog's parts, made once: the viewer stays in place, so it is never attached twice. */
const dialogName = el('div', '');
const dialogSide = el('div', 'algs-dialog-side');
const viewer = el('div', 'learn-viewer algs-viewer');
{
  const head = el('header', 'algs-dialog-head');
  const close = el('button', 'ghost small', t('algs.close'));
  close.type = 'button';
  close.onclick = () => dialog.close();
  head.append(dialogName, close);
  const body = el('div', 'algs-dialog-body');
  body.append(viewer, dialogSide);
  dialog.append(head, body);
}

function openCase(c: RefCase) {
  dialogName.replaceChildren(el('h2', '', title(c)), el('span', 'muted', [c.shape, t(`algs.group.${c.group}`)].filter(Boolean).join(' · ')));
  if (!player) {
    player = document.createElement('twisty-player') as Player;
    player.setAttribute('puzzle', '3x3x3');
    player.setAttribute('background', 'none');
    player.setAttribute('control-panel', 'bottom-row');
    player.setAttribute('hint-facelets', 'floating');
    viewer.append(player);
  }

  const side = dialogSide;
  side.replaceChildren(diagram(c));
  const hint = hintText(c);
  if (hint) {
    const p = el('p', 'algs-hint');
    p.append(el('strong', '', `${t('algs.recognise')}: `), hint);
    side.append(p);
  }

  const rows = el('div', 'algs-rows');
  const buttons: HTMLButtonElement[] = [];
  const row = (alg: string, label: string, slotCase: RefCase) => {
    const b = el('button', 'algs-row');
    b.type = 'button';
    b.append(el('code', '', alg), el('span', 'muted', t('algs.moves', { count: moves(alg) })));
    b.setAttribute('aria-label', `${t('algs.play')}: ${alg}`);
    b.onclick = () => {
      buttons.forEach((k) => k.setAttribute('aria-pressed', String(k === b)));
      load(slotCase, alg, true);
    };
    buttons.push(b);
    const wrap = el('div', 'algs-row-wrap');
    if (label) wrap.append(el('span', 'lp-label', label));
    wrap.append(b);
    return wrap;
  };
  rows.append(row(c.algs[0], t('algs.main'), c));
  c.algs.slice(1).forEach((a, i) => rows.append(row(a, i === 0 ? t('algs.alts') : '', c)));
  if (c.left?.length) {
    c.left.forEach((a, i) => rows.append(row(a, i === 0 ? t('algs.left') : '', { ...c, setup: c.leftSetups![i] })));
  }
  side.append(rows);
  buttons[0].setAttribute('aria-pressed', 'true');
  dialog.showModal();
  load(c, c.algs[0], false);
}

dialog.addEventListener('close', () => player?.pause());
dialog.addEventListener('click', (e) => {
  // A click on the backdrop closes the dialog.
  if (e.target === dialog) dialog.close();
});

// ---------------------------------------------------------------- start

for (const s of ALG_SETS) {
  const label = el('label', 'seg');
  const input = el('input');
  input.type = 'radio';
  input.name = 'algs-set';
  input.value = s;
  input.onchange = () => pickSet(s);
  label.append(input, `${t(`algs.set.${s}`)} `, el('span', 'algs-seg-n', String(REFERENCE[s].length)));
  sets.append(label);
}
search.addEventListener('input', render);
twoLook.addEventListener('change', render);

const setInHash = () => {
  const s = /[&?]set=(\w+)/.exec(location.hash)?.[1];
  return ALG_SETS.includes(s as AlgSet) ? (s as AlgSet) : null;
};

function startSet(): AlgSet {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(SET_KEY);
  } catch {
    // No storage: start on OLL.
  }
  return setInHash() ?? (ALG_SETS.includes(saved as AlgSet) ? (saved as AlgSet) : 'oll');
}

pickSet(startSet());

/** The tab was opened again, or its link changed. */
export function show() {
  const s = setInHash();
  if (s && s !== set) pickSet(s);
}

/** Another tab was opened: stop the viewer. */
export function hide() {
  player?.pause();
  if (dialog.open) dialog.close();
}
