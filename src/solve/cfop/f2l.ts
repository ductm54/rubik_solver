/**
 * F2L, one corner-edge pair at a time, the way it is taught: turn the cube (y) so the target slot
 * is front-right, take pieces out of wrong slots if needed, then solve the pair with an
 * algorithm for its case.
 *
 * The case algorithms are built from the usual F2L "triggers" (R U R', F' U F, R' F R F', ...),
 * which only touch the front-right slot and the U layer. A shortest-path search over the 150
 * places the pair can be in (corner in U or the slot × edge in U or the slot) gives the
 * shortest trigger sequence for every case.
 */
import { type Move, applyMovesToArray, countMoves, formatAlg, invertAlg, parseAlg, simplifyAlg, solvedState, toColorArray } from '../../core/cube';
import { type Stickers, cubie, faceOf, locate, pieceSolved } from '../pieces';

export const SLOTS = ['FR', 'FL', 'BL', 'BR'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_NAMES: Record<Slot, string> = { FR: 'front-right', FL: 'front-left', BL: 'back-left', BR: 'back-right' };

/** y-rotation that brings each slot to the front-right position. */
const SLOT_ROTATION: Record<Slot, string> = { FR: '', FL: "y'", BL: 'y2', BR: 'y' };

const CORNER_HOME = cubie('DFR'); // D, F, R facelets
const EDGE_HOME = cubie('FR'); // F, R facelets
const CROSS = ['DF', 'DR', 'DB', 'DL'].map(cubie);
export const SLOT_PIECES: Record<Slot, [number[], number[]]> = {
  FR: [cubie('DFR'), cubie('FR')],
  FL: [cubie('DLF'), cubie('FL')],
  BL: [cubie('DBL'), cubie('BL')],
  BR: [cubie('DRB'), cubie('BR')],
};

export const crossSolved = (st: Stickers) => CROSS.every((c) => pieceSolved(st, c));
export const slotSolved = (st: Stickers, s: Slot) => SLOT_PIECES[s].every((p) => pieceSolved(st, p));

const TRIGGERS = [
  'U', "U'", 'U2',
  "R U R'", "R U' R'", "R U2 R'",
  "F' U F", "F' U' F", "F' U2 F",
  "R' F R F'", "F R' F' R",
].map(parseAlg);

/** Where the front-right pair is: "corner facelets|edge facelets". */
function pairKey(st: Stickers): string {
  return `${locate(st, CORNER_HOME).join(',')}|${locate(st, EDGE_HOME).join(',')}`;
}

interface CaseEntry {
  alg: Move[];
  moves: number;
}

let table: Map<string, CaseEntry> | null = null;

/** Shortest trigger sequence for every front-right pair case (Dijkstra from the solved pair). */
export function f2lTable(): Map<string, CaseEntry> {
  if (table) return table;
  const solved = toColorArray(solvedState());
  const best = new Map<string, { cost: number; path: Move[]; st: Stickers }>();
  best.set(pairKey(solved), { cost: 0, path: [], st: solved });
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    for (const [k, v] of best) if (!done.has(k) && (cur === null || v.cost < best.get(cur)!.cost)) cur = k;
    if (cur === null) break;
    done.add(cur);
    const { path, st } = best.get(cur)!;
    for (const t of TRIGGERS) {
      const p = simplifyAlg([...path, ...t]);
      const n = applyMovesToArray(st, t);
      const k = pairKey(n);
      const cost = countMoves(p);
      const old = best.get(k);
      if (!old || cost < old.cost) best.set(k, { cost, path: p, st: n });
    }
  }
  table = new Map();
  for (const [k, v] of best) {
    const alg = simplifyAlg(invertAlg(v.path));
    table.set(k, { alg, moves: countMoves(alg) });
  }
  return table;
}

/** Plain-language description of where the front-right pair's pieces are. */
export function describePair(st: Stickers, crossWord = 'cross colour'): string {
  const c = locate(st, CORNER_HOME);
  const e = locate(st, EDGE_HOME);
  const cornerInSlot = faceOf(c[0]) !== 'U' && c.every((i) => faceOf(i) !== 'U');
  const edgeInSlot = e.every((i) => faceOf(i) !== 'U');
  const cross = faceOf(c[0]); // where the cross-colour sticker of the corner faces
  const facing = cross === 'U' ? 'up' : cross === 'D' ? 'down' : 'to the side';
  const cornerText = cornerInSlot ? `corner in the slot (${crossWord} ${facing === 'down' ? 'facing down' : facing})` : `corner on top (${crossWord} facing ${facing})`;
  const edgeText = edgeInSlot ? (pieceSolved(st, EDGE_HOME) ? 'edge in the slot, correct' : 'edge in the slot, flipped') : 'edge on top';
  return `${cornerText}, ${edgeText}`;
}

/** Pair pieces of FR are only in the U layer or in the FR slot itself. */
function pairReady(st: Stickers): boolean {
  const inOtherSlot = (facelets: number[]) => facelets.every((i) => faceOf(i) !== 'U') && !facelets.some((i) => [...CORNER_HOME, ...EDGE_HOME].includes(i));
  return !inOtherSlot(locate(st, CORNER_HOME)) && !inOtherSlot(locate(st, EDGE_HOME));
}

/** Moves that lift the contents of a (non front-right) slot into the U layer. */
const EXTRACT: Record<Exclude<Slot, 'FR'>, Move[][]> = {
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
  rotation: Move[];
  extraction: Move[];
  alg: Move[];
  moves: number;
  description: string;
  extractedFrom?: Slot;
}

/** Cheapest way to solve the pair of `slot` (in the cube's current orientation). */
export function planPair(st: Stickers, slot: Slot, crossWord?: string): PairPlan | null {
  const rotation = parseAlg(SLOT_ROTATION[slot] || '');
  const view = applyMovesToArray(st, rotation);
  // Slots already solved (named in the rotated view) must stay solved.
  const keep = SLOTS.filter((s) => s !== 'FR' && slotSolved(view, s));
  const tbl = f2lTable();

  const finish = (v: Stickers, extraction: Move[], from?: Slot): PairPlan | null => {
    const e = tbl.get(pairKey(v));
    if (!e) return null;
    return {
      slot, rotation, extraction, alg: e.alg, moves: countMoves(extraction) + e.moves,
      description: describePair(v, crossWord), extractedFrom: from,
    };
  };
  if (pairReady(view)) return finish(view, []);

  let best: PairPlan | null = null;
  const tryExtract = (v: Stickers, done: Move[], depth: number, from?: Slot) => {
    const stuck = [slotOf(locate(v, CORNER_HOME)), slotOf(locate(v, EDGE_HOME))].filter(
      (s): s is Exclude<Slot, 'FR'> => !!s && s !== 'FR',
    );
    if (!stuck.length) {
      const p = finish(v, simplifyAlg(done), from);
      if (p && (!best || p.moves < best.moves)) best = p;
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

export const formatPairAlg = (p: PairPlan) => formatAlg([...p.rotation, ...p.extraction, ...p.alg]);
