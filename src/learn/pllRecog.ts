/**
 * Two-side PLL recognition: every PLL case seen from each angle (the top turned 0, 1, 2 or 3
 * times before the algorithm), as the six top-layer stickers on the front and right sides.
 * Angles that look the same as another angle of the same case (H, Z, E, N are symmetric) are
 * shown once, so a case has at most four views.
 *
 * Each view is described the way a cuber reads it: first each side on its own (a bar, headlights,
 * a block, or three colours), then, only when needed, how stickers on the two sides compare (same,
 * opposite or neighbouring colours). The comparisons are the fewest that tell this view apart from
 * every other view of every case, so the description is enough to know both the case and the U
 * turn to do first. tests/pllRecog.test.ts checks that.
 */
import { type Color, applyMovesToArray, formatAlg, invertAlg, parseAlg } from '../core/cube';
import { GROUPS, REFERENCE } from './algs';

/** Side colours in order round the cube: neighbours are next to each other, opposites two apart. */
const RING: Color[] = ['B', 'R', 'G', 'O'];

export type Relation = 'same' | 'opposite' | 'neighbour';
export type SideKind = 'bar' | 'lights' | 'lightsOpposite' | 'blockLeft' | 'blockRight' | 'endsOpposite' | 'endsNeighbour';

export const relation = (a: Color, b: Color): Relation =>
  a === b ? 'same' : (RING.indexOf(a) + 2) % 4 === RING.indexOf(b) ? 'opposite' : 'neighbour';

/** One side's three stickers, left to right. */
export function sideKind([a, b, c]: Color[]): SideKind {
  if (a === b && b === c) return 'bar';
  if (a === c) return relation(a, b) === 'opposite' ? 'lightsOpposite' : 'lights';
  if (a === b) return 'blockLeft';
  if (b === c) return 'blockRight';
  return relation(a, c) === 'opposite' ? 'endsOpposite' : 'endsNeighbour';
}

/**
 * The six stickers, 0-2 the front (left to right) and 3-5 the right side (front to back); 2 and 3
 * are the same corner. The pairs across the two sides that can be compared, most useful first:
 * the two ends, the two edges, then each edge with the other side's stickers.
 */
export const PAIRS: [number, number][] = [
  [0, 5],
  [1, 4],
  [1, 5],
  [0, 4],
  [1, 3],
  [2, 4],
  [0, 3],
  [2, 5],
];

export interface RecogView {
  /** The U turn to do before the algorithm ('' for none). */
  pre: string;
  /** Front then right side, as described above. */
  stickers: Color[];
  front: SideKind;
  right: SideKind;
  /** Comparisons needed to tell this view apart: an index into PAIRS and the relation seen. */
  compare: { pair: number; rel: Relation }[];
}

export interface RecogCase {
  id: string;
  group: string;
  alg: string;
  views: RecogView[];
}

const TURNS = ['', 'U', 'U2', "U'"];
const FRONT_ROW = [18, 19, 20];
const RIGHT_ROW = [9, 10, 11];
/** Colours relabelled round the ring, so a view reads the same whichever way the top layer sits. */
const shift = (v: Color[], k: number) => v.map((c) => RING[(RING.indexOf(c) + k) % 4]);
const canonical = (v: Color[]) => [0, 1, 2, 3].map((k) => shift(v, k).join('')).sort()[0];

interface Raw extends Omit<RecogView, 'compare'> {
  id: string;
  rels: Relation[];
}

function rawViews(): Raw[] {
  const out: Raw[] = [];
  for (const c of REFERENCE.pll) {
    const seen = new Set<string>();
    for (const u of TURNS) {
      const st = applyMovesToArray(c.stickers as Color[], u);
      const stickers = [...FRONT_ROW, ...RIGHT_ROW].map((i) => st[i]);
      const key = canonical(stickers);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: c.id,
        pre: u ? formatAlg(invertAlg(parseAlg(u))) : '',
        stickers,
        front: sideKind(stickers.slice(0, 3)),
        right: sideKind(stickers.slice(3)),
        rels: PAIRS.map(([i, j]) => relation(stickers[i], stickers[j])),
      });
    }
  }
  return out;
}

/** Index combinations of PAIRS, fewest first, then the most useful pairs first. */
const COMBOS: number[][] = (() => {
  const n = PAIRS.length;
  const out: number[][] = [];
  for (let i = 0; i < n; i++) out.push([i]);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) out.push([i, j, k]);
  return out;
})();

function build(): RecogCase[] {
  const raw = rawViews();
  const view = (w: Raw): RecogView => {
    const rivals = raw.filter((o) => o !== w && o.front === w.front && o.right === w.right);
    const pick = rivals.length ? COMBOS.find((cb) => rivals.every((o) => cb.some((p) => o.rels[p] !== w.rels[p]))) : [];
    if (!pick) throw new Error(`PLL ${w.id}: no comparison tells this view apart`);
    return { pre: w.pre, stickers: w.stickers, front: w.front, right: w.right, compare: pick.map((p) => ({ pair: p, rel: w.rels[p] })) };
  };
  return REFERENCE.pll
    .map((c) => ({ id: c.id, group: c.group, alg: c.algs[0], views: raw.filter((w) => w.id === c.id).map(view) }))
    .sort((a, b) => GROUPS.pll.indexOf(a.group) - GROUPS.pll.indexOf(b.group));
}

export const PLL_RECOG: RecogCase[] = build();

/**
 * The chart's view for six front-and-right stickers (coloured with the ring colours above), with
 * its case: the one whose side shapes and comparisons all match. The solver's PLL tips use it so
 * they explain a case the same way the chart does.
 */
export function findView(stickers: Color[]): { id: string; view: RecogView } | undefined {
  const front = sideKind(stickers.slice(0, 3));
  const right = sideKind(stickers.slice(3));
  const rels = PAIRS.map(([i, j]) => relation(stickers[i], stickers[j]));
  for (const c of PLL_RECOG) {
    for (const v of c.views) {
      if (v.front !== front || v.right !== right) continue;
      if (PAIRS.every(([i, j], p) => relation(v.stickers[i], v.stickers[j]) === rels[p])) return { id: c.id, view: v };
    }
  }
  return undefined;
}
