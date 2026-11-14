/**
 * Last-layer recognition. Each table entry's case is found by running its algorithm backwards on
 * a solved cube, so recognition can never disagree with the algorithm. A case matches the cube
 * after a pre-AUF (U turn before the algorithm); for PLL a post-AUF finishes the solve.
 */
import { type Move, applyMovesToArray, countMoves, formatAlg, invertAlg, parseAlg, simplifyAlg, solvedState, toColorArray } from '../../core/cube';
import { type Stickers, CORNERS, EDGES, faceOf, homeColor } from '../pieces';
import type { AlgEntry } from './algs/oll';

const AUF: Move[][] = [[], parseAlg('U'), parseAlg('U2'), parseAlg("U'")];

/** Every sticker as the face its colour belongs to: colour-scheme independent. */
const normalise = (st: Stickers): string[] => {
  const faceOfColor = new Map<string, string>();
  for (let f = 0; f < 6; f++) faceOfColor.set(st[f * 9 + 4], 'URFDLB'[f]);
  return st.map((c) => faceOfColor.get(c)!);
};

const U_LAYER = [...CORNERS, ...EDGES].filter((p) => p.some((i) => faceOf(i) === 'U'));
const U_CORNER_FACELETS = new Set(CORNERS.filter((p) => p.some((i) => faceOf(i) === 'U')).flat());
const U_EDGE_FACELETS = new Set(EDGES.filter((p) => p.some((i) => faceOf(i) === 'U')).flat());
const LL_FACELETS = U_LAYER.flat();

export type KeyKind = 'orient' | 'orientEdges' | 'perm' | 'permCorners';

/** What a stage looks at: orientation (which stickers are top colour) or full colours. */
function key(st: Stickers, kind: KeyKind): string {
  const n = normalise(st);
  return LL_FACELETS.map((i) => {
    if (kind === 'orientEdges' && !U_EDGE_FACELETS.has(i)) return '.';
    if (kind === 'permCorners' && !U_CORNER_FACELETS.has(i)) return '.';
    if (kind === 'orient' || kind === 'orientEdges') return n[i] === 'U' ? 'U' : '-';
    return n[i];
  }).join('');
}

export interface LLTable {
  kind: KeyKind;
  /** Whether a post-AUF is part of the solution (only for the stage that finishes the cube). */
  postAuf: boolean;
  cases: Map<string, { entry: AlgEntry; alg: Move[]; post: Move[] }[]>;
}

export function buildTable(entries: AlgEntry[], kind: KeyKind, postAuf: boolean): LLTable {
  const solved = toColorArray(solvedState());
  const cases = new Map<string, { entry: AlgEntry; alg: Move[]; post: Move[] }[]>();
  for (const entry of entries) {
    const alg = parseAlg(entry.alg);
    for (const post of AUF) {
      // State X with X · alg · post = solved.
      const x = applyMovesToArray(solved, invertAlg([...alg, ...post]));
      const k = key(x, kind);
      if (!cases.has(k)) cases.set(k, []);
      cases.get(k)!.push({ entry, alg, post: postAuf ? post : [] });
    }
  }
  return { kind, postAuf, cases };
}

/** True when the stage this kind of key looks at is already done (up to an AUF for perm). */
export function stageDone(st: Stickers, kind: KeyKind): boolean {
  const solvedKey = (s: Stickers) => key(s, kind) === key(toColorArray(solvedState()), kind);
  if (kind === 'orient' || kind === 'orientEdges') return solvedKey(st);
  return AUF.some((a) => solvedKey(applyMovesToArray(st, a)));
}

export interface LLMatch {
  entry: AlgEntry | null; // null = only an AUF was needed
  moves: Move[];
  count: number;
}

/** Shortest pre-AUF + algorithm (+ post-AUF) that does this stage, or null if no case matches. */
export function matchLL(st: Stickers, table: LLTable): LLMatch | null {
  let best: LLMatch | null = null;
  const consider = (m: LLMatch) => {
    if (!best || m.count < best.count) best = m;
  };
  const solvedKeyPerm = key(toColorArray(solvedState()), table.kind);
  for (const pre of AUF) {
    const s = applyMovesToArray(st, pre);
    const k = key(s, table.kind);
    if (k === solvedKeyPerm) {
      if (table.postAuf || table.kind === 'orient' || table.kind === 'orientEdges') {
        // Already done: for the last stage the pre-AUF itself is the whole step.
        const moves = table.postAuf ? pre : [];
        consider({ entry: null, moves, count: countMoves(moves) });
      } else consider({ entry: null, moves: [], count: 0 });
      continue;
    }
    for (const c of table.cases.get(k) ?? []) {
      const moves = simplifyAlg([...pre, ...c.alg, ...c.post]);
      consider({ entry: c.entry, moves, count: countMoves(moves) });
    }
  }
  return best;
}

export const formatMoves = formatAlg;
/** Top colour of the cube, for hint text. */
export const topColor = (st: Stickers) => homeColor(st, 4);
