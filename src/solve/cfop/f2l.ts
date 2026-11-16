/**
 * F2L, one corner-edge pair at a time, the way it is taught: turn the cube (y) so the target slot
 * is front-right (or front-left), take pieces out of wrong slots if needed, then solve the pair
 * with the standard algorithm for its case.
 *
 * The algorithms are the 41 F2L cases from SpeedCubeDB, most-voted first, for the front-right
 * and the front-left slot (algs/f2l.ts). With an AUF (U, U', U2) in front they cover all 150
 * places the pair can be in (corner in U or the slot × edge in U or the slot).
 */
import { type Move, applyMovesToArray, countMoves, formatAlg, invertAlg, parseAlg, simplifyAlg, solvedState, toColorArray } from '../../core/cube';
import { t } from '../../i18n';
import { type Stickers, cubie, faceOf, locate, pieceSolved } from '../pieces';
import { F2L_CASES } from './algs/f2l';

export const SLOTS = ['FR', 'FL', 'BL', 'BR'] as const;
export type Slot = (typeof SLOTS)[number];
/** The slots an algorithm is used in: the pair goes in at the front-right or the front-left. */
export type Side = 'FR' | 'FL';

/** y-rotation that brings each slot to the front-right / front-left position. */
const SLOT_ROTATION: Record<Side, Record<Slot, string>> = {
  FR: { FR: '', FL: "y'", BL: 'y2', BR: 'y' },
  FL: { FR: 'y', FL: '', BL: "y'", BR: 'y2' },
};

const CROSS = ['DF', 'DR', 'DB', 'DL'].map(cubie);
export const SLOT_PIECES: Record<Slot, [number[], number[]]> = {
  FR: [cubie('DFR'), cubie('FR')],
  FL: [cubie('DLF'), cubie('FL')],
  BL: [cubie('DBL'), cubie('BL')],
  BR: [cubie('DRB'), cubie('BR')],
};

export const crossSolved = (st: Stickers) => CROSS.every((c) => pieceSolved(st, c));
export const slotSolved = (st: Stickers, s: Slot) => SLOT_PIECES[s].every((p) => pieceSolved(st, p));

/** Where the pair of `side` is: "corner facelets|edge facelets". */
function pairKey(st: Stickers, side: Side): string {
  const [corner, edge] = SLOT_PIECES[side];
  return `${locate(st, corner).join(',')}|${locate(st, edge).join(',')}`;
}

interface CaseEntry {
  alg: Move[];
  moves: number;
  /** SpeedCubeDB case number ("12"); empty for the solved pair. */
  id: string;
  /** The SpeedCubeDB algorithm, as written there (before the AUF). */
  source: string;
}

const AUF = ['', 'U', "U'", 'U2'];
/** The y-turn that undoes the cube turn an algorithm leaves (y', d, ...), or null if none does. */
function undoTurn(alg: Move[]): Move[] | null {
  const solved = toColorArray(solvedState());
  for (const r of ['', 'y', "y'", 'y2'].map(parseAlg)) {
    const st = applyMovesToArray(solved, [...alg, ...r]);
    if ([...'URFDLB'].every((_, i) => st[i * 9 + 4] === solved[i * 9 + 4])) return r;
  }
  return null;
}

const tables: Partial<Record<Side, Map<string, CaseEntry>>> = {};

/** The algorithm for every place of the pair of `side` (front-right or front-left). */
export function f2lTable(side: Side = 'FR'): Map<string, CaseEntry> {
  const cached = tables[side];
  if (cached) return cached;
  const solved = toColorArray(solvedState());
  const others = SLOTS.filter((s) => s !== side);
  const table = new Map<string, CaseEntry>([[pairKey(solved, side), { alg: [], moves: 0, id: '', source: '' }]]);
  for (const c of F2L_CASES) {
    for (const text of c[side]) {
      const alg = parseAlg(text);
      const undo = undoTurn(alg);
      if (!undo) continue;
      // The case this algorithm solves: undo it on a solved cube (held the same way afterwards).
      const start = applyMovesToArray(solved, invertAlg([...alg, ...undo]));
      if (!crossSolved(start) || !others.every((s) => slotSolved(start, s)) || slotSolved(start, side)) continue;
      for (const a of AUF) {
        const full = simplifyAlg([...parseAlg(a), ...alg]);
        const st = applyMovesToArray(start, invertAlg(parseAlg(a)));
        const key = pairKey(st, side);
        const old = table.get(key);
        const moves = countMoves(full);
        if (!old || moves < old.moves) table.set(key, { alg: full, moves, id: c.id, source: text });
      }
      break;
    }
  }
  tables[side] = table;
  return table;
}

/** Plain-language description of where the pair of `side` is. */
export function describePair(st: Stickers, crossWord = 'cross colour', side: Side = 'FR'): string {
  const [corner, edge] = SLOT_PIECES[side];
  const c = locate(st, corner);
  const e = locate(st, edge);
  const cornerInSlot = c.every((i) => faceOf(i) !== 'U');
  const edgeInSlot = e.every((i) => faceOf(i) !== 'U');
  const cross = faceOf(c[0]); // where the cross-colour sticker of the corner faces
  const facing = cross === 'U' ? 'Up' : cross === 'D' ? 'Down' : 'Side';
  const cornerText = t(`f2l.corner${cornerInSlot ? 'Slot' : 'Top'}${facing}`, { cross: crossWord });
  const edgeText = t(edgeInSlot ? (pieceSolved(st, edge) ? 'f2l.edgeSlotOk' : 'f2l.edgeSlotFlipped') : 'f2l.edgeTop');
  return t('f2l.pair', { corner: cornerText, edge: edgeText });
}

/** Moves that lift the contents of a slot into the U layer. */
const EXTRACT: Record<Slot, Move[][]> = {
  FR: ["R U R'", "R U' R'", "R U2 R'", "F' U F", "F' U' F", "F' U2 F"].map(parseAlg),
  FL: ["L' U L", "L' U' L", "L' U2 L", "F U F'", "F U' F'", "F U2 F'"].map(parseAlg),
  BL: ["L U L'", "L U' L'", "L U2 L'", "B' U B", "B' U' B", "B' U2 B"].map(parseAlg),
  BR: ["R' U R", "R' U' R", "R' U2 R", "B U B'", "B U' B'", "B U2 B'"].map(parseAlg),
};

const slotOf = (facelets: number[]): Slot | null => {
  for (const s of SLOTS) if (facelets.every((i) => SLOT_PIECES[s].flat().includes(i))) return s;
  return null;
};

export interface PairPlan {
  slot: Slot;
  /** Where the pair goes in once the cube is turned: front-right or front-left. */
  side: Side;
  rotation: Move[];
  extraction: Move[];
  alg: Move[];
  /** Face turns (cube turns not counted). */
  moves: number;
  /** For picking the easiest pair: face turns plus one per cube turn. */
  cost: number;
  /** SpeedCubeDB case number ("12"); empty when the pair was already solved. */
  caseId: string;
  description: string;
  extractedFrom?: Slot;
}

const turns = (m: Move[]) => m.filter((x) => 'xyz'.includes(x.base)).length;

/** The pair of `slot` solved with the pair going in at `side` (in the cube's current orientation). */
function planSide(st: Stickers, slot: Slot, side: Side, crossWord?: string): PairPlan | null {
  const rotation = parseAlg(SLOT_ROTATION[side][slot]);
  const view = applyMovesToArray(st, rotation);
  // Slots already solved (named in the rotated view) must stay solved.
  const keep = SLOTS.filter((s) => s !== side && slotSolved(view, s));
  const tbl = f2lTable(side);
  const [corner, edge] = SLOT_PIECES[side];

  let best: PairPlan | null = null;
  const tryExtract = (v: Stickers, done: Move[], depth: number, from?: Slot) => {
    const stuck = [slotOf(locate(v, corner)), slotOf(locate(v, edge))].filter((s): s is Slot => !!s && s !== side);
    if (!stuck.length) {
      const e = tbl.get(pairKey(v, side));
      if (!e) return;
      const extraction = simplifyAlg(done);
      const moves = countMoves(extraction) + e.moves;
      const cost = moves + turns(rotation) + turns(e.alg);
      if (!best || cost < best.cost)
        best = { slot, side, rotation, extraction, alg: e.alg, moves, cost, caseId: e.id, description: describePair(v, crossWord, side), extractedFrom: from };
      return;
    }
    if (depth === 0) return;
    for (const x of EXTRACT[stuck[0]]) {
      const n = applyMovesToArray(v, x);
      if (!crossSolved(n) || !keep.every((k) => slotSolved(n, k))) continue;
      tryExtract(n, [...done, ...x], depth - 1, from ?? stuck[0]);
    }
  };
  tryExtract(view, [], 2);
  return best;
}

/**
 * Easiest way to solve the pair of `slot` (in the cube's current orientation): with the cube turned
 * so the slot is front-right or front-left, whichever takes fewer moves (front-right on a tie).
 */
export function planPair(st: Stickers, slot: Slot, crossWord?: string): PairPlan | null {
  const fr = planSide(st, slot, 'FR', crossWord);
  const fl = planSide(st, slot, 'FL', crossWord);
  if (!fr || !fl) return fr ?? fl;
  return fl.cost < fr.cost ? fl : fr;
}

export const formatPairAlg = (p: PairPlan) => formatAlg([...p.rotation, ...p.extraction, ...p.alg]);
